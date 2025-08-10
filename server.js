// server.js
// -----------------------------------------------------------------------------
// Environment variables required (DigitalOcean → Component → Environment Vars):
//   MONGODB_URI           - your Mongo connection string (or DATABASE_URL)
//   MONGODB_DB            - e.g. "ExpenseManager"
//   JWT_SECRET            - long random string (>= 32 chars)
//   RP_NAME               - e.g. "ExpenseManager"
//   RP_ID                 - your domain (no scheme), e.g. "walrus-app-vkptp.ondigitalocean.app"
//   ORIGIN                - full origin, e.g. "https://walrus-app-vkptp.ondigitalocean.app"
//
// Optional:
//   OWNER_EMAIL           - always allowed by allowlist (default: swapna@swapnade.com)
//   ENFORCE_ALLOWLIST     - "true" | "false" (default: true)
//   PORT                  - default 8080
// -----------------------------------------------------------------------------

const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const base64url = require("base64url");
require("dotenv").config();

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

// ---- Your existing feature routers (remain the same) ------------------------
const bucketsRoutes = require("./routes/buckets");
const expensesRoutes = require("./routes/expenses");
const categoriesRoutes = require("./routes/categories");

// ---- App setup --------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 8080;

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || "";
const MONGODB_DB = process.env.MONGODB_DB || "ExpenseManager";

const JWT_SECRET = process.env.JWT_SECRET;
const RP_NAME = process.env.RP_NAME || "ExpenseManager";
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "swapna@swapnade.com").toLowerCase();
const ENFORCE_ALLOWLIST = (process.env.ENFORCE_ALLOWLIST || "true").toLowerCase() !== "false";

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI/DATABASE_URL env var");
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET env var");
  process.exit(1);
}

// Helpers to resolve RP_ID & ORIGIN safely
function getRpID() {
  if (process.env.RP_ID) return process.env.RP_ID;
  if (process.env.ORIGIN) return new URL(process.env.ORIGIN).hostname;
  throw new Error("Set RP_ID or ORIGIN env var");
}
function getOrigin() {
  if (process.env.ORIGIN) return process.env.ORIGIN;
  throw new Error("Set ORIGIN env var (https://your.domain)");
}

// ---- CORS -------------------------------------------------------------------
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://walrus-app-vkptp.ondigitalocean.app", // your DO frontend
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: false, // using Bearer tokens, not cookies
  })
);
app.use(express.json());

// ---- Health & docs (public) -------------------------------------------------
app.get("/health", async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.command({ ping: 1 });
    res.json({ status: "ok", mongo: "up", time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: "error", detail: e.message });
  }
});

app.get("/api", (_req, res) => {
  res.json({
    app: "Expense Manager API",
    status: "ok",
    docs: {
      health: "GET /health",
      createBucket: "POST /buckets",
      fundBucket: "POST /buckets/:id/fund",
      transfer: "POST /buckets/transfer",
      addExpense: "POST /expenses",
    },
  });
});

// ---- Minimal user model helpers (inline) ------------------------------------
const ACCOUNT_TYPES = new Set(["personal", "business", "both"]);
function normalizeType(type) {
  const t = String(type || "").toLowerCase();
  if (!ACCOUNT_TYPES.has(t)) throw new Error("invalid_account_type");
  return t;
}
async function usersCol(db) {
  const col = db.collection("users");
  await col.createIndex({ email: 1 }, { unique: true });
  return col;
}
async function findUserByEmail(db, email) {
  const col = await usersCol(db);
  return col.findOne({ email: String(email || "").toLowerCase() });
}
async function ensureUserWithType(db, email, accountType) {
  const col = await usersCol(db);
  const e = String(email || "").toLowerCase();
  const t = normalizeType(accountType);
  let u = await col.findOne({ email: e });
  if (u) {
    if (!u.accountType) {
      await col.updateOne(
        { _id: u._id },
        { $set: { accountType: t, updatedAt: new Date() } }
      );
      u = await col.findOne({ _id: u._id });
    }
    return u;
  }
  const doc = {
    email: e,
    accountType: t,                       // <-- store the choice
    webauthn: { credentials: [] },        // [{ id, publicKey, counter, transports }]
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const r = await col.insertOne(doc);
  doc._id = r.insertedId;
  return doc;
}
async function saveChallenge(db, userId, challenge) {
  const col = await usersCol(db);
  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { "webauthn.currentChallenge": challenge, updatedAt: new Date() } }
  );
}
async function addCredential(db, userId, cred) {
  const col = await usersCol(db);
  await col.updateOne(
    { _id: new ObjectId(userId) },
    {
      $push: { "webauthn.credentials": cred },
      $unset: { "webauthn.currentChallenge": "" },
      $set: { updatedAt: new Date() },
    }
  );
}
async function updateCounter(db, userId, credId, newCounter) {
  const col = await usersCol(db);
  await col.updateOne(
    { _id: new ObjectId(userId), "webauthn.credentials.id": credId },
    {
      $set: {
        "webauthn.credentials.$.counter": newCounter,
        updatedAt: new Date(),
      },
      $unset: { "webauthn.currentChallenge": "" },
    }
  );
}

// ---- JWT helpers -------------------------------------------------------------
function signAccessToken(payload, opts = {}) {
  // payload: { userId, email, accountType }
  const options = {
    issuer: "expensemanager-api",
    audience: "expensemanager-client",
    expiresIn: opts.expiresIn || "12h",
  };
  return jwt.sign(payload, JWT_SECRET, options);
}

// ---- WebAuthn routes (public) -----------------------------------------------
// Registration start: requires email + accountType (personal|business|both)
app.post("/auth/webauthn/register/start", async (req, res) => {
  try {
    const { email, accountType } = req.body || {};
    if (!email || !accountType) {
      return res.status(400).json({ error: "email_and_accountType_required" });
    }
    const db = req.app.locals.db;
    const user = await ensureUserWithType(db, email, accountType);

    const rpID = getRpID();
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: user._id.toString(),
      userName: user.email,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform", // prefer on-device passkeys
      },
      excludeCredentials: (user.webauthn.credentials || []).map((c) => ({
        id: base64url.toBuffer(c.id),
        type: "public-key",
      })),
    });

    await saveChallenge(db, user._id, options.challenge);
    res.json(options);
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: e.message });
  }
});

// Registration finish
app.post("/auth/webauthn/register/finish", async (req, res) => {
  try {
    const { email, accountType, attestation } = req.body || {};
    if (!email || !accountType || !attestation) {
      return res.status(400).json({ error: "bad_request" });
    }

    const db = req.app.locals.db;
    const user = await findUserByEmail(db, email);
    if (!user || !user.webauthn?.currentChallenge) {
      return res.status(400).json({ error: "challenge_not_found" });
    }

    const rpID = getRpID();
    const origin = getOrigin();

    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: user.webauthn.currentChallenge,
      expectedRPID: rpID,
      expectedOrigin: origin,
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return res.status(400).json({ verified: false });
    }

    const { registrationInfo } = verification;
    const newCred = {
      id: base64url.encode(registrationInfo.credentialID),
      publicKey: base64url.encode(registrationInfo.credentialPublicKey),
      counter: registrationInfo.counter || 0,
      transports: attestation?.response?.transports || [],
    };

    await addCredential(db, user._id, newCred);

    // Mint JWT immediately after successful registration
    const fresh = await findUserByEmail(db, email);
    const token = signAccessToken({
      userId: fresh._id.toString(),
      email: fresh.email,
      accountType: fresh.accountType, // <-- carries the chosen type
    });

    res.json({ verified: true, token });
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: e.message });
  }
});

// Login start
app.post("/auth/webauthn/login/start", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email_required" });

    const db = req.app.locals.db;
    const user = await findUserByEmail(db, email);
    const creds = user?.webauthn?.credentials || [];
    if (!user || creds.length === 0) {
      return res.status(404).json({ error: "no_credentials" });
    }

    const rpID = getRpID();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: creds.map((c) => ({
        id: base64url.toBuffer(c.id),
        type: "public-key",
        transports: c.transports || undefined,
      })),
    });

    await saveChallenge(db, user._id, options.challenge);
    res.json(options);
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: e.message });
  }
});

// Login finish → verifies assertion and returns JWT with accountType
app.post("/auth/webauthn/login/finish", async (req, res) => {
  try {
    const { email, assertion } = req.body || {};
    if (!email || !assertion) return res.status(400).json({ error: "bad_request" });

    const db = req.app.locals.db;
    const user = await findUserByEmail(db, email);
    if (!user || !user.webauthn?.currentChallenge) {
      return res.status(400).json({ error: "challenge_not_found" });
    }

    const rpID = getRpID();
    const origin = getOrigin();

    const credIdB64 = assertion.id;
    const cred = (user.webauthn.credentials || []).find((c) => c.id === credIdB64);
    if (!cred) return res.status(404).json({ error: "credential_not_found" });

    const authenticator = {
      credentialID: base64url.toBuffer(cred.id),
      credentialPublicKey: base64url.toBuffer(cred.publicKey),
      counter: cred.counter || 0,
      transports: cred.transports || undefined,
    };

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: user.webauthn.currentChallenge,
      expectedRPID: rpID,
      expectedOrigin: origin,
      requireUserVerification: true,
      authenticator,
    });

    if (!verification.verified) {
      return res.status(400).json({ verified: false });
    }

    const { authenticationInfo } = verification;
    await updateCounter(db, user._id, cred.id, authenticationInfo.newCounter);

    // Mint JWT with accountType
    const fresh = await findUserByEmail(db, email);
    const token = signAccessToken({
      userId: fresh._id.toString(),
      email: fresh.email,
      accountType: fresh.accountType, // <-- here too
    });

    res.json({ verified: true, token });
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: e.message });
  }
});

// ---- JWT auth middleware (protect APIs) -------------------------------------
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return res.status(401).json({ error: "missing_authorization" });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, {
        issuer: "expensemanager-api",
        audience: "expensemanager-client",
      });
    } catch {
      return res.status(401).json({ error: "invalid_or_expired_token" });
    }

    req.user = {
      userId: decoded.userId,
      email: String(decoded.email || "").toLowerCase(),
      accountType: decoded.accountType, // 'personal' | 'business' | 'both'
    };

    if (ENFORCE_ALLOWLIST) {
      const email = req.user.email;
      if (email !== OWNER_EMAIL) {
        const db = req.app?.locals?.db;
        if (!db) return res.status(503).json({ error: "db_unavailable" });
        const domain = email.split("@")[1] || "";
        const hit = await db.collection("allowlist").findOne({
          $or: [{ type: "email", value: email }, { type: "domain", value: domain }],
        });
        if (!hit) return res.status(403).json({ error: "not_allowed" });
      }
    }

    return next();
  } catch {
    return res.status(401).json({ error: "auth_failed" });
  }
}

// ---- Protected app routes ---------------------------------------------------
app.use(auth);
app.use("/categories", categoriesRoutes);
app.use("/buckets", bucketsRoutes);
app.use("/expenses", expensesRoutes);

// ---- Serve SPA (built frontend) --------------------------------------------
const distDir = path.join(__dirname, "dist");
const publicDir = fs.existsSync(distDir) ? distDir : path.join(__dirname, "public");

app.use(express.static(publicDir)); // serves /index.html and /assets/*

app.get("*", (req, res) => {
  const apiPrefixes = ["/api", "/health", "/auth", "/categories", "/buckets", "/expenses"];
  const isApi = apiPrefixes.some((p) => req.path.startsWith(p));
  if (isApi) return res.status(404).json({ error: "Not found" });
  return res.sendFile(path.join(publicDir, "index.html"));
});

// ---- Mongo connection then start server ------------------------------------
let client;
async function init() {
  try {
    console.log("Connecting to MongoDB...");
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    await client.connect();

    const db = client.db(MONGODB_DB);
    await db.command({ ping: 1 });

    // Helpful index if you keep an allowlist collection (email/domain)
    try {
      await db.collection("allowlist").createIndex({ type: 1, value: 1 }, { unique: true });
    } catch (_) {}

    app.locals.db = db;
    console.log(`Mongo connected to database: ${db.databaseName}`);

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server (Mongo connection error):", err.message);
    process.exit(1);
  }
}

init().catch((err) => {
  console.error("Unhandled init error:", err);
  process.exit(1);
});

// ---- Graceful shutdown ------------------------------------------------------
process.on("SIGTERM", async () => {
  try {
    await client?.close();
  } catch (_) {}
  process.exit(0);
});

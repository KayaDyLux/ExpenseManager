const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config();

// Routes (your existing files)
const auth = require("./middleware/auth");
const bucketsRoutes = require("./routes/buckets");
const expensesRoutes = require("./routes/expenses");
const categoriesRoutes = require("./routes/categories");

const app = express();
const PORT = process.env.PORT || 8080;

// Use env-provided URI. Prefer MONGODB_URI, fall back to DO's DATABASE_URL.
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || "";
// App database (the DB where your collections live)
const MONGODB_DB = process.env.MONGODB_DB || "ExpenseManager";

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI/DATABASE_URL env var");
  process.exit(1);
}

// ---------- CORS ----------
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://walrus-app-vkptp.ondigitalocean.app", // your DO site
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: false, // we use Bearer tokens, not cookies
  })
);

// ---------- Body parsing ----------
app.use(express.json());

// ---------- Public routes ----------
app.get("/health", async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.command({ ping: 1 });
    res.json({ status: "ok", mongo: "up", time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: "error", detail: e.message });
  }
});

// Optional API root
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

// ---------- Auth-protected routes ----------
app.use(auth);
app.use("/categories", categoriesRoutes);
app.use("/buckets", bucketsRoutes);
app.use("/expenses", expensesRoutes);

// ---------- Serve SPA (built frontend) ----------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir)); // serves /index.html, /assets/* etc.

// SPA fallback: send index.html for any non-API GET so client routing works
app.get("*", (req, res) => {
  const apiPrefixes = ["/api", "/health", "/categories", "/buckets", "/expenses"];
  const isApi = apiPrefixes.some((p) => req.path.startsWith(p));
  if (isApi) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.sendFile(path.join(publicDir, "index.html"));
});

// ---------- Mongo connection then start server ----------
let client;
async function init() {
  try {
    console.log("Connecting to MongoDB...");
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    const db = client.db(MONGODB_DB);
    // quick ping to verify the DB is reachable
    await db.command({ ping: 1 });
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

// Graceful shutdown
process.on("SIGTERM", async () => {
  try {
    await client?.close();
  } catch (_) {}
  process.exit(0);
});

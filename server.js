const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
require("dotenv").config();

// Routes
const auth = require("./middleware/auth");
const bucketsRoutes = require("./routes/buckets");
const expensesRoutes = require("./routes/expenses");
const categoriesRoutes = require("./routes/categories");

const app = express();
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "ExpenseManager";

if (!MONGODB_URI) {
  // Fail fast if not configured in DO env vars
  console.error("Missing MONGODB_URI env var");
  process.exit(1);
}

// ---------- CORS (BEFORE routes) ----------
app.use(cors({
  // while testing you can use ["*"]; for production, lock this to your frontend domain(s)
  origin: ["*"], // change later to: ["https://YOUR-FRONTEND.DOMAIN"]
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: true,
}));

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

// Optional: a friendly public root (remove if you want pure API)
app.get("/", (req, res) => {
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

// ---------- Mongo connection (single, reused) ----------
let client;
async function init() {
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  app.locals.db = db;

  // Make db available to routes via req.db if you want:
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

init().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  try { await client?.close(); } catch (_) {}
  process.exit(0);
});

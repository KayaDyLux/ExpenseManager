const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const path = require("path");
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
  console.error("Missing MONGODB_URI env var");
  process.exit(1);
}

// ---------- CORS (BEFORE routes) ----------
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://walrus-app-vkptp.ondigitalocean.app" // your DO frontend (or same domain)
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: false, // use bearer tokens, not cookies
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
app.get("/api", (req, res) => {
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
  // let API routes 404 naturally; everything else -> index.html
  const apiPrefixes = ["/api", "/health", "/categories", "/buckets", "/expenses"];
  if (apiPrefixes.some(p => req.pa

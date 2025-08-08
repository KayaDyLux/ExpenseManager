// server.js

const express = require("express");
const { MongoClient } = require("mongodb");
const auth = require("./middleware/auth");
const bucketsRoutes = require("./routes/buckets");
const expensesRoutes = require("./routes/expenses");

const app = express();

// Read env vars set in DigitalOcean
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ExpenseManager";
const port = process.env.PORT || 8080;

if (!mongoUri) {
  console.error("❌ MONGODB_URI is not set");
  process.exit(1);
}

// Parse JSON bodies
app.use(express.json());

// Connect once, then start server
MongoClient.connect(mongoUri)
  .then(client => {
    console.log("✅ Connected to MongoDB");
    const db = client.db(dbName);

    // Make db available to routes
    app.locals.db = db;
    app.locals.client = client;

    // Public health check
    app.get("/health", (req, res) => {
      res.json({ status: "ok", mongo: "up", time: new Date().toISOString() });
    });

    // Everything below requires auth (mock for now)
    app.use(auth);

    // Routes
    app.use("/buckets", bucketsRoutes);
    app.use("/expenses", expensesRoutes);

    // Start
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

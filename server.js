// server.js — Production-ready Express server for ExpenseManager
// Architecture: Node.js + Express + MongoDB (Mongoose)
// Auth: JWT (HS256) via middleware/auth.js
// Routing: /api/* for API; SPA served from /public
// Notes:
//  - Applies authRequired globally to /api (all protected)
//  - requireWorkspace enforced inside workspace-aware routers
//  - Proper static serving with API exclusions
//  - Health checks, security headers, CORS, compression, logging (dev), error handling
//  - Graceful shutdown

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

// Auth middleware
const { authRequired } = require('./middleware/auth');

// Routers
const categoriesRoutes = require('./routes/categories');
const budgetsRoutes = require('./routes/budgets');
const expensesRoutes = require('./routes/expenses');
const workspacesRoutes = require('./routes/workspaces');
const incomeRoutes = require('./routes/income');

const app = express();

// ---------------------------
// App settings
// ---------------------------
const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  // Fail fast with a clear message
  console.error('❌ Missing MONGO_URI in environment.');
  process.exit(1);
}

// If behind a proxy/load balancer (DigitalOcean App Platform)
app.set('trust proxy', 1);

// ---------------------------
// Middlewares
// ---------------------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS (restrict in production via env)
const allowedOrigin = process.env.CORS_ORIGIN || '*';
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

if (!isProd) {
  app.use(morgan('dev'));
}

// ---------------------------
// Health checks (public)
// ---------------------------
app.get('/healthz', (req, res) => res.status(200).json({ ok: true, uptime: process.uptime() }));

// ---------------------------
// API (protected by default)
// ---------------------------
// If you have public API routes, mount them BEFORE this line.
app.use('/api', authRequired);

app.use('/api/categories', categoriesRoutes);
app.use('/api/budgets', budgetsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/workspaces', workspacesRoutes);
app.use('/api/income', incomeRoutes);

// 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------
// Static (SPA)
// ---------------------------
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { maxAge: isProd ? '1d' : 0 }));

// Send index.html for non-API routes (client-side routing)
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ---------------------------
// Error handler (last)
// ---------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

// ---------------------------
// Mongo connection & Indexes
// ---------------------------
mongoose.set('strictQuery', true);

async function connectMongoWithRetry() {
  const opts = {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10_000,
  };
  try {
    await mongoose.connect(MONGO_URI, opts);
    console.log('✅ Mongo connected:', mongoose.connection.name);

    // Enforce critical indexes defined in schemas once connected
    await ensureIndexes();

    // Start server only after successful Mongo connection
    startServer();
  } catch (err) {
    console.error('Mongo connection failed, retrying in 5s:', err.message);
    setTimeout(connectMongoWithRetry, 5000);
  }
}

async function ensureIndexes() {
  // Lazy-load models to ensure mongoose.models is populated
  // (Importing routers above may already register models.)
  const models = mongoose.models;
  const critical = ['Category', 'Budget', 'Expense', 'Workspace', 'Income', 'User'];
  for (const name of critical) {
    const mdl = models[name];
    if (mdl && typeof mdl.ensureIndexes === 'function') {
      try {
        await mdl.ensureIndexes();
        // Some Mongoose versions use createIndexes/ensureIndexes interchangeably
      } catch (e) {
        if (mdl.createIndexes) await mdl.createIndexes();
      }
    }
  }
  console.log('🔧 Index enforcement done');
}

let server;
function startServer() {
  server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server && server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('🛑 Mongo disconnected. Bye.');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Boot
connectMongoWithRetry();

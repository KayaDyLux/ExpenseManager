// server.js – production-ready

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')
const { authRequired } = require('./middleware/auth')

// --- Routes ---
const categoriesRoutes = require('./routes/categories')
const budgetsRoutes = require('./routes/budgets') // replaces buckets
const expensesRoutes = require('./routes/expenses')
const workspacesRoutes = require('./routes/workspaces')
const incomeRoutes = require('./routes/income')

// --- App init ---
const app = express()
const PORT = process.env.PORT || 8080
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL
const MONGODB_DB = process.env.MONGODB_DB || 'ExpenseManager'

if (!MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI')
  process.exit(1)
}

// --- Middleware ---
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// --- CORS ---
const allowedOrigins = [
  'http://localhost:5173',
  process.env.ORIGIN,
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    return cb(new Error('CORS not allowed'))
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}))

// --- Public endpoints ---
app.get('/health', async (req, res) => {
  try {
    await req.app.locals.db.command({ ping: 1 })
    res.json({ status: 'ok', time: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message })
  }
})

// --- Protected API ---
app.use(authRequired)
app.use('/categories', categoriesRoutes)
app.use('/budgets', budgetsRoutes)
app.use('/expenses', expensesRoutes)
app.use('/workspaces', workspacesRoutes)
app.use('/', incomeRoutes) // income defines full paths (/income-sources, /income/summary, etc.)

// --- Serve SPA ---
const distDir = path.join(__dirname, 'dist')
const publicDir = fs.existsSync(distDir) ? distDir : path.join(__dirname, 'public')
app.use(express.static(publicDir))

app.get('*', (req, res) => {
  const apiPrefixes = ['/health', '/categories', '/budgets', '/expenses', '/workspaces', '/income']
  if (apiPrefixes.some(p => req.path.startsWith(p))) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.sendFile(path.join(publicDir, 'index.html'))
})

// --- Start server after DB connect ---
let client
async function init() {
  try {
    client = new MongoClient(MONGODB_URI, { maxPoolSize: 10 })
    await client.connect()
    const db = client.db(MONGODB_DB)
    await db.command({ ping: 1 })

    // Indexes for performance & uniqueness
    await db.collection('categories').createIndex({ workspaceId: 1, name_lc: 1, active: 1 }, { unique: true })
    await db.collection('budgets').createIndex({ workspaceId: 1, name_lc: 1, active: 1 }, { unique: true })
    await db.collection('users').createIndex({ email: 1 }, { unique: true })

    app.locals.db = db
    console.log(`✅ Mongo connected: ${MONGODB_DB}`)

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
    })
  } catch (err) {
    console.error('❌ Mongo connection failed:', err.message)
    process.exit(1)
  }
}

init()

// --- Graceful shutdown ---
process.on('SIGTERM', async () => {
  console.log('Shutting down...')
  await client?.close()
  process.exit(0)
})

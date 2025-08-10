// routes/workspaces.js
const router = require('express').Router()
const { authRequired, requireWorkspace } = require('../middleware/auth')
const { ObjectId } = require('mongodb')

// All workspace routes require auth
router.use(authRequired)

/**
 * POST /workspaces/init
 * Ensure personal/business workspaces exist for this user
 * Seeds default categories if new workspaces created
 */
router.post('/init', async (req, res) => {
  const db = req.app.locals.db
  const { accountType } = req.user
  const userId = new ObjectId(req.user.userId)
  const typesNeeded = []

  if (accountType === 'personal' || accountType === 'both') typesNeeded.push('personal')
  if (accountType === 'business' || accountType === 'both') typesNeeded.push('business')

  const existing = await db.collection('workspaces')
    .find({ userId, type: { $in: typesNeeded }, active: { $ne: false } })
    .toArray()
  const existingTypes = existing.map(ws => ws.type)

  const toCreate = typesNeeded.filter(t => !existingTypes.includes(t))
  const now = new Date()

  const newWorkspaces = toCreate.map(t => ({
    userId,
    type: t,
    name: t === 'personal' ? 'Personal' : 'Business',
    currency: 'EUR',
    startDayOfMonth: 1,
    active: true,
    createdAt: now,
    updatedAt: now
  }))

  if (newWorkspaces.length) {
    await db.collection('workspaces').insertMany(newWorkspaces)
    // TODO: seed default categories for each new workspace
  }

  const all = await db.collection('workspaces')
    .find({ userId, active: { $ne: false } })
    .sort({ type: 1 })
    .toArray()

  res.json({ workspaces: all })
})

/**
 * GET /workspaces
 * List active workspaces for logged-in user
 */
router.get('/', async (req, res) => {
  const db = req.app.locals.db
  const userId = new ObjectId(req.user.userId)
  const docs = await db.collection('workspaces')
    .find({ userId, active: { $ne: false } })
    .sort({ type: 1 })
    .toArray()
  res.json(docs)
})

/**
 * GET /workspaces/:id/summary
 * Returns KPIs, budgets, charts for a given workspace
 */
router.get('/:id/summary', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const wsId = new ObjectId(req.params.id)

  const workspace = await db.collection('workspaces').findOne({ _id: wsId })
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' })

  // TODO: Replace placeholders with actual aggregations
  res.json({
    kpis: { cashOnHand: 0, mtdSpend: 0, remainingToBudget: 0 },
    charts: { spendingOverTime: [], categoryBreakdown: [] },
    budgets: []
  })
})

/**
 * PATCH /workspaces/account-type
 * Upgrade/downgrade account type; archive/unarchive workspaces
 */
router.patch('/account-type', async (req, res) => {
  const db = req.app.locals.db
  const { newType } = req.body
  const userId = new ObjectId(req.user.userId)
  const validTypes = ['personal', 'business', 'both']

  if (!validTypes.includes(newType)) {
    return res.status(400).json({ error: 'Invalid account type' })
  }

  // Archive workspaces no longer needed
  const now = new Date()
  if (newType === 'personal') {
    await db.collection('workspaces').updateMany(
      { userId, type: 'business', active: true },
      { $set: { active: false, archivedAt: now, updatedAt: now } }
    )
  } else if (newType === 'business') {
    await db.collection('workspaces').updateMany(
      { userId, type: 'personal', active: true },
      { $set: { active: false, archivedAt: now, updatedAt: now } }
    )
  }

  // Reactivate if both selected
  if (newType === 'both') {
    await db.collection('workspaces').updateMany(
      { userId, active: false },
      { $set: { active: true }, $unset: { archivedAt: '' } }
    )
  }

  res.json({ ok: true })
})

module.exports = router

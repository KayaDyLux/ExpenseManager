// routes/budgets.js
const express = require('express')
const { ObjectId } = require('mongodb')
const Joi = require('joi')
const rateLimit = require('express-rate-limit')
const { authRequired, requireWorkspace } = require('../middleware/auth')

const router = express.Router()

// --- Middleware: all budget routes require auth ---
router.use(authRequired)

// --- Validators ---
const id = (v) => {
  try { return new ObjectId(String(v)) } catch { return null }
}

const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  target: Joi.number().min(0).default(0),
  period: Joi.string().valid('monthly', 'quarterly', 'annual').default('monthly'),
  color: Joi.string().trim().max(20).optional()
})

const updateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  target: Joi.number().min(0),
  period: Joi.string().valid('monthly', 'quarterly', 'annual'),
  color: Joi.string().trim().max(20),
  active: Joi.boolean()
}).min(1)

const fundSchema = Joi.object({
  amount: Joi.number().greater(0).required(),
  date: Joi.date().iso().default(() => new Date(), 'now'),
  note: Joi.string().max(300).allow('', null),
  source: Joi.string().max(120).allow('', null)
})

const transferSchema = Joi.object({
  fromBudgetId: Joi.string().required(),
  toBudgetId: Joi.string().required(),
  amount: Joi.number().greater(0).required(),
  note: Joi.string().max(300).allow('', null)
})

// Light rate limit for money-affecting endpoints
const writeLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * GET /budgets?workspaceId=...&includeArchived=false
 */
router.get('/', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const ws = id(req.workspaceId)
  const includeArchived = String(req.query.includeArchived || 'false') === 'true'

  const filter = { workspaceId: ws }
  if (!includeArchived) filter.active = { $ne: false }

  const docs = await db.collection('budgets')
    .find(filter)
    .sort({ name_lc: 1 })
    .toArray()

  res.json(docs)
})

/**
 * POST /budgets
 * body: { name, target?, period?, color? }
 */
router.post('/', requireWorkspace, writeLimiter, async (req, res) => {
  const db = req.app.locals.db
  const { value, error } = createSchema.validate(req.body, { stripUnknown: true })
  if (error) return res.status(400).json({ error: error.message })

  const now = new Date()
  const doc = {
    workspaceId: id(req.workspaceId),
    name: value.name,
    name_lc: value.name.trim().toLowerCase(),
    target: value.target,
    period: value.period,
    color: value.color,
    active: true,
    createdAt: now,
    updatedAt: now
  }

  try {
    const r = await db.collection('budgets').insertOne(doc)
    res.status(201).json({ _id: r.insertedId, ...doc })
  } catch (e) {
    // Likely unique index collision on (workspaceId, name_lc, active)
    res.status(400).json({ error: e.message })
  }
})

/**
 * PATCH /budgets/:id
 */
router.patch('/:id', requireWorkspace, writeLimiter, async (req, res) => {
  const db = req.app.locals.db
  const budgetId = id(req.params.id)
  const ws = id(req.workspaceId)
  if (!budgetId) return res.status(400).json({ error: 'invalid id' })

  const { value, error } = updateSchema.validate(req.body, { stripUnknown: true })
  if (error) return res.status(400).json({ error: error.message })

  const $set = { ...value, updatedAt: new Date() }
  if (value.name) $set.name_lc = value.name.trim().toLowerCase()

  const r = await db.collection('budgets').findOneAndUpdate(
    { _id: budgetId, workspaceId: ws },
    { $set },
    { returnDocument: 'after' }
  )
  if (!r.value) return res.status(404).json({ error: 'Budget not found' })
  res.json(r.value)
})

/**
 * DELETE /budgets/:id  (soft delete)
 */
router.delete('/:id', requireWorkspace, writeLimiter, async (req, res) => {
  const db = req.app.locals.db
  const budgetId = id(req.params.id)
  const ws = id(req.workspaceId)
  if (!budgetId) return res.status(400).json({ error: 'invalid id' })

  const now = new Date()
  const r = await db.collection('budgets').findOneAndUpdate(
    { _id: budgetId, workspaceId: ws, active: { $ne: false } },
    { $set: { active: false, archivedAt: now, updatedAt: now } },
    { returnDocument: 'after' }
  )
  if (!r.value) return res.status(404).json({ error: 'Budget not found or already archived' })
  res.json({ ok: true, archivedAt: now.toISOString() })
})

/**
 * POST /budgets/:id/fund
 * body: { amount, date?, note?, source? }
 */
router.post('/:id/fund', requireWorkspace, writeLimiter, async (req, res) => {
  const db = req.app.locals.db
  const budgetId = id(req.params.id)
  const ws = id(req.workspaceId)
  if (!budgetId) return res.status(400).json({ error: 'invalid id' })

  const { value, error } = fundSchema.validate(req.body, { stripUnknown: true })
  if (error) return res.status(400).json({ error: error.message })

  // Ensure budget exists and is active
  const budget = await db.collection('budgets').findOne({ _id: budgetId, workspaceId: ws, active: { $ne: false } })
  if (!budget) return res.status(404).json({ error: 'Budget not found or archived' })

  const doc = {
    workspaceId: ws,
    budgetId,
    amount: value.amount,
    date: new Date(value.date),
    note: value.note || undefined,
    source: value.source || 'manual',
    createdAt: new Date()
  }

  const r = await db.collection('fundings').insertOne(doc)
  res.status(201).json({ _id: r.insertedId, ...doc })
})

/**
 * POST /budgets/transfer
 * body: { fromBudgetId, toBudgetId, amount, note? }
 * Creates two funding records: negative for from, positive for to.
 */
router.post('/transfer', requireWorkspace, writeLimiter, async (req, res) => {
  const db = req.app.locals.db
  const ws = id(req.workspaceId)

  const { value, error } = transferSchema.validate(req.body, { stripUnknown: true })
  if (error) return res.status(400).json({ error: error.message })

  const fromId = id(value.fromBudgetId)
  const toId = id(value.toBudgetId)
  if (!fromId || !toId || String(fromId) === String(toId)) {
    return res.status(400).json({ error: 'Invalid from/to budget' })
  }

  // Ensure both budgets exist in same workspace
  const budgets = await db.collection('budgets')
    .find({ _id: { $in: [fromId, toId] }, workspaceId: ws, active: { $ne: false } })
    .toArray()
  if (budgets.length !== 2) return res.status(400).json({ error: 'Budgets not found or archived' })

  const now = new Date()
  const docs = [
    // debit (outflow)
    {
      workspaceId: ws,
      budgetId: fromId,
      amount: -Math.abs(value.amount),
      date: now,
      note: value.note ? `Transfer out: ${value.note}` : 'Transfer out',
      source: 'transfer',
      createdAt: now
    },
    // credit (inflow)
    {
      workspaceId: ws,
      budgetId: toId,
      amount: Math.abs(value.amount),
      date: now,
      note: value.note ? `Transfer in: ${value.note}` : 'Transfer in',
      source: 'transfer',
      createdAt: now
    }
  ]

  await db.collection('fundings').insertMany(docs, { ordered: true })
  res.status(201).json({ ok: true })
})

/**
 * GET /budgets/:id/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns { target, funded, spent, remaining, expenses: [...], fundings: [...] }
 */
router.get('/:id/summary', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const ws = id(req.workspaceId)
  const budgetId = id(req.params.id)
  if (!budgetId) return res.status(400).json({ error: 'invalid id' })

  const budget = await db.collection('budgets').findOne({ _id: budgetId, workspaceId: ws })
  if (!budget) return res.status(404).json({ error: 'Budget not found' })

  // Parse period range
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const to = req.query.to ? new Date(req.query.to) : new Date()
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return res.status(400).json({ error: 'Invalid from/to' })
  }

  // Aggregate fundings
  const fundedAgg = await db.collection('fundings').aggregate([
    { $match: { workspaceId: ws, budgetId, date: { $gte: from, $lt: to } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).toArray()
  const funded = fundedAgg[0]?.total || 0

  // Aggregate expenses
  const spentAgg = await db.collection('expenses').aggregate([
    { $match: { workspaceId: ws, budgetId, date: { $gte: from, $lt: to } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).toArray()
  const spent = spentAgg[0]?.total || 0

  const remainingClassic = Math.max(0, (budget.target || 0) - spent)
  const envelopeRemaining = funded - spent

  res.json({
    budget: {
      _id: budget._id,
      name: budget.name,
      target: budget.target,
      period: budget.period,
      color: budget.color,
    },
    period: { from, to },
    totals: {
      funded,
      spent,
      remainingClassic,
      envelopeRemaining
    }
  })
})

module.exports = router

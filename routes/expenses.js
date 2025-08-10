// routes/expenses.js
const express = require('express')
const { ObjectId } = require('mongodb')
const router = express.Router()
const { authRequired, requireWorkspace } = require('../middleware/auth')

// All expense routes require auth
router.use(authRequired)

/* --------------------------- helpers --------------------------- */
function oid(id, name = 'id') {
  try {
    return new ObjectId(id)
  } catch {
    const err = new Error(`Invalid ObjectId for ${name}`)
    err.status = 400
    throw err
  }
}

function num(n, name) {
  const v = Number(n)
  if (!Number.isFinite(v)) {
    const err = new Error(`${name} must be a finite number`)
    err.status = 400
    throw err
  }
  return v
}

function sanitizeCurrency(c) {
  return String(c || 'EUR').trim().toUpperCase().slice(0, 3)
}

function pickExpenseUpdate(body) {
  const out = {}
  if (body.amount !== undefined) out.amount = num(body.amount, 'amount')
  if (body.currency !== undefined) out.currency = sanitizeCurrency(body.currency)
  if (body.date !== undefined) out.date = new Date(body.date)
  if (body.merchant !== undefined) out.merchant = String(body.merchant).trim()
  if (body.note !== undefined) out.note = String(body.note)
  if (body.receiptUrl !== undefined) out.receiptUrl = String(body.receiptUrl)
  if (body.ocrData !== undefined) out.ocrData = body.ocrData
  if (body.categoryId !== undefined) out.categoryId = body.categoryId ? oid(body.categoryId, 'categoryId') : undefined
  if (body.budgetId !== undefined) out.budgetId = body.budgetId ? oid(body.budgetId, 'budgetId') : undefined

  // tax: allow rate (0..1) and/or amount
  if (body.tax !== undefined) {
    const t = body.tax || {}
    const tax = {}
    if (t.rate !== undefined) tax.rate = num(t.rate, 'tax.rate')
    if (t.amount !== undefined) tax.amount = num(t.amount, 'tax.amount')
    out.tax = tax
  }
  return out
}

/* ---------------------------- create --------------------------- */
/**
 * POST /expenses
 * body: { workspaceId, categoryId?, budgetId?, amount, currency?, date?, merchant?, tax?, note?, receiptUrl?, ocrData? }
 * - Auto-map budgetId from category.defaultBudgetId if budgetId missing
 */
router.post('/', requireWorkspace, async (req, res, next) => {
  try {
    const db = req.app.locals.db
    const ws = oid(req.workspaceId, 'workspaceId')
    const now = new Date()

    if (req.body.amount === undefined) {
      return res.status(400).json({ error: 'amount is required' })
    }

    const expense = {
      workspaceId: ws,
      userId: oid(req.user.userId, 'userId'),
      categoryId: req.body.categoryId ? oid(req.body.categoryId, 'categoryId') : undefined,
      budgetId: req.body.budgetId ? oid(req.body.budgetId, 'budgetId') : undefined,
      amount: num(req.body.amount, 'amount'),
      currency: sanitizeCurrency(req.body.currency),
      date: req.body.date ? new Date(req.body.date) : now,
      merchant: req.body.merchant ? String(req.body.merchant).trim() : undefined,
      tax: req.body.tax || {},
      note: req.body.note,
      receiptUrl: req.body.receiptUrl,
      ocrData: req.body.ocrData,
      active: true,
      createdAt: now,
      updatedAt: now,
    }

    // Auto-map budget from category if not provided
    if (!expense.budgetId && expense.categoryId) {
      const cat = await db.collection('categories').findOne({
        _id: expense.categoryId, workspaceId: ws,
      }, { projection: { defaultBudgetId: 1 } })
      if (cat?.defaultBudgetId) {
        // ensure budget still active in this workspace
        const b = await db.collection('budgets').findOne({
          _id: cat.defaultBudgetId, workspaceId: ws, active: { $ne: false },
        }, { projection: { _id: 1 } })
        if (b) expense.budgetId = b._id
      }
    }

    // Optional: if budgetId provided, validate it belongs to the workspace & is active
    if (expense.budgetId) {
      const exists = await db.collection('budgets').countDocuments({
        _id: expense.budgetId, workspaceId: ws, active: { $ne: false },
      }, { limit: 1 })
      if (!exists) return res.status(400).json({ error: 'budgetId not found in workspace or archived' })
    }

    const r = await db.collection('expenses').insertOne(expense)
    res.status(201).json({ _id: r.insertedId, ...expense })
  } catch (err) { next(err) }
})

/* ----------------------------- list ---------------------------- */
/**
 * GET /expenses?workspaceId=...&from=YYYY-MM-DD&to=YYYY-MM-DD&categoryId=&budgetId=&limit=&cursor=
 * - Cursor is the last _id from previous page for pagination.
 */
router.get('/', requireWorkspace, async (req, res, next) => {
  try {
    const db = req.app.locals.db
    const ws = oid(req.workspaceId, 'workspaceId')
    const includeArchived = String(req.query.includeArchived || 'false') === 'true'
    const limit = Math.max(1, Math.min(Number(req.query.limit || 50), 200))
    const cursor = req.query.cursor ? oid(req.query.cursor, 'cursor') : null

    const match = { workspaceId: ws }
    if (!includeArchived) match.active = { $ne: false }

    if (req.query.from || req.query.to) {
      match.date = {}
      if (req.query.from) match.date.$gte = new Date(req.query.from)
      if (req.query.to) match.date.$lt = new Date(req.query.to)
    }
    if (req.query.categoryId) match.categoryId = oid(req.query.categoryId, 'categoryId')
    if (req.query.budgetId) match.budgetId = oid(req.query.budgetId, 'budgetId')
    if (cursor) match._id = { $lt: cursor }

    const docs = await db.collection('expenses')
      .find(match)
      .sort({ _id: -1 }) // descending for pagination
      .limit(limit + 1)
      .toArray()

    const nextCursor = docs.length > limit ? String(docs[limit - 1]?._id) : null
    const page = docs.slice(0, limit)

    res.json({ items: page, nextCursor })
  } catch (err) { next(err) }
})

/* ------------------------- get by id --------------------------- */
/**
 * GET /expenses/:id?workspaceId=...
 */
router.get('/:id', requireWorkspace, async (req, res, next) => {
  try {
    const db = req.app.locals.db
    const ws = oid(req.workspaceId, 'workspaceId')
    const _id = oid(req.params.id, 'id')

    const doc = await db.collection('expenses').findOne({ _id, workspaceId: ws })
    if (!doc) return res.status(404).json({ error: 'Expense not found' })
    res.json(doc)
  } catch (err) { next(err) }
})

/* ---------------------------- update -------------------------- */
/**
 * PATCH /expenses/:id
 * body: any updatable fields (see pickExpenseUpdate)
 * - validates budget/category are in workspace
 * - if budgetId omitted but category changed → re-map from category.defaultBudgetId
 */
router.patch('/:id', requireWorkspace, async (req, res, next) => {
  try {
    const db = req.app.locals.db
    const ws = oid(req.workspaceId, 'workspaceId')
    const _id = oid(req.params.id, 'id')

    const $set = pickExpenseUpdate(req.body)
    $set.updatedAt = new Date()

    // If category changed and no explicit budgetId, try auto-map
    if ($set.categoryId && $set.budgetId === undefined) {
      const cat = await db.collection('categories').findOne({
        _id: $set.categoryId, workspaceId: ws,
      }, { projection: { defaultBudgetId: 1 } })
      if (cat?.defaultBudgetId) {
        const b = await db.collection('budgets').findOne({
          _id: cat.defaultBudgetId, workspaceId: ws, active: { $ne: false },
        }, { projection: { _id: 1 } })
        if (b) $set.budgetId = b._id
      }
    }

    // Validate explicit budgetId/categoryId (same workspace, active for budget)
    if ($set.budgetId) {
      const exists = await db.collection('budgets').countDocuments({
        _id: $set.budgetId, workspaceId: ws, active: { $ne: false },
      }, { limit: 1 })
      if (!exists) return res.status(400).json({ error: 'budgetId not found in workspace or archived' })
    }
    if ($set.categoryId) {
      const exists = await db.collection('categories').countDocuments({
        _id: $set.categoryId, workspaceId: ws,
      }, { limit: 1 })
      if (!exists) return res.status(400).json({ error: 'categoryId not found in workspace' })
    }

    const r = await db.collection('expenses').findOneAndUpdate(
      { _id, workspaceId: ws },
      { $set },
      { returnDocument: 'after' }
    )
    if (!r.value) return res.status(404).json({ error: 'Expense not found' })
    res.json(r.value)
  } catch (err) { next(err) }
})

/* --------------------------- soft delete ---------------------- */
/**
 * DELETE /expenses/:id  (soft delete)
 */
router.delete('/:id', requireWorkspace, async (req, res, next) => {
  try {
    const db = req.app.locals.db
    const ws = oid(req.workspaceId, 'workspaceId')
    const _id = oid(req.params.id, 'id')
    const now = new Date()

    const r = await db.collection('expenses').findOneAndUpdate(
      { _id, workspaceId: ws, active: { $ne: false } },
      { $set: { active: false, archivedAt: now, updatedAt: now } },
      { returnDocument: 'after' }
    )
    if (!r.value) return res.status(404).json({ error: 'Expense not found or already archived' })

    res.json({ ok: true, archivedAt: now.toISOString() })
  } catch (err) { next(err) }
})

/* ----------------------------- restore ------------------------ */
/**
 * POST /expenses/:id/restore
 */
router.post('/:id/restore', requireWorkspace, async (req, res, next) => {
  try {
    const db = req.app.locals.db
    const ws = oid(req.workspaceId, 'workspaceId')
    const _id = oid(req.params.id, 'id')

    const r = await db.collection('expenses').findOneAndUpdate(
      { _id, workspaceId: ws, active: false },
      { $set: { active: true, updatedAt: new Date() }, $unset: { archivedAt: '' } },
      { returnDocument: 'after' }
    )
    if (!r.value) return res.status(404).json({ error: 'Expense not archived or not found' })
    res.json(r.value)
  } catch (err) { next(err) }
})

/* ---------------------------- summary ------------------------ */
/**
 * GET /expenses/summary/monthly?workspaceId=...&from=&to=
 * Returns aggregated spend/tax per month (YYYY-MM).
 */
router.get('/summary/monthly', requireWorkspace, async (req, res, next) => {
  try {
    const db = req.app.locals.db
    const ws = oid(req.workspaceId, 'workspaceId')

    const match = { workspaceId: ws, active: { $ne: false } }
    if (req.query.from || req.query.to) {
      match.date = {}
      if (req.query.from) match.date.$gte = new Date(req.query.from)
      if (req.query.to) match.date.$lt = new Date(req.query.to)
    }

    const agg = await db.collection('expenses').aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            y: { $year: '$date' },
            m: { $month: '$date' },
          },
          spend: { $sum: '$amount' },
          tax: { $sum: { $ifNull: ['$tax.amount', 0] } },
        }
      },
      { $sort: { '_id.y': -1, '_id.m': -1 } }
    ]).toArray()

    const months = agg.map(a => ({
      year: a._id.y,
      month: a._id.m,
      spend: a.spend,
      tax: a.tax,
    }))

    res.json({ months })
  } catch (err) { next(err) }
})

/* -------------------------- error handler --------------------- */
router.use((err, req, res, _next) => {
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Server error' })
})

module.exports = router

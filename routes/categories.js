// routes/categories.js
const express = require('express')
const { ObjectId } = require('mongodb')
const router = express.Router()
const { authRequired, requireWorkspace } = require('../middleware/auth')

// All category routes require auth
router.use(authRequired)

/**
 * GET /categories?workspaceId=...&includeArchived=false
 */
router.get('/', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const ws = new ObjectId(req.workspaceId)
  const includeArchived = String(req.query.includeArchived || 'false') === 'true'

  const filter = { workspaceId: ws }
  if (!includeArchived) filter.active = { $ne: false }

  const docs = await db.collection('categories')
    .find(filter)
    .sort({ name_lc: 1 })
    .toArray()

  res.json(docs)
})

/**
 * POST /categories
 * body: { workspaceId, name, color?, icon?, defaultBudgetId? }
 */
router.post('/', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const { name, color, icon, defaultBudgetId } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const now = new Date()
  const doc = {
    workspaceId: new ObjectId(req.workspaceId),
    name,
    name_lc: String(name).trim().toLowerCase(),
    color,
    icon,
    defaultBudgetId: defaultBudgetId ? new ObjectId(defaultBudgetId) : undefined,
    active: true,
    createdAt: now,
    updatedAt: now,
  }

  try {
    const r = await db.collection('categories').insertOne(doc)
    res.status(201).json({ _id: r.insertedId, ...doc })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/**
 * PATCH /categories/:id
 * body can include: name, color, icon, active
 */
router.patch('/:id', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const _id = new ObjectId(req.params.id)
  const ws = new ObjectId(req.workspaceId)

  const $set = { updatedAt: new Date() }
  ;['name', 'color', 'icon', 'active'].forEach(k => {
    if (req.body[k] !== undefined) $set[k] = req.body[k]
  })
  if ($set.name) $set.name_lc = String($set.name).trim().toLowerCase()

  const r = await db.collection('categories').findOneAndUpdate(
    { _id, workspaceId: ws },
    { $set },
    { returnDocument: 'after' }
  )
  if (!r.value) return res.status(404).json({ error: 'Category not found' })
  res.json(r.value)
})

/**
 * PATCH /categories/:id/map-bucket
 * body: { defaultBudgetId: string|null }
 */
router.patch('/:id/map-bucket', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const _id = new ObjectId(req.params.id)
  const ws = new ObjectId(req.workspaceId)
  const { defaultBudgetId } = req.body

  const now = new Date()
  if (defaultBudgetId) {
    const budgetId = new ObjectId(defaultBudgetId)
    const exists = await db.collection('budgets')
      .findOne({ _id: budgetId, workspaceId: ws, active: { $ne: false } })
    if (!exists) return res.status(400).json({ error: 'Budget not found in workspace or archived' })

    const r = await db.collection('categories').findOneAndUpdate(
      { _id, workspaceId: ws },
      { $set: { defaultBudgetId: budgetId, updatedAt: now } },
      { returnDocument: 'after' }
    )
    if (!r.value) return res.status(404).json({ error: 'Category not found' })
    return res.json(r.value)
  }

  // Clear mapping
  const r = await db.collection('categories').findOneAndUpdate(
    { _id, workspaceId: ws },
    { $unset: { defaultBudgetId: '' }, $set: { updatedAt: now } },
    { returnDocument: 'after' }
  )
  if (!r.value) return res.status(404).json({ error: 'Category not found' })
  res.json(r.value)
})

/**
 * DELETE /categories/:id   (soft delete)
 */
router.delete('/:id', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const _id = new ObjectId(req.params.id)
  const ws = new ObjectId(req.workspaceId)
  const now = new Date()

  const r = await db.collection('categories').findOneAndUpdate(
    { _id, workspaceId: ws, active: { $ne: false } },
    { $set: { active: false, archivedAt: now, updatedAt: now } },
    { returnDocument: 'after' }
  )
  if (!r.value) return res.status(404).json({ error: 'Category not found or already archived' })

  res.json({ ok: true, archivedAt: now.toISOString() })
})

/**
 * POST /categories/:id/restore
 */
router.post('/:id/restore', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const _id = new ObjectId(req.params.id)
  const ws = new ObjectId(req.workspaceId)

  const r = await db.collection('categories').findOneAndUpdate(
    { _id, workspaceId: ws, active: false },
    { $set: { active: true, updatedAt: new Date() }, $unset: { archivedAt: '' } },
    { returnDocument: 'after' }
  )
  if (!r.value) return res.status(404).json({ error: 'Category not archived or not found' })
  res.json(r.value)
})

/**
 * POST /categories/bulk   (JSON)
 * body: { items: [{ name, color?, icon?, budgetId? }] }
 */
router.post('/bulk', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const ws = new ObjectId(req.workspaceId)
  const items = Array.isArray(req.body.items) ? req.body.items : []
  if (!items.length) return res.status(400).json({ error: 'items required' })

  const now = new Date()
  const docs = []
  for (const it of items) {
    if (!it.name) continue
    docs.push({
      workspaceId: ws,
      name: it.name,
      name_lc: String(it.name).trim().toLowerCase(),
      color: it.color,
      icon: it.icon,
      defaultBudgetId: it.budgetId ? new ObjectId(it.budgetId) : undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
  }
  if (!docs.length) return res.status(400).json({ error: 'no valid items' })
  const r = await db.collection('categories').insertMany(docs, { ordered: false })
  res.status(201).json({ created: r.insertedCount })
})

/**
 * POST /categories/bulk-csv?workspaceId=...&createBudgetIfMissing=true
 * body: raw CSV with header: name,color,icon,budgetName
 */
router.post('/bulk-csv', requireWorkspace, express.text({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const db = req.app.locals.db
  const ws = new ObjectId(req.workspaceId)
  const createBudgetIfMissing = String(req.query.createBudgetIfMissing || 'true') === 'true'

  const text = (req.body || '').trim()
  if (!text) return res.status(400).json({ error: 'CSV body required' })

  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = lines.shift()
  if (!header) return res.status(400).json({ error: 'CSV header missing' })

  const cols = header.split(',').map(s => s.trim().toLowerCase())
  const idx = {
    name: cols.indexOf('name'),
    color: cols.indexOf('color'),
    icon: cols.indexOf('icon'),
    budgetName: cols.indexOf('budgetname'),
  }
  if (idx.name === -1) return res.status(400).json({ error: 'CSV must include "name"' })

  const now = new Date()
  const docs = []

  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim())
    const name = parts[idx.name]
    if (!name) continue

    let defaultBudgetId
    if (idx.budgetName !== -1) {
      const budgetName = (parts[idx.budgetName] || '').trim()
      if (budgetName) {
        const budgetNameLc = budgetName.toLowerCase()
        let budget = await db.collection('budgets')
          .findOne({ workspaceId: ws, name_lc: budgetNameLc, active: { $ne: false } })
        if (!budget && createBudgetIfMissing) {
          const r = await db.collection('budgets').insertOne({
            workspaceId: ws,
            name: budgetName,
            name_lc: budgetNameLc,
            target: 0,
            period: 'monthly',
            active: true,
            createdAt: now,
            updatedAt: now,
          })
          budget = { _id: r.insertedId }
        }
        if (budget) defaultBudgetId = budget._id
      }
    }

    docs.push({
      workspaceId: ws,
      name,
      name_lc: name.toLowerCase(),
      color: idx.color !== -1 ? parts[idx.color] || undefined : undefined,
      icon: idx.icon !== -1 ? parts[idx.icon] || undefined : undefined,
      defaultBudgetId,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
  }

  if (!docs.length) return res.status(400).json({ error: 'No valid data rows' })
  const r = await db.collection('categories').insertMany(docs, { ordered: false })
  res.status(201).json({ created: r.insertedCount })
})

/**
 * GET /categories/:id/suggest-budget?workspaceId=...
 */
router.get('/:id/suggest-budget', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const ws = new ObjectId(req.workspaceId)
  const _id = new ObjectId(req.params.id)

  const cat = await db.collection('categories').findOne({ _id, workspaceId: ws })
  if (!cat) return res.status(404).json({ error: 'Category not found' })

  if (cat.defaultBudgetId) {
    const b = await db.collection('budgets')
      .findOne({ _id: cat.defaultBudgetId, workspaceId: ws, active: { $ne: false } })
    if (b) return res.json({ budgetId: b._id, name: b.name })
  }

  const match = await db.collection('budgets')
    .findOne({ workspaceId: ws, name_lc: cat.name_lc, active: { $ne: false } })
  if (match) return res.json({ budgetId: match._id, name: match.name })

  res.json({ budgetId: null })
})

module.exports = router

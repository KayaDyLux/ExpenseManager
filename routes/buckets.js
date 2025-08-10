const express = require('express')
const { ObjectId } = require('mongodb')
const router = express.Router()
const { authRequired, requireWorkspace } = require('../middleware/auth')

// All budgets routes require auth
router.use(authRequired)

/**
 * GET /budgets?workspaceId=...
 */
router.get('/budgets', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const ws = new ObjectId(req.workspaceId)
  const docs = await db.collection('budgets')
    .find({ workspaceId: ws, active: { $ne: false } })
    .sort({ name_lc: 1 })
    .toArray()
  res.json(docs)
})

/**
 * POST /budgets
 * body: { workspaceId, name, target, period, color? }
 */
router.post('/budgets', requireWorkspace, async (req, res) => {
  const db = req.app.locals.db
  const { name, target, period, color } = req.body
  if (!name || !target || !period) {
    return res.status(400).json({ error: 'name, target, period are required' })
  }
  const now = new Date()
  const doc = {
    workspaceId: new ObjectId(req.workspaceId),
    name,
    name_lc: String(name).trim().toLowerCase(),
    target: Number(target),
    period, // 'monthly' | 'quarterly' | 'annu

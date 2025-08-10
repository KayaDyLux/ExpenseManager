const router = require('express').Router()
const { authRequired, requireWorkspace } = require('../middleware/auth')

// Everything under here: auth + workspace scoping
router.use(authRequired)

// Income Sources
router.get('/income-sources', requireWorkspace, async (req, res) => res.json([]))
router.post('/income-sources', requireWorkspace, async (req, res) =>
  res.status(201).json({ _id: 'is_new', ...req.body, workspaceId: req.workspaceId })
)
router.patch('/income-sources/:id', requireWorkspace, async (req, res) => res.json({ ok: true }))
router.delete('/income-sources/:id', requireWorkspace, async (req, res) =>
  res.json({ ok: true, archivedAt: new Date().toISOString() })
)
router.post('/income-sources/:id/restore', requireWorkspace, async (req, res) => res.json({ ok: true }))

// Income entries
router.get('/incomes', requireWorkspace, async (req, res) => res.json([]))
router.post('/incomes', requireWorkspace, async (req, res) =>
  res.status(201).json({ _id: 'inc_new', ...req.body, workspaceId: req.workspaceId })
)
router.delete('/incomes/:id', requireWorkspace, async (req, res) => res.json({ ok: true }))

// Summary
router.get('/income/summary', requireWorkspace, async (req, res) =>
  res.json({ total: 0, currency: 'EUR', bySource: [] })
)

module.exports = router

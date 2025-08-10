const router = require('express').Router()
const { authRequired } = require('../middleware/auth') // you already have this file

// All workspace routes require auth
router.use(authRequired)

// Create user’s personal/business workspaces + seed defaults
router.post('/init', async (req, res) => {
  // TODO: real impl
  res.json({ workspaces: [
    { _id: 'w_personal', type: 'personal', name: 'Personal', currency: 'EUR', active: true },
    { _id: 'w_business', type: 'business', name: 'Business', currency: 'EUR', active: true },
  ]})
})

// List active workspaces for user
router.get('/', async (req, res) => res.json([{ _id: 'w_personal', type: 'personal', name: 'Personal' }]))

// KPIs + charts
router.get('/:id/summary', async (req, res) => res.json({ kpis: {}, charts: {}, budgets: [] }))

// Upgrade/downgrade account type
router.patch('/account-type', async (req, res) => res.json({ ok: true }))

module.exports = router

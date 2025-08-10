const express = require('express');
const router = express.Router();
const { requireWorkspace } = require('../middleware/auth');

router.get('/', requireWorkspace, async (req, res) => {
  res.json([]); // TODO: replace with real budgets routes
});

module.exports = router;

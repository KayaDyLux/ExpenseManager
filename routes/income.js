const express = require('express');
const router = express.Router();

// Example endpoints we'll flesh out later
router.get('/income-sources', async (req, res) => res.json([]));
router.get('/income', async (req, res) => res.json([]));
router.get('/income/summary', async (req, res) => res.json({ total: 0 }));

module.exports = router;

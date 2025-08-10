// routes/income.js
// Production-ready income routes
// Architecture: Express + Mongoose + JWT (authRequired) + workspace scoping (requireWorkspace)
// Conventions: All queries are scoped by { userId, workspaceId }. No cross-tenant leakage.

const express = require('express');
const mongoose = require('mongoose');
const { authRequired, requireWorkspace } = require('../middleware/auth');

const router = express.Router();

// ---------------------------
// Mongoose Model
// ---------------------------
const IncomeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // Money
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'EUR', trim: true },

    // Meta
    date: { type: Date, required: true, index: true },
    source: { type: String, trim: true }, // e.g., Salary, Refund, Interest
    notes: { type: String, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  },
  { timestamps: true }
);

// Text index for simple searches on source/notes
IncomeSchema.index({ source: 'text', notes: 'text' });
// Frequently used compound index for queries
IncomeSchema.index({ userId: 1, workspaceId: 1, date: -1 });

const Income = mongoose.models.Income || mongoose.model('Income', IncomeSchema);

// ---------------------------
// Helpers
// ---------------------------
function parsePaging(query) {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize || query.limit || '25', 10), 1), 200);
  return { page, pageSize, skip: (page - 1) * pageSize, limit: pageSize };
}

function buildFilters(req) {
  const { start, end, q, min, max, categoryId } = req.query;
  const filters = {
    userId: req.user._id,
    workspaceId: req.workspaceId, // set by requireWorkspace
  };

  if (start || end) {
    filters.date = {};
    if (start) filters.date.$gte = new Date(start);
    if (end) {
      const e = new Date(end);
      // include full end day if only a date is provided
      if (!end.includes('T')) e.setUTCHours(23, 59, 59, 999);
      filters.date.$lte = e;
    }
  }

  if (min !== undefined || max !== undefined) {
    filters.amount = {};
    if (min !== undefined) filters.amount.$gte = Number(min);
    if (max !== undefined) filters.amount.$lte = Number(max);
  }

  if (categoryId) {
    if (mongoose.isValidObjectId(categoryId)) filters.categoryId = categoryId;
  }

  if (q && q.trim()) {
    // Use $text if available, otherwise fallback to regex OR on fields
    filters.$or = [
      { $text: { $search: q } },
      { source: { $regex: q, $options: 'i' } },
      { notes: { $regex: q, $options: 'i' } },
    ];
  }

  return filters;
}

function scrub(input) {
  const out = {};
  if (input.amount !== undefined) out.amount = Number(input.amount);
  if (input.currency !== undefined) out.currency = String(input.currency).trim().toUpperCase();
  if (input.date !== undefined) out.date = new Date(input.date);
  if (input.source !== undefined) out.source = String(input.source).trim();
  if (input.notes !== undefined) out.notes = String(input.notes).trim();
  if (input.categoryId !== undefined && mongoose.isValidObjectId(input.categoryId)) out.categoryId = input.categoryId;
  return out;
}

// ---------------------------
// Routes
// ---------------------------

// Create income
router.post('/', authRequired, requireWorkspace, async (req, res, next) => {
  try {
    const body = scrub(req.body || {});

    if (Number.isNaN(body.amount) || body.amount === undefined) {
      return res.status(400).json({ error: 'amount is required and must be a number' });
    }
    if (!body.date) body.date = new Date();

    const doc = await Income.create({
      ...body,
      userId: req.user._id,
      workspaceId: req.workspaceId,
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// List income (with paging, filters, totals)
router.get('/', authRequired, requireWorkspace, async (req, res, next) => {
  try {
    const { page, pageSize, skip, limit } = parsePaging(req.query);
    const filters = buildFilters(req);

    const [items, total, summary] = await Promise.all([
      Income.find(filters).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
      Income.countDocuments(filters),
      Income.aggregate([
        { $match: filters },
        { $group: { _id: null, sum: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const sum = summary[0]?.sum || 0;

    res.json({ items, page, pageSize, total, sum });
  } catch (err) {
    next(err);
  }
});

// Get single income by id
router.get('/:id', authRequired, requireWorkspace, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });

    const doc = await Income.findOne({ _id: id, userId: req.user._id, workspaceId: req.workspaceId });
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// Update income
router.put('/:id', authRequired, requireWorkspace, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });

    const update = scrub(req.body || {});

    const doc = await Income.findOneAndUpdate(
      { _id: id, userId: req.user._id, workspaceId: req.workspaceId },
      { $set: update },
      { new: true }
    );

    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// Delete income
router.delete('/:id', authRequired, requireWorkspace, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });

    const result = await Income.deleteOne({ _id: id, userId: req.user._id, workspaceId: req.workspaceId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'not found' });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Simple bulk insert (optional). Accepts an array of income rows.
router.post('/bulk', authRequired, requireWorkspace, async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : [];
    if (!rows.length) return res.status(400).json({ error: 'expected an array of income rows' });

    const docs = rows.map((r) => ({
      ...scrub(r),
      userId: req.user._id,
      workspaceId: req.workspaceId,
      date: r.date ? new Date(r.date) : new Date(),
      currency: (r.currency || 'EUR').toString().toUpperCase(),
    }));

    // Basic validation
    for (const d of docs) {
      if (Number.isNaN(d.amount) || d.amount === undefined) {
        return res.status(400).json({ error: 'every row must include a numeric amount' });
      }
    }

    const inserted = await Income.insertMany(docs, { ordered: false });
    res.status(201).json({ inserted: inserted.length });
  } catch (err) {
    // If some documents failed, still return what worked
    if (err?.writeErrors) {
      return res.status(207).json({
        inserted: err.result?.result?.nInserted || 0,
        errors: err.writeErrors.map((e) => ({ index: e.index, message: e.errmsg })),
      });
    }
    next(err);
  }
});

module.exports = router;

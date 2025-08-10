// routes/workspaces.js
// Production-ready workspace routes
// Scope: per-user workspaces (personal/business). No requireWorkspace here (this *provides* workspaces).

const express = require('express');
const mongoose = require('mongoose');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// ---------------------------
// Mongoose Model
// ---------------------------
const WorkspaceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['personal', 'business'], required: true, index: true },
    color: { type: String, trim: true },
    icon: { type: String, trim: true },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

WorkspaceSchema.index({ userId: 1, type: 1, name: 1 });
// Ensure only one default per user+type via partial unique index
WorkspaceSchema.index(
  { userId: 1, type: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

const Workspace = mongoose.models.Workspace || mongoose.model('Workspace', WorkspaceSchema);

// ---------------------------
// Helpers
// ---------------------------
function scrub(input) {
  const out = {};
  if (input.name !== undefined) out.name = String(input.name).trim();
  if (input.type !== undefined) out.type = String(input.type).trim();
  if (input.color !== undefined) out.color = String(input.color).trim();
  if (input.icon !== undefined) out.icon = String(input.icon).trim();
  if (input.isDefault !== undefined) out.isDefault = Boolean(input.isDefault);
  return out;
}

async function ensureSingleDefault(userId, type, desiredId) {
  await Workspace.updateMany({ userId, type, _id: { $ne: desiredId }, isDefault: true }, { $set: { isDefault: false } });
}

async function ensureAtLeastOne(userId, accountType) {
  const needPersonal = accountType === 'personal' || accountType === 'both';
  const needBusiness = accountType === 'business' || accountType === 'both';

  const ops = [];
  if (needPersonal) {
    ops.push(
      (async () => {
        const exists = await Workspace.findOne({ userId, type: 'personal' });
        if (!exists) {
          await Workspace.create({ userId, type: 'personal', name: 'Personal', isDefault: true });
        }
      })()
    );
  }
  if (needBusiness) {
    ops.push(
      (async () => {
        const exists = await Workspace.findOne({ userId, type: 'business' });
        if (!exists) {
          await Workspace.create({ userId, type: 'business', name: 'Business', isDefault: true });
        }
      })()
    );
  }
  await Promise.all(ops);
}

// ---------------------------
// Routes
// ---------------------------

// List all workspaces for the user
router.get('/', authRequired, async (req, res, next) => {
  try {
    const items = await Workspace.find({ userId: req.user._id }).sort({ type: 1, name: 1 });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Ensure default workspaces exist based on accountType
// body: { accountType: 'personal' | 'business' | 'both' }
router.post('/ensure', authRequired, async (req, res, next) => {
  try {
    const { accountType } = req.body || {};
    if (!['personal', 'business', 'both'].includes(accountType)) {
      return res.status(400).json({ error: "accountType must be 'personal', 'business', or 'both'" });
    }
    await ensureAtLeastOne(req.user._id, accountType);
    const items = await Workspace.find({ userId: req.user._id }).sort({ type: 1, name: 1 });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// Create a workspace
router.post('/', authRequired, async (req, res, next) => {
  try {
    const data = scrub(req.body || {});
    if (!data.name) return res.status(400).json({ error: 'name is required' });
    if (!['personal', 'business'].includes(data.type)) return res.status(400).json({ error: "type must be 'personal' or 'business'" });

    // If marking as default, clear other defaults of same type
    if (data.isDefault) {
      await ensureSingleDefault(req.user._id, data.type);
    }

    const doc = await Workspace.create({ ...data, userId: req.user._id });
    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'default workspace already exists for this type' });
    next(err);
  }
});

// Get single workspace
router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
    const doc = await Workspace.findOne({ _id: id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// Update workspace (name/color/icon/isDefault)
router.put('/:id', authRequired, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });

    const update = scrub(req.body || {});

    const doc = await Workspace.findOne({ _id: id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'not found' });

    if (update.isDefault === true) {
      await ensureSingleDefault(req.user._id, doc.type, doc._id);
    }

    Object.assign(doc, update);
    await doc.save();
    res.json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'default workspace already exists for this type' });
    next(err);
  }
});

// Delete workspace
router.delete('/:id', authRequired, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });

    const doc = await Workspace.findOne({ _id: id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'not found' });

    // Safety: prevent deleting the only workspace of a type
    const countSameType = await Workspace.countDocuments({ userId: req.user._id, type: doc.type });
    if (countSameType <= 1) {
      return res.status(400).json({ error: `cannot delete the only ${doc.type} workspace` });
    }

    await Workspace.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Get default workspace per type (handy for onboarding)
router.get('/defaults/by-type', authRequired, async (req, res, next) => {
  try {
    const [personal, business] = await Promise.all([
      Workspace.findOne({ userId: req.user._id, type: 'personal', isDefault: true }),
      Workspace.findOne({ userId: req.user._id, type: 'business', isDefault: true }),
    ]);
    res.json({ personal, business });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

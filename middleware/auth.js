// middleware/auth.js
const { Magic } = require('@magic-sdk/admin');

// Secret from Magic dashboard (DO env var)
const magic = new Magic(process.env.MAGIC_SECRET_KEY);

// Optional: who always bypasses allowlist
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'swapna@swapnade.com').toLowerCase();

// Optional: turn API-side allowlist on/off (default: ON)
const ENFORCE_ALLOWLIST = (process.env.ENFORCE_ALLOWLIST || 'true').toLowerCase() !== 'false';

module.exports = async function auth(req, res, next) {
  try {
    // Expect: Authorization: Bearer <DID_TOKEN>
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const didToken = h.slice(7).trim();

    // Validate Magic DID token
    await magic.token.validate(didToken);
    const issuer = magic.token.getIssuer(didToken);

    // Grab user metadata (email, etc.)
    const meta = await magic.users.getMetadataByIssuer(issuer);
    const email = (meta?.email || '').toLowerCase();

    // Attach to request for your routes
    req.user = { issuer, email };

    // Optional API-side allowlist (email or domain)
    if (ENFORCE_ALLOWLIST) {
      if (email !== OWNER_EMAIL) {
        const db = req.app?.locals?.db;
        if (!db) return res.status(503).json({ error: 'db_unavailable' });

        const domain = email.split('@')[1] || '';
        const allowHit = await db.collection('allowlist').findOne({
          $or: [{ type: 'email', value: email }, { type: 'domain', value: domain }],
        });

        if (!allowHit) return res.status(403).json({ error: 'not_allowed' });
      }
    }

    next();
  } catch (err) {
    // Token invalid/expired/etc.
    return res.status(401).json({ error: 'invalid_token' });
  }
};

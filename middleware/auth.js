/**
 * middleware/auth.js
 *
 * Production-ready JWT auth middleware for your WebAuthn stack.
 * - Verifies "Authorization: Bearer <JWT>"
 * - Attaches req.user = { userId, email, name, ... }
 * - Optional allowlist check (email or domain) from MongoDB
 *
 * Requires env:
 *   JWT_SECRET              - strong random string (>= 32 chars)
 *   ENFORCE_ALLOWLIST       - "true" | "false" (default: true)
 *   OWNER_EMAIL             - always allowed (default: swapna@swapnade.com)
 *
 * Optional convenience:
 *   Use signAccessToken(payload) below to mint tokens after WebAuthn login.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail fast if misconfigured in production
  console.error('FATAL: Missing JWT_SECRET env var');
  process.exit(1);
}

// Who always bypasses allowlist
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'swapna@swapnade.com').toLowerCase();

// API-side allowlist toggle (default ON)
const ENFORCE_ALLOWLIST =
  (process.env.ENFORCE_ALLOWLIST || 'true').toLowerCase() !== 'false';

/**
 * Create an access token.
 * Use this in your WebAuthn "login verify" handler after you identify the user.
 *
 * @param {object} payload - e.g. { userId, email, name }
 * @param {object} [opts]  - e.g. { expiresIn: '1h' }
 * @returns {string} JWT
 */
function signAccessToken(payload, opts = {}) {
  const options = {
    issuer: 'expensemanager-api',
    audience: 'expensemanager-client',
    expiresIn: opts.expiresIn || '1h',
  };
  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Parse "Authorization: Bearer <token>" and return { scheme, token }.
 */
function parseBearerHeader(headerValue = '') {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const [scheme, token] = headerValue.split(' ');
  if (!scheme || !token) return null;
  return { scheme, token };
}

/**
 * Main middleware: verify JWT and (optionally) check allowlist in Mongo.
 *
 * Expects:
 *   - app.locals.db set in server.js (MongoDB db instance)
 *   - Authorization: Bearer <JWT> header
 */
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    const parsed = parseBearerHeader(header);

    if (!parsed || parsed.scheme.toLowerCase() !== 'bearer') {
      return res.status(401).json({ error: 'missing_authorization' });
    }

    let decoded;
    try {
      decoded = jwt.verify(parsed.token, JWT_SECRET, {
        issuer: 'expensemanager-api',
        audience: 'expensemanager-client',
      });
    } catch (err) {
      return res.status(401).json({ error: 'invalid_or_expired_token' });
    }

    // Attach to request for downstream routes
    // Typical shape: { userId, email, name, ... }
    req.user = decoded;

    // -------- Optional allowlist enforcement --------
    if (ENFORCE_ALLOWLIST) {
      const email = (decoded.email || '').toLowerCase();

      // Owner always allowed
      if (email !== OWNER_EMAIL) {
        const db = req.app?.locals?.db;
        if (!db) {
          // If DB not ready, fail closed to avoid bypass
          return res.status(503).json({ error: 'db_unavailable' });
        }

        const domain = email.split('@')[1] || '';
        const allowHit = await db.collection('allowlist').findOne({
          $or: [{ type: 'email', value: email }, { type: 'domain', value: domain }],
        });

        if (!allowHit) {
          return res.status(403).json({ error: 'not_allowed' });
        }
      }
    }
    // -----------------------------------------------

    return next();
  } catch (err) {
    // Defensive catch-all
    return res.status(401).json({ error: 'auth_failed' });
  }
}

module.exports = {
  auth,
  signAccessToken,
  parseBearerHeader,
};

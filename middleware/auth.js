/**
 * middleware/auth.js
 *
 * JWT auth + workspace guard for ExpenseManager.
 * - Verifies "Authorization: Bearer <JWT>"
 * - Attaches req.user = { userId, email, accountType, ... }
 * - Optional allowlist check (email/domain) via Mongo
 * - requireWorkspace() enforces workspaceId in query/body/params
 *
 * Env:
 *   JWT_SECRET           (required)
 *   ENFORCE_ALLOWLIST    "true" | "false" (default: true)
 *   OWNER_EMAIL          default: swapna@swapnade.com
 */

const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('FATAL: Missing JWT_SECRET env var')
  process.exit(1)
}

const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'swapna@swapnade.com').toLowerCase()
const ENFORCE_ALLOWLIST = (process.env.ENFORCE_ALLOWLIST || 'true').toLowerCase() !== 'false'

/** Mint an access token after auth */
function signAccessToken(payload, opts = {}) {
  const options = {
    issuer: 'expensemanager-api',
    audience: 'expensemanager-client',
    expiresIn: opts.expiresIn || '1h',
  }
  return jwt.sign(payload, JWT_SECRET, options)
}

/** Parse "Authorization: Bearer <token>" */
function parseBearerHeader(headerValue = '') {
  if (!headerValue || typeof headerValue !== 'string') return null
  const [scheme, token] = headerValue.split(' ')
  if (!scheme || !token) return null
  return { scheme, token }
}

/** Require a valid JWT (owner/domain allowlist optional) */
async function authRequired(req, res, next) {
  try {
    // Let CORS preflights pass
    if (req.method === 'OPTIONS') return next()

    const parsed = parseBearerHeader(req.headers.authorization)
    if (!parsed || parsed.scheme.toLowerCase() !== 'bearer') {
      return res.status(401).json({ error: 'missing_authorization' })
    }

    let decoded
    try {
      decoded = jwt.verify(parsed.token, JWT_SECRET, {
        issuer: 'expensemanager-api',
        audience: 'expensemanager-client',
      })
    } catch {
      return res.status(401).json({ error: 'invalid_or_expired_token' })
    }

    req.user = decoded

    if (ENFORCE_ALLOWLIST) {
      const email = (decoded.email || '').toLowerCase()

      if (email !== OWNER_EMAIL) {
        const db = req.app?.locals?.db
        if (!db) return res.status(503).json({ error: 'db_unavailable' })

        const domain = email.split('@')[1] || ''
        const allowHit = await db.collection('allowlist').findOne({
          $or: [{ type: 'email', value: email }, { type: 'domain', value: domain }],
        })
        if (!allowHit) return res.status(403).json({ error: 'not_allowed' })
      }
    }

    return next()
  } catch {
    return res.status(401).json({ error: 'auth_failed' })
  }
}

/** Ensure a workspaceId is present; attach to req.workspaceId */
function requireWorkspace(req, res, next) {
  const wid = (req.query.workspaceId || req.body.workspaceId || req.params.workspaceId || '')
    .toString()
    .trim()

  if (!wid) return res.status(400).json({ error: 'workspaceId required' })

  req.workspaceId = wid
  next()
}

module.exports = {
  authRequired,
  requireWorkspace,
  signAccessToken,
  parseBearerHeader,
}

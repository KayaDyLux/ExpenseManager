/**
 * middleware/auth.js
 *
 * Production-ready JWT auth middleware for your WebAuthn stack.
 * - Verifies "Authorization: Bearer <JWT>"
 * - Attaches req.user = { userId, email, accountType, ... }
 * - Optional allowlist check (email or domain) from MongoDB
 * - requireWorkspace() enforces workspaceId in query/body/params
 *
 * Env:
 *   JWT_SECRET              - strong random string (>= 32 chars)
 *   ENFORCE_ALLOWLIST       - "true" | "false" (default: true)
 *   OWNER_EMAIL             - always allowed (default: swapna@swapnade.com)
 */

const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('FATAL: Missing JWT_SECRET env var')
  process.exit(1)
}

const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'swapna@swapnade.com').toLowerCase()
const ENFORCE_ALLOWLIST =
  (process.env.ENFORCE_ALLOWLIST || 'true').toLowerCase() !== 'false'

function signAccessToken(payload, opts = {}) {
  const options = {
    issuer: 'expensemanager-api',
    audience: 'expensemanager-client',
    expiresIn: opts.expiresIn || '1h',
  }
  return jwt.sign(payload, JWT_SECRET, options)
}

function parseBearerHeader(headerValue = '') {
  if (!headerValue || typeof headerValue !== 'string') return null
  const [scheme, token] = headerValue.split(' ')
  if (!scheme || !token) return null
  return { scheme, token }
}

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization
    const parsed = parseBearerHeader(header)

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

function requireWorkspace(req, res, next) {
  const wid = req.query.workspaceId || req.body.workspaceId || req.params.workspaceId
  if (!wid) {
    return res.status(400).json({ error: 'workspaceId required' })
  }
  req.workspaceId = wid
  next()
}

module.exports = {
  authRequired,
  requireWorkspace,
  signAccessToken,
  parseBearerHeader,
}

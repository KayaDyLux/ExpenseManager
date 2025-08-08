// middleware/auth.js
// Production-ready JWT verification with a safe dev toggle.
// npm i jose

const { createRemoteJWKSet, jwtVerify } = require("jose");

// Env vars in DO App Platform:
// AUTH_ISSUER  -> e.g. https://YOURTENANT.us.auth0.com  OR  https://your-subdomain.clerk.accounts.dev
// AUTH_AUDIENCE (optional) -> only if your IdP sets it
// ALLOW_TEST_TOKEN=true -> keeps Postman working with "Bearer test" during transition
const ISSUER = process.env.AUTH_ISSUER;
const AUDIENCE = process.env.AUTH_AUDIENCE;
const ALLOW_TEST_TOKEN = process.env.ALLOW_TEST_TOKEN === "true";

let JWKS;
if (ISSUER) {
  JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
}

module.exports = async (req, res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing Authorization header" });

  // Dev compatibility: allow "Bearer test" while you wire the frontend
  if (ALLOW_TEST_TOKEN && token === "test") {
    req.user = {
      userId: "dev-user",
      workspaceId: "000000000000000000000002",
      role: "owner",
      _dev: true,
    };
    return next();
  }

  if (!ISSUER) {
    return res.status(501).json({ error: "Auth not configured (AUTH_ISSUER missing)" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE, // remove if your IdP doesn’t use audience
    });

    // Map IdP claims -> your app fields (adjust if your IdP uses different claim names)
    req.user = {
      userId: payload.sub,
      workspaceId: payload.org_id || payload.orgId || payload.workspaceId || null,
      role: payload.role || "member",
    };

    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token", detail: err.message });
  }
};

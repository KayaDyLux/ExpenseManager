// middleware/auth.js
// Production-ready JWT verification with a safe dev toggle.
// Requires: npm i jose

const { createRemoteJWKSet, jwtVerify } = require("jose");

// ---- Env config (set these in DO App Platform) ----
// e.g. Clerk:  AUTH_ISSUER=https://YOURSUBDOMAIN.clerk.accounts.dev
// e.g. Auth0:  AUTH_ISSUER=https://YOURTENANT.us.auth0.com
const ISSUER = process.env.AUTH_ISSUER;      // required for real JWTs
const AUDIENCE = process.env.AUTH_AUDIENCE;  // optional, only if your provider sets an audience
const ALLOW_TEST_TOKEN = process.env.ALLOW_TEST_TOKEN === "true"; // temporary

// Lazily create JWKS only when ISSUER is provided
let JWKS;
if (ISSUER) {
  JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
}

module.exports = async (req, res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Missing Authorization header" });

  // Temporary compatibility for your current Postman tests
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
    // You didn’t configure real JWT yet
    return res.status(501).json({ error: "Auth not configured (AUTH_ISSUER missing)" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE, // remove if your provider doesn’t use it
    });

    // Map claims from your IdP -> app fields
    req.user = {
      userId: payload.sub,
      workspaceId:
        payload.org_id || payload.orgId || payload.workspaceId || null,
      role: payload.role || "member",
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token", detail: err.message });
  }
};

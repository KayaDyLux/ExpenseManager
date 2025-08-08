// middleware/auth.js
// Placeholder for real Clerk/Auth0 JWT validation

module.exports = function (req, res, next) {
  // In production: verify JWT from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

  // TEMP: mock decoded token
  // TODO: replace with actual JWT verification
  req.user = {
    userId: "mock-user-id",
    workspaceId: "mock-workspace-id",
    role: "owner"
  };

  next();
};

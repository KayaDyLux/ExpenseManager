// middleware/auth.js
// Temporary mock until JWT verification is added

const MOCK_USER_ID = "000000000000000000000001";       // valid ObjectId
const MOCK_WORKSPACE_ID = "000000000000000000000002";  // valid ObjectId

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  // TODO: replace this with real JWT verification (Clerk/Auth0)
  req.user = {
    userId: MOCK_USER_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    role: "owner"
  };

  next();
};


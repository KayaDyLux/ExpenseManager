// middleware/auth.js

const ALLOW_NO_AUTH = process.env.ALLOW_NO_AUTH === "true";
const MOCK_USER_ID = "000000000000000000000001";
const MOCK_WORKSPACE_ID = "000000000000000000000002";

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    if (ALLOW_NO_AUTH) {
      req.user = {
        userId: MOCK_USER_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        role: "owner",
      };
      return next();
    }
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  // TODO: replace with real JWT verification later
  req.user = {
    userId: MOCK_USER_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    role: "owner",
  };

  next();
};

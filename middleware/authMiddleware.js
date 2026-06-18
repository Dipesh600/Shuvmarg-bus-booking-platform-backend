const jwt = require("jsonwebtoken");
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    // console.log(token);
    if (!token) {
      return res.status(400).json({
        status: false,
        message: "Authorization header is missing or invalid",
      });
    }
    const verifyAuthToken = jwt.verify(token, process.env.SECRET_KEY);
    req.userInfo = verifyAuthToken;

    // === MULTI-ROLE BACKWARD COMPAT ===
    // Legacy JWTs have `role` but no `activeRole`. Map for consistent downstream use.
    if (req.userInfo.role && !req.userInfo.activeRole) {
      req.userInfo.activeRole = req.userInfo.role;
      req.userInfo.roles = req.userInfo.roles || [req.userInfo.role];
    }

    next();
  } catch (e) {
    if (e.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please login again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid token",
    });
  }
};

module.exports = authMiddleware;
const jwt = require("jsonwebtoken");
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    // console.log(token);
    if (!token) {
      return res.status(401).json({
        status: false,
        message: "Authorization header is missing or invalid",
      });
    }
    const verifyAuthToken = jwt.verify(token, process.env.SECRET_KEY);
    
    // SECURITY: Enforce strict token purpose. Normal API access requires an "access" token.
    // This rejects temporary tokens (e.g., FORCE_PASSWORD_CHANGE) from normal routes.
    if (verifyAuthToken.purpose !== "access") {
      return res.status(403).json({
        success: false,
        message: "Invalid token purpose. Expected an access token.",
        errorCode: "INVALID_TOKEN_PURPOSE",
      });
    }

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
const jwt = require("jsonwebtoken");

const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (authHeader === undefined) {
    return next();
  }

  const [scheme, token, extraPart] = authHeader.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || extraPart) {
    return res.status(401).json({
      status: false,
      message: "Authorization header is missing or invalid",
    });
  }

  try {
    const userInfo = jwt.verify(token, process.env.SECRET_KEY);

    if (userInfo.purpose !== "access") {
      return res.status(403).json({
        success: false,
        message: "Invalid token purpose. Expected an access token.",
        errorCode: "INVALID_TOKEN_PURPOSE",
      });
    }

    req.userInfo = userInfo;

    if (req.userInfo.role && !req.userInfo.activeRole) {
      req.userInfo.activeRole = req.userInfo.role;
      req.userInfo.roles = req.userInfo.roles || [req.userInfo.role];
    }

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
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

module.exports = optionalAuthMiddleware;

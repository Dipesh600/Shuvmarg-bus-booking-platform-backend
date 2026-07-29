const jwt = require("jsonwebtoken");

const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (authHeader === undefined) {
    return next();
  }

  const [scheme, token, extraPart] = authHeader.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || extraPart) {
    return next();
  }

  try {
    const userInfo = jwt.verify(token, process.env.SECRET_KEY);

    if (userInfo.purpose !== "access") {
      return next();
    }

    req.userInfo = userInfo;

    if (req.userInfo.role && !req.userInfo.activeRole) {
      req.userInfo.activeRole = req.userInfo.role;
      req.userInfo.roles = req.userInfo.roles || [req.userInfo.role];
    }

    return next();
  } catch {
    // Authentication is genuinely optional on these routes. Invalid, expired,
    // or malformed credentials must never block the public response and must
    // never create a partial identity.
    return next();
  }
};

module.exports = optionalAuthMiddleware;

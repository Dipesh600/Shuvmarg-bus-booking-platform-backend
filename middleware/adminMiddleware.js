const jwt = require("jsonwebtoken");

const superAdminAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(400).json({
        status: false,
        message: "Authorization header is missing or invalid",
      });
    }

    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.adminInfo = decoded;

    if (req.adminInfo.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super Admins only.",
      });
    }

    next();
  } catch (error) {
    console.error("Super admin auth middleware error:", error);
    return res.status(401).json({
      status: false,
      message: "Unauthorized: Invalid or expired token",
    });
  }
};

module.exports = superAdminAuthMiddleware;
// Admin
const adminMiddleware = (req, res, next) => {
    if (!req.userInfo) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Please login first.",
        });
    }
    if (req.userInfo.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Admins only.",
        });
    }
    next();
}
// Bus Owner
const busOwnerMiddleware = (req, res, next) => {
    if (!req.userInfo) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Please login first.",
        });
    }
    if (req.userInfo.role !== "busOwner") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Bus owners only.",
        });
    }
    next();
}

// Agent
const agentMiddleware = (req, res, next) => {
    if (!req.userInfo) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Please login first.",
        });
    }
    if (req.userInfo.role !== "agent") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Agents only.",
        });
    }
    next();
}
// Admin or Buss Owner
const isAdminOrBusOwner = async (req, res, next) => {
    try {
        const role = req.userInfo?.role;
        if (role !== "admin" && role !== "busOwner") {
            return res.status(403).json({
                status: false,
                message: "Access denied!",
            });
        }
        next();
    } catch (error) {
        console.error("Role check failed:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error.",
        });
    }
};

// Conductor
const conductorMiddleware = (req, res, next) => {
    if (!req.userInfo) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Please login first.",
        });
    }
    if (req.userInfo.role !== "conductor") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Conductors only.",
        });
    }
    next();
};

// Driver
const driverMiddleware = (req, res, next) => {
    if (!req.userInfo) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Please login first.",
        });
    }
    if (req.userInfo.role !== "driver") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Drivers only.",
        });
    }
    next();
};

// Bus Owner OR Conductor — for conductor routes (bus owner acting as conductor)
const busOwnerOrConductorMiddleware = (req, res, next) => {
    if (!req.userInfo) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Please login first.",
        });
    }
    if (req.userInfo.role !== "busOwner" && req.userInfo.role !== "conductor") {
        return res.status(403).json({
            success: false,
            message: "Access denied. Bus owners or conductors only.",
        });
    }
    next();
};

module.exports = {
    isAdminOrBusOwner,
    adminMiddleware,
    agentMiddleware,
    busOwnerMiddleware,
    conductorMiddleware,
    driverMiddleware,
    busOwnerOrConductorMiddleware,
};

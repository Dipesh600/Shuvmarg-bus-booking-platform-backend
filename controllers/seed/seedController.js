/**
 * controllers/seed/seedController.js
 *
 * DEPRECATED: This used to create an "admin" User. Admins now use the
 * SuperAdmin model exclusively. Use seedSuperAdmin.js instead.
 *
 * This controller is kept for backward compatibility but now returns
 * a clear deprecation message pointing to the proper flow.
 */

const seedAdmin = async (req, res) => {
    return res.status(410).json({
        status: false,
        message: "Deprecated: Admin users are no longer created in the User collection. Use the SuperAdmin model and seedSuperAdmin.js script instead.",
        migration: "Admin authentication uses a separate SuperAdmin collection with its own JWT system (adminMiddleware.js).",
    });
};

module.exports = seedAdmin;
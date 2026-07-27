"use strict";

function buildUserQuery(search, statusFilter) {
  const query = { roles: "passenger", deletedAt: null };
  if (["active", "inactive", "banned"].includes(statusFilter)) {
    query.status = statusFilter;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = ["name", "phone", "email"].map((field) => ({
      [field]: { $regex: escaped, $options: "i" },
    }));
  }
  return query;
}

function formatUsers(users, bookingCounts) {
  const bookingMap = {};
  for (const booking of bookingCounts) {
    bookingMap[booking._id.toString()] = {
      bookingCount: booking.bookingCount,
      totalSpent: booking.totalSpent,
    };
  }
  return users.map((user) => {
    const stats = bookingMap[user._id.toString()] || {
      bookingCount: 0,
      totalSpent: 0,
    };
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      gender: user.gender,
      role: user.role,
      roles: user.roles,
      status: user.status,
      profilePicture: user.profilePicture,
      referralCode: user.referralCode,
      totalReferrals: user.totalReferrals,
      isVerified: user.isVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      bookingCount: stats.bookingCount,
      totalSpent: stats.totalSpent,
    };
  });
}

function createUserDirectoryController({ repository, logger = console }) {
  return async function getAllUsers(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
      const search = (req.query.search || "").trim();
      const status = (req.query.status || "").trim().toLowerCase();
      const [users, totalCount, counts] = await repository.findUsers(
        buildUserQuery(search, status),
        page,
        limit
      );
      return res.status(200).json({
        success: true,
        message: "Users retrieved successfully!",
        data: formatUsers(users, counts),
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: page * limit < totalCount,
        },
      });
    } catch (error) {
      logger.error("getAllUsers error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };
}

module.exports = {
  createUserDirectoryController,
  buildUserQuery,
  formatUsers,
};

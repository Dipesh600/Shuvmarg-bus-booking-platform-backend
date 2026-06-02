const User = require("../../models/userModel.js");
const Booking = require("../../models/bookTicketModel.js");
const cloudinary = require("../../handlers/cloudinary.js");
const generatePassword = require("../../handlers/passwordGenerator.js");
const emailTemplate = require("../../handlers/password-email-template.js");
const emailManager = require("../../emailManager/emailManager.js");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const createAccount = async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    if (!name || !email || !phone || !address) {
      const missingField = !name
        ? "Name"
        : !email
          ? "Email"
          : // : !password
          // ? "Password"
          !phone
            ? "Phone"
            : !address
              ? "Address"
              : "Gender";

      return res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: "Email or phone number already registered!",
      });
    }
    const newPassword = generatePassword((length = 8));
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const newUser = new User({
      name,
      email,
      phone,
      address,
      password: hashedPassword,
      gender: "male",
    });

    const savedUser = await newUser.save();
    const userWithoutPassword = savedUser.toObject();
    delete userWithoutPassword.password;
    const emailContent = emailTemplate(newPassword, name);
    await emailManager(email, "Auto Generated Password", emailContent);

    return res.status(201).json({
      status: true,
      message: "Account Created Successfully!",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
    });
  }
};
// Admin Change User Password
const changeUserPassword = async (req, res) => {
  try {
    const { id, password, confirmPassword } = req.body;

    if (!id || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: !id
          ? "Id is required!"
          : !password
            ? "Password is required!"
            : "Confirm password is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid user ID format!",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password do not match!",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long!",
      });
    }

    const user = await User.findById(id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password updated successfully!",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};
// Get User Account Status
const getUserAccountStatus = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Id is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid user ID format!",
      });
    }

    const user = await User.findById(id).select(
      "status yatrapoints referralCode totalReferrals"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    const accountStatus = user.status || "active";
    const yaatraPointsBalance = user.yatrapoints || 0;

    const referralStatistics = {
      referralCode: user.referralCode || null,
      totalReferrals: user.totalReferrals || 0,
    };

    const complaintHistory = {
      data: [
        {
          id: 1,
          title: "Late Service",
          description: "Service was delayed by 2 hours",
          status: "Pending",
          date: "2025-01-10"
        },
        {
          id: 2,
          title: "Wrong Billing",
          description: "Charged extra amount",
          status: "Resolved",
          date: "2025-01-15"
        },
        {
          id: 3,
          title: "Poor Support",
          description: "Customer support did not respond",
          status: "In Progress",
          date: "2025-01-20"
        }
      ],
    };


    return res.status(200).json({
      success: true,
      message: "User account status retrieved successfully!",
      data: {
        accountStatus: {
          status: accountStatus,
          yaatraPointsBalance,
          referralStatistics,
          complaintHistory,
        },
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};
// Delete Account
const deleteAccount = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Id is required!",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid user ID format!",
      });
    }

    const deletedUser = await User.findByIdAndDelete({ _id: id });

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully!",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};
// Get User Activity Summary
const getUserActivitySummary = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Id is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid user ID format!",
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(id);

    const [
      totalBookings,
      favoriteRoutesAgg,
      paymentMethodsAgg,
      averageBookingAgg,
      lastBooking,
    ] = await Promise.all([
      // Total bookings made by user (all statuses)
      Booking.countDocuments({ userId: userObjectId }),

      // Favorite routes: group by scheduleId and sort by count desc,
      // including route.from and route.to from busSchedule
      Booking.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: "$scheduleId",
            bookings: { $sum: 1 },
          },
        },
        { $sort: { bookings: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "busschedules",
            localField: "_id",
            foreignField: "_id",
            as: "schedule",
          },
        },
        { $unwind: { path: "$schedule", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            bookings: 1,
            routeFrom: "$schedule.route.from",
            routeTo: "$schedule.route.to",
          },
        },
      ]),

      // Payment methods used: group by gateway
      Booking.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: "$gateway",
            count: { $sum: 1 },
          },
        },
      ]),

      // Average booking value for successful bookings
      Booking.aggregate([
        { $match: { userId: userObjectId, status: "booked" } },
        {
          $group: {
            _id: null,
            averageValue: { $avg: "$totalAmount" },
          },
        },
      ]),

      // Last activity: most recent booking
      Booking.findOne({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .select("createdAt bookedAt status"),
    ]);

    const favoriteRoutes = favoriteRoutesAgg.map((item) => ({
      scheduleId: item._id,
      bookings: item.bookings,
      route: {
        from: item.routeFrom || null,
        to: item.routeTo || null,
      },
    }));

    const paymentMethods = paymentMethodsAgg.map((item) => ({
      method: item._id,
      count: item.count,
    }));

    const averageBookingValue =
      averageBookingAgg && averageBookingAgg.length > 0
        ? averageBookingAgg[0].averageValue
        : 0;

    const lastActivityTimestamp = lastBooking
      ? lastBooking.createdAt || lastBooking.bookedAt
      : null;

    return res.status(200).json({
      success: true,
      message: "User activity summary retrieved successfully!",
      data: {
        activitySummary: {
          totalBookings,
          favoriteRoutes,
          paymentMethods,
          averageBookingValue,
          lastActivityTimestamp,
        },
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};
// Update Account
const updateAccount = async (req, res) => {
  try {
    const { name, phone, address, email, id } = req.body;
    const profilePic = req.files?.profilePic;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Id is required!",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid user ID format!",
      });
    }

    const user = await User.findById({ _id: id });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (email) user.email = email.toLowerCase();

    if (profilePic) {
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(profilePic.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
        });
      }

      if (profilePic.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "File size too large. Maximum 5MB allowed",
        });
      }

      const base64profilePic = `data:${profilePic.mimetype
        };base64,${profilePic.data.toString("base64")}`;

      const result = await cloudinary.uploader.upload(base64profilePic, {
        folder: "profile_picture",
        public_id: `admin_update_${id}_${Date.now()}`,
        overwrite: true,
        transformation: [{ width: 400, height: 400, crop: "fill", quality: "auto" }],
      });

      user.profilePicture = result.secure_url;
    }

    const updatedUser = await user.save();

    return res.status(200).json({
      success: true,
      message: "Account updated successfully!",
      data: {
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: updatedUser.address,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};
// Get User by id
const getUserById = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Id is required!",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid user ID format!",
      });
    }
    const user = await User.findById(id).select("-password -__v -otp -otpExpiry");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully!",
      data: user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};
// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: "passenger" }).select("-password");

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found!",
      });
    }

    const formattedUsers = users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      gender: user.gender,
      role: user.role,
      status: user.status,
      profilePicture: user.profilePicture,
      referralCode: user.referralCode,
      totalReferrals: user.totalReferrals,
      yatrapoints: user.yatrapoints,
      yatrapoints: user.yatrapoints,
      createdAt: user.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully!",
      data: formattedUsers,
    });
  } catch (error) {
    console.error("Error fetching all users:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};
// Update user status 
const updateUserStatus = async (req, res) => {
  try {
    const { id, status } = req.body;

    if (!id || !status) {
      return res.status(400).json({
        success: false,
        message: !id ? "Id is required!" : "Status is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid user ID format!",
      });
    }

    const allowedStatuses = ["active", "inactive", "banned"];
    const normalizedStatus = String(status).toLowerCase();

    if (!allowedStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status value. Allowed values are: active, inactive, banned",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    user.status = normalizedStatus;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "User status updated successfully!",
      data: {
        id: user._id,
        status: user.status,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get all bookings for a specific user
const getUserBookings = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Id is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid user ID format!",
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(id);

    const bookings = await Booking.find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "User bookings retrieved successfully!",
      data: bookings,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get User Dashboard Stats
const getUserDashboard = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Execute a single, highly-optimized aggregation pass mapping over passengers
    const stats = await User.aggregate([
      { $match: { role: "passenger" } },
      {
        $facet: {
          totalUsers: [{ $count: "count" }],
          activeUsers: [
            { $match: { status: "active" } },
            { $count: "count" }
          ],
          newUsersToday: [
            { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday } } },
            { $count: "count" }
          ],
          verifiedUsers: [
            { $match: { isVerified: true } },
            { $count: "count" }
          ]
        }
      }
    ]);

    const aggregates = stats[0];

    return res.status(200).json({
      success: true,
      data: {
        totalUsers: aggregates.totalUsers[0]?.count || 0,
        activeUsers: aggregates.activeUsers[0]?.count || 0,
        newUsersToday: aggregates.newUsersToday[0]?.count || 0,
        verifiedUsers: aggregates.verifiedUsers[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching user dashboard stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user dashboard stats",
      error: error.message,
    });
  }
};

module.exports = {
  createAccount,
  deleteAccount,
  updateAccount,
  getUserById,
  getAllUsers,
  getUserActivitySummary,
  getUserAccountStatus,
  changeUserPassword,
  updateUserStatus,
  getUserBookings,
  getUserDashboard,
};

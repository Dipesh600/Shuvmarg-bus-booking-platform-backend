const mongoose = require("mongoose");
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      // required: [true, "Name is required"],
      trim: true,
      minlength: [3, "Name must be at least 3 characters long"],
    },
    email: {
      type: String,
      // required: [true, "Email is required"],
      trim: true,
      unique: true,
      sparse: true, // <--- ADD THIS LINE
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
    },
    address: {
      type: String,
      // required: [true, "Address is required"],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      select: false,
    },
    profilePicture: {
      type: String,
      default:
        "https://giftolexia.com/wp-content/uploads/2015/11/dummy-profile.png",
    },
    gender: {
      type: String,
      enum: ["male", "female"],
      //   required: [true, "Gender is required"],
    },
    role: {
      type: String,
      enum: ["passenger", "agent", "busOwner", "conductor", "driver", "admin"],
      default: "passenger",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "banned", "pending", "invited"],
      default: "active",
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    yatrapoints: {
      type: Number,
      default: 0,
    },
    // Referral System Fields
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    totalReferrals: {
      type: Number,
      default: 0,
    },

    // === SHUVMARG MONEY (SM Money) ===
    smMoneyEnabled: {
      type: Boolean,
      default: true,    // false when account suspended — blocks SM Money spending
    },
    welcomeOfferUsed: {
      type: Boolean,
      default: false,   // true after first booking uses welcome offer
    },
    // Analytics only — NEVER used for balance computation (balance is always
    // computed from sm_ledger aggregation, never from a stored field).
    lifetimeSmEarned: {
      type: Number,
      default: 0,
    },
    lifetimeSmSpent: {
      type: Number,
      default: 0,
    },

    // === SECURITY ===
    lastLoginAt: {
      type: Date,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,    // Non-null = account locked until this timestamp
    },

    // === SOFT DELETE ===
    deletedAt: {
      type: Date,
      default: null,    // Non-null = account soft-deleted
    },

    // === ADMIN-GENERATED CREDENTIALS ===
    forcePasswordChange: {
      type: Boolean,
      default: false,   // true = user must change temp password on first login
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

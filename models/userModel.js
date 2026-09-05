const mongoose = require("mongoose");
const accountRolePolicy = require('../src/shared/auth/account-role.policy');
const temporaryCredentialFields = require('./schemaFields/userTemporaryCredentialFields');
const userSchema = new mongoose.Schema({
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
      sparse: true,
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
      // NOTE: validators run BEFORE pre-save hooks — resolve effective roles
      // independently using the canonical role policy.
      required: [
        function requirePasswordForOperationalRoles() {
          return accountRolePolicy.hasPrivilegedRole(this);
        },
        'Password is required for operational roles',
      ],
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
    // The FIRST role this user registered with — historical/analytics only.
    // NOT used for authorization. Auth checks use `roles[]` and JWT `activeRole`.
    role: {
      type: String,
      enum: ["passenger", "agent", "busOwner", "conductor", "driver"],
      default: "passenger",
    },
    // === MULTI-ROLE SUPPORT (SOURCE OF TRUTH FOR AUTHORIZATION) ===
    // All roles this user actively holds. Grows when user is onboarded to a new app.
    // Role-specific status lives on role profile models (Agent, BusOwner), not here.
    roles: {
      type: [String],
      enum: ["passenger", "agent", "busOwner", "conductor", "driver"],
      default: undefined,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "User must have at least one role",
      },
      index: true,
    },
    // Track when each role was granted: { passenger: Date, agent: Date, ... }
    roleActivatedAt: {
      type: Map,
      of: Date,
      default: {},
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
    // Incremented on logout/password change. Tokens embed the version; stale tokens are rejected.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // === SOFT DELETE ===
    deletedAt: {
      type: Date,
      default: null,    // Non-null = account soft-deleted
    },
    // === ADMIN ENFORCEMENT ===
    // Why the user was banned/suspended — shown to the user in the app
    suspensionReason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    // When the status was last changed by an admin
    suspendedAt: {
      type: Date,
      default: null,
    },
    // Which admin changed the status (for internal tracking)
    statusChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },
    // === ADMIN-GENERATED CREDENTIALS ===
    forcePasswordChange: {
      type: Boolean,
      default: false,   // true = user must change temp password on first login
    },
    ...temporaryCredentialFields,
  },
  { timestamps: true }
);

require("./schemas/user-role-hooks")(userSchema);

// Normalize phone to a consistent local format (strips +977, 977, leading 0).
userSchema.pre("save", function (next) {
  // Phone normalization — single canonical form in the DB
  if (this.isModified("phone") && this.phone) {
    let p = String(this.phone).replace(/[\s\-\(\)]/g, "");
    if (p.startsWith("+977")) p = p.slice(4);
    else if (p.startsWith("977") && p.length > 10) p = p.slice(3);
    if (p.startsWith("0") && p.length === 11) p = p.slice(1);
    this.phone = p;
  }


  next();
});

module.exports = mongoose.model("User", userSchema);

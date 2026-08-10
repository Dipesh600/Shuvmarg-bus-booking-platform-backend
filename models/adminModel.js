const mongoose = require("mongoose");
const { ADMIN_ID_PATTERN } = require("../src/modules/admin/auth-security/admin-identity.policy");

const superAdminSchema = new mongoose.Schema(
  {
    adminId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      match: ADMIN_ID_PATTERN,
    },
    email: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, 
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    password: {
      type: String,
      required: true,
      minlength: 8, 
      select: false,
    },

    role: {
      type: String,
      enum: ["SUPER_ADMIN",'ADMIN','SUB_ADMIN'],
      required: true,
    },

    isRootAdmin: {
      type: Boolean,
      default: false,
      immutable: true,
    },

    lifecycleStatus: {
      type: String,
      enum: ["INVITED", "MFA_PENDING", "ACTIVE", "SUSPENDED"],
      default: "MFA_PENDING",
    },

    // ====== 2FA SETTINGS ======
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    twoFactorType: {
      type: String,
      enum: ["GOOGLE_AUTH", "SMS"],
      default: "GOOGLE_AUTH",
    },

    twoFactorSecret: {
      type: String, 
      select: false,
    },

    encryptedTwoFactorSecret: {
      type: String,
      select: false,
    },

    pendingEncryptedTwoFactorSecret: {
      type: String,
      select: false,
    },

    mfaConfirmedAt: Date,
    recoveryCodeHashes: { type: [String], select: false, default: [] },

    phoneNumber: {
      type: String, 
    },

    // ====== BIOMETRIC ======
    biometricEnabled: {
      type: Boolean,
      default: false,
    },

    biometricPublicKey: {
      type: String, 
    },

    // ====== SECURITY ======
    lastLoginAt: {
      type: Date,
    },

    // Stores the TOTP window timestamp of the last accepted OTP to prevent replay within the 90s window.
    // Updated on every successful 2FA login. (NEW-FINDING-04)
    lastOtpWindowUsed: {
      type: Number,
      default: 0,
    },

    sessionVersion: { type: Number, default: 1 },
    failedMfaAttempts: { type: Number, default: 0 },
    lockedUntil: Date,

    loginAttempts: {
      type: Number,
      default: 0,
    },

    accountLocked: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

superAdminSchema.index(
  { isRootAdmin: 1 },
  { unique: true, partialFilterExpression: { isRootAdmin: true }, name: "one_root_admin" }
);

// ── DUAL REGISTRATION (intentional) ──────────────────────────────────────────
// Some older models reference `ref: "Admin"` while newer ones use `ref: "SuperAdmin"`.
// Both are registered to the same schema + collection ("superadmins") so that
// Mongoose populate() works regardless of which ref name a model uses.
// DO NOT remove either registration without migrating all existing refs first.
mongoose.model("Admin", superAdminSchema, "superadmins");
module.exports = mongoose.model("SuperAdmin", superAdminSchema);

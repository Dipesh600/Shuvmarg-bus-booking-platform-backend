const mongoose = require("mongoose");

const superAdminSchema = new mongoose.Schema(
  {
    adminId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      match: /^SUMA-ADM-\d{3}$/,
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
      default: "SUPER_ADMIN",
    },

    // ====== 2FA SETTINGS ======
    twoFactorEnabled: {
      type: Boolean,
      default: true,
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
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// ── DUAL REGISTRATION (intentional) ──────────────────────────────────────────
// Some older models reference `ref: "Admin"` while newer ones use `ref: "SuperAdmin"`.
// Both are registered to the same schema + collection ("superadmins") so that
// Mongoose populate() works regardless of which ref name a model uses.
// DO NOT remove either registration without migrating all existing refs first.
mongoose.model("Admin", superAdminSchema, "superadmins");
module.exports = mongoose.model("SuperAdmin", superAdminSchema);

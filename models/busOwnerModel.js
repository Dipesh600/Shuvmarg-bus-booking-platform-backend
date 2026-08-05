const mongoose = require("mongoose");
const busOwnerAuditFields = require("./schemas/bus-owner-audit-fields");

const busOwnerSchema = new mongoose.Schema(
  {
    busOwnerId: {
      type: String,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    companyName: {
      type: String,
      default: null,
    },

    /* BUSINESS DOCUMENTS */
    companyRegistration: {
      documentUrls: [String],
      verified: { type: Boolean, default: false },
      rejectionReason: { type: String, default: null },
    },
    ownerIdentity: {
      documentUrls: [String],
      verified: { type: Boolean, default: false },
      rejectionReason: { type: String, default: null },
    },
    taxRegistration: {
      panNumber: { type: String, default: null },
      vatNumber: { type: String, default: null },
      registrationNumber: { type: String, default: null },
      documentUrls: [String],
      verified: { type: Boolean, default: false },
      rejectionReason: { type: String, default: null },
    },
    transportLicense: {
      licenseNumber: { type: String, default: null },
      validTill: { type: Date, default: null },
      documentUrls: [String],
      verified: { type: Boolean, default: false },
      rejectionReason: { type: String, default: null },
    },
    insuranceCertificates: [
      {
        insurerName: { type: String, default: null },
        policyNumber: { type: String, default: null },
        validTill: { type: Date, default: null },
        documentUrls: [String],
        verified: { type: Boolean, default: false },
        rejectionReason: { type: String, default: null },
      },
    ],
    bankDetails: {
      bankName: { type: String, default: null },
      accountNumber: { type: String, default: null },
      accountHolderName: { type: String, default: null },
      branchName: { type: String, default: null },
      swiftCode: { type: String, default: null },
      documentUrls: [String],
    },

    /* APPROVAL, REVIEWS & STATUS */
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    kycReview: {
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null,
      },
      reviewedAt: { type: Date, default: null },
    },
    ...busOwnerAuditFields,
  },
  { timestamps: true }
);

// Auto-generate human-readable BusOwner ID: SUV-MARG-BOWNER-ABC-001
busOwnerSchema.pre("save", async function (next) {
  if (this.busOwnerId) return next();

  const prefix = "SUV-MARG-BOWNER";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  const generateRandomPart = (length) => {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  try {
    let uniqueIdFound = false;
    let candidate;

    while (!uniqueIdFound) {
      const randomCode = generateRandomPart(3);
      const randomNumber = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
      candidate = `${prefix}-${randomCode}-${randomNumber}`;
      const existing = await mongoose.model("BusOwner").findOne({ busOwnerId: candidate });
      if (!existing) {
        uniqueIdFound = true;
      }
    }

    this.busOwnerId = candidate;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("BusOwner", busOwnerSchema);

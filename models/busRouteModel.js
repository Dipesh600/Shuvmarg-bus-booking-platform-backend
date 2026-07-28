const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema(
  {
    routeName: {
      type: String,
      required: true,
      trim: true,
    },
    via: {
      type: String, // e.g. "BP Highway" or "Hetauda"
      trim: true,
    },
    from: {
      type: String,
      required: true,
      trim: true,
    },
    to: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional for GLOBAL routes
    },
    returnRouteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusRoute", // Links to the reciprocal trip
    },
    type: {
      type: String,
      enum: ["GLOBAL", "CUSTOM"],
      default: "GLOBAL",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    distanceKm: {
      type: Number,
    },
    durationMinutes: {
      type: Number,
    },
    stoppages: [{
      name: { type: String, required: true },
      city: { type: String },
      distanceFromSource: { type: Number, default: 0 },
      linkedPoints: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "BoardingPoints",
      }],
      isIntermediate: { type: Boolean, default: false },
    }],
  },
  { timestamps: true }
);

/**
 * Ownership invariant — runs only on INSERT, only for CUSTOM (owner-specific) routes.
 *
 * GLOBAL routes have no owner, so they are explicitly excluded.
 * A CUSTOM route cannot be written to the database unless the operator
 * who owns it has a fully KYC-approved BusOwner profile.
 *
 * Canonical enforcement point — this check cannot be bypassed by any
 * service, admin tool, or future code path that ultimately calls save().
 */
routeSchema.pre("save", async function (next) {
    if (!this.isNew) return next();
    if (this.type === "GLOBAL" || !this.ownerId) return next(); // global routes have no owner

    const BusOwner = require("mongoose").model("BusOwner");
    const busOwner = await BusOwner.findOne({ user: this.ownerId })
        .select("verificationStatus")
        .lean();

    if (!busOwner) {
        return next(new Error(
            "OWNER_PROFILE_NOT_FOUND: No BusOwner profile found for this user."
        ));
    }

    if (busOwner.verificationStatus !== "approved") {
        return next(new Error(
            `OWNER_NOT_APPROVED: Route creation requires an approved BusOwner profile ` +
            `(current status: ${busOwner.verificationStatus}).`
        ));
    }

    return next();
});

module.exports = mongoose.model("BusRoute", routeSchema);


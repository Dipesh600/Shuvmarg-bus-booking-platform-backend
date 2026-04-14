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
      minlength: [6, "Password must be at least 6 characters long"],
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
      enum: ["active", "inactive", "banned"],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

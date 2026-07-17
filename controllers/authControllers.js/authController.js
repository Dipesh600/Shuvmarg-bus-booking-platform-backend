const User = require("../../models/userModel.js");
const OTP = require("../../models/otpModel.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const emailManager = require("../../emailManager/emailManager.js");
const generateOtpEmailContent = require("../../handlers/otp-template.js");
const cloudinary = require("../../handlers/cloudinary.js");
const { isPhoneRegistered, normalizePhone } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");


// Resend OTP — works for both registration (phone not in DB) and password reset (phone in DB)
const resendOtp = async (req, res) => {
  try {
    const { phone, purpose } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required!",
      });
    }

    // Validate purpose
    const validPurposes = ["REGISTRATION", "PASSWORD_RESET", "ACCOUNT_ACTIVATION"];
    const otpPurpose = purpose || "REGISTRATION";
    if (!validPurposes.includes(otpPurpose)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP purpose.",
      });
    }

    // For REGISTRATION resend, phone must NOT exist in User table
    if (otpPurpose === "REGISTRATION") {
      const { registered } = await isPhoneRegistered(phone);
      if (registered) {
        return res.status(409).json({
          success: false,
          message: "This phone number is already registered.",
          errorCode: "PHONE_ALREADY_REGISTERED",
        });
      }
    }

    // For PASSWORD_RESET resend, phone MUST exist in User table
    if (otpPurpose === "PASSWORD_RESET") {
      const user = await User.findOne({ phone: normalizePhone(phone) });
      if (!user) {
        // Don't reveal whether user exists
        return res.status(200).json({
          success: true,
          message: "If an account exists, a new OTP has been sent.",
        });
      }
    }

    // Use centralized OTP helper
    const result = await createAndSendOTP(phone, otpPurpose);

    return res.status(200).json({
      success: true,
      message: "New OTP sent successfully!",
      data: { expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (error.message && error.message.startsWith("OTP_SEND_BLOCKED:")) {
      const minutesLeft = parseInt(error.message.split(":")[1], 10) || 10;
      return res.status(429).json({
        success: false,
        message: `Too many OTP requests. Please wait ${minutesLeft} minute(s) before trying again.`,
        errorCode: "OTP_SEND_BLOCKED",
        retryAfterMinutes: minutesLeft,
      });
    }
    console.error("Resend OTP Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to resend OTP. Please try again.",
    });
  }
};
// Change Profile Picture
const UpdateProfilePic = async (req, res) => {
  try {
    const userId = req.userInfo?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const profilePic = req.files?.profilePic;
    if (!profilePic) {
      return res.status(400).json({
        status: false,
        message: "Profile picture is required",
      });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!allowedTypes.includes(profilePic.mimetype)) {
      return res.status(400).json({
        status: false,
        message: "Invalid file type. Only JPEG, PNG, and GIF are allowed",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const base64profilePic = `data:${
      profilePic.mimetype
    };base64,${profilePic.data.toString("base64")}`;
    const result = await cloudinary.uploader.upload(base64profilePic, {
      folder: "profile_picture",
      public_id: `user_${userId}_${Date.now()}`,
      overwrite: true,
    });

    user.profilePicture = result.secure_url;
    await user.save({ validateBeforeSave: true });

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      // data: {
      //     profilePicture: user.profilePicture,
      //     publicId: result.public_id
      // }
    });
  } catch (error) {
    console.error("Update Profile Picture Error:", error);
    if (error.http_code) {
      return res.status(error.http_code).json({
        status: false,
        message: `Cloudinary error: ${error.message}`,
      });
    }
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Update User Profile (name, address, gender, and optionally profile picture)
const updateProfile = async (req, res) => {
  try {
    const userId = req.userInfo?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const { name, address, gender } = req.body;
    const profilePic = req.files?.profilePic;

    const normalize = (v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'string') {
        const t = v.trim();
        if (t === '' || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return null;
        return t;
      }
      return v;
    };
    const nameInput = normalize(name);
    const addressInput = normalize(address);
    const genderInput = normalize(gender);

    // Validate at least one field is provided
    if (!nameInput && !addressInput && !genderInput && !profilePic) {
      return res.status(400).json({
        status: false,
        message: "At least one field (name, address, gender, or profilePic) is required to update",
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Validate fields if provided
    if (nameInput && nameInput.length < 3) {
      return res.status(400).json({
        status: false,
        message: "Name must be at least 3 characters long",
      });
    }

    if (addressInput && addressInput.length < 5) {
      return res.status(400).json({
        status: false,
        message: "Address must be at least 5 characters long",
      });
    }

    if (genderInput && !['male', 'female'].includes(genderInput.toLowerCase())) {
      return res.status(400).json({
        status: false,
        message: "Gender must be either 'male' or 'female'",
      });
    }

    // Handle profile picture upload if provided
    let profilePictureUrl = user.profilePicture; // Keep existing if not updating
    if (profilePic) {
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(profilePic.mimetype)) {
        return res.status(400).json({
          status: false,
          message: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
        });
      }

      // Check file size (max 5MB)
      if (profilePic.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          status: false,
          message: "File size too large. Maximum 5MB allowed",
        });
      }

      try {
        const base64profilePic = `data:${
          profilePic.mimetype
        };base64,${profilePic.data.toString("base64")}`;
        
        const result = await cloudinary.uploader.upload(base64profilePic, {
          folder: "profile_picture",
          public_id: `user_${userId}_${Date.now()}`,
          overwrite: true,
          transformation: [
            { width: 400, height: 400, crop: "fill", quality: "auto" }
          ]
        });

        profilePictureUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.error("Cloudinary upload error:", cloudinaryError);
        return res.status(500).json({
          status: false,
          message: "Failed to upload profile picture",
        });
      }
    }

    // Update user fields
    const updateData = {};
    if (nameInput) updateData.name = nameInput;
    if (addressInput) updateData.address = addressInput;
    if (genderInput) updateData.gender = genderInput.toLowerCase();
    if (profilePictureUrl !== user.profilePicture) updateData.profilePicture = profilePictureUrl;

    // Update user in database
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { 
        new: true, 
        runValidators: true,
        select: "-password -__v -otp -otpExpiry -_id -referredBy -phone -role -isVerified -status -createdAt -updatedAt -rewardPoints -referralCode -referralPoints -totalReferrals -phoneVerified -yatrapoints"
      }
    );

    return res.status(200).json({
      status: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });

  } catch (error) {
    console.error("Update Profile Error:", error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        status: false,
        message: "Validation error",
        errors: validationErrors
      });
    }

    // Handle cloudinary errors
    if (error.http_code) {
      return res.status(error.http_code).json({
        status: false,
        message: `Cloudinary error: ${error.message}`,
      });
    }

    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Update Password
const updatePassword = async (req, res) => {
  try {
    const userId = req.userInfo?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const { oldPassword, newPassword } = req.body;

    // Validate required fields
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        status: false,
        message: "Both old password and new password are required",
      });
    }

    // Validate new password strength
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        status: false,
        message: passwordCheck.errors[0],
        errors: passwordCheck.errors,
      });
    }

    // Find user with password field included
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      const MAX_ATTEMPTS = 5;
      const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

      // Single atomic aggregation pipeline update:
      // - Always increments failedLoginAttempts by 1
      // - Conditionally sets lockedUntil and increments tokenVersion
      //   when the NEW count (after increment) reaches MAX_ATTEMPTS.
      // No second round-trip, no race window.
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        [
          {
            $set: {
              failedLoginAttempts: { $add: ["$failedLoginAttempts", 1] },
              lockedUntil: {
                $cond: {
                  if: { $gte: [{ $add: ["$failedLoginAttempts", 1] }, MAX_ATTEMPTS] },
                  then: new Date(Date.now() + LOCK_DURATION_MS),
                  else: "$lockedUntil",
                },
              },
              tokenVersion: {
                $cond: {
                  if: { $gte: [{ $add: ["$failedLoginAttempts", 1] }, MAX_ATTEMPTS] },
                  then: { $add: ["$tokenVersion", 1] },
                  else: "$tokenVersion",
                },
              },
            },
          },
        ],
        { new: true }
      );

      const newFailedCount = updatedUser.failedLoginAttempts;
      const remaining = MAX_ATTEMPTS - newFailedCount;
      const message =
        remaining > 0
          ? `Current password is incorrect. ${remaining} attempt(s) remaining.`
          : "Too many failed attempts. Account locked for 15 minutes and all sessions revoked.";

      return res.status(401).json({ success: false, message });
    }


    // Clear failed attempts on successful password verification
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await User.findByIdAndUpdate(user._id, {
        $set: { failedLoginAttempts: 0, lockedUntil: null }
      });
    }

    // Check if new password is different from old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        status: false,
        message: "New password must be different from current password",
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password in database
    await User.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
    });

    // Revoke ALL refresh tokens — forces re-login on all devices
    const { revokeAllUserTokens } = require("../../utils/tokenService.js");
    await revokeAllUserTokens(userId);

    return res.status(200).json({
      status: true,
      message: "Password updated successfully! Please login again on all devices.",
    });

  } catch (error) {
    console.error("Update Password Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Get User Detail
const getUserDetail = async (req, res) => {
  try {
    const userId = req.userInfo.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const user = await User.findById(userId).select(
      "-password -__v -otp -otpExpiry -createdAt -updatedAt"
    );

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Convert user to object and clean up old point fields
    const userObj = user.toObject();

    // Remove old point fields if they exist
    delete userObj.rewardPoints;
    delete userObj.referralPoints;

    return res.status(200).json({
      status: true,
      message: "User details fetched successfully",
      data: userObj,
    });
  } catch (error) {
    console.error("Get User Detail Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};


// Change Forced Password — for admin-generated temp credentials
const changeForcePassword = async (req, res) => {
  try {
    const { tempToken, newPassword, phone, otp } = req.body;

    if (!tempToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Temp token and new password are required.",
      });
    }

    // Verify the temp token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.SECRET_KEY);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Temp token is invalid or expired. Please login again.",
      });
    }

    if (decoded.purpose !== "FORCE_PASSWORD_CHANGE") {
      return res.status(401).json({
        success: false,
        message: "Invalid token purpose.",
      });
    }

    // Validate new password strength
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        message: passwordCheck.errors[0],
        errors: passwordCheck.errors,
      });
    }

    // If phone + OTP provided, verify phone ownership
    if (phone && otp) {
      const otpResult = await verifyOTPCode(phone, otp, "ACCOUNT_ACTIVATION");
      if (!otpResult.valid) {
        return res.status(400).json({
          success: false,
          message: otpResult.error,
        });
      }
    }

    const user = await User.findById(decoded.id).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.forcePasswordChange) {
      return res.status(400).json({
        success: false,
        message: "Password change is not required for this account.",
      });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    user.forcePasswordChange = false;
    user.phoneVerified = true;
    await user.save();

    // Revoke all prior sessions before issuing new credentials (FINDING-08)
    const { generateTokenPair, revokeAllUserTokens } = require("../../utils/tokenService.js");
    await revokeAllUserTokens(user._id);

    // Increment tokenVersion BEFORE minting the new token pair.
    // This invalidates the FORCE_PASSWORD_CHANGE temp token and any other
    // access tokens in the wild. The new access token will carry version+1
    // and will therefore be the only valid one.
    await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

    // Re-fetch so the new tokenVersion is baked into the access token payload
    const freshUser = await User.findById(user._id);

    // Generate full token pair now
    const { accessToken, refreshToken } = await generateTokenPair(freshUser, {
      deviceInfo: req.get("User-Agent") || null,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
    });

    const userWithoutPassword = freshUser.toObject();
    delete userWithoutPassword.password;

    const responseData = {
      success: true,
      message: "Password changed successfully. Welcome!",
      user: userWithoutPassword,
      accessToken,
    };

    // Refresh token delivered via httpOnly cookie only — not in response body (FINDING-06)
    if (refreshToken) {
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Change Force Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  resendOtp,
  UpdateProfilePic,
  updateProfile,
  updatePassword,
  getUserDetail,
  changeForcePassword,
};

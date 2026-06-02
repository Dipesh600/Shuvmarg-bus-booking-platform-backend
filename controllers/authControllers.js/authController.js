const User = require("../../models/userModel.js");
const OTP = require("../../models/otpModel.js");
const ReferralHistory = require("../../models/referralModel.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const emailManager = require("../../emailManager/emailManager.js");
const generateOtpEmailContent = require("../../handlers/otp-template.js");
const cloudinary = require("../../handlers/cloudinary.js");
const sendOTP = require("../../handlers/sparro-otp.js");
const { isPhoneRegistered } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");

// Step 1: Send OTP for phone verification
const sendPhoneOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required!",
      });
    }

    // GLOBAL phone uniqueness check — blocks if phone exists under ANY role
    const { registered } = await isPhoneRegistered(phone);
    if (registered) {
      return res.status(409).json({
        success: false,
        message: "This phone number is already registered.",
        errorCode: "PHONE_ALREADY_REGISTERED",
      });
    }

    // Use centralized OTP helper — 6-digit, crypto-secure, with purpose
    const result = await createAndSendOTP(phone, "REGISTRATION");

    return res.status(200).json({
      status: true,
      message: "OTP sent successfully!",
      data: {
        phone,
        expiresIn: result.expiresIn,
      },
    });
  } catch (error) {
    console.error("Send OTP Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to send OTP!",
      error: error.message,
    });
  }
};

// Step 2: Verify OTP and create user
const verifyPhoneOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        status: false,
        message: "Phone number and OTP are required!",
      });
    }

    // Verify OTP with purpose enforcement and constant-time comparison
    const result = await verifyOTPCode(phone, otp, "REGISTRATION");
    if (!result.valid) {
      return res.status(400).json({
        status: false,
        message: result.error,
      });
    }

    // Double-check phone isn't registered (race condition guard)
    const { registered } = await isPhoneRegistered(phone);
    if (registered) {
      return res.status(409).json({
        status: false,
        message: "This phone number is already registered.",
        errorCode: "PHONE_ALREADY_REGISTERED",
      });
    }

    return res.status(200).json({
      status: true,
      message:
        "Phone verified successfully! Please complete your registration.",
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to verify OTP!",
      error: error.message,
    });
  }
};

// Step 3: Complete user registration
const completeRegistration = async (req, res) => {
  try {
    const { phone, name, email, address, password, gender, referralCode } =
      req.body;

    if (!phone || !name || !password || !address || !gender) {
      const missingField = !phone
        ? "Phone"
        : !name
        ? "Name"
        : !password
        ? "Password"
        : !address
        ? "Address"
        : "Gender";

      return res.status(400).json({
        status: false,
        message: `${missingField} is required!`,
      });
    }

    // SECURITY CHECK: Verify that this phone went through REGISTRATION OTP verification
    const otpRecord = await OTP.findOne({ phone, purpose: "REGISTRATION", isUsed: true });
    if (!otpRecord) {
      return res.status(400).json({
        status: false,
        message:
          "Phone number not verified. Please complete OTP verification first.",
      });
    }

    // Additional security: Check if OTP verification was done recently (within 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (otpRecord.updatedAt < thirtyMinutesAgo) {
      return res.status(400).json({
        status: false,
        message:
          "OTP verification expired. Please verify your phone number again.",
      });
    }

    // Global phone uniqueness check
    const { registered } = await isPhoneRegistered(phone);
    if (registered) {
      return res.status(409).json({
        status: false,
        message: "This phone number is already registered.",
        errorCode: "PHONE_ALREADY_REGISTERED",
      });
    }

    // Check if email already exists for another user (only if email is provided)
    if (email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({
          status: false,
          message: "Email already exists!",
        });
      }
    }

    // Validate password strength
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        status: false,
        message: passwordCheck.errors[0],
        errors: passwordCheck.errors,
      });
    }

    // Hash password — cost factor 12 (minimum for production, 2024 standard)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Always generate a unique referral code for the new user
    const { generateReferralCode } = require("../../handlers/referralCodeGenerator.js");
    const myReferralCode = await generateReferralCode();

    // Create new user with all information (email is optional)
    const newUser = new User({
      phone,
      name,
      email: email || null, // Set email to null if not provided
      address,
      password: hashedPassword,
      gender,
      phoneVerified: true,
      isVerified: true,
      referralCode: myReferralCode,
    });

    // Handle referral code from input if provided (used to find the referrer only)
    let referrerUser = null;
    if (referralCode) {
      const {
        validateReferralCode,
      } = require("../../handlers/referralCodeGenerator.js");

      // Validate referral code format
      if (!validateReferralCode(referralCode)) {
        return res.status(400).json({
          status: false,
          message: "Invalid referral code format",
        });
      }

      // Find referrer by referral code
      referrerUser = await User.findOne({ referralCode });
      if (!referrerUser) {
        return res.status(400).json({
          status: false,
          message: "Invalid referral code",
        });
      }

      // Check if user is trying to refer themselves
      if (referrerUser.phone === phone) {
        return res.status(400).json({
          status: false,
          message: "You cannot refer yourself",
        });
      }

      // Apply referral - both users get 10 points
      newUser.referredBy = referrerUser._id;
      newUser.yatrapoints = 10; // Give 10 points to new user (User A)

      // Update referrer's statistics and points
      referrerUser.totalReferrals += 1;
      referrerUser.yatrapoints += 10; // Give 10 points to referrer (User B)
      await referrerUser.save();
    }

    const savedUser = await newUser.save();

    // Create referral history record if referral code was used
    if (referralCode && referrerUser) {
      try {
        const referralHistoryRecord = new ReferralHistory({
          referredUserId: savedUser._id, // User A (who used the referral code)
          referrerUserId: referrerUser._id, // User B (who owns the referral code)
          referredUserPoints: 10, // Points awarded to User A
          referrerPoints: 10, // Points awarded to User B
          usedReferralCode: referralCode.toUpperCase(), // The referral code that was used
          status: "completed",
          rewardType: "refral_point",
          metadata: {
            ipAddress: req.ip || req.connection.remoteAddress || null,
            deviceInfo: req.get('User-Agent') || null,
          },
          pointsCredited: true,
        });

        await referralHistoryRecord.save();
        console.log(`Referral history created: User ${savedUser._id} used code ${referralCode} from User ${referrerUser._id}`);
      } catch (referralError) {
        console.error("Error creating referral history:", referralError);
        // Don't fail the registration if referral history creation fails
      }
    }

    return res.status(201).json({
      status: true,
      message: "Registration completed successfully!",
      data: {
        userId: savedUser._id,
        phone: savedUser.phone,
        email: savedUser.email,
        // referralApplied: !!referralCode,
        // bonusPoints: referralCode ? 50 : 0,
      },
    });
  } catch (error) {
    console.error("Complete Registration Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to complete registration!",
      error: error.message,
    });
  }
};

// login
const login = async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return res.status(400).json({
        success: false,
        message: `${!emailOrPhone ? "Email or Phone" : "Password"} is required!`,
      });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    }).select("+password");

    if (!user) {
      // Vague response — don't reveal whether phone/email exists
      return res.status(401).json({ success: false, message: "Invalid credentials!" });
    }

    // === SOFT-DELETE CHECK ===
    if (user.deletedAt) {
      return res.status(403).json({ success: false, message: "This account has been deactivated. Contact support." });
    }

    // === ACCOUNT LOCK CHECK ===
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
        errorCode: "ACCOUNT_LOCKED",
      });
    }

    // === BANNED CHECK ===
    if (user.status === "banned") {
      return res.status(403).json({ success: false, message: "Your account has been banned. Contact support." });
    }

    // === INVITED BUT NOT YET ACTIVATED ===
    if (user.status === "invited") {
      return res.status(403).json({
        success: false,
        message: "Your account has not been activated yet. Please check your SMS for activation instructions.",
        errorCode: "ACCOUNT_NOT_ACTIVATED",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      // Increment failed attempts
      const MAX_ATTEMPTS = 5;
      const LOCK_DURATION_MS = 15 * 60 * 1000;  // 15 minutes

      const newFailedCount = (user.failedLoginAttempts || 0) + 1;
      const updateData = { $inc: { failedLoginAttempts: 1 } };

      if (newFailedCount >= MAX_ATTEMPTS) {
        updateData.$set = { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) };
      }

      await User.findByIdAndUpdate(user._id, updateData);

      const remaining = MAX_ATTEMPTS - newFailedCount;
      const message = remaining > 0
        ? `Invalid credentials! ${remaining} attempt(s) remaining.`
        : "Too many failed attempts. Account locked for 15 minutes.";

      return res.status(401).json({ success: false, message });
    }

    // === FORCE PASSWORD CHANGE CHECK ===
    if (user.forcePasswordChange) {
      // Issue a short-lived temp token for the password change flow only
      const tempToken = jwt.sign(
        { id: user._id, purpose: "FORCE_PASSWORD_CHANGE" },
        process.env.SECRET_KEY,
        { expiresIn: "15m" }
      );

      return res.status(200).json({
        success: true,
        message: "You must change your temporary password before proceeding.",
        forcePasswordChange: true,
        tempToken,
      });
    }

    // === SUCCESS — reset counters, record login time ===
    await User.findByIdAndUpdate(user._id, {
      $set: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;

    // Generate access + refresh token pair via token service
    const { generateTokenPair } = require("../../utils/tokenService.js");
    const { accessToken, refreshToken } = await generateTokenPair(user, {
      deviceInfo: req.get("User-Agent") || null,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
    });

    const responseData = {
      success: true,
      message: "Login successful",
      user: userWithoutPassword,
      accessToken,
    };

    // Include refresh token only if generated (admin role gets none)
    if (refreshToken) {
      responseData.refreshToken = refreshToken;
    }

    return res.status(200).json(responseData);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
// OTP Verification (Legacy - for existing users)
const verifyOtp = async (req, res) => {
  try {
    const { emailOrPhone, otp } = req.body;

    if (!emailOrPhone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone and OTP are required!",
      });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User already verified.",
      });
    }

    // For legacy users who might still have OTP in User table
    // This function is kept for backward compatibility
    if (user.otp && user.otp === otp) {
      user.isVerified = true;
      user.otp = null;
      user.otpExpiry = null;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "OTP Verified Successfully!",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid OTP or OTP not found.",
    });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
// Request Password Reset
const requestPasswordReset = async (req, res) => {
  try {
    const { emailOrPhone } = req.body;

    if (!emailOrPhone) {
      return res
        .status(400)
        .json({ status: false, message: "Email or Phone is required!" });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    });

    if (!user) {
      // Don't reveal whether user exists — vague response
      return res
        .status(200)
        .json({ status: true, message: "If an account exists, OTP has been sent." });
    }

    // Use centralized OTP helper with PASSWORD_RESET purpose
    await createAndSendOTP(user.phone, "PASSWORD_RESET");

    return res.status(200).json({
      status: true,
      message: "OTP sent to registered phone!",
    });
  } catch (err) {
    console.error("requestPasswordReset error:", err);
    if (err.message && err.message.includes('Sparrow SMS')) {
      return res.status(502).json({ status: false, message: err.message });
    }
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};
// verify Otp For Reset
const verifyOtpForReset = async (req, res) => {
  try {
    const { emailOrPhone, otp } = req.body;

    if (!emailOrPhone || !otp) {
      return res
        .status(400)
        .json({ status: false, message: "Phone/Email and OTP are required!" });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    });

    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found." });
    }

    // Verify with purpose enforcement — do NOT mark used yet (resetPassword will do that)
    const result = await verifyOTPCode(user.phone, otp, "PASSWORD_RESET", false);
    if (!result.valid) {
      return res.status(400).json({ status: false, message: result.error });
    }

    return res.status(200).json({
      status: true,
      message: "OTP verified. Proceed to reset password.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};
// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { emailOrPhone, otp, newPassword } = req.body;

    if (!emailOrPhone || !otp || !newPassword) {
      return res
        .status(400)
        .json({ status: false, message: "All fields are required." });
    }

    const user = await User.findOne({ phone: emailOrPhone }).select(
      "+password"
    );

    if (!user) {
      return res
        .status(400)
        .json({ status: false, message: "User not found." });
    }

    // Verify OTP with purpose enforcement — mark as used on success
    const result = await verifyOTPCode(user.phone, otp, "PASSWORD_RESET", true);
    if (!result.valid) {
      return res.status(400).json({ status: false, message: result.error });
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

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    return res
      .status(200)
      .json({ status: true, message: "Password reset successful!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

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
      const user = await User.findOne({ phone });
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
    console.error("Resend OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
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
      return res.status(400).json({
        status: false,
        message: "Current password is incorrect",
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

// Refresh Token — issue new access token using a valid refresh token
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required.",
      });
    }

    const { rotateRefreshToken } = require("../../utils/tokenService.js");

    const result = await rotateRefreshToken(refreshToken, {
      deviceInfo: req.get("User-Agent") || null,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
    });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully.",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    console.error("Refresh Token Error:", error.message);

    const errorMap = {
      INVALID_REFRESH_TOKEN: { status: 401, message: "Invalid or revoked refresh token. Please login again." },
      REFRESH_TOKEN_EXPIRED: { status: 401, message: "Refresh token expired. Please login again." },
      USER_NOT_FOUND: { status: 401, message: "User not found. Please login again." },
      ACCOUNT_DEACTIVATED: { status: 403, message: "This account has been deactivated. Contact support." },
      ACCOUNT_BANNED: { status: 403, message: "Your account has been banned. Contact support." },
    };

    const mapped = errorMap[error.message];
    if (mapped) {
      return res.status(mapped.status).json({ success: false, message: mapped.message });
    }

    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Logout — revoke the refresh token (true server-side logout)
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      // Even without a refresh token, client should clear local tokens
      return res.status(200).json({
        success: true,
        message: "Logged out successfully.",
      });
    }

    const { revokeRefreshToken } = require("../../utils/tokenService.js");
    await revokeRefreshToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("Logout Error:", error);
    // Don't fail logout — always return success to the client
    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
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

    // Generate full token pair now
    const { generateTokenPair } = require("../../utils/tokenService.js");
    const { accessToken, refreshToken } = await generateTokenPair(user, {
      deviceInfo: req.get("User-Agent") || null,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
    });

    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;

    const responseData = {
      success: true,
      message: "Password changed successfully. Welcome!",
      user: userWithoutPassword,
      accessToken,
    };

    if (refreshToken) {
      responseData.refreshToken = refreshToken;
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
  sendPhoneOTP,
  verifyPhoneOTP,
  completeRegistration,
  login,
  verifyOtp,
  requestPasswordReset,
  verifyOtpForReset,
  resetPassword,
  resendOtp,
  UpdateProfilePic,
  updateProfile,
  updatePassword,
  getUserDetail,
  refreshAccessToken,
  logout,
  changeForcePassword,
};

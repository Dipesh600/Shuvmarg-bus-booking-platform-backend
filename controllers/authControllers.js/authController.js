const User = require("../../models/userModel.js");
const OTP = require("../../models/otpModel.js");
const ReferralHistory = require("../../models/referralModel.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const emailManager = require("../../emailManager/emailManager.js");
const generateOtpEmailContent = require("../../handlers/otp-template.js");
const cloudinary = require("../../handlers/cloudinary.js");
const sendOTP = require("../../handlers/sparro-otp.js");

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

    // Check if phone already exists in User table
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered!",
      });
    }

    // Generate OTP
    const otpCode = Math.floor(1000 + Math.random() * 9000);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save or update OTP in OTP table
    const otpData = await OTP.findOneAndUpdate(
      { phone },
      {
        otp: otpCode,
        otpExpiry,
        isUsed: false,
        attempts: 0,
      },
      { upsert: true, new: true }
    );

    // Send OTP via SMS
    await sendOTP(phone, `Your Sumarg Verification code is: ${otpCode}`);

    return res.status(200).json({
      status: true,
      message: "OTP sent successfully!",
      data: {
        phone,
        expiresIn: "5 minutes",
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

    // Find OTP record
    const otpRecord = await OTP.findOne({ phone });
    if (!otpRecord) {
      return res.status(400).json({
        status: false,
        message: "OTP not found. Please request a new OTP.",
      });
    }

    // Check if OTP is valid
    if (!otpRecord.isValid()) {
      if (otpRecord.isExpired()) {
        return res.status(400).json({
          status: false,
          message: "OTP has expired. Please request a new one.",
        });
      }
      if (otpRecord.isUsed) {
        return res.status(400).json({
          status: false,
          message: "OTP has already been used. Please request a new one.",
        });
      }
      if (otpRecord.attempts >= otpRecord.maxAttempts) {
        return res.status(400).json({
          status: false,
          message: "Maximum OTP attempts exceeded. Please request a new one.",
        });
      }
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      await otpRecord.incrementAttempts();
      return res.status(400).json({
        status: false,
        message: "Invalid OTP.",
      });
    }

    // Mark OTP as used
    await otpRecord.markAsUsed();

    // Check if phone already exists in User table (only check, don't create)
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: "Phone number already registered!",
      });
    }

    // Generate referral code for new user
    const {
      generateReferralCode,
    } = require("../../handlers/referralCodeGenerator.js");
    const referralCode = await generateReferralCode();

    return res.status(200).json({
      status: true,
      message:
        "Phone verified successfully! Please complete your registration.",
      // data: {
      //   phone,
      //   referralCode,
      //   verified: true,
      // },
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

    // SECURITY CHECK: Verify that this phone number actually went through OTP verification
    const otpRecord = await OTP.findOne({ phone, isUsed: true });
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

    // Check if phone already exists in User table
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: "Phone number already registered!",
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

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
        message: `${
          !emailOrPhone ? "Email or Phone" : "Password"
        } is required!`,
      });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    }).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials!",
      });
    }

    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;
    const accessToken = jwt.sign(
      {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
      process.env.SECRET_KEY,
      { expiresIn: "30d" }
    );
    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: userWithoutPassword,
      accessToken,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
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

    const user = await User.findOne({ phone: emailOrPhone });

    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found!" });
    }

    // Generate OTP for password reset
    const otpCode = Math.floor(1000 + Math.random() * 9000);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save OTP in OTP table
    await OTP.findOneAndUpdate(
      { phone: user.phone },
      {
        otp: otpCode,
        otpExpiry,
        isUsed: false,
        attempts: 0,
      },
      { upsert: true, new: true }
    );

    if (user.phone) {
      await sendOTP(
        user.phone,
        `Your Sumarg Password Reset code is: ${otpCode}`
      );
    }

    return res.status(200).json({
      status: true,
      message: "OTP sent to registered phone!",
    });
  } catch (err) {
    console.error(err);
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
        .json({ status: false, message: "Email and OTP are required!" });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    });

    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found." });
    }

    // Find OTP record from OTP table
    const otpRecord = await OTP.findOne({ phone: user.phone });
    if (!otpRecord || otpRecord.otp !== otp) {
      return res.status(400).json({ status: false, message: "Invalid OTP." });
    }

    if (otpRecord.isExpired()) {
      return res.status(400).json({ status: false, message: "OTP expired." });
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

    // Find and verify OTP record from OTP table
    const otpRecord = await OTP.findOne({ phone: user.phone });
    if (!otpRecord || otpRecord.otp !== otp) {
      return res.status(400).json({ status: false, message: "Invalid OTP." });
    }

    if (otpRecord.isExpired()) {
      return res.status(400).json({ status: false, message: "OTP expired." });
    }

    // Mark OTP as used
    await otpRecord.markAsUsed();

    const hashedPassword = await bcrypt.hash(newPassword, 10);
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

// Resend OTP
const resendOtp = async (req, res) => {
  try {
    const { emailOrPhone } = req.body;

    if (!emailOrPhone) {
      return res.status(400).json({
        success: false,
        message: "Email or Phone is required!",
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
        message: "User is already verified!",
      });
    }

    // Generate new OTP
    const newOtp = Math.floor(1000 + Math.random() * 9000);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    // Update OTP in OTP table
    await OTP.findOneAndUpdate(
      { phone: user.phone },
      {
        otp: newOtp,
        otpExpiry,
        isUsed: false,
        attempts: 0,
      },
      { upsert: true, new: true }
    );

    // Send OTP via SMS
    await sendOTP(user.phone, `Your Sumarg Verification code is: ${newOtp}`);

    return res.status(200).json({
      success: true,
      message: "New OTP sent successfully!",
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
    if (newPassword.length < 6) {
      return res.status(400).json({
        status: false,
        message: "New password must be at least 6 characters long",
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
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await User.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
    });

    return res.status(200).json({
      status: true,
      message: "Password updated successfully!",
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
};

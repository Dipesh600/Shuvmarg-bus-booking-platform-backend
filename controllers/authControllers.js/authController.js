const User = require("../../models/userModel.js");
const OTP = require("../../models/otpModel.js");
const emailManager = require("../../emailManager/emailManager.js");
const generateOtpEmailContent = require("../../handlers/otp-template.js");
const cloudinary = require("../../handlers/cloudinary.js");

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
  UpdateProfilePic,
  updateProfile,
  getUserDetail,
};

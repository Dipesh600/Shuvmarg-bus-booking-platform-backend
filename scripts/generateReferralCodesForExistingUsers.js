const mongoose = require("mongoose");
const User = require("../models/userModel.js");
const { generateReferralCode } = require("../handlers/referralCodeGenerator.js");
require("dotenv").config();

const generateReferralCodesForExistingUsers = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Connected to Database!");

    // Find users without referral codes
    const usersWithoutReferralCodes = await User.find({
      $or: [
        { referralCode: { $exists: false } },
        { referralCode: null }
      ]
    });

    console.log(`Found ${usersWithoutReferralCodes.length} users without referral codes`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutReferralCodes) {
      try {
        const referralCode = await generateReferralCode();
        user.referralCode = referralCode;
        await user.save();
        
        console.log(`Generated referral code ${referralCode} for user: ${user.name || user.phone}`);
        successCount++;
      } catch (error) {
        console.error(`Error generating referral code for user ${user.name || user.phone}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\nSummary:`);
    console.log(`Successfully generated referral codes: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total users processed: ${usersWithoutReferralCodes.length}`);

  } catch (error) {
    console.error("Script error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from Database!");
  }
};

// Run the script if called directly
if (require.main === module) {
  generateReferralCodesForExistingUsers();
}

module.exports = generateReferralCodesForExistingUsers; 
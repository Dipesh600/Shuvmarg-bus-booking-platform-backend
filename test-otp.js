const mongoose = require('mongoose');
const OTP = require('./models/otpModel.js');

// Test OTP model functionality
async function testOTP() {
  try {
    // Connect to MongoDB (you'll need to set your connection string)
    await mongoose.connect('mongodb://localhost:27017/your-database', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Test creating an OTP
    const testOTP = new OTP({
      phone: '+9779812345678',
      otp: '1234',
      otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
    });

    await testOTP.save();
    console.log('OTP saved successfully:', testOTP);

    // Test OTP methods
    console.log('Is OTP expired?', testOTP.isExpired());
    console.log('Is OTP valid?', testOTP.isValid());

    // Test marking as used
    await testOTP.markAsUsed();
    console.log('OTP marked as used:', testOTP.isUsed);

    // Test incrementing attempts
    await testOTP.incrementAttempts();
    console.log('Attempts incremented:', testOTP.attempts);

    // Clean up
    await OTP.deleteOne({ _id: testOTP._id });
    console.log('Test OTP cleaned up');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testOTP();
}

module.exports = testOTP;

'use strict';

const User = require('../../../../../models/userModel');
const BusOwner = require('../../../../../models/busOwnerModel');
const OTP = require('../../../../../models/otpModel');

const findConsumedOtp = (phone) => OTP.findOne({
  phone,
  purpose: 'BUSOWNER_REGISTRATION',
  isUsed: true,
});

const findUserByEmail = (email) => User.findOne({ email });

const upgradeUserToBusOwner = (userId, activatedAt) => User.findByIdAndUpdate(
  userId,
  {
    $addToSet: { roles: 'busOwner' },
    $set: { 'roleActivatedAt.busOwner': activatedAt },
  },
  { new: true },
);

const createUser = async (userData) => {
  const user = new User(userData);
  return user.save();
};

const findBusOwnerByUser = (userId) => BusOwner.findOne({ user: userId });

const createBusOwnerProfile = async ({ userId, companyName }) => {
  const busOwner = new BusOwner({
    user: userId,
    companyName: companyName.trim(),
    verificationStatus: 'pending',
  });
  return busOwner.save();
};

module.exports = {
  findConsumedOtp,
  findUserByEmail,
  upgradeUserToBusOwner,
  createUser,
  findBusOwnerByUser,
  createBusOwnerProfile,
};

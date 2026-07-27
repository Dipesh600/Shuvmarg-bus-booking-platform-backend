"use strict";

const BusOwner = require("../../../../models/busOwnerModel.js");
const User = require("../../../../models/userModel.js");

const applyRegistration = (owner, body) => {
  if (!owner.taxRegistration) owner.taxRegistration = {};
  for (const field of ["panNumber", "registrationNumber"]) {
    if (body[field] !== undefined) owner.taxRegistration[field] = body[field];
  }
};

const applyBank = (owner, body) => {
  if (!owner.bankDetails) owner.bankDetails = {};
  for (const field of [
    "bankName",
    "accountNumber",
    "accountHolderName",
    "branchName",
    "swiftCode",
  ]) {
    if (body[field] !== undefined) owner.bankDetails[field] = body[field];
  }
};

const updateUniqueFields = async (user, { email, phone }) => {
  if (email !== undefined) {
    const next = email && email.trim() !== "" ? email.toLowerCase() : null;
    const current = user.email ? user.email.toLowerCase() : null;
    if (next !== current) {
      if (next && (await User.findOne({ email: next }))) {
        return "Email already in use.";
      }
      user.email = next;
    }
  }
  if (phone && phone !== user.phone) {
    if (await User.findOne({ phone })) return "Phone number already in use.";
    user.phone = phone;
  }
  return null;
};

const updateBusOwnerProfile = async (req, res) => {
  try {
    const { id, name, address, companyName } = req.body;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Bus Owner ID is required.",
      });
    }
    const owner = await BusOwner.findById(id);
    if (!owner) {
      return res.status(404).json({
        success: false,
        message: "Bus Owner record not found.",
      });
    }
    const user = await User.findById(owner.user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Linked user account not found.",
      });
    }
    if (name) user.name = name;
    if (address) user.address = address;
    const conflict = await updateUniqueFields(user, req.body);
    if (conflict) {
      return res.status(400).json({ success: false, message: conflict });
    }
    if (companyName) owner.companyName = companyName;
    applyRegistration(owner, req.body);
    applyBank(owner, req.body);
    await Promise.all([user.save(), owner.save()]);
    return res.status(200).json({
      success: true,
      message: "Bus Owner profile updated successfully.",
      data: { user, busOwner: owner },
    });
  } catch (error) {
    console.error("updateBusOwnerProfile error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = { updateBusOwnerProfile };

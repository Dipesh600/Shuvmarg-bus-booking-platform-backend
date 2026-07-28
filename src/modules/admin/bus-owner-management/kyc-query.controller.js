"use strict";

const BusOwner = require("../../../../models/busOwnerModel.js");
const { isValidObjectId } = require("./request-validation.policy.js");

const findKyc = async (id) => {
  let owner = await BusOwner.findOne({ user: id })
    .populate("user", "name email phone role")
    .lean();
  if (!owner) {
    owner = await BusOwner.findById(id)
      .populate("user", "name email phone role")
      .lean();
  }
  return owner;
};

const getBusOwnerKycById = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "Id is required!" });
    }
    if (!isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid id format!" });
    }
    const owner = await findKyc(id);
    if (!owner) {
      return res
        .status(404)
        .json({ success: false, message: "Bus owner KYC not found!" });
    }
    return res.status(200).json({
      success: true,
      message: "Bus owner KYC details retrieved successfully!",
      data: owner,
    });
  } catch (error) {
    console.error("getBusOwnerKycById error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error!" });
  }
};

const getAllBusOwnerKycs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.verificationStatus) {
      filter.verificationStatus = req.query.verificationStatus;
    }
    const data = await BusOwner.find(filter)
      .populate("user", "name email phone role")
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({
      success: true,
      message:
        data.length === 0
          ? "No KYC records found."
          : "Bus owner KYC records retrieved successfully!",
      results: data.length,
      data,
    });
  } catch (error) {
    console.error("getAllBusOwnerKycs error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error!" });
  }
};

module.exports = { getBusOwnerKycById, getAllBusOwnerKycs };

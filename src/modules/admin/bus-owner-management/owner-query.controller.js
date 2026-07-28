"use strict";

const BusOwner = require("../../../../models/busOwnerModel.js");
const User = require("../../../../models/userModel.js");
const Fleet = require("../../../../models/fleetModel.js");
const { isValidObjectId } = require("./request-validation.policy.js");

const getAllBusOwners = async (_req, res) => {
  try {
    const owners = await BusOwner.find()
      .populate("user", "-password -__v -otp -otpExpiry")
      .lean();
    const data = owners
      .map((owner) =>
        owner.user
          ? {
              _id: owner.user._id,
              busOwnerId: owner._id,
              name: owner.user.name,
              email: owner.user.email,
              phone: owner.user.phone,
              profilePicture: owner.user.profilePicture,
              status: owner.user.status,
              isVerified: owner.verificationStatus === "approved",
              verificationStatus: owner.verificationStatus,
              companyName:
                owner.companyName ||
                owner.companyRegistration?.companyName ||
                "N/A",
              createdAt: owner.createdAt,
            }
          : null
      )
      .filter(Boolean);
    return res.status(200).json({
      success: true,
      message:
        data.length === 0
          ? "No bus owners registered yet."
          : "Bus owners retrieved successfully!",
      results: data.length,
      data,
    });
  } catch (error) {
    console.error("getAllBusOwners error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error!" });
  }
};

const findOwnerAndUser = async (id) => {
  let user = await User.findById(id).select("-password -__v -otp -otpExpiry");
  let owner = await BusOwner.findOne({ user: id });
  if (!owner) {
    owner = await BusOwner.findById(id);
    if (owner && !user) {
      user = await User.findById(owner.user).select(
        "-password -__v -otp -otpExpiry"
      );
    }
  }
  return { user, owner };
};

const getBusOwnerById = async (req, res) => {
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
    const { user, owner } = await findOwnerAndUser(id);
    if (!user && !owner) {
      return res
        .status(404)
        .json({ success: false, message: "Bus owner not found!" });
    }
    const roles =
      user.roles && user.roles.length > 0 ? user.roles : [user.role];
    if (!roles.includes("busOwner")) {
      return res
        .status(400)
        .json({ success: false, message: "User is not a bus owner!" });
    }
    const fleets = await Fleet.find({
      busOwnerId: owner ? owner._id : null,
    }).populate("operatorId", "name email");
    const activeRoutes = new Set(
      fleets
        .map((fleet) => fleet.route?.from + "-" + fleet.route?.to)
        .filter(Boolean)
    ).size;
    const formatted = {
      ...user.toObject(),
      busOwnerDoc: owner || null,
      fleetSize: fleets.length,
      activeRoutes,
      buses: fleets.map((fleet) => ({
        id: fleet.busNumber,
        type: fleet.busType,
        route: fleet.route
          ? `${fleet.route.from} - ${fleet.route.to}`
          : "Unassigned",
        status: fleet.status,
        capacity: fleet.totalSeats || 0,
      })),
      monthlyRevenue: "NPR 0",
      totalRevenue: "NPR 0",
      recentPayments: [],
    };
    return res.status(200).json({
      success: true,
      message: "Bus owner details retrieved successfully!",
      user: formatted,
    });
  } catch (error) {
    console.error("getBusOwnerById error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error!" });
  }
};

module.exports = { getAllBusOwners, getBusOwnerById };

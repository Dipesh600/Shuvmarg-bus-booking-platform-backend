const mongoose = require("mongoose");
require("dotenv").config();
const Coupon = require("./models/couponModel");
const CouponUsage = require("./models/couponUsageModel");
const User = require("./models/userModel");
const Booking = require("./models/bookTicketModel"); // Ensure booking is loaded

async function test() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/shuvmarg", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const coupon = await Coupon.findOne();
  if (!coupon) {
    console.log("No coupons found.");
    process.exit(0);
  }

  const id = coupon._id.toString();
  console.log("Testing with coupon ID:", id);

  try {
    const dailyUsage = await CouponUsage.aggregate([
      { $match: { couponId: new mongoose.Types.ObjectId(id), status: "applied" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$usageDate" } },
          redemptions: { $sum: 1 },
          totalDiscount: { $sum: "$discountAmount" },
          totalOriginal: { $sum: "$originalAmount" },
          totalFinal: { $sum: "$finalAmount" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 60 },
    ]);
    console.log("dailyUsage ok");

    const topUsers = await CouponUsage.aggregate([
      { $match: { couponId: new mongoose.Types.ObjectId(id), status: "applied" } },
      {
        $group: {
          _id: "$userId",
          timesUsed: { $sum: 1 },
          totalDiscount: { $sum: "$discountAmount" },
          lastUsed: { $max: "$usageDate" },
        },
      },
      { $sort: { timesUsed: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$userInfo.name", "Unknown"] },
          phone: { $ifNull: ["$userInfo.phone", ""] },
          timesUsed: 1,
          totalDiscount: 1,
          lastUsed: 1,
        },
      },
    ]);
    console.log("topUsers ok");

    const usageLog = await CouponUsage.find({
      couponId: new mongoose.Types.ObjectId(id),
    })
      .populate("userId", "name phone email")
      .populate("bookingId", "ticketId")
      .sort({ usageDate: -1 })
      .limit(50);
    console.log("usageLog ok");

    const summaryAgg = await CouponUsage.aggregate([
      { $match: { couponId: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: null,
          totalRedemptions: { $sum: { $cond: [{ $eq: ["$status", "applied"] }, 1, 0] } },
          totalDiscountBurned: { $sum: { $cond: [{ $eq: ["$status", "applied"] }, "$discountAmount", 0] } },
          totalOriginalGMV: { $sum: "$originalAmount" },
          uniqueUsers: { $addToSet: "$userId" },
          refundedCount: { $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] } },
        },
      },
      {
        $project: {
          totalRedemptions: 1,
          totalDiscountBurned: 1,
          totalOriginalGMV: 1,
          uniqueUsersCount: { $size: "$uniqueUsers" },
          refundedCount: 1,
          avgDiscountPerUsage: {
            $cond: [
              { $gt: ["$totalRedemptions", 0] },
              { $divide: ["$totalDiscountBurned", "$totalRedemptions"] },
              0,
            ],
          },
        },
      },
    ]);
    console.log("summaryAgg ok", summaryAgg);

  } catch (err) {
    console.error("ERROR CAUGHT:");
    console.error(err);
  }
  process.exit(0);
}
test();

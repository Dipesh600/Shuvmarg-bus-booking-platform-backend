require("dotenv").config();
const mongoose = require("mongoose");
const dbConnection = require("./db/db.js");
const Coupon = require("./models/couponModel.js");
const User = require("./models/userModel.js"); // assuming userModel.js exists

const seedCoupons = async () => {
  try {
    await dbConnection();
    console.log("Connected to DB, seeding coupons...");

    // Find a random user to act as the creator, or just use a dummy valid object ID if none exists
    let admin = await User.findOne();
    let adminId = admin ? admin._id : new mongoose.Types.ObjectId();

    // Clear existing coupons to prevent duplicate key errors during testing
    await Coupon.deleteMany({});

    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);

    const coupons = [
      {
        couponCode: "VOYAGE20",
        title: "Get 20% OFF on first trip",
        description: "Special launch offer for new Shuvmarg riders.",
        discountType: "percentage",
        discountValue: 20,
        validFrom: now,
        validTo: nextMonth,
        createdBy: adminId
      },
      {
        couponCode: "WEEKEND50",
        title: "Super Weekend Saver",
        description: "Save 50% flat this weekend only.",
        discountType: "percentage",
        discountValue: 50,
        validFrom: now,
        validTo: nextMonth,
        createdBy: adminId
      },
      {
        couponCode: "SHUV500",
        title: "Flat Rs. 500 OFF VIP Ride",
        description: "Premium deluxe booking discount.",
        discountType: "fixed",
        discountValue: 500,
        validFrom: now,
        validTo: nextMonth,
        createdBy: adminId
      },
      {
        couponCode: "DASH10",
        title: "Fast Lane 10% Ticket Slash",
        description: "Quick book promo code.",
        discountType: "percentage",
        discountValue: 10,
        validFrom: now,
        validTo: nextMonth,
        createdBy: adminId
      },
      {
        couponCode: "EARLYBIRD",
        title: "Early Bird Rs. 200 Cashback",
        description: "Book early within 7 days.",
        discountType: "fixed",
        discountValue: 200,
        validFrom: now,
        validTo: nextMonth,
        createdBy: adminId
      }
    ];

    await Coupon.insertMany(coupons);
    console.log("Successfully inserted 5 coupons into the database!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding coupons:", error);
    process.exit(1);
  }
};

seedCoupons();

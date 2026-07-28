require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dbConnection = require("../db/db.js");
const User = require("../models/userModel.js");

const seedUser = async () => {
    try {
        await dbConnection();

        // You can change these details if you want a different user
        const name = "Test Passenger";
        const email = "test@shuvmarg.com";
        const phone = "9800000000";
        const plainPassword = "Password123";

        const existing = await User.findOne({
            $or: [{ email }, { phone }],
        });

        if (existing) {
            console.log("User already exists with this email or phone:", {
                email: existing.email,
                phone: existing.phone,
            });
            return process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const newUser = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            role: "passenger",
            isVerified: true,
            phoneVerified: true,
            address: "Kathmandu, Nepal",
            gender: "male",
            yatrapoints: 50 // starting bonus points!
        });

        console.log("✅ Normal test user created successfully!");
        console.log({
            id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            phone: newUser.phone,
            role: newUser.role,
        });
        console.log("👉 Login Phone/Email:", email);
        console.log("👉 Login Password:", plainPassword);

        process.exit(0);
    } catch (error) {
        console.error("❌ Failed to create user:", error);
        process.exit(1);
    } finally {
        mongoose.connection.close();
    }
};

seedUser();

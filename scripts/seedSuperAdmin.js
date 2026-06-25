require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dbConnection = require("../db/db.js");
const SuperAdmin = require("../models/adminModel.js");

const seedSuperAdmin = async () => {
    try {
        await dbConnection();

        const email = process.env.SUPER_ADMIN_EMAIL || "superadmin@sumarg.com";
        const adminId = process.env.SUPER_ADMIN_ID || "SUMA-ADM-001";
        const plainPassword = process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin@123";

        const existing = await SuperAdmin.findOne({
            $or: [{ email }, { adminId }],
        });

        if (existing) {
            console.log("Super admin already exists:", {
                adminId: existing.adminId,
                email: existing.email,
            });
            return process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const superAdmin = await SuperAdmin.create({
            adminId,
            email,
            password: hashedPassword,
        });

        console.log("Super admin created successfully:");
        console.log({
            adminId: superAdmin.adminId,
            email: superAdmin.email,
            role: superAdmin.role,
        });
        console.log("Use this password on first login:", plainPassword);

        process.exit(0);
    } catch (error) {
        console.error("Failed to seed super admin:", error);
        process.exit(1);
    } finally {
        mongoose.connection.close();
    }
};

seedSuperAdmin();

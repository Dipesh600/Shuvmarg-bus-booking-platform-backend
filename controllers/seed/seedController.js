const bcrypt = require('bcryptjs');
const User = require("../../models/userModel.js")

const seedAdmin = async (req, res) => {
    try {
        const plainPassword = "12345678";

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

        const adminData = {
            name: "Dipesh Chaudhary",
            email: "dipesh@sumarg.com",
            phone: "9800000000",
            address: "kathmandu",
            password: hashedPassword,
            profilePicture: "https://giftolexia.com/wp-content/uploads/2015/11/dummy-profile.png",
            gender: "male",
            role: "admin",
            isVerified: false,
            status: "active",
        };

        const existingUser = await User.findOne({ email: adminData.email });
        if (existingUser) {
            return res.status(400).json({
                status: false,
                message: "User with this email already exists"
            });
        }

        const userData = new User(adminData);
        await userData.save();

        return res.status(201).json({
            status: true,
            message: "Admin user created successfully!",
            data: userData
        });

    } catch (e) {
        console.log("error from seed", e);
        return res.status(500).json({
            status: false,
            message: "Internal server error"
        });
    }
};

module.exports = seedAdmin;
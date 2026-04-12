const Mongoose = require("mongoose");

const userDeviceInfoSchema = new Mongoose.Schema({
    userId: {
        type: Mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    token: {
        type: String,
    },
    userType: String,
    os: String,
    osVersion: String,
    deviceModel: String,
}, { timestamps: true });

module.exports = Mongoose.model("UserDeviceInfo", userDeviceInfoSchema);

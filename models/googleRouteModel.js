const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    polyline: [
      new mongoose.Schema(
        {
          lat: { type: Number },
          lng: { type: Number },
          address: { type: String },
        },
        { _id: false }
      ),
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Route", routeSchema);

const mongoose = require("mongoose");
require("dotenv").config();
const OperatorRouteConfig = require("./models/operatorRouteConfigModel");
require("./models/routeVariantModel");
require("./models/routeCorridorModel");
require("./models/cityModel");

async function run() {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/shuvmarg");
    const config = await OperatorRouteConfig.findOne()
            .populate({
                path: "variantId",
                populate: {
                    path: "corridorId",
                    populate: [
                        { path: "originId" },
                        { path: "destinationId" }
                    ]
                },
            }).lean();
    console.log(JSON.stringify(config.variantId.corridorId.originId, null, 2));
    process.exit(0);
}
run();

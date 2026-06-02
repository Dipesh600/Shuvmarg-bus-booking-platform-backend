const mongoose = require("mongoose");
const Schedule = require("./models/scheduleModel");

mongoose.connect("mongodb://localhost:27017/shuvmarg", { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const schedules = await Schedule.find({}).populate("variantId").lean();
    for (const s of schedules) {
      console.log(`ID: ${s._id}, Bus: ${s.busId}, Dir: ${s.variantId?.direction}, Dep: ${s.departureTime}, Ret: ${s.returnScheduleId}`);
    }
    process.exit(0);
  });

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const TestSchema = new Schema({
    tripId: Number,
    seats: [String]
});
TestSchema.index({ tripId: 1, seats: 1 }, { unique: true });

const TestModel = mongoose.model("TestBooking", TestSchema);

const run = async () => {
    await mongoose.connect("mongodb://127.0.0.1:27017/test_db");
    await TestModel.deleteMany({});
    
    try {
        await TestModel.create({ tripId: 1, seats: ["A1"] });
        console.log("Insert 1 success");
        
        await TestModel.create({ tripId: 1, seats: ["A1", "A2"] });
        console.log("Insert 2 success (SHOULD NOT HAPPEN)");
    } catch (e) {
        console.log("Insert 2 failed as expected:", e.message);
    }
    process.exit(0);
};
run();

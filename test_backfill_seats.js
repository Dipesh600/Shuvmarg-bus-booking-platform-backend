require("dotenv").config();
const mongoose = require("mongoose");
const Trip = require("./models/tripModel");
const Seat = require("./models/seatsModel");
const Bus = require("./models/fleetModel");

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);
    
    // Find seats with empty seata and empty seatb
    const emptySeats = await Seat.find({ "seata.0": { $exists: false }, "seatb.0": { $exists: false } });
    console.log(`Found ${emptySeats.length} empty seat documents to backfill.`);
    
    for (const seatDoc of emptySeats) {
        const trip = await Trip.findById(seatDoc.tripId);
        if (!trip) continue;
        
        const bus = await Bus.findById(trip.busId);
        const totalSeats = bus?.totalSeats || 36;
        
        const seata = [];
        const seatb = [];
        let generatedCount = 0;
        const rows = Math.ceil(totalSeats / 4);
        
        for (let i = 1; i <= rows; i++) {
            if (generatedCount < totalSeats) { seata.push({ seatNo: `A${i}`, booked: false }); generatedCount++; }
            if (generatedCount < totalSeats) { seata.push({ seatNo: `B${i}`, booked: false }); generatedCount++; }
            if (generatedCount < totalSeats) { seatb.push({ seatNo: `C${i}`, booked: false }); generatedCount++; }
            if (generatedCount < totalSeats) { seatb.push({ seatNo: `D${i}`, booked: false }); generatedCount++; }
        }
        
        seatDoc.seata = seata;
        seatDoc.seatb = seatb;
        await seatDoc.save();
    }
    
    console.log("Backfill complete!");
    process.exit(0);
};
run();

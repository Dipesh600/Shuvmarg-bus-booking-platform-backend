const mongoose = require('mongoose');
const Seat = require('./models/seatsModel.js');

mongoose.connect('mongodb://127.0.0.1:27017/shuvmarg').then(async () => {
    const seats = await Seat.find().lean();
    console.log("Total seats:", seats.length);
    const missingTimestamps = seats.filter(s => !s.createdAt || !s.updatedAt);
    console.log("Seats missing timestamps:", missingTimestamps.length);
    
    const missingV = seats.filter(s => s.__v === undefined);
    console.log("Seats missing __v:", missingV.length);
    mongoose.disconnect();
});

const mongoose = require('mongoose');
const Seat = require('./models/seatsModel.js');

mongoose.connect('mongodb://127.0.0.1:27017/shuvmarg').then(async () => {
    const seat = await Seat.findOne({tripId: "6a0566848ebd7314d3e82abf"}).lean();
    console.log(JSON.stringify(seat, null, 2));
    mongoose.disconnect();
});

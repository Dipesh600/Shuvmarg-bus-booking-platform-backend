const mongoose = require('mongoose');
const Booking = require('./models/bookTicketModel.js');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    const formattedPassengers = [{name: "rahul sha", phone: "9803643115", email: "", seatNo: ["B1"]}].map(p => ({
      name: p.name || "Passenger",
      age: p.age || 25,
      gender: p.gender || "other",
      seatNo: p.seatNo || "N/A"
    }));

    const booking = new Booking({
      userId: new mongoose.Types.ObjectId(),
      tripId: new mongoose.Types.ObjectId(),
      seats: ["B1"],
      passengerDetails: formattedPassengers,
      boardingPoint: {},
      droppingPoint: {},
      originalAmount: 1150,
      couponUsed: null,
      couponCode: "shuvmarg",
      discountAmount: 0,
      totalAmount: 1050,
      yatraPointsUsed: 0,
      yatraPointsDiscount: 0,
      ticketId: "TKT-123",
    });

    await booking.validate();
    console.log("Validation successful");
  } catch (e) {
    console.error("Validation failed:", e);
  }
  process.exit(0);
}
run();

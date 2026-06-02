const mongoose = require('mongoose');
const Seat = require('./models/seatsModel.js');
const Booking = require('./models/bookTicketModel.js');
require('dotenv').config();

async function releaseOrphanedSeats() {
  await mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true });

  const allSeats = await Seat.find({});
  let releasedCount = 0;

  for (const seatDoc of allSeats) {
    let changed = false;
    for (const arr of ['seata', 'seatb', 'seatc']) {
      for (const s of seatDoc[arr]) {
        if (s.booked) {
          const booking = await Booking.findOne({ tripId: seatDoc.tripId, seats: s.seatNo.toLowerCase() });
          const bookingUpper = await Booking.findOne({ tripId: seatDoc.tripId, seats: s.seatNo.toUpperCase() });
          if (!booking && !bookingUpper) {
            console.log(`Releasing orphaned seat ${s.seatNo} for trip ${seatDoc.tripId}`);
            s.booked = false;
            s.bookedBy = null;
            s.bookedAt = null;
            changed = true;
            releasedCount++;
          }
        }
      }
    }
    if (changed) {
      await seatDoc.save();
    }
  }

  process.exit(0);
}

releaseOrphanedSeats();

const mongoose = require("mongoose");

const seatUnitSchema = new mongoose.Schema(
  {
    seatNo: { type: String, required: true },
    booked: { type: Boolean, default: false },
    bookedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    bookedAt: { type: Date, default: null },
  },
  { _id: false }
);

const autoSeatSchema = new mongoose.Schema(
  {
    busNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    busType: {
      type: String,
      required: true,
      enum: ['deluxe', 'semi-deluxe', 'normal'],
    },
    totalSeats: {
      type: Number,
      required: true,
    },
    seatsPerRow: {
      type: Number,
      required: true,
      enum: [2, 3, 4],
    },
    seata: [seatUnitSchema],
    seatb: [seatUnitSchema],
  },
  { timestamps: true }
);

// Static method to get seat configuration by bus number
autoSeatSchema.statics.getSeatConfig = async function(busNo) {
  return this.findOne({ busNo });
};

// Method to initialize seat configuration
autoSeatSchema.methods.initializeSeats = function() {
  const totalSeats = this.totalSeats;
  const seatsPerRow = this.seatsPerRow;
  const rows = Math.ceil(totalSeats / seatsPerRow);
  
  this.seata = [];
  this.seatb = [];
  
  let seatNumber = 1;
  
  for (let i = 1; i <= rows; i++) {
    // Add seats to seata (left side)
    if (seatNumber <= totalSeats) {
      this.seata.push({
        seatNo: `A${i}`,
        booked: false,
        bookedBy: null,
        bookedAt: null
      });
      seatNumber++;
    }
    
    // Add seats to seatb (right side) if seatsPerRow > 1
    if (seatsPerRow > 1 && seatNumber <= totalSeats) {
      this.seatb.push({
        seatNo: `B${i}`,
        booked: false,
        bookedBy: null,
        bookedAt: null
      });
      seatNumber++;
    }
    
    // For buses with 3 or 4 seats per row (additional middle seats)
    if (seatsPerRow > 2) {
      // Middle seats for 3 or 4 seats per row
      if (seatNumber <= totalSeats) {
        this.seata.push({
          seatNo: `C${i}`,
          booked: false,
          bookedBy: null,
          bookedAt: null
        });
        seatNumber++;
      }
      
      // Fourth seat for buses with 4 seats per row
      if (seatsPerRow === 4 && seatNumber <= totalSeats) {
        this.seatb.push({
          seatNo: `D${i}`,
          booked: false,
          bookedBy: null,
          bookedAt: null
        });
        seatNumber++;
      }
    }
  }
  
  return this;
};

module.exports = mongoose.model("AutoSeat", autoSeatSchema);

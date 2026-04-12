const AutoSeat = require("../../../models/autoSeatsModel.js");
const BusSchedule = require("../../../models/busScheduleModel.js");


async function createAutoSeat(req, res) {
  try {
    const { scheduleId, bussNo, seatRangeA, seatRangeB } = req.body;

    if (!scheduleId) {
      return res.status(400).json({ status: false, message: "scheduleId is required" });
    }

    const schedule = await BusSchedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ status: false, message: "Schedule not found" });
    }

    const exists = await AutoSeat.findOne({ scheduleId });
    if (exists) {
      return res.status(409).json({ status: false, message: "AutoSeat already exists for this schedule", data: exists });
    }

    const finalBussNo = bussNo || schedule.bussNo;

    const generateSeatsFromRange = (prefix, range) => {
      const [start, end] = range.split("-").map(Number);
      const seats = [];
      for (let i = start; i <= end; i++) {
        seats.push({ seatNo: `${prefix}${i}`, booked: false, bookedBy: null, bookedAt: null });
      }
      return seats;
    };

    let seata = [];
    let seatb = [];

    if (seatRangeA && seatRangeB) {
      seata = generateSeatsFromRange("a", seatRangeA);
      seatb = generateSeatsFromRange("b", seatRangeB);
    } else {
      const total = schedule.totalSeats || 0;
      const half = Math.floor(total / 2);
      const gen = (prefix, count) => Array.from({ length: count }, (_, i) => ({
        seatNo: `${prefix}${i + 1}`,
        booked: false,
        bookedBy: null,
        bookedAt: null,
      }));
      seata = gen("a", half);
      seatb = gen("b", total - half);
    }

    const doc = await AutoSeat.create({
      scheduleId,
      bussNo: finalBussNo,
      seata,
      seatb,
    });

    return res.status(201).json({ status: true, message: "AutoSeat created", data: doc });
  } catch (error) {
    console.error("createAutoSeat error:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
}

module.exports = { createAutoSeat };

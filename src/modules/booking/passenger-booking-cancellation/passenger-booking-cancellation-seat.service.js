function createPassengerBookingCancellationSeatService() {
  const freeSeats = (seatDoc, bookedSeats) => {
    // Helper to free a seat from seata, seatb, or seatc
    const freeSeat = (seatNo) => {
      let seatKey = null;
      if (seatDoc.seata.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seata";
      } else if (seatDoc.seatb.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seatb";
      } else if (seatDoc.seatc.some((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase())) {
        seatKey = "seatc";
      }
      if (seatKey) {
        const seatObj = seatDoc[seatKey]?.find((s) => s.seatNo.toLowerCase() === seatNo.toLowerCase());
        if (seatObj) {
          seatObj.booked = false;
          seatObj.bookedBy = null;
          seatObj.bookedAt = null;
        }
      }
    };

    bookedSeats.forEach((s) => freeSeat(s.toLowerCase()));
  };

  return { freeSeats };
}

module.exports = {
  createPassengerBookingCancellationSeatService,
};

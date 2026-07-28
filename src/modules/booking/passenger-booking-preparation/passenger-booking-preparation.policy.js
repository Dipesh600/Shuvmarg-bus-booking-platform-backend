function validatePreparationInput({ scheduleId, seatNumbers }) {
  if (
    !scheduleId ||
    !seatNumbers ||
    seatNumbers.length === 0
  ) {
    return {
      isValid: false,
      statusCode: 400,
      responseBody: {
        success: false,
        message: "Missing required fields: scheduleId, seatNumbers",
      },
    };
  }
  return { isValid: true };
}

function calculateAuthoritativeOriginalAmount(trip, seatCount) {
  const fare = trip?.tripFare ?? trip?.routeId?.basePrice;
  if (!Number.isFinite(fare) || fare <= 0) {
    return {
      isValid: false,
      statusCode: 409,
      responseBody: {
        success: false,
        message: "A valid fare is not configured for this trip.",
        errorCode: "TRIP_FARE_UNAVAILABLE",
      },
    };
  }
  return { isValid: true, originalAmount: fare * seatCount };
}

function validateTripForOnlineBooking(trip, now) {
  if (!trip) {
    return {
      isValid: false,
      statusCode: 404,
      responseBody: { success: false, message: "Trip not found." },
    };
  }
  if (trip.bookingClosesAt && new Date(trip.bookingClosesAt) < now) {
    return {
      isValid: false,
      statusCode: 400,
      responseBody: {
        success: false,
        message: "Online booking has closed for this trip. Bookings can no longer be accepted.",
        errorCode: "BOOKING_WINDOW_CLOSED",
      },
    };
  }
  if (trip.status !== "scheduled" && trip.status !== "boarding") {
    return {
      isValid: false,
      statusCode: 400,
      responseBody: {
        success: false,
        message: `Bookings are not available for trips with status: ${trip.status}`,
        errorCode: "TRIP_NOT_BOOKABLE",
      },
    };
  }
  return { isValid: true };
}

function classifyRequestedSeats(seatDoc, normalizedSeats) {
  const allSeats = [...seatDoc.seata, ...seatDoc.seatb, ...seatDoc.seatc];
  const alreadyBookedSeats = [];
  const blockedSeats = [];
  const invalidSeats = [];

  normalizedSeats.forEach((seatNo) => {
    const seat = allSeats.find((s) => s.seatNo.toLowerCase() === seatNo);
    if (!seat) {
      invalidSeats.push(seatNo.toUpperCase());
    } else if (seat.booked) {
      alreadyBookedSeats.push(seatNo.toUpperCase());
    } else if (seat.blockedFor && seat.blockedFor !== "none") {
      blockedSeats.push(seatNo.toUpperCase());
    }
  });

  return { invalidSeats, alreadyBookedSeats, blockedSeats };
}

function calculatePreparationQuote({
  originalAmount,
  couponDiscount = 0,
  spendableBalance = 0,
  requestedSmMoney = 0,
  maxDiscountPercent = 80,
}) {
  const discountAmount = couponDiscount;
  const maxDiscountPct = maxDiscountPercent || 80;
  const maxTotalDiscount = Math.floor(originalAmount * (maxDiscountPct / 100));
  const maxSmMoneyAllowed = Math.max(0, maxTotalDiscount - discountAmount);

  let reqSmMoney = Number(requestedSmMoney) || 0;
  reqSmMoney = Math.max(0, Math.floor(reqSmMoney));
  const smMoneyApplied = Math.min(reqSmMoney, spendableBalance, maxSmMoneyAllowed);

  const afterCouponAmount = originalAmount - discountAmount;
  const gatewayAmount = afterCouponAmount - smMoneyApplied;
  const paymentAmount = gatewayAmount;

  return {
    originalAmount,
    couponDiscount: discountAmount,
    afterCouponAmount,
    spendableBalance,
    smMoneyApplied,
    maxSmMoneyAllowed,
    totalDiscount: discountAmount + smMoneyApplied,
    gatewayAmount,
    paymentAmount,
  };
}

module.exports = {
  validatePreparationInput,
  validateTripForOnlineBooking,
  classifyRequestedSeats,
  calculatePreparationQuote,
  calculateAuthoritativeOriginalAmount,
};

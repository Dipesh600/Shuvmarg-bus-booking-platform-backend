const retireLegacyBookingFlow = (req, res) => {
  return res.status(410).json({
    success: false,
    message: "This booking endpoint has been retired. Use the prepare and confirm booking flow.",
    errorCode: "LEGACY_BOOKING_FLOW_RETIRED",
  });
};

module.exports = {
  retireLegacyBookingFlow,
};

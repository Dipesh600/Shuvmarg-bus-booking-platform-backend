class PassengerBookingCancellationValidationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'PassengerBookingCancellationValidationError';
    this.statusCode = statusCode;
  }
}

module.exports = {
  PassengerBookingCancellationValidationError,
};

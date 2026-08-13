"use strict";

class SeatLayoutV3Error extends Error {
  constructor(message, path = null) {
    super(message);
    this.name = "SeatLayoutV3Error";
    this.code = "SEAT_LAYOUT_V3_INVALID";
    this.statusCode = 422;
    this.details = path ? { path } : null;
  }
}

module.exports = { SeatLayoutV3Error };

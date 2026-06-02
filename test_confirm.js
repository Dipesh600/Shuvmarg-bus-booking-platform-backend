const axios = require('axios');
async function run() {
  try {
    const res = await axios.post('http://127.0.0.1:7012/api/ticket/confirmBooking', {
      scheduleId: "6a05661f8ebd7314d3e82857",
      seatNumbers: ["B1"],
      paymentAmount: 1050,
      originalAmount: 1150,
      passengerDetails: [{name: "rahul sha", phone: "9803643115", email: "", seatNo: ["B1"]}],
      couponCode: "shuvmarg",
      tempBookingId: "ESEWA_12345",
      paymentId: "123456",
      gateway: "esewa"
    }, {
      headers: {
        // Need to pass a valid token. The user's token is in the dartvm logs.
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZjRmZWFmZWU2ODQ0NTQwYjY0OGUzNCIsIm5hbWUiOiJyYWh1bCBzaGEiLCJwaG9uZSI6Ijk4MDM2NDMxMTUiLCJyb2xlIjoiYnVzT3duZXIiLCJpc1ZlcmlmaWVkIjp0cnVlLCJpYXQiOjE3NzkwOTQzMzQsImV4cCI6MTc3OTY5OTEzNH0.4LedWN6WxoRNagQjP2pzpFIwZPNtMam8byhyVGkPtQg'
      }
    });
    console.log(res.data);
  } catch (e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
run();

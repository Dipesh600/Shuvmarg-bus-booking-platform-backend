const axios = require("axios");
const qs = require("qs");

async function sendOTP(phone, message) {
  const payload = qs.stringify({
    token: "v2_xRg3g3C0Fh9n0avtMoMV5ohNjSV.WfMx",
    from: "Demo",
    to: phone,
    text: message,
  });

  try {
    const response = await axios.post(
      "http://api.sparrowsms.com/v2/sms/",
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("SMS Sent:", response.data);
  } catch (error) {
    console.error(
      "Error sending SMS:",
      error.response ? error.response.data : error.message
    );
  }
}
module.exports = sendOTP;

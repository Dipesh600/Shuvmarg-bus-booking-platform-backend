const axios = require("axios");
const qs = require("qs");

/**
 * handlers/sparro-otp.js
 *
 * Sparrow SMS gateway wrapper.
 *
 * Configuration (required in .env):
 *   SPARROW_SMS_TOKEN  — API token from Sparrow SMS dashboard
 *   SPARROW_SMS_FROM   — Sender name registered with Sparrow (default: "TheAlert")
 */
async function sendOTP(phone, message) {
  const token = process.env.SPARROW_SMS_TOKEN;
  const from = process.env.SPARROW_SMS_FROM || "TheAlert";

  if (!token) {
    throw new Error("SPARROW_SMS_TOKEN is not set in environment variables.");
  }

  const payload = qs.stringify({
    token,
    from,
    to: phone,
    text: message,
  });

  try {
    const response = await axios.post(
      "https://api.sparrowsms.com/v2/sms/",
      payload,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000, // 10 second timeout — don't hang the request
      }
    );

    console.log("SMS sent to", phone, "| Response:", response.data);
  } catch (error) {
    const errorDetails = error.response ? error.response.data : error.message;
    console.error("Sparrow SMS error:", errorDetails);
    throw new Error(`Sparrow SMS Gateway Error: ${JSON.stringify(errorDetails)}`);
  }
}

module.exports = sendOTP;

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

  const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);

  const payload = qs.stringify({
    token,
    from,
    to: cleanPhone,
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

    console.log("[Sparrow SMS] Sent to", phone, "| Response:", response.data);

    if (response.data && response.data.response_code && response.data.response_code !== 200) {
      const msg = `Sparrow SMS returned status code ${response.data.response_code}: ${response.data.response || "Delivery failed"}`;
      console.error("[Sparrow SMS Delivery Warning]:", msg);
      if (process.env.NODE_ENV === "production") {
        throw new Error(msg);
      }
    }
  } catch (error) {
    const errorDetails = error.response ? error.response.data : error.message;
    console.error("[Sparrow SMS Error]:", errorDetails);
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Sparrow SMS Gateway Error: ${JSON.stringify(errorDetails)}`);
    }
  }
}

module.exports = sendOTP;

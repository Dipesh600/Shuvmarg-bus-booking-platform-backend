const axios = require("axios");
const qs = require("qs");

const queuedMessageCount = (data) => {
  const code = Number(data?.response_code);
  const count = Number(data?.count);
  return code === 200 && Number.isSafeInteger(count) && count > 0 ? count : 0;
};

/**
 * handlers/sparro-otp.js
 *
 * Sparrow SMS gateway wrapper.
 *
 * Configuration (required in .env):
 *   SPARROW_SMS_TOKEN  — API token from Sparrow SMS dashboard
 *   SPARROW_SMS_FROM   — Sender name registered with Sparrow (default: "TheAlert")
 *
 * Errors are ALWAYS thrown regardless of environment.
 * A successful response confirms queue acceptance only; it does not prove handset delivery.
 * Invalid provider responses always throw so callers cannot report a false queue success.
 */
async function sendOTP(phone, message) {
  const token = process.env.SPARROW_SMS_TOKEN;
  const from = process.env.SPARROW_SMS_FROM || "TheAlert";

  if (!token) {
    throw new Error("Sparrow SMS Gateway Error: SPARROW_SMS_TOKEN is not configured.");
  }

  const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);

  const payload = qs.stringify({
    token,
    from,
    to: cleanPhone,
    text: message,
  });

  let response;
  try {
    response = await axios.post(
      "https://api.sparrowsms.com/v2/sms/",
      payload,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      }
    );
  } catch (error) {
    // HTTP-level failure: Sparrow returned 4xx/5xx, or network/timeout
    let detail;
    if (error.response) {
      detail = `HTTP ${error.response.status} — ${JSON.stringify(error.response.data)}`;
    } else {
      detail = `No response from Sparrow — ${error.message}`;
    }
    console.error("[Sparrow SMS Error]:", detail);
    throw new Error(`Sparrow SMS Gateway Error: ${detail}`);
  }

  // Sparrow sometimes returns HTTP 200 but embeds a non-200 response_code in the body
  // (e.g. response_code 1001 = Invalid IP Address, 1003 = Invalid token).
  // Treat these as queue request failures — never silently ignore them.
  const count = queuedMessageCount(response.data);
  if (count === 0) {
    const code = response.data?.response_code ?? "missing";
    const detail = `code ${code} — ${response.data?.response || "No messages were queued"}`;
    console.error("[Sparrow SMS Error]:", detail, response.data);
    throw new Error(`Sparrow SMS Gateway Error: ${detail}`);
  }

  console.log("[Sparrow SMS] Queued for", cleanPhone, "| Count:", count);
  return { queued: true, count };
}

module.exports = sendOTP;
module.exports.queuedMessageCount = queuedMessageCount;

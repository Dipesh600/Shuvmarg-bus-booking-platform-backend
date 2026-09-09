const axios = require("axios");
const qs = require("qs");
const { maskPhone, normalizePhone } = require("../src/modules/notifications/outbox/notification-outbox.policy");

class SmsProviderError extends Error {
  constructor(message, { category = "PROVIDER_ERROR", retryable = false, providerCode = null, httpStatus = null } = {}) {
    super(message);
    this.name = "SmsProviderError";
    this.category = category;
    this.retryable = retryable;
    this.providerCode = providerCode;
    this.httpStatus = httpStatus;
  }
}

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
  let cleanPhone;
  try {
    cleanPhone = normalizePhone(phone);
  } catch {
    throw new SmsProviderError("Sparrow SMS Gateway Error: invalid recipient.", {
      category: "VALIDATION", retryable: false, providerCode: "INVALID_PHONE",
    });
  }
  const token = process.env.SPARROW_SMS_TOKEN;
  const from = process.env.SPARROW_SMS_FROM || "TheAlert";

  if (!token) {
    throw new SmsProviderError("Sparrow SMS Gateway Error: token is not configured.", {
      category: "CONFIGURATION", retryable: true, providerCode: "TOKEN_MISSING",
    });
  }

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
      detail = `HTTP ${error.response.status} from Sparrow`;
    } else {
      detail = `No response from Sparrow — ${error.message}`;
    }
    const status = Number(error.response?.status || 0);
    const retryable = !status || [408, 425, 429].includes(status) || status >= 500;
    const category = [401, 403].includes(status) ? "AUTHENTICATION" : retryable ? "TEMPORARY" : "PERMANENT";
    console.error("[Sparrow SMS Error]:", category, status || error.code || "NO_RESPONSE");
    throw new SmsProviderError(`Sparrow SMS Gateway Error: ${detail}`, {
      category,
      retryable: category === "AUTHENTICATION" || retryable,
      providerCode: error.code || (status ? `HTTP_${status}` : "NO_RESPONSE"),
      httpStatus: status || null,
    });
  }

  // Sparrow sometimes returns HTTP 200 but embeds a non-200 response_code in the body
  // (e.g. response_code 1001 = Invalid IP Address, 1003 = Invalid token).
  // Treat these as queue request failures — never silently ignore them.
  const count = queuedMessageCount(response.data);
  if (count === 0) {
    const code = response.data?.response_code ?? "missing";
    const detail = `provider response code ${code}`;
    const configuration = [1001, 1003].includes(Number(code));
    console.error("[Sparrow SMS Error]:", configuration ? "CONFIGURATION" : "PROVIDER_REJECTED", code);
    throw new SmsProviderError(`Sparrow SMS Gateway Error: ${detail}`, {
      category: configuration ? "CONFIGURATION" : "PROVIDER_REJECTED",
      retryable: configuration,
      providerCode: String(code),
    });
  }

  const providerReference = response.data?.message_id || response.data?.messageId
    || response.data?.reference_id || response.data?.referenceId || null;
  console.log("[Sparrow SMS] Accepted for", maskPhone(cleanPhone), "| Count:", count);
  return { queued: true, count, providerReference: providerReference ? String(providerReference) : null };
}

module.exports = sendOTP;
module.exports.queuedMessageCount = queuedMessageCount;
module.exports.SmsProviderError = SmsProviderError;

/**
 * services/esewaVerificationService.js
 *
 * Server-side eSewa payment verification.
 *
 * BEFORE releasing a booking confirmation, we MUST verify the payment
 * with eSewa directly. The Flutter SDK's onPaymentSuccess callback returns
 * a refId — but this is CLIENT-provided and could be fabricated.
 *
 * eSewa Status Check API:
 *   UAT:  GET https://uat.esewa.com.np/api/epay/transaction/status/
 *   PROD: GET https://epay.esewa.com.np/api/epay/transaction/status/
 *
 * Query params:
 *   product_code       — your merchant product code (EPAYTEST for UAT)
 *   total_amount       — the exact amount charged
 *   transaction_uuid   — the refId from eSewa SDK
 *
 * Response (if successful):
 *   { status: "COMPLETE", ref_id: "...", total_amount: "...", ... }
 *
 * Docs: https://developer.esewa.com.np/
 */

const axios = require("axios");
const logger = require("../utils/logger.js");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const ESEWA_CONFIG = {
    baseUrl: IS_PRODUCTION
        ? "https://epay.esewa.com.np/api/epay/transaction/status/"
        : "https://uat.esewa.com.np/api/epay/transaction/status/",
    productCode: process.env.ESEWA_PRODUCT_CODE || "EPAYTEST",
    secretKey:   process.env.ESEWA_SECRET_KEY   || "",
};

/**
 * Verifies a payment with eSewa.
 * @param {string} transactionUuid - The refId returned by eSewa SDK (payment ID)
 * @param {number} totalAmount     - The amount that should have been paid (in NPR)
 * @returns {{ verified: boolean, esewaData?: object, error?: string }}
 */
const verifyEsewaPayment = async (transactionUuid, totalAmount) => {
    // Skip verification in dev if no secret configured (don't block development)
    if (!IS_PRODUCTION && !process.env.ESEWA_SECRET_KEY) {
        logger.warn("esewaVerification: ESEWA_SECRET_KEY not set — skipping verification in dev mode.", {
            transactionUuid,
            totalAmount,
        });
        return { verified: true, skipped: true };
    }

    try {
        const url = ESEWA_CONFIG.baseUrl;
        const params = {
            product_code:     ESEWA_CONFIG.productCode,
            total_amount:     totalAmount,
            transaction_uuid: transactionUuid,
        };

        logger.info("esewaVerification: Calling eSewa Status API", { url, transactionUuid, totalAmount });

        const response = await axios.get(url, {
            params,
            timeout: 10_000,   // 10 second timeout
            headers: {
                "Accept": "application/json",
            },
        });

        const data = response.data;

        logger.info("esewaVerification: eSewa API response", {
            transactionUuid,
            status: data?.status,
            ref_id: data?.ref_id,
        });

        // eSewa returns status "COMPLETE" for successful payments
        if (data?.status !== "COMPLETE") {
            return {
                verified: false,
                error: `eSewa payment status is "${data?.status}" — expected "COMPLETE"`,
                esewaData: data,
            };
        }

        // Verify the amount matches (allow ±1 NPR rounding tolerance)
        const esewaAmount = parseFloat(data.total_amount?.replace(/,/g, "") || "0");
        if (Math.abs(esewaAmount - totalAmount) > 1) {
            logger.warn("esewaVerification: Amount mismatch detected!", {
                transactionUuid,
                expectedAmount: totalAmount,
                esewaReportedAmount: esewaAmount,
            });
            return {
                verified: false,
                error: `Payment amount mismatch: paid Rs.${esewaAmount}, expected Rs.${totalAmount}`,
                esewaData: data,
            };
        }

        return { verified: true, esewaData: data };

    } catch (err) {
        // If eSewa API is unreachable — DO NOT let this block booking
        // Log as error and allow with warning (graceful degradation)
        // In production, integrate a retry queue here.
        if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
            logger.error("esewaVerification: eSewa API timeout — proceeding with caution", {
                transactionUuid,
                error: err.message,
            });
            // Strict policy: reject on timeout in production
            if (IS_PRODUCTION) {
                return {
                    verified: false,
                    error: "eSewa verification service timed out. Please try again.",
                };
            }
            // Lenient in dev
            return { verified: true, timedOut: true };
        }

        logger.error("esewaVerification: Unexpected error calling eSewa API", {
            transactionUuid,
            error: err.message,
            status: err.response?.status,
        });

        return {
            verified: false,
            error: "eSewa verification failed due to an unexpected error.",
        };
    }
};

module.exports = { verifyEsewaPayment, ESEWA_CONFIG };

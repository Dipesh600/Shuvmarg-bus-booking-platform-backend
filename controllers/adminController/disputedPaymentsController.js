/**
 * controllers/adminController/disputedPaymentsController.js
 *
 * Admin endpoints for managing disputed payments.
 *
 * A "disputed" payment is one where eSewa collected money from the user
 * but the booking creation failed on our end. Since eSewa has no
 * programmatic refund API, the finance team must refund manually from
 * the eSewa merchant dashboard. These endpoints provide visibility
 * and resolution tracking for that process.
 */

const Transaction = require("../../models/transactionModel.js");
const User        = require("../../models/userModel.js");
const UserDeviceInfo = require("../../models/userDeviceInfoModel.js");
const logger      = require("../../utils/logger.js");
const { uploadFileToS3, getPresignedUrl, buildS3Path } = require("../../services/s3Service.js");
const { processFile } = require("../../services/fileProcessor.js");
const {
  createLocalNotification,
  notificationManager,
} = require("../notificationController/notification_manager.js");


// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps a transaction status to its dispute type folder name.
 * Used to organize S3 proof uploads by dispute category.
 */
const getDisputeType = (status) => {
    switch (status) {
        case "DISPUTED":          return "booking-mismatch";
        case "PAYMENT_RECEIVED":  return "verification-lag";
        default:                  return "general";
    }
};


/**
 * GET /admin/disputes
 *
 * Lists all DISPUTED and PAYMENT_RECEIVED transactions with full context.
 *
 * Query params:
 *   ?status=DISPUTED | PAYMENT_RECEIVED | REFUNDED (optional, defaults to DISPUTED + PAYMENT_RECEIVED)
 *   ?userId=xxx          (optional — filter by user)
 *   ?page=1&limit=20     (optional — pagination)
 */
const getDisputedPayments = async (req, res) => {
  try {
    const {
      status,
      userId,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip     = (pageNum - 1) * limitNum;

    // Build filter
    const filter = {};

    if (status) {
      // Allow comma-separated statuses: ?status=DISPUTED,PAYMENT_RECEIVED
      const statuses = status.split(",").map(s => s.trim().toUpperCase());
      filter.status = { $in: statuses };
    } else {
      // Default: show DISPUTED and stale PAYMENT_RECEIVED
      filter.status = { $in: ["DISPUTED", "PAYMENT_RECEIVED"] };
    }

    if (userId) {
      filter.userId = userId;
    }

    const [transactions, totalCount] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("userId", "name phone email")
        .populate("tripId", "tripId tripDate departureTime arrivalTime fromStopName toStopName directionLabel")
        .populate("bookingId", "ticketId seats status")
        .populate("resolvedBy", "name email")
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    // Compute waiting time + resolve proof presigned URLs
    const enriched = await Promise.all(
      transactions.map(async (txn) => {
        const enrichedTxn = {
          ...txn,
          waitingMinutes: Math.round((Date.now() - new Date(txn.createdAt).getTime()) / 60000),
        };

        // Generate a temporary presigned URL for the proof image (if it exists as an S3 key)
        if (txn.proofAttachmentKey) {
          try {
            enrichedTxn.proofAttachmentUrl = await getPresignedUrl(txn.proofAttachmentKey);
          } catch (urlErr) {
            logger.warn("getDisputedPayments: failed to generate presigned URL", {
              key: txn.proofAttachmentKey,
              error: urlErr.message,
            });
            enrichedTxn.proofAttachmentUrl = null;
          }
        }

        return enrichedTxn;
      })
    );

    return res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        page:       pageNum,
        limit:      limitNum,
        total:      totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    logger.error("getDisputedPayments: error", { error: error.stack || error.message });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch disputed payments.",
    });
  }
};


/**
 * PATCH /admin/disputes/:transactionId/resolve
 *
 * Admin marks a disputed payment as resolved.
 *
 * Body / Form-Data:
 *   - refundNote:   "Refunded via eSewa merchant dashboard, ref #12345"
 *   - refundStatus: "COMPLETED" | "PENDING"  (defaults to "COMPLETED")
 *   - proofImage:   File attachment (screenshot of the manual refund transfer)
 *
 * Validations:
 *   - Transaction must exist
 *   - Transaction must be in DISPUTED status
 *   - refundNote is required (audit trail)
 *   - proofImage is required when refundStatus is COMPLETED
 */
const resolveDispute = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { refundNote, refundStatus = "COMPLETED" } = req.body;

    if (!refundNote || refundNote.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "refundNote is required. Describe how the refund was processed (e.g., eSewa merchant dashboard reference).",
      });
    }

    if (!["PENDING", "COMPLETED"].includes(refundStatus)) {
      return res.status(400).json({
        success: false,
        message: "refundStatus must be PENDING or COMPLETED.",
      });
    }

    // ── Look up the transaction first (we need its current status for the S3 path) ──
    const existingTxn = await Transaction.findById(transactionId).select("status").lean();
    if (!existingTxn) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found.",
      });
    }

    if (existingTxn.status !== "DISPUTED") {
      return res.status(400).json({
        success: false,
        message: `Cannot resolve a transaction with status "${existingTxn.status}". Only DISPUTED transactions can be resolved.`,
      });
    }

    // ── Process and upload proof image to S3 ────────────────────────────
    const proofFile = req.files?.proofImage || req.files?.proof;
    let proofAttachmentKey = null;

    if (proofFile) {
      try {
        // Compress the image using the "proof" preset (1200px, 80% WebP)
        const processed = await processFile(proofFile, { preset: "proof" });

        // Build the S3 path: disputes/{disputeType}/{transactionId}/
        const s3Path = buildS3Path({
          type: "dispute_proof",
          disputeType: getDisputeType(existingTxn.status),
          transactionId: transactionId,
        });

        // Upload to S3 — returns the object key
        proofAttachmentKey = await uploadFileToS3(processed, s3Path);

        logger.info("resolveDispute: proof image uploaded to S3", {
          transactionId,
          s3Key: proofAttachmentKey,
          originalSize: `${(processed.originalSize / 1024).toFixed(0)}KB`,
          compressedSize: `${(processed.size / 1024).toFixed(0)}KB`,
        });
      } catch (uploadErr) {
        logger.error("resolveDispute: S3 upload failed", { error: uploadErr.message });
        return res.status(500).json({
          success: false,
          message: `Failed to upload proof image: ${uploadErr.message}`,
        });
      }
    } else if (refundStatus === "COMPLETED") {
      // Proof is mandatory for completed refunds
      return res.status(400).json({
        success: false,
        message: "Proof image is required when marking refund as COMPLETED. Upload a screenshot of the manual refund.",
      });
    }

    // ── Atomic update ───────────────────────────────────────────────────
    const updatePayload = {
      status:       "REFUNDED",
      refundStatus: refundStatus,
      refundNote:   refundNote.trim(),
      resolvedAt:   new Date(),
      resolvedBy:   req.adminInfo?.id || null,
    };

    if (proofAttachmentKey) {
      updatePayload.proofAttachmentKey = proofAttachmentKey;
    }

    const updated = await Transaction.findOneAndUpdate(
      {
        _id:    transactionId,
        status: "DISPUTED",
      },
      {
        $set: updatePayload,
      },
      { new: true }
    ).populate("userId", "name phone email");

    if (!updated) {
      // Race condition — someone else resolved it between our check and update
      return res.status(409).json({
        success: false,
        message: "This dispute was already resolved by another admin. Please refresh.",
      });
    }

    logger.info("resolveDispute: dispute resolved", {
      transactionId: updated._id,
      resolvedBy: req.adminInfo?.id,
      refundStatus,
      proofAttachmentKey,
      userId: updated.userId?._id,
    });

    // ── Notify the user ─────────────────────────────────────────────────
    try {
      const notifUserId = updated.userId?._id || updated.userId;
      if (notifUserId) {
        await createLocalNotification(
          notifUserId,
          "DISPUTE_RESOLVED",
          "Payment Issue Resolved",
          `Your payment dispute (Case ID: ${updated._id}) has been resolved. ${refundStatus === "COMPLETED" ? "A refund has been processed." : "A refund is being processed."} Note: ${refundNote.trim()}`,
          {
            transactionId: updated._id,
            refundStatus,
            refundNote: refundNote.trim(),
          }
        );

        // Push notification
        const userDevices = await UserDeviceInfo.find({ userId: notifUserId });
        const tokens = userDevices.map(d => d.token).filter(Boolean);
        if (tokens.length > 0) {
          await notificationManager(
            tokens,
            "Payment Issue Resolved",
            `Your payment dispute (Case ID: ${updated._id}) has been resolved. ${refundStatus === "COMPLETED" ? "Refund processed." : "Refund in progress."}`
          );
        }
      }
    } catch (notifErr) {
      logger.error("resolveDispute: failed to send user notification", { error: notifErr.message });
    }

    return res.status(200).json({
      success: true,
      message: "Dispute resolved successfully.",
      data: updated,
    });
  } catch (error) {
    logger.error("resolveDispute: error", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "Failed to resolve dispute.",
    });
  }
};


module.exports = {
  getDisputedPayments,
  resolveDispute,
};

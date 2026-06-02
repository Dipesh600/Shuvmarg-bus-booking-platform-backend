const cron = require("node-cron");
const Transaction = require("../models/transactionModel.js");
const Booking = require("../models/bookTicketModel.js");
const logger = require("../utils/logger.js");
const { createLocalNotification, notificationManager } = require("../controllers/notificationController/notification_manager.js");

/**
 * services/reconcilePayments.js
 *
 * Runs every 5 minutes to catch orphaned PAYMENT_RECEIVED transactions.
 * If a transaction is stuck in PAYMENT_RECEIVED for >10 minutes:
 * 1. Check if a Booking exists with the same transactionId.
 * 2. If Yes: The booking succeeded but the transaction update failed. Auto-resolve to SUCCESS.
 * 3. If No: The booking failed and the user's money is stuck. Move to DISPUTED and alert admins/user.
 */

const setupReconciliationCron = () => {
    // Run every 5 minutes
    cron.schedule("*/5 * * * *", async () => {
        logger.info("PaymentReconciliationCRON: ═══ Starting sweep ═══");

        try {
            // Find transactions stuck in PAYMENT_RECEIVED older than 10 minutes
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            
            const orphanedTransactions = await Transaction.find({
                status: "PAYMENT_RECEIVED",
                createdAt: { $lt: tenMinutesAgo }
            }).lean();

            if (orphanedTransactions.length === 0) {
                logger.info("PaymentReconciliationCRON: No orphaned transactions found.");
                return;
            }

            logger.info(`PaymentReconciliationCRON: Found ${orphanedTransactions.length} orphaned transactions.`);

            for (const txn of orphanedTransactions) {
                try {
                    // Check if a Booking exists for this payment
                    const booking = await Booking.findOne({ transactionId: txn.transactionId }).lean();

                    if (booking) {
                        // Late reconciliation: Booking exists, just update transaction status
                        await Transaction.findByIdAndUpdate(txn._id, {
                            status: "SUCCESS",
                            bookingId: booking._id,
                            ticketId: booking.ticketId
                        });
                        logger.info(`PaymentReconciliationCRON: Auto-resolved ${txn._id} to SUCCESS. Booking found.`);
                    } else {
                        // Disaster scenario: Money taken, no booking created
                        await Transaction.findByIdAndUpdate(txn._id, {
                            status: "DISPUTED",
                            disputeReason: "Reconciliation CRON: Stuck in PAYMENT_RECEIVED for >10 mins with no matching booking."
                        });

                        logger.error(`🚨 PaymentReconciliationCRON: DISPUTED ${txn._id}. No booking found! User money stuck.`, {
                            esewaId: txn.transactionId,
                            userId: txn.userId,
                            amount: txn.totalAmount
                        });

                        // Alert Admin
                        const adminUserId = process.env.ADMIN_ALERT_USER_ID;
                        if (adminUserId) {
                            await createLocalNotification(
                                adminUserId,
                                "DISPUTED_PAYMENT",
                                "⚠️ CRON: Disputed Payment Detected",
                                `Payment of Rs.${txn.totalAmount} (Case ID: ${txn._id}) was received but no booking exists. Immediate refund needed.`,
                                { transactionId: txn._id, esewaPaymentId: txn.transactionId }
                            );
                        }

                        // Alert User
                        await createLocalNotification(
                            txn.userId,
                            "PAYMENT_DISPUTE",
                            "Payment Issue Detected",
                            `We noticed your payment of Rs.${txn.totalAmount} was processed but the ticket wasn't generated. Case ID: ${txn._id}. Our team is working on a refund.`,
                            { transactionId: txn._id, amount: txn.totalAmount }
                        );
                    }
                } catch (innerErr) {
                    logger.error(`PaymentReconciliationCRON: Failed to process txn ${txn._id}`, { error: innerErr.message });
                }
            }
        } catch (fatalErr) {
            logger.error("PaymentReconciliationCRON: FATAL error", { error: fatalErr.message });
        }
    });

    logger.info("PaymentReconciliationCRON: scheduled — runs every 5 minutes");
};

module.exports = { setupReconciliationCron };

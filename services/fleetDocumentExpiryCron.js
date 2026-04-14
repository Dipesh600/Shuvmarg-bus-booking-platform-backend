/**
 * services/fleetDocumentExpiryCron.js
 * 
 * Runs daily at 08:00 AM (Nepal time ≈ 02:15 UTC) to:
 * 1. Find fleets with documents expiring in 30 or 7 days
 * 2. Send notification to fleet owner
 * 3. Auto-SUSPEND fleets with already-expired compliance documents
 *    (fitness cert, insurance, route permit) to protect passengers
 * 
 * NOTE: busOwner must keep documents updated via the dashboard
 */

const cron = require("node-cron");
const logger = require("../utils/logger.js");

const setupFleetDocumentExpiryCron = () => {
    // Run every day at 02:15 UTC (≈ 08:00 NPT)
    cron.schedule("15 2 * * *", async () => {
        logger.info("CRON [fleetDocExpiry]: Starting document expiry check...");

        try {
            // Lazy require to avoid circular dependency at boot
            const Fleet  = require("../models/fleetModel.js");
            const { createLocalNotification } = require("../controllers/notificationController/notification_manager.js");

            const now = new Date();

            // ── 1. FIND EXPIRING DOCUMENTS ────────────────────────────────
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            const sevenDaysFromNow  = new Date(now.getTime() +  7 * 24 * 60 * 60 * 1000);

            // Find any ACTIVE fleet where at least one document expires soon
            const expiringFleets = await Fleet.find({
                status: "ACTIVE",
                approvalStatus: "APPROVED",
                $or: [
                    { "fleetDocuments.fitnessCert.validTill":  { $lte: thirtyDaysFromNow, $gte: now } },
                    { "fleetDocuments.insurance.validTill":    { $lte: thirtyDaysFromNow, $gte: now } },
                    { "fleetDocuments.routePermit.validTill":  { $lte: thirtyDaysFromNow, $gte: now } },
                ],
            }).lean();

            logger.info(`CRON [fleetDocExpiry]: ${expiringFleets.length} fleets with expiring documents.`);

            for (const fleet of expiringFleets) {
                const docs = fleet.fleetDocuments || {};
                const expiredSoon = [];

                const check = (name, validTill) => {
                    if (!validTill) return;
                    const daysLeft = Math.ceil((new Date(validTill) - now) / (24 * 60 * 60 * 1000));
                    if (daysLeft <= 30 && daysLeft > 0) {
                        expiredSoon.push({ name, daysLeft });
                    }
                };

                check("Fitness Certificate", docs.fitnessCert?.validTill);
                check("Insurance",           docs.insurance?.validTill);
                check("Route Permit",        docs.routePermit?.validTill);

                if (expiredSoon.length > 0) {
                    const docList = expiredSoon
                        .map(d => `• ${d.name}: expires in ${d.daysLeft} day(s)`)
                        .join("\n");

                    const message = `Fleet "${fleet.busName}" has documents expiring soon:\n${docList}\nPlease renew immediately to avoid suspension.`;

                    try {
                        await createLocalNotification(
                            fleet.ownerId,
                            "FLEET_DOC_EXPIRY_ALERT",
                            "Document Expiry Alert",
                            message,
                            { fleetId: fleet._id, fleetName: fleet.busName, documents: expiredSoon }
                        );
                    } catch (notifErr) {
                        logger.error("CRON [fleetDocExpiry]: Failed to send notification", { fleetId: fleet._id, error: notifErr.message });
                    }
                }
            }

            // ── 2. AUTO-SUSPEND FLEETS WITH EXPIRED DOCUMENTS ─────────────
            const expiredFleets = await Fleet.find({
                status: "ACTIVE",
                approvalStatus: "APPROVED",
                $or: [
                    { "fleetDocuments.fitnessCert.validTill":  { $lt: now, $ne: null } },
                    { "fleetDocuments.insurance.validTill":    { $lt: now, $ne: null } },
                    { "fleetDocuments.routePermit.validTill":  { $lt: now, $ne: null } },
                ],
            });

            logger.warn(`CRON [fleetDocExpiry]: ${expiredFleets.length} fleets have EXPIRED documents — auto-suspending.`);

            for (const fleet of expiredFleets) {
                fleet.status = "INACTIVE";
                fleet.rejectionReason = "Auto-suspended: One or more compliance documents (fitness cert, insurance, or route permit) have expired.";
                await fleet.save();

                logger.warn(`CRON [fleetDocExpiry]: Fleet ${fleet.busName} (${fleet.fleetId}) suspended due to expired documents.`);

                try {
                    await createLocalNotification(
                        fleet.ownerId,
                        "FLEET_SUSPENDED",
                        "Fleet Suspended — Expired Documents",
                        `Your fleet "${fleet.busName}" has been suspended due to expired compliance documents. Please update your documents and contact support.`,
                        { fleetId: fleet._id }
                    );
                } catch (notifErr) {
                    logger.error("CRON [fleetDocExpiry]: Failed to send suspension notification", { fleetId: fleet._id });
                }
            }

            logger.info("CRON [fleetDocExpiry]: Document expiry check complete.");
        } catch (err) {
            logger.error("CRON [fleetDocExpiry]: Fatal error", { error: err.message, stack: err.stack });
        }
    });

    logger.info("CRON [fleetDocExpiry]: Scheduled (daily at 02:15 UTC).");
};

module.exports = setupFleetDocumentExpiryCron;

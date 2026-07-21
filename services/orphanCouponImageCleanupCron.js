const cron = require("node-cron");
const { listObjectsInFolder, deleteFromS3 } = require("./s3Service.js");
const Coupon = require("../models/couponModel.js");

// Schedule task to run every day at 3:00 AM
// "0 3 * * *" -> minute 0, hour 3, every day
const startOrphanCouponImageCleanupCron = () => {
    cron.schedule("0 3 * * *", async () => {
        console.log("[CRON] Starting orphaned coupon image cleanup...");
        try {
            await cleanupOrphanedCouponImages();
        } catch (error) {
            console.error("[CRON] Orphaned coupon image cleanup failed:", error);
        }
    });
    console.log("Orphaned coupon image cleanup cron job initialized.");
};

/**
 * Scans S3 for coupon images that are not associated with any coupon in the database.
 * Deletes images that have been orphaned for more than 24 hours.
 */
const cleanupOrphanedCouponImages = async () => {
    try {
        // 1. Get all objects currently in S3 inside platform/coupons
        const s3Objects = await listObjectsInFolder("platform/coupons");
        
        if (!s3Objects || s3Objects.length === 0) {
            console.log("[CRON] No coupon images found in S3 to clean up.");
            return;
        }

        // 2. Get all image URLs currently referenced by coupons in the database
        const usedImageUrls = await Coupon.find().distinct("imageUrl");
        
        // Convert to a Set for O(1) lookups
        const usedImagesSet = new Set(usedImageUrls.filter(Boolean));
        
        // 3. Define the threshold: objects older than 24 hours are safe to delete
        const thresholdDate = new Date();
        thresholdDate.setHours(thresholdDate.getHours() - 24);

        const keysToDelete = [];

        // 4. Check each S3 object
        for (const s3Obj of s3Objects) {
            const isUsed = usedImagesSet.has(s3Obj.Key);
            const isOldEnough = new Date(s3Obj.LastModified) < thresholdDate;
            
            // If it's NOT used in the DB and it's older than 24 hours, mark for deletion
            if (!isUsed && isOldEnough) {
                keysToDelete.push(s3Obj.Key);
            }
        }

        // 5. Delete orphaned objects
        if (keysToDelete.length > 0) {
            console.log(`[CRON] Found ${keysToDelete.length} orphaned coupon images. Deleting...`);
            
            // Chunk deletions to avoid overwhelming the S3 batch limit (1000 max per request usually, but deleteFromS3 handles one by one via Promise.allSettled)
            await deleteFromS3(keysToDelete);
            
            console.log(`[CRON] Successfully deleted ${keysToDelete.length} orphaned coupon images.`);
        } else {
            console.log("[CRON] No orphaned coupon images older than 24 hours found.");
        }

    } catch (error) {
        console.error("[CRON] Error during cleanupOrphanedCouponImages:", error);
        throw error;
    }
};

module.exports = {
    startOrphanCouponImageCleanupCron,
    cleanupOrphanedCouponImages, // exported for testing
};

const FareRule = require("../../models/fareRuleModel");

/**
 * Create or update a fare rule for a fleet+route combo.
 * Bus Owner scoped: only manages their own fare rules.
 */
const upsertFareRule = async (req, res) => {
    try {
        const ownerId = req.userInfo?.id;
        const { fleetId, routeId, baseFare, seatClassPremium, advanceDiscount, peakPricing } = req.body;

        if (!baseFare || baseFare < 0) {
            return res.status(400).json({ success: false, message: "baseFare is required and must be >= 0" });
        }

        // Upsert: find existing rule for this fleet+route combo or create new
        const fareRule = await FareRule.findOneAndUpdate(
            { ownerId, fleetId: fleetId || null, routeId: routeId || null },
            {
                $set: {
                    ownerId,
                    fleetId: fleetId || null,
                    routeId: routeId || null,
                    baseFare,
                    ...(seatClassPremium && { seatClassPremium }),
                    ...(advanceDiscount && { advanceDiscount }),
                    ...(peakPricing && { peakPricing }),
                    isActive: true,
                }
            },
            { upsert: true, new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Fare rule saved successfully",
            data: fareRule
        });
    } catch (e) {
        console.error("upsertFareRule error:", e);
        if (e.code === 11000) {
            return res.status(409).json({ success: false, message: "A fare rule already exists for this fleet/route combination." });
        }
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * Get all fare rules for the logged-in bus owner.
 */
const getMyFareRules = async (req, res) => {
    try {
        const ownerId = req.userInfo?.id;
        const fareRules = await FareRule.find({ ownerId, isActive: true })
            .populate("fleetId", "busName busNumber")
            .populate("routeId", "routeName from to")
            .lean();

        return res.status(200).json({ success: true, results: fareRules.length, data: fareRules });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * Delete (soft-disable) a fare rule.
 */
const deleteFareRule = async (req, res) => {
    try {
        const ownerId = req.userInfo?.id;
        const { fareRuleId } = req.body;

        const rule = await FareRule.findOneAndUpdate(
            { _id: fareRuleId, ownerId },
            { $set: { isActive: false } },
            { new: true }
        );

        if (!rule) {
            return res.status(404).json({ success: false, message: "Fare rule not found or unauthorized" });
        }

        return res.status(200).json({ success: true, message: "Fare rule disabled", data: rule });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * Public: compute effective fare for a given trip date
 * (applies advance discount and peak surcharge if applicable).
 */
const computeEffectiveFare = async (req, res) => {
    try {
        const { fleetId, routeId, travelDate } = req.body;

        if (!fleetId || !routeId || !travelDate) {
            return res.status(400).json({ success: false, message: "fleetId, routeId, and travelDate are required" });
        }

        // Find the most specific rule (fleet+route > fleet only > route only)
        const rule = await FareRule.findOne({
            fleetId,
            routeId,
            isActive: true,
        });

        if (!rule) {
            return res.status(404).json({ success: false, message: "No active fare rule for this combination" });
        }

        let finalFare = rule.baseFare;
        let appliedModifiers = [];

        const today = new Date();
        const travel = new Date(travelDate);
        const daysUntilTravel = Math.floor((travel - today) / (1000 * 60 * 60 * 24));

        // Apply advance discount
        if (rule.advanceDiscount.enabled && daysUntilTravel >= rule.advanceDiscount.daysBeforeTravel) {
            const discount = (finalFare * rule.advanceDiscount.discountPercent) / 100;
            finalFare -= discount;
            appliedModifiers.push({ type: "ADVANCE_DISCOUNT", value: -discount, percent: rule.advanceDiscount.discountPercent });
        }

        // Apply peak surcharge
        if (rule.peakPricing.enabled && rule.peakPricing.peakDates.includes(travelDate)) {
            const surcharge = (finalFare * rule.peakPricing.surchargePercent) / 100;
            finalFare += surcharge;
            appliedModifiers.push({ type: "PEAK_SURCHARGE", value: surcharge, percent: rule.peakPricing.surchargePercent });
        }

        return res.status(200).json({
            success: true,
            data: {
                baseFare: rule.baseFare,
                finalFare: Math.round(finalFare),
                seatClassPremium: rule.seatClassPremium,
                appliedModifiers,
            }
        });
    } catch (e) {
        console.error("computeEffectiveFare error:", e);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { upsertFareRule, getMyFareRules, deleteFareRule, computeEffectiveFare };

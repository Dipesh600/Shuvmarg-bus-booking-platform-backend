const Settlement = require("../../models/settlementModel");
const Trip = require("../../models/tripModel");
const Booking = require("../../models/bookTicketModel");

const raiseSettlement = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const role = req.userInfo?.role;
        if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const { tripIds, ownerId } = req.body;
        
        if (!tripIds || !Array.isArray(tripIds) || tripIds.length === 0) {
            return res.status(400).json({ success: false, message: "Please provide an array of tripIds" });
        }

        const targetOwnerId = role === "admin" ? ownerId : userId;
        if (!targetOwnerId) {
            return res.status(400).json({ success: false, message: "ownerId is required for admin" });
        }

        // Fetch trips — only allow settlement on COMPLETED trips owned by this owner
        const trips = await Trip.find({
            _id: { $in: tripIds },
            ownerId: targetOwnerId,
            status: "completed",       // <<< GUARD: cannot settle in-progress trips
        });

        if (trips.length !== tripIds.length) {
            return res.status(400).json({
                success: false,
                message: "Some trips are invalid, unauthorized, or not yet completed."
            });
        }

        // Check no trip is already part of another pending/paid settlement
        const existingSettlements = await Settlement.find({
            tripIds: { $in: tripIds },
            status: { $in: ["pending", "processing", "paid"] }
        });
        if (existingSettlements.length > 0) {
            return res.status(409).json({
                success: false,
                message: "One or more trips already have an active settlement."
            });
        }

        // ============================================================
        // REAL FINANCIAL CALCULATION — aggregation from Booking collection
        // ============================================================
        const bookings = await Booking.find({
            tripId: { $in: tripIds },
            status: "booked",   // only confirmed bookings, not cancelled
        }).lean();

        let totalGross = 0;
        let totalSold = 0;

        for (const booking of bookings) {
            totalSold += booking.seats.length;
            totalGross += booking.totalAmount;   // the amount actually paid (post-discount)
        }

        const commissionRate = 10;  // 10% platform fee
        const platformCommission = Math.round((totalGross * commissionRate) / 100);
        const netPayableAmount = totalGross - platformCommission;

        const newSettlement = await Settlement.create({
            ownerId: targetOwnerId,
            tripIds,
            totalTicketsSold: totalSold,
            grossAmount: totalGross,
            platformCommission,
            commissionRate,
            netPayableAmount,
            status: "pending",
            raisedBy: role === "admin" ? "ADMIN" : "OWNER"
        });

        return res.status(201).json({
            success: true,
            message: "Settlement raised successfully",
            data: newSettlement
        });

    } catch (e) {
      console.error("raiseSettlement error:", e);
      return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const getMySettlements = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const settlements = await Settlement.find({ ownerId: userId }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            results: settlements.length,
            data: settlements
        });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const paySettlement = async (req, res) => {
    try {
        const adminId = req.userInfo?.id;
        const role = req.userInfo?.role;
        if (role !== "admin") return res.status(403).json({ success: false, message: "Admin only" });

        const { settlementId, paymentMethod, paymentProof, remarks } = req.body;

        const settlement = await Settlement.findById(settlementId);
        if (!settlement) {
            return res.status(404).json({ success: false, message: "Settlement not found" });
        }

        if (settlement.status === "paid" || settlement.status === "received") {
            return res.status(400).json({ success: false, message: "Settlement is already paid." });
        }

        settlement.status = "paid";
        settlement.paymentMethod = paymentMethod || "BANK_TRANSFER";
        settlement.paymentProof = paymentProof;
        settlement.paidAt = new Date();
        settlement.paidBy = adminId;
        if (remarks) settlement.remarks = remarks;

        await settlement.save();

        return res.status(200).json({
            success: true,
            message: "Settlement marked as paid",
            data: settlement
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const markSettlementReceived = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { settlementId } = req.body;

        const settlement = await Settlement.findOne({ _id: settlementId, ownerId: userId });
        if (!settlement) {
            return res.status(404).json({ success: false, message: "Settlement not found" });
        }

        if (settlement.status !== "paid") {
            return res.status(400).json({ success: false, message: "Settlement must be paid by admin before you can confirm receipt." });
        }

        settlement.status = "received";
        settlement.receivedAt = new Date();
        settlement.receivedConfirmedBy = userId;

        await settlement.save();

        return res.status(200).json({
            success: true,
            message: "Settlement receipt verified",
            data: settlement
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    raiseSettlement,
    getMySettlements,
    paySettlement,
    markSettlementReceived
};

const Settlement = require("../../models/settlementModel");
const Trip = require("../../models/tripModel");
const Booking = require("../../models/bookTicketModel");

const raiseSettlement = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const role = req.userInfo?.role;
        if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

        const { tripIds, ownerId, brandId } = req.body;

        if (!tripIds || !Array.isArray(tripIds) || tripIds.length === 0) {
            return res.status(400).json({ success: false, message: "Please provide an array of tripIds" });
        }
        if (!brandId) {
            return res.status(400).json({ success: false, message: "brandId is required. Settlements are raised per brand." });
        }

        const targetOwnerId = role === "admin" ? ownerId : userId;
        if (!targetOwnerId) {
            return res.status(400).json({ success: false, message: "ownerId is required for admin" });
        }

        // ── FETCH BRAND to get the actual commission rate ──────────────────
        const OperatorBrand = require("../../models/operatorBrandModel");
        const brand = await OperatorBrand.findById(brandId).select("commissionRate bankDetails status ownerId").lean();
        if (!brand) {
            return res.status(404).json({ success: false, message: "Brand not found." });
        }
        // Guard: brand must belong to this owner
        if (brand.ownerId.toString() !== targetOwnerId.toString()) {
            return res.status(403).json({ success: false, message: "Brand does not belong to this owner." });
        }
        if (brand.status === "SUSPENDED") {
            return res.status(400).json({ success: false, message: "Cannot raise a settlement for a suspended brand." });
        }

        // Fetch trips — only allow settlement on COMPLETED trips owned by this owner
        // AND belonging to this brand
        const trips = await Trip.find({
            _id: { $in: tripIds },
            ownerId: targetOwnerId,
            brandId,
            status: "completed",       // <<< GUARD: cannot settle in-progress trips
        });

        if (trips.length !== tripIds.length) {
            return res.status(400).json({
                success: false,
                message: "Some trips are invalid, unauthorized, not completed, or don't belong to this brand."
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
        // REAL FINANCIAL CALCULATION — uses BRAND's actual commission rate
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

        // Use the brand's negotiated rate — NOT a hardcoded value
        const commissionRate = brand.commissionRate ?? 8;
        const platformCommission = Math.round((totalGross * commissionRate) / 100);
        const netPayableAmount = totalGross - platformCommission;

        const newSettlement = await Settlement.create({
            ownerId: targetOwnerId,
            brandId,                    // ← brand-scoped
            tripIds,
            totalTicketsSold: totalSold,
            grossAmount: totalGross,
            platformCommission,
            commissionRate,             // ← snapshot the rate at time of settlement
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
        // adminMiddleware sets req.adminInfo; busOwner middleware sets req.userInfo
        const isAdmin = !!req.adminInfo;
        const userId  = req.adminInfo?.id ?? req.userInfo?.id;

        if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

        // Admin sees all settlements platform-wide; bus owner sees only their own
        const query = isAdmin ? {} : { ownerId: userId };

        const settlements = await Settlement.find(query)
            .populate("ownerId", "name email phone")
            .populate("brandId", "brandName brandCode commissionRate bankDetails")
            .sort({ createdAt: -1 });

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

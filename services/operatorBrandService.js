const OperatorBrand = require("../models/operatorBrandModel.js");
const Fleet = require("../models/fleetModel.js");
const User = require("../models/userModel.js");
const BusOwner = require("../models/busOwnerModel.js");

/**
 * Create a new OperatorBrand scoped to a Bus Owner.
 * Called by admin from the Bus Owner Detail page.
 */
const createBrand = async (adminId, data) => {
    const { ownerId, brandName, contactEmail, contactPhone, baseCity, commissionRate, notes } = data;

    if (!ownerId) throw new Error("ownerId is required.");
    if (!brandName) throw new Error("brandName is required.");

    // Validate owner exists and has busOwner role
    const owner = await User.findById(ownerId);
    if (!owner) throw new Error("Bus owner not found.");
    if (owner.role !== "busOwner") {
        throw new Error(
            `User role "${owner.role}" cannot own brands. Only accounts with the busOwner role are permitted.`
        );
    }

    // ── VERIFICATION GUARD ─────────────────────────────────────────
    // A brand can only be created under a fully KYC-approved bus owner.
    // Pending or rejected owners cannot operate brands on the platform.
    const busOwnerKyc = await BusOwner.findOne({ user: ownerId }).select("verificationStatus companyName").lean();
    if (!busOwnerKyc) throw new Error("Bus owner KYC profile not found. Complete registration first.");
    if (busOwnerKyc.verificationStatus !== "approved") {
        throw new Error(
            `Bus owner KYC is not approved (current status: ${busOwnerKyc.verificationStatus}). ` +
            `Brands can only be created after KYC approval.`
        );
    }

    // Prevent duplicate brand names under the same owner
    const existing = await OperatorBrand.findOne({ ownerId, brandName: { $regex: new RegExp(`^${brandName}$`, "i") } });
    if (existing) throw new Error(`Brand "${brandName}" already exists under this owner.`);

    const brand = await OperatorBrand.create({
        ownerId, brandName, contactEmail, contactPhone, baseCity,
        commissionRate: commissionRate ?? 8,
        notes,
        // Record which admin created it
        approvedBy: adminId,
        approvedAt: new Date(),
        status: "ACTIVE", // Admin-created brands are auto-approved
    });

    return brand;
};

/**
 * Get all brands for a specific owner (for the Operators tab in Owner Detail page).
 */
const getBrandsByOwner = async (ownerId) => {
    const brands = await OperatorBrand.find({ ownerId })
        .sort({ createdAt: -1 })
        .lean();

    // Attach fleet count and active route count to each brand
    const fleetCounts = await Fleet.aggregate([
        { $match: { brandId: { $in: brands.map(b => b._id) } } },
        { $group: { _id: "$brandId", count: { $sum: 1 } } }
    ]);
    const fleetMap = Object.fromEntries(fleetCounts.map(f => [f._id.toString(), f.count]));

    return brands.map(b => ({
        ...b,
        fleetCount: fleetMap[b._id.toString()] || 0,
    }));
};

/**
 * Get brand detail by ID.
 */
const getBrandById = async (brandId) => {
    const brand = await OperatorBrand.findById(brandId)
        .populate("ownerId", "name email phone")
        .lean();
    if (!brand) throw new Error("Brand not found.");

    const fleetCount = await Fleet.countDocuments({ brandId });
    return { ...brand, fleetCount };
};

/**
 * Get all brands (admin list view — paginated).
 */
const getAllBrands = async ({ page = 1, limit = 30, status, search } = {}) => {
    const query = {};
    if (status && status !== "all") query.status = status;
    if (search) query.brandName = { $regex: search, $options: "i" };

    const skip = (page - 1) * limit;
    const [brands, total] = await Promise.all([
        OperatorBrand.find(query)
            .populate("ownerId", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        OperatorBrand.countDocuments(query),
    ]);

    return { brands, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

/**
 * Update brand status (ACTIVE / SUSPENDED).
 */
const updateBrandStatus = async (brandId, adminId, status, reason) => {
    const allowed = ["ACTIVE", "SUSPENDED", "PENDING"];
    if (!allowed.includes(status)) throw new Error(`Invalid status: ${status}`);

    const update = { status };
    if (status === "SUSPENDED") {
        if (!reason) throw new Error("Suspension reason is required.");
        update.suspendedBy = adminId;
        update.suspendedReason = reason;
    }
    if (status === "ACTIVE") {
        update.approvedBy = adminId;
        update.approvedAt = new Date();
    }

    const brand = await OperatorBrand.findByIdAndUpdate(brandId, update, { new: true });
    if (!brand) throw new Error("Brand not found.");
    return brand;
};

/**
 * Update brand details (name, commission, bank details, etc.)
 */
const updateBrand = async (brandId, data) => {
    const allowed = ["brandName", "contactEmail", "contactPhone", "baseCity", "commissionRate", "bankDetails", "logo", "notes"];
    const update = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    const brand = await OperatorBrand.findByIdAndUpdate(brandId, update, { new: true, runValidators: true });
    if (!brand) throw new Error("Brand not found.");
    return brand;
};

module.exports = { createBrand, getBrandsByOwner, getBrandById, getAllBrands, updateBrandStatus, updateBrand };

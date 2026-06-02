const svc = require("../../services/operatorBrandService.js");

// POST /admin/brands — Create brand (scoped to an owner)
const createBrand = async (req, res) => {
    try {
        const adminId = req.admin?._id;
        const data = await svc.createBrand(adminId, req.body);
        res.status(201).json({ success: true, message: "Operator brand created.", data });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

// GET /admin/brands — All brands (paginated, filterable)
const getAllBrands = async (req, res) => {
    try {
        const { page, limit, status, search } = req.query;
        const data = await svc.getAllBrands({
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 30,
            status, search,
        });
        res.status(200).json({ success: true, ...data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /admin/brands/:brandId — Brand detail
const getBrandById = async (req, res) => {
    try {
        const data = await svc.getBrandById(req.params.brandId);
        res.status(200).json({ success: true, data });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 500;
        res.status(status).json({ success: false, message: err.message });
    }
};

// GET /admin/owners/:ownerId/brands — All brands for a specific owner
const getBrandsByOwner = async (req, res) => {
    try {
        const data = await svc.getBrandsByOwner(req.params.ownerId);
        res.status(200).json({ success: true, results: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /admin/brands/:brandId/status — Approve / Suspend
const updateBrandStatus = async (req, res) => {
    try {
        const adminId = req.admin?._id;
        const { status, reason } = req.body;
        if (!status) return res.status(400).json({ success: false, message: "status is required." });
        const data = await svc.updateBrandStatus(req.params.brandId, adminId, status, reason);
        res.status(200).json({ success: true, message: `Brand ${status.toLowerCase()}.`, data });
    } catch (err) {
        const code = err.message.includes("not found") ? 404 : 400;
        res.status(code).json({ success: false, message: err.message });
    }
};

// PATCH /admin/brands/:brandId — Update brand details
const updateBrand = async (req, res) => {
    try {
        const data = await svc.updateBrand(req.params.brandId, req.body);
        res.status(200).json({ success: true, message: "Brand updated.", data });
    } catch (err) {
        const code = err.message.includes("not found") ? 404 : 400;
        res.status(code).json({ success: false, message: err.message });
    }
};

module.exports = { createBrand, getAllBrands, getBrandById, getBrandsByOwner, updateBrandStatus, updateBrand };

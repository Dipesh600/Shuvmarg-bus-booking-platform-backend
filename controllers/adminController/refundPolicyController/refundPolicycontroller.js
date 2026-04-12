const RefundPolicy = require("../../../models/refundPolicyModel.js");

// Create Refund Policy
const createRefundPolicy = async (req, res) => {
    try {
        const { policyName, refundPercentage, deductionPercentage, description, minHours, maxHours, color } = req.body;

        if (!policyName || refundPercentage === undefined || deductionPercentage === undefined || !description) {
            return res.status(400).json({
                status: false,
                message: "Please provide all required fields.",
            });
        }

        const newPolicy = new RefundPolicy({
            policyName,
            refundPercentage,
            deductionPercentage,
            description,
            minHours,
            maxHours,
            color,
        });

        await newPolicy.save();

        return res.status(201).json({
            status: true,
            message: "Refund policy created successfully!",
            data: newPolicy,
        });
    } catch (error) {
        console.error("Error creating refund policy:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
        });
    }
};

// Get All Refund Policies
const getAllRefundPolicies = async (req, res) => {
    try {
        const policies = await RefundPolicy.find().sort({ minHours: 1 }); // Sorted by timing

        return res.status(200).json({
            status: true,
            message: "Refund policies fetched successfully!",
            results: policies.length,
            data: policies,
        });
    } catch (error) {
        console.error("Error fetching refund policies:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
        });
    }
};

// Get Refund Policy By ID
const getRefundPolicyById = async (req, res) => {
    try {
        const { id } = req.body; // Expecting ID in body as per previous patterns

        if (!id) {
            return res.status(400).json({
                status: false,
                message: "Policy ID is required.",
            });
        }

        const policy = await RefundPolicy.findById(id);

        if (!policy) {
            return res.status(404).json({
                status: false,
                message: "Refund policy not found.",
            });
        }

        return res.status(200).json({
            status: true,
            message: "Refund policy fetched successfully!",
            data: policy,
        });
    } catch (error) {
        console.error("Error fetching refund policy:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
        });
    }
};

// Update Refund Policy
const updateRefundPolicy = async (req, res) => {
    try {
        const { id, ...updateData } = req.body;

        if (!id) {
            return res.status(400).json({
                status: false,
                message: "Policy ID is required.",
            });
        }

        const updatedPolicy = await RefundPolicy.findByIdAndUpdate(id, updateData, { new: true });

        if (!updatedPolicy) {
            return res.status(404).json({
                status: false,
                message: "Refund policy not found.",
            });
        }

        return res.status(200).json({
            status: true,
            message: "Refund policy updated successfully!",
            data: updatedPolicy,
        });
    } catch (error) {
        console.error("Error updating refund policy:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
        });
    }
};

// Delete Refund Policy
const deleteRefundPolicy = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                status: false,
                message: "Policy ID is required.",
            });
        }

        const deletedPolicy = await RefundPolicy.findByIdAndDelete(id);

        if (!deletedPolicy) {
            return res.status(404).json({
                status: false,
                message: "Refund policy not found.",
            });
        }

        return res.status(200).json({
            status: true,
            message: "Refund policy deleted successfully!",
        });
    } catch (error) {
        console.error("Error deleting refund policy:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
        });
    }
};

// Toggle Policy Status
const togglePolicyStatus = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                status: false,
                message: "Policy ID is required.",
            });
        }

        const policy = await RefundPolicy.findById(id);

        if (!policy) {
            return res.status(404).json({
                status: false,
                message: "Refund policy not found.",
            });
        }

        policy.isActive = !policy.isActive;
        await policy.save();

        return res.status(200).json({
            status: true,
            message: `Refund policy ${policy.isActive ? "activated" : "deactivated"} successfully!`,
            data: policy,
        });
    } catch (error) {
        console.error("Error toggling refund policy status:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
        });
    }
};

module.exports = {
    createRefundPolicy,
    getAllRefundPolicies,
    getRefundPolicyById,
    updateRefundPolicy,
    deleteRefundPolicy,
    togglePolicyStatus,
};
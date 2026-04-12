const seatTemplateService = require("../../../services/seatTemplateService.js");

// Create Seat Template for Owner by Admin
const createTemplateForOwner = async (req, res) => {
    try {
        const adminInfo = req.adminInfo;
        const { userId } = req.body; // Pattern: userId (ownerId)

        if (!userId) {
            return res.status(400).json({
                status: false,
                message: "Owner ID is required!",
            });
        }

        const newTemplate = await seatTemplateService.createTemplate(req.body, adminInfo.id);

        return res.status(201).json({
            status: true,
            message: "Seat template created successfully!",
            data: newTemplate,
        });
    } catch (error) {
        console.error("createTemplateForOwner error:", error);
        return res.status(error.message.includes("required") ? 400 : 500).json({
            status: false,
            message: error.message || "Internal Server Error!",
        });
    }
};

// Get All Seats Template
const getAllSeatsTemplate = async (req, res) => {
    try {
        const seatsTemplate = await seatTemplateService.getAllTemplates();
        return res.status(200).json({
            status: true,
            message: "Seats template fetched successfully!",
            results: seatsTemplate.length,
            data: seatsTemplate,
        });
    } catch (error) {
        console.error("getAllSeatsTemplate error:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
            error: error.message,
        });
    }
};

// Get Seats Template by User ID
const getTemplatesByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const templates = await seatTemplateService.getTemplatesByUserId(userId);
        return res.status(200).json({
            status: true,
            message: "User's seat templates fetched successfully!",
            results: templates.length,
            data: templates,
        });
    } catch (error) {
        console.error("getTemplatesByUser error:", error);
        return res.status(error.message.includes("required") ? 400 : 500).json({
            status: false,
            message: error.message || "Internal Server Error!",
        });
    }
};

// Get Seat Template By ID
const getSeatTemplateById = async (req, res) => {
    try {
        const { id } = req.params;
        const template = await seatTemplateService.getTemplateById(id);

        return res.status(200).json({
            status: true,
            message: "Seat template fetched successfully",
            data: template,
        });
    } catch (error) {
        console.error("getSeatTemplateById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            status: false,
            message: error.message || "Internal Server Error!",
        });
    }
};

// Update Seat Template
const updateSeatTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedTemplate = await seatTemplateService.updateTemplate(id, req.body);

        return res.status(200).json({
            status: true,
            message: "Seat template updated successfully!",
            data: updatedTemplate,
        });
    } catch (error) {
        console.error("updateSeatTemplate error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({
            status: false,
            message: error.message || "Internal Server Error!",
        });
    }
};

// Delete Seat Template
const deleteSeatTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        await seatTemplateService.deleteTemplate(id);

        return res.status(200).json({
            status: true,
            message: "Seat template deleted successfully!",
        });
    } catch (error) {
        console.error("deleteSeatTemplate error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            status: false,
            message: error.message || "Internal Server Error!",
        });
    }
};

// Toggle Seat Template Status
const toggleSeatTemplateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedTemplate = await seatTemplateService.toggleTemplateStatus(id);

        return res.status(200).json({
            status: true,
            message: `Seat template ${updatedTemplate.isActive ? 'activated' : 'deactivated'} successfully!`,
            data: updatedTemplate
        });
    } catch (error) {
        console.error("toggleSeatTemplateStatus error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            status: false,
            message: error.message || "Internal Server Error!",
        });
    }
};

module.exports = {
    createTemplateForOwner,
    getAllSeatsTemplate,
    getTemplatesByUser,
    getSeatTemplateById,
    updateSeatTemplate,
    deleteSeatTemplate,
    toggleSeatTemplateStatus,
};

const SeatTemplate = require("../models/seatTemplateModel");

// Helper to count seats from the config
const countSeatsFromConfig = (seatConfig) => {
    if (!seatConfig || !seatConfig.floors) return 0;
    let count = 0;
    seatConfig.floors.forEach(floor => {
        if (!floor.rows) return;
        floor.rows.forEach(row => {
            if (!row.cells) return;
            row.cells.forEach(cell => {
                if (cell.cellType === "SEAT") {
                    count++;
                }
            });
        });
    });
    return count;
};

const createTemplate = async (templateData, createdById) => {
    const { templateName, seatConfig, userId } = templateData;

    if (!templateName || !seatConfig) {
        throw new Error("Template name and seat config are required!");
    }

    const totalSeats = countSeatsFromConfig(seatConfig);

    return await SeatTemplate.create({
        userId,
        templateName,
        totalSeats,
        seatConfig,
        createdById,
    });
};

const getAllTemplates = async () => {
    return await SeatTemplate.find().sort({ createdAt: -1 }).lean();
};

const getTemplatesByUserId = async (userId) => {
    if (!userId) {
        throw new Error("User ID is required.");
    }
    return await SeatTemplate.find({ userId }).sort({ createdAt: -1 }).lean();
};

const getTemplateById = async (id) => {
    const template = await SeatTemplate.findById(id);
    if (!template) {
        throw new Error("Seat template not found!");
    }
    return template;
};

const updateTemplate = async (id, data) => {
    const { templateName, seatConfig, isActive } = data;

    const template = await SeatTemplate.findById(id);
    if (!template) {
        throw new Error("Seat template not found!");
    }

    const updateData = {};
    if (templateName !== undefined) updateData.templateName = templateName;
    if (seatConfig !== undefined) {
        updateData.seatConfig = seatConfig;
        updateData.totalSeats = countSeatsFromConfig(seatConfig);
    }
    if (isActive !== undefined) updateData.isActive = isActive;

    return await SeatTemplate.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
    });
};

const deleteTemplate = async (id) => {
    const deletedTemplate = await SeatTemplate.findByIdAndDelete(id);
    if (!deletedTemplate) {
        throw new Error("Seat template not found!");
    }
    return deletedTemplate;
};

const toggleTemplateStatus = async (id) => {
    const template = await SeatTemplate.findById(id);
    if (!template) {
        throw new Error("Seat template not found!");
    }

    const currentStatus = template.isActive !== undefined ? template.isActive : true;

    return await SeatTemplate.findByIdAndUpdate(
        id,
        { isActive: !currentStatus },
        { new: true }
    );
};

module.exports = {
    createTemplate,
    getAllTemplates,
    getTemplateById,
    getTemplatesByUserId,
    updateTemplate,
    deleteTemplate,
    toggleTemplateStatus,
};

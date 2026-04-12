const SeatTemplate = require("../models/seatTemplateModel");

const createTemplate = async (templateData, createdById) => {
    const { templateName, aCount, bCount, cCount, userId } = templateData;

    if (!templateName || aCount === undefined || bCount === undefined || cCount === undefined) {
        throw new Error("Template name and seat counts (aCount, bCount, cCount) are required!");
    }

    const seata = [];
    for (let i = 1; i <= aCount; i++) {
        seata.push({ seatNo: `a${i}` });
    }

    const seatb = [];
    for (let i = 1; i <= bCount; i++) {
        seatb.push({ seatNo: `b${i}` });
    }

    const seatc = [];
    for (let i = 1; i <= cCount; i++) {
        seatc.push({ seatNo: `c${i}` });
    }

    const totalSeats = Number(aCount) + Number(bCount) + Number(cCount);

    return await SeatTemplate.create({
        userId,
        templateName,
        totalSeats,
        seata,
        seatb,
        seatc,
        createdBy: userId, // Match original pattern
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
    const { templateName, aCount, bCount, cCount, seata, seatb, seatc, isActive } = data;

    const template = await SeatTemplate.findById(id);
    if (!template) {
        throw new Error("Seat template not found!");
    }

    let finalSeata = seata || template.seata;
    let finalSeatb = seatb || template.seatb;
    let finalSeatc = seatc || template.seatc;

    // Regenerate arrays if counts are provided
    if (aCount !== undefined) {
        finalSeata = [];
        for (let i = 1; i <= aCount; i++) {
            finalSeata.push({ seatNo: `a${i}` });
        }
    }
    if (bCount !== undefined) {
        finalSeatb = [];
        for (let i = 1; i <= bCount; i++) {
            finalSeatb.push({ seatNo: `b${i}` });
        }
    }
    if (cCount !== undefined) {
        finalSeatc = [];
        for (let i = 1; i <= cCount; i++) {
            finalSeatc.push({ seatNo: `c${i}` });
        }
    }

    const totalSeats = finalSeata.length + finalSeatb.length + finalSeatc.length;

    const updateData = {
        ...(templateName !== undefined && { templateName }),
        seata: finalSeata,
        seatb: finalSeatb,
        seatc: finalSeatc,
        totalSeats,
        ...(isActive !== undefined && { isActive }),
    };

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

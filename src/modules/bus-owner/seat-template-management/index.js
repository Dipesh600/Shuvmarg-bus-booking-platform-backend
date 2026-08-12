"use strict";

const SeatTemplate = require("../../../../models/seatTemplateModel");
const templates = require("../../../../services/seatTemplateService");

function errorResponse(error, res) {
  const status = Number(error?.statusCode) || 500;
  return res.status(status).json({
    success: false,
    code: status === 500 ? "SEAT_TEMPLATE_OPERATION_FAILED" : error.code,
    message: status === 500 ? "Seat template operation failed." : error.message,
  });
}

async function list(req, res) {
  try {
    const ownerId = req.userInfo?.id;
    const records = await SeatTemplate.find({
      isActive: true,
      $or: [{ scope: "GLOBAL" }, { scope: "OPERATOR", userId: ownerId }],
    }).sort({ scope: 1, templateName: 1 }).lean();
    return res.status(200).json({ success: true, data: { templates: records } });
  } catch (error) { return errorResponse(error, res); }
}

async function create(req, res) {
  try {
    const ownerId = req.userInfo?.id;
    const template = await templates.createTemplate({
      templateName: req.body?.templateName,
      seatConfig: req.body?.seatConfig,
      userId: ownerId,
      scope: "OPERATOR",
    }, null);
    return res.status(201).json({ success: true, data: { template } });
  } catch (error) { return errorResponse(error, res); }
}

async function derive(req, res) {
  try {
    const ownerId = req.userInfo?.id;
    const template = await templates.deriveTemplate(
      req.body?.baseTemplateId,
      { templateName: req.body?.templateName, seatConfig: req.body?.seatConfig },
      ownerId,
      null
    );
    return res.status(201).json({ success: true, data: { template } });
  } catch (error) { return errorResponse(error, res); }
}

module.exports = { list, create, derive };

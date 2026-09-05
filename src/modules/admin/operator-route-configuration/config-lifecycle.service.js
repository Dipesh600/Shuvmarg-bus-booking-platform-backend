"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const OperatorConfig = require("../../../../models/operatorRouteConfigModel.js");
const { recomputeTimingArray } = require("./timing.policy.js");
const {
  assertVariantReadyForOperatorConfig,
} = require("./variant-readiness.policy.js");
const { assertValidRouteConfigDocument } = require("./route-config-payload.policy.js");

function failure(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function updateConfig(configId, data) {
  const config = await OperatorConfig.findById(configId);
  if (!config) throw failure(404, "Route config not found.");
  const activeCount = await Schedule.countDocuments({
    operatorRouteConfigId: configId, status: "ACTIVE",
  });
  if (activeCount > 0) {
    throw failure(
      409,
      `This route config has ${activeCount} ACTIVE schedule(s). ` +
      "Suspend all active schedules before editing the route configuration."
    );
  }
  if (data.patternName && data.patternName !== config.patternName) {
    const total = await Schedule.countDocuments({ operatorRouteConfigId: configId });
    if (total > 0) {
      throw failure(
        409,
        `Cannot rename pattern: ${total} schedule(s) reference this pattern. ` +
        "Renaming would break the historical schedule → pattern link."
      );
    }
  }
  const allowed = [
    "activeStops", "boardingConfig", "timingConfig",
    "returnActiveStops", "returnBoardingConfig", "returnTimingConfig",
    "returnOverridden", "notes", "patternName",
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) config[key] = data[key];
  }
  if (data.status !== undefined) {
    if (!["ACTIVE", "DRAFT"].includes(data.status)) {
      throw failure(400, "Route config status must be ACTIVE or DRAFT.");
    }
    if (data.status === "DRAFT" && config.status === "ACTIVE") {
      throw failure(409, "Active route setup cannot be moved back to draft.");
    }
    if (data.status === "ACTIVE") {
      await assertVariantReadyForOperatorConfig(config.variantId);
    }
    config.status = data.status;
  }
  if (data.timingConfig) {
    config.timingConfig = recomputeTimingArray(config.timingConfig);
  }
  if (data.returnTimingConfig) config.returnTimingConfig = recomputeTimingArray(config.returnTimingConfig);
  await assertValidRouteConfigDocument(config);
  await config.save();
  return config;
}

async function toggleConfigStatus(configId) {
  const config = await OperatorConfig.findById(configId);
  if (!config) throw failure(404, "Route config not found.");
  if (config.status === "ACTIVE") {
    const activeCount = await Schedule.countDocuments({ operatorRouteConfigId: configId, status: "ACTIVE" });
    if (activeCount > 0) {
      throw failure(
        409,
        `Cannot deactivate: ${activeCount} ACTIVE schedule(s) are running ` +
        "on this pattern. Suspend all schedules first."
      );
    }
    config.status = "INACTIVE";
  } else {
    await assertVariantReadyForOperatorConfig(config.variantId);
    config.status = "ACTIVE";
    await assertValidRouteConfigDocument(config);
  }
  await config.save();
  return config;
}

async function setDefaultPattern(brandId, configId) {
  const config = await OperatorConfig.findById(configId).lean();
  if (!config) throw new Error("Route config not found.");
  if (config.brandId.toString() !== brandId.toString()) {
    throw new Error("Unauthorized: config does not belong to this brand.");
  }
  await OperatorConfig.updateMany(
    { brandId, variantId: config.variantId, fleetId: config.fleetId || null,
      _id: { $ne: configId } },
    { $set: { isDefault: false } },
  );
  return OperatorConfig.findByIdAndUpdate(
    configId,
    { $set: { isDefault: true } },
    { new: true }
  ).lean();
}

async function deleteConfig(configId) {
  const config = await OperatorConfig.findById(configId).populate({
    path: "variantId", select: "returnVariantId",
  });
  if (!config) throw failure(404, "Route config not found.");
  const scheduleCount = await Schedule.countDocuments({ operatorRouteConfigId: configId });
  if (scheduleCount > 0) {
    throw failure(
      409,
      `Cannot delete: ${scheduleCount} schedule(s) reference this pattern. ` +
      "Archive or delete those schedules first."
    );
  }
  if (config.isDefault) {
    const sibling = await OperatorConfig.findOne({
      brandId: config.brandId,
      variantId: config.variantId,
      fleetId: config.fleetId || null,
      _id: { $ne: configId },
    });
    if (sibling) {
      sibling.isDefault = true;
      await sibling.save();
    }
  }
  const returnVariantId = config.variantId?.returnVariantId;
  if (returnVariantId) {
    const returnConfig = await OperatorConfig.findOne({
      brandId: config.brandId,
      variantId: returnVariantId,
      fleetId: config.fleetId || null,
      patternName: config.patternName,
    });
    if (returnConfig) {
      const count = await Schedule.countDocuments({ operatorRouteConfigId: returnConfig._id });
      if (count === 0) await returnConfig.deleteOne();
    }
  }
  await config.deleteOne();
}

module.exports = { updateConfig, toggleConfigStatus, setDefaultPattern, deleteConfig };

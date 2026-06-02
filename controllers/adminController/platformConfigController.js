const PlatformConfig = require("../../models/platformConfigModel");

/**
 * Platform Config Controller — Admin endpoints for managing operational parameters.
 *
 * Gateway fee rates, cashback config, SM Money config, referral config —
 * all adjustable from the admin panel without code deployment.
 *
 * Every change is audit-trailed: who changed it, when, and why.
 */

/**
 * GET /api/admin/platform-config
 * List all platform configs.
 */
const listConfigs = async (req, res) => {
  try {
    const configs = await PlatformConfig.find({})
      .sort({ key: 1 })
      .lean();

    // Merge with defaults to show configs that haven't been customized yet
    const { DEFAULTS } = require("../../models/platformConfigModel");
    const configMap = new Map(configs.map((c) => [c.key, c]));

    const allConfigs = Object.entries(DEFAULTS).map(([key, defaultValue]) => {
      const dbConfig = configMap.get(key);
      return {
        key,
        value: dbConfig ? dbConfig.value : defaultValue,
        isCustomized: !!dbConfig,
        updatedBy: dbConfig?.updatedBy || null,
        updatedAt: dbConfig?.updatedAt || null,
        note: dbConfig?.note || null,
        description: dbConfig?.description || null,
      };
    });

    // Also include any custom configs not in DEFAULTS
    for (const config of configs) {
      if (!DEFAULTS[config.key]) {
        allConfigs.push({
          key: config.key,
          value: config.value,
          isCustomized: true,
          updatedBy: config.updatedBy,
          updatedAt: config.updatedAt,
          note: config.note,
          description: config.description,
        });
      }
    }

    return res.status(200).json({
      status: true,
      message: "Platform configs retrieved",
      data: allConfigs,
    });
  } catch (error) {
    console.error("Error listing platform configs:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * GET /api/admin/platform-config/:key
 * Get a specific config by key (falls back to default if not in DB).
 */
const getConfig = async (req, res) => {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        status: false,
        message: "Config key is required",
      });
    }

    const value = await PlatformConfig.getConfig(key);

    if (value === null) {
      return res.status(404).json({
        status: false,
        message: `Config key "${key}" not found`,
      });
    }

    // Also fetch metadata if exists in DB
    const doc = await PlatformConfig.findOne({ key }).lean();

    return res.status(200).json({
      status: true,
      data: {
        key,
        value,
        isCustomized: !!doc,
        updatedBy: doc?.updatedBy || null,
        updatedAt: doc?.updatedAt || null,
        note: doc?.note || null,
      },
    });
  } catch (error) {
    console.error("Error getting platform config:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * PUT /api/admin/platform-config/:key
 * Update a specific config. Creates if it doesn't exist (upsert).
 *
 * Body: { value: { ... }, note: "reason for change" }
 */
const updateConfig = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, note } = req.body;
    const adminId = req.adminInfo?.id || req.userInfo?.id;

    if (!key) {
      return res.status(400).json({
        status: false,
        message: "Config key is required",
      });
    }

    if (value === undefined || value === null) {
      return res.status(400).json({
        status: false,
        message: "Config value is required",
      });
    }

    // Validate known config keys have correct structure
    const validationError = validateConfigValue(key, value);
    if (validationError) {
      return res.status(400).json({
        status: false,
        message: validationError,
      });
    }

    const updated = await PlatformConfig.setConfig(key, value, {
      updatedBy: adminId,
      note: note || null,
    });

    return res.status(200).json({
      status: true,
      message: `Config "${key}" updated successfully`,
      data: {
        key: updated.key,
        value: updated.value,
        updatedBy: updated.updatedBy,
        updatedAt: updated.updatedAt,
        note: updated.note,
      },
    });
  } catch (error) {
    console.error("Error updating platform config:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * Validate the structure of known config keys.
 * Returns error string or null if valid.
 */
function validateConfigValue(key, value) {
  switch (key) {
    case "gateway_fees": {
      if (typeof value !== "object" || Array.isArray(value)) {
        return "gateway_fees must be an object with gateway names as keys";
      }
      for (const [gateway, config] of Object.entries(value)) {
        if (typeof config !== "object" || config === null) {
          return `gateway_fees.${gateway} must be an object with feePercent and label`;
        }
        if (typeof config.feePercent !== "number" || config.feePercent < 0 || config.feePercent > 100) {
          return `gateway_fees.${gateway}.feePercent must be a number between 0 and 100`;
        }
        if (typeof config.label !== "string" || !config.label.trim()) {
          return `gateway_fees.${gateway}.label must be a non-empty string`;
        }
      }
      return null;
    }

    case "cashback_config": {
      if (typeof value !== "object") return "cashback_config must be an object";
      if (typeof value.minNPR !== "number" || value.minNPR < 0)
        return "cashback_config.minNPR must be a non-negative number";
      if (typeof value.maxNPR !== "number" || value.maxNPR <= value.minNPR)
        return "cashback_config.maxNPR must be greater than minNPR";
      if (typeof value.skewLevel !== "number" || value.skewLevel < 1 || value.skewLevel > 5)
        return "cashback_config.skewLevel must be 1-5";
      if (typeof value.maxPercentOfTicket !== "number" || value.maxPercentOfTicket <= 0 || value.maxPercentOfTicket > 100)
        return "cashback_config.maxPercentOfTicket must be 1-100";
      return null;
    }

    case "sm_money_config": {
      if (typeof value !== "object") return "sm_money_config must be an object";
      if (typeof value.creditExpiryMonths !== "number" || value.creditExpiryMonths < 1)
        return "creditExpiryMonths must be >= 1";
      if (typeof value.scratchCardExpiryDays !== "number" || value.scratchCardExpiryDays < 1)
        return "scratchCardExpiryDays must be >= 1";
      if (typeof value.maxDiscountPercent !== "number" || value.maxDiscountPercent < 1 || value.maxDiscountPercent > 100)
        return "maxDiscountPercent must be 1-100";
      return null;
    }

    case "referral_config": {
      if (typeof value !== "object") return "referral_config must be an object";
      if (!Array.isArray(value.unlockAmounts) || value.unlockAmounts.length !== 5)
        return "unlockAmounts must be an array of 5 numbers";
      const sum = value.unlockAmounts.reduce((a, b) => a + b, 0);
      if (typeof value.totalAmount !== "number" || value.totalAmount !== sum)
        return `totalAmount (${value.totalAmount}) must equal sum of unlockAmounts (${sum})`;
      return null;
    }

    default:
      return null; // Unknown keys are allowed — flexible config store
  }
}

module.exports = {
  listConfigs,
  getConfig,
  updateConfig,
};

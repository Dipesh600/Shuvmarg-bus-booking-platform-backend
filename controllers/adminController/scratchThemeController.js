const PlatformConfig = require("../../models/platformConfigModel");
const { processFile } = require("../../services/fileProcessor");
const { uploadFileToS3, getPresignedUrl, deleteFromS3, buildS3Path } = require("../../services/s3Service");
const crypto = require("crypto");

/**
 * Scratch Card Theme Controller
 *
 * Manages the collection of scratch card overlay themes stored in PlatformConfig
 * under the key "scratch_card_themes".
 *
 * Each theme has:
 *   - id:          UUID v4 (generated server-side, immutable)
 *   - name:        Human-readable label ("Dashain Special", "Gold Ticket")
 *   - imageKey:    S3 object key for the overlay texture
 *   - weight:      Relative probability weight (integer, ≥ 1)
 *   - isActive:    Whether this theme is in the active rotation
 *   - createdAt:   ISO timestamp
 *
 * Weight normalization:
 *   Weights are NOT stored as percentages. They are relative integers.
 *   E.g., weights [10, 5, 1] → probabilities [62.5%, 31.25%, 6.25%]
 *   The randomizer divides each weight by the total sum at runtime.
 *   This means admins don't need to manually rebalance percentages when
 *   adding/removing themes — the math handles it automatically.
 *
 * Default theme:
 *   The "Default" theme (solid lime color, no image) is built into the
 *   mobile app. It is NOT stored in PlatformConfig. When no active themes
 *   exist, the mobile app naturally falls back to the default.
 */

const CONFIG_KEY = "scratch_card_themes";

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch the themes array from PlatformConfig, or return empty array.
 */
async function _getThemes() {
  const config = await PlatformConfig.getConfig(CONFIG_KEY);
  return Array.isArray(config) ? config : [];
}

/**
 * Persist the themes array back to PlatformConfig.
 */
async function _saveThemes(themes, adminId, note = null) {
  return PlatformConfig.setConfig(CONFIG_KEY, themes, {
    updatedBy: adminId,
    note,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/scratch-themes
 *
 * List all themes with presigned image URLs.
 * Returns computed probability percentages alongside raw weights.
 */
const listThemes = async (req, res) => {
  try {
    const themes = await _getThemes();

    // Compute total weight of ACTIVE themes for probability display
    const totalActiveWeight = themes
      .filter((t) => t.isActive)
      .reduce((sum, t) => sum + (t.weight || 1), 0);

    // Resolve presigned URLs for each theme's image
    const enriched = await Promise.all(
      themes.map(async (theme) => {
        let presignedUrl = null;
        if (theme.imageKey) {
          try {
            presignedUrl = await getPresignedUrl(theme.imageKey);
          } catch (_) {
            // S3 key may have been orphaned — not a fatal error
          }
        }

        const probability =
          theme.isActive && totalActiveWeight > 0
            ? Math.round(((theme.weight || 1) / totalActiveWeight) * 10000) / 100
            : 0;

        return {
          ...theme,
          imageUrl: presignedUrl,
          probability, // Computed %, read-only — not stored
        };
      })
    );

    return res.status(200).json({
      status: true,
      data: enriched,
      meta: {
        totalThemes: themes.length,
        activeThemes: themes.filter((t) => t.isActive).length,
        totalActiveWeight,
      },
    });
  } catch (error) {
    console.error("Error listing scratch themes:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to list scratch card themes",
    });
  }
};

/**
 * POST /api/admin/scratch-themes
 *
 * Create a new theme. Expects multipart/form-data with:
 *   - name:     string (required)
 *   - weight:   number (optional, default 10)
 *   - isActive: boolean (optional, default true)
 *   - image:    file (required, JPEG/PNG/WebP)
 */
const createTheme = async (req, res) => {
  try {
    const adminId = req.adminInfo?.id;
    const { name, weight, isActive } = req.body;

    // ── Validate ────────────────────────────────────────────────────
    if (!name || !name.trim()) {
      return res.status(400).json({
        status: false,
        message: "Theme name is required",
      });
    }

    if (!req.files || !req.files.image) {
      return res.status(400).json({
        status: false,
        message: "Theme image file is required",
      });
    }

    const parsedWeight = Math.max(1, Math.floor(Number(weight) || 10));

    // ── Process image ───────────────────────────────────────────────
    const processed = await processFile(req.files.image, {
      preset: "scratch_theme",
      allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });

    // ── Upload to S3 ────────────────────────────────────────────────
    const s3Path = buildS3Path({ type: "scratch_theme" });
    const imageKey = await uploadFileToS3(processed, s3Path);

    // ── Build theme entry ───────────────────────────────────────────
    const newTheme = {
      id: crypto.randomUUID(),
      name: name.trim(),
      imageKey,
      weight: parsedWeight,
      isActive: isActive === "false" || isActive === false ? false : true,
      createdAt: new Date().toISOString(),
    };

    // ── Persist ─────────────────────────────────────────────────────
    const themes = await _getThemes();
    themes.push(newTheme);
    await _saveThemes(themes, adminId, `Added theme: ${newTheme.name}`);

    // Return with presigned URL
    let presignedUrl = null;
    try {
      presignedUrl = await getPresignedUrl(imageKey);
    } catch (_) {}

    return res.status(201).json({
      status: true,
      message: `Theme "${newTheme.name}" created successfully`,
      data: { ...newTheme, imageUrl: presignedUrl },
    });
  } catch (error) {
    console.error("Error creating scratch theme:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to create scratch card theme",
    });
  }
};

/**
 * PATCH /api/admin/scratch-themes/:themeId
 *
 * Update theme metadata (name, weight, isActive).
 * To replace the image, use the dedicated image upload endpoint.
 */
const updateTheme = async (req, res) => {
  try {
    const adminId = req.adminInfo?.id;
    const { themeId } = req.params;
    const { name, weight, isActive } = req.body;

    const themes = await _getThemes();
    const idx = themes.findIndex((t) => t.id === themeId);

    if (idx === -1) {
      return res.status(404).json({
        status: false,
        message: "Theme not found",
      });
    }

    // Apply updates — only provided fields
    if (name !== undefined && name.trim()) {
      themes[idx].name = name.trim();
    }
    if (weight !== undefined) {
      themes[idx].weight = Math.max(1, Math.floor(Number(weight) || 1));
    }
    if (isActive !== undefined) {
      themes[idx].isActive = isActive === "true" || isActive === true;
    }

    await _saveThemes(themes, adminId, `Updated theme: ${themes[idx].name}`);

    return res.status(200).json({
      status: true,
      message: `Theme "${themes[idx].name}" updated`,
      data: themes[idx],
    });
  } catch (error) {
    console.error("Error updating scratch theme:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to update scratch card theme",
    });
  }
};

/**
 * PATCH /api/admin/scratch-themes/:themeId/image
 *
 * Replace the overlay image for an existing theme.
 * Deletes the old S3 object to prevent orphans.
 */
const replaceThemeImage = async (req, res) => {
  try {
    const adminId = req.adminInfo?.id;
    const { themeId } = req.params;

    if (!req.files || !req.files.image) {
      return res.status(400).json({
        status: false,
        message: "New image file is required",
      });
    }

    const themes = await _getThemes();
    const idx = themes.findIndex((t) => t.id === themeId);

    if (idx === -1) {
      return res.status(404).json({
        status: false,
        message: "Theme not found",
      });
    }

    // ── Delete old S3 object ────────────────────────────────────────
    const oldKey = themes[idx].imageKey;
    if (oldKey) {
      await deleteFromS3(oldKey);
    }

    // ── Process + upload new image ──────────────────────────────────
    const processed = await processFile(req.files.image, {
      preset: "scratch_theme",
      allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });

    const s3Path = buildS3Path({ type: "scratch_theme" });
    const newKey = await uploadFileToS3(processed, s3Path);

    themes[idx].imageKey = newKey;
    await _saveThemes(themes, adminId, `Replaced image for theme: ${themes[idx].name}`);

    let presignedUrl = null;
    try {
      presignedUrl = await getPresignedUrl(newKey);
    } catch (_) {}

    return res.status(200).json({
      status: true,
      message: "Theme image replaced successfully",
      data: { ...themes[idx], imageUrl: presignedUrl },
    });
  } catch (error) {
    console.error("Error replacing scratch theme image:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to replace theme image",
    });
  }
};

/**
 * DELETE /api/admin/scratch-themes/:themeId
 *
 * Permanently delete a theme and its S3 image.
 * Existing scratch cards that used this theme retain their imageUrl
 * (they snapshot the key at creation time), but the presigned URL
 * will eventually stop resolving — the mobile app handles this
 * gracefully by falling back to the solid color.
 */
const deleteTheme = async (req, res) => {
  try {
    const adminId = req.adminInfo?.id;
    const { themeId } = req.params;

    const themes = await _getThemes();
    const idx = themes.findIndex((t) => t.id === themeId);

    if (idx === -1) {
      return res.status(404).json({
        status: false,
        message: "Theme not found",
      });
    }

    const deletedTheme = themes[idx];

    // ── Delete S3 image ─────────────────────────────────────────────
    if (deletedTheme.imageKey) {
      await deleteFromS3(deletedTheme.imageKey);
    }

    // ── Remove from config ──────────────────────────────────────────
    themes.splice(idx, 1);
    await _saveThemes(themes, adminId, `Deleted theme: ${deletedTheme.name}`);

    return res.status(200).json({
      status: true,
      message: `Theme "${deletedTheme.name}" deleted`,
    });
  } catch (error) {
    console.error("Error deleting scratch theme:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to delete scratch card theme",
    });
  }
};

/**
 * PATCH /api/admin/scratch-themes/:themeId/toggle
 *
 * Quick toggle a theme's active status without touching other fields.
 */
const toggleTheme = async (req, res) => {
  try {
    const adminId = req.adminInfo?.id;
    const { themeId } = req.params;

    const themes = await _getThemes();
    const idx = themes.findIndex((t) => t.id === themeId);

    if (idx === -1) {
      return res.status(404).json({
        status: false,
        message: "Theme not found",
      });
    }

    themes[idx].isActive = !themes[idx].isActive;
    const newState = themes[idx].isActive ? "activated" : "paused";

    await _saveThemes(themes, adminId, `${newState} theme: ${themes[idx].name}`);

    return res.status(200).json({
      status: true,
      message: `Theme "${themes[idx].name}" ${newState}`,
      data: themes[idx],
    });
  } catch (error) {
    console.error("Error toggling scratch theme:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to toggle scratch card theme",
    });
  }
};

module.exports = {
  listThemes,
  createTheme,
  updateTheme,
  replaceThemeImage,
  deleteTheme,
  toggleTheme,
};

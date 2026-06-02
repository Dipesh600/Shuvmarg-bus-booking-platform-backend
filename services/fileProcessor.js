/**
 * services/fileProcessor.js
 *
 * Centralized file processing pipeline for all uploads across the platform.
 *
 * Responsibilities:
 *   1. Validate file type and size
 *   2. Compress images (JPEG, PNG, GIF, WebP → WebP at configurable quality)
 *   3. Pass through documents (PDF) without modification
 *   4. Return a normalized file object compatible with uploadFileToS3()
 *
 * Design decisions:
 *   - Returns the same shape as express-fileupload ({ data, mimetype, name, size })
 *     so it can be used as a drop-in pre-processor before uploadFileToS3().
 *   - Image compression uses sharp (libvips) — 4-8x faster than JS-only alternatives.
 *   - PDFs are validated but not re-compressed (reliable PDF compression requires
 *     Ghostscript, which is a system binary — not suitable for a Node-only pipeline).
 *   - All processing is in-memory (no temp files on disk).
 *
 * Usage:
 *   const { processFile } = require("../services/fileProcessor");
 *
 *   // Single file — compress image before S3 upload
 *   const processed = await processFile(req.files.proofImage, { preset: "proof" });
 *   const s3Key = await uploadFileToS3(processed, s3Path);
 *
 *   // KYC document — might be PDF or image
 *   const processed = await processFile(req.files.companyRegistration, { preset: "document" });
 *   const s3Key = await uploadFileToS3(processed, s3Path);
 *
 *   // Profile picture — small square crop
 *   const processed = await processFile(req.files.avatar, { preset: "avatar" });
 *   const s3Key = await uploadFileToS3(processed, s3Path);
 */

const sharp = require("sharp");
const path  = require("path");

// ── Allowed MIME Types ───────────────────────────────────────────────────────

const IMAGE_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
]);

const DOCUMENT_MIMES = new Set([
    "application/pdf",
]);

const ALL_ALLOWED_MIMES = new Set([...IMAGE_MIMES, ...DOCUMENT_MIMES]);

// ── Compression Presets ──────────────────────────────────────────────────────
//
// Each preset defines how a specific category of upload should be processed.
// Add new presets here as the platform grows (e.g., "fleet_photo", "banner").
//
// maxWidth/maxHeight: Resize the longest edge. Aspect ratio is always preserved.
// quality:           WebP quality (1-100). 80 = good balance of size vs clarity.
// format:            Output format for images. "webp" is the modern standard.
// maxFileSizeMB:     Maximum allowed input file size before processing.

const PRESETS = {
    // Dispute proof screenshots — needs to be legible but not full resolution
    proof: {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 80,
        format: "webp",
        maxFileSizeMB: 10,
    },

    // KYC documents — higher resolution since these are legal documents
    document: {
        maxWidth: 2400,
        maxHeight: 2400,
        quality: 85,
        format: "webp",
        maxFileSizeMB: 20,
    },

    // Profile pictures — small, optimized
    avatar: {
        maxWidth: 512,
        maxHeight: 512,
        quality: 80,
        format: "webp",
        maxFileSizeMB: 5,
    },

    // Fleet/bus images — high quality for display
    fleet_image: {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 85,
        format: "webp",
        maxFileSizeMB: 15,
    },

    // Default fallback — moderate compression
    default: {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 80,
        format: "webp",
        maxFileSizeMB: 20,
    },
};

// ── Core Processing ──────────────────────────────────────────────────────────

/**
 * Process a single file: validate, compress (if image), and return
 * a normalized file object ready for uploadFileToS3().
 *
 * @param {object} file - express-fileupload file object ({ data, mimetype, name, size })
 * @param {object} [options]
 * @param {string} [options.preset="default"] - Compression preset name (see PRESETS above)
 * @param {string[]} [options.allowedMimes] - Override allowed MIME types for this upload
 * @returns {Promise<{ data: Buffer, mimetype: string, name: string, size: number, originalSize: number, wasCompressed: boolean }>}
 * @throws {Error} If file is null, wrong type, or too large
 */
const processFile = async (file, options = {}) => {
    // ── Validate input ───────────────────────────────────────────────────
    if (!file) {
        throw new Error("No file provided.");
    }

    if (!file.data || !file.mimetype) {
        throw new Error("Invalid file object. Expected express-fileupload format.");
    }

    const preset = PRESETS[options.preset] || PRESETS.default;
    const allowedMimes = options.allowedMimes
        ? new Set(options.allowedMimes)
        : ALL_ALLOWED_MIMES;

    // ── Type check ───────────────────────────────────────────────────────
    if (!allowedMimes.has(file.mimetype)) {
        const allowed = [...allowedMimes].join(", ");
        throw new Error(
            `Invalid file type: "${file.mimetype}". Allowed types: ${allowed}`
        );
    }

    // ── Size check (before processing) ───────────────────────────────────
    const maxBytes = preset.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
        throw new Error(
            `File too large: ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum: ${preset.maxFileSizeMB}MB.`
        );
    }

    // ── Route: Image → compress | Document → pass through ────────────────
    if (IMAGE_MIMES.has(file.mimetype)) {
        return await _compressImage(file, preset);
    }

    // Documents (PDF, etc.) — validate and pass through without modification
    return {
        data: file.data,
        mimetype: file.mimetype,
        name: file.name,
        size: file.size,
        originalSize: file.size,
        wasCompressed: false,
    };
};

/**
 * Process multiple files with the same preset.
 * Convenience wrapper for batch uploads (e.g., multiple KYC documents).
 *
 * @param {object|object[]} files - Single file or array of files
 * @param {object} [options] - Same options as processFile()
 * @returns {Promise<Array>} Array of processed file objects
 */
const processFiles = async (files, options = {}) => {
    const fileArray = Array.isArray(files) ? files : [files];
    return Promise.all(fileArray.map(file => processFile(file, options)));
};

// ── Image Compression (private) ──────────────────────────────────────────────

/**
 * Compress an image using sharp.
 *
 * Pipeline:
 *   1. Read the raw buffer
 *   2. Auto-rotate based on EXIF orientation (phones often embed rotation)
 *   3. Resize to fit within maxWidth × maxHeight (aspect ratio preserved)
 *   4. Convert to the target format (WebP by default)
 *   5. Strip all metadata (EXIF, ICC profiles) — reduces size & protects privacy
 *
 * @param {object} file - express-fileupload file object
 * @param {object} preset - Compression preset
 * @returns {Promise<object>} Processed file object
 */
const _compressImage = async (file, preset) => {
    const originalSize = file.size;
    const originalName = file.name || "image";

    // Build the sharp pipeline
    let pipeline = sharp(file.data)
        .rotate()   // Auto-rotate based on EXIF orientation
        .resize({
            width: preset.maxWidth,
            height: preset.maxHeight,
            fit: "inside",             // Never upscale, never crop — just fit within bounds
            withoutEnlargement: true,  // Don't upscale small images
        });

    // Apply format-specific compression
    let outputMimetype;
    let outputExtension;

    switch (preset.format) {
        case "webp":
            pipeline = pipeline.webp({ quality: preset.quality });
            outputMimetype = "image/webp";
            outputExtension = "webp";
            break;
        case "jpeg":
            pipeline = pipeline.jpeg({ quality: preset.quality, mozjpeg: true });
            outputMimetype = "image/jpeg";
            outputExtension = "jpg";
            break;
        case "png":
            pipeline = pipeline.png({ quality: preset.quality, compressionLevel: 9 });
            outputMimetype = "image/png";
            outputExtension = "png";
            break;
        default:
            pipeline = pipeline.webp({ quality: preset.quality });
            outputMimetype = "image/webp";
            outputExtension = "webp";
    }

    // Strip metadata (EXIF, ICC, XMP) — reduces file size and removes GPS data
    pipeline = pipeline.withMetadata(false);

    // Execute the pipeline
    const outputBuffer = await pipeline.toBuffer();

    // Build the new filename: originalName_compressed.webp
    const baseName = path.basename(originalName, path.extname(originalName));
    const newName = `${baseName}.${outputExtension}`;

    return {
        data: outputBuffer,
        mimetype: outputMimetype,
        name: newName,
        size: outputBuffer.length,
        originalSize,
        wasCompressed: true,
    };
};

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    processFile,
    processFiles,
    PRESETS,
    IMAGE_MIMES,
    DOCUMENT_MIMES,
    ALL_ALLOWED_MIMES,
};

"use strict";

const path = require("node:path");
const sharp = require("sharp");

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function webpName(name) {
  const base = path.basename(name || "image", path.extname(name || "image"));
  return `${base || "image"}.webp`;
}

async function processValidatedUpload(file) {
  if (!IMAGE_MIMES.has(file.mimetype)) return file;

  const data = await sharp(file.data, { failOn: "error" })
    .rotate()
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  return {
    ...file,
    name: webpName(file.name),
    mimetype: "image/webp",
    data,
    size: data.length,
  };
}

module.exports = { processValidatedUpload };

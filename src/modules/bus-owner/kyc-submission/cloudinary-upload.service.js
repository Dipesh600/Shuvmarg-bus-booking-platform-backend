"use strict";

function createCloudinaryUploadService({ cloudinary }) {
  async function uploadFile(file, folder) {
    const buffer = file.data || file.buffer;
    const base64 = `data:${file.mimetype};base64,${buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(base64, {
      folder,
      overwrite: true,
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  }

  async function uploadMany(files, folder) {
    const fileArray = Array.isArray(files) ? files : [files];
    const assets = [];
    for (const file of fileArray) {
      assets.push(await uploadFile(file, folder));
    }
    return assets;
  }

  async function deleteMany(publicIds) {
    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) return;
    for (const publicId of publicIds) {
      if (!publicId) continue;
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error(`Failed to delete Cloudinary asset ${publicId}:`, err);
      }
    }
  }

  return { uploadMany, deleteMany };
}

module.exports = { createCloudinaryUploadService };

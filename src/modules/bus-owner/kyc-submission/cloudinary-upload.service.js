"use strict";

function createCloudinaryUploadService({ cloudinary }) {
  async function uploadFile(file, folder) {
    const base64 = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
    const result = await cloudinary.uploader.upload(base64, {
      folder,
      overwrite: true,
    });
    return result.secure_url;
  }

  async function uploadMany(files, folder) {
    const fileArray = Array.isArray(files) ? files : [files];
    const urls = [];
    for (const file of fileArray) {
      urls.push(await uploadFile(file, folder));
    }
    return urls;
  }

  return { uploadMany };
}

module.exports = { createCloudinaryUploadService };

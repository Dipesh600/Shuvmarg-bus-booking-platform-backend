"use strict";

const defaultCloudinary = require("../../../../handlers/cloudinary.js");

const createBusOwnerScheduleImageService = ({
  cloudinary = defaultCloudinary,
} = {}) => ({
  async uploadThumbnail(file) {
    const base64Thumbnail = `data:${file.mimetype};base64,${file.data.toString(
      "base64"
    )}`;
    const result = await cloudinary.uploader.upload(base64Thumbnail, {
      folder: "buss_ticket_thumbnail",
    });
    return result.secure_url;
  },
});

module.exports = {
  createBusOwnerScheduleImageService,
  defaultImageService: createBusOwnerScheduleImageService(),
};

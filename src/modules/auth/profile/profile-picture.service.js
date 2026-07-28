'use strict';

const cloudinary = require('../../../../handlers/cloudinary');

const toDataUri = (profilePic) =>
  `data:${profilePic.mimetype};base64,${profilePic.data.toString('base64')}`;

const uploadStandaloneProfilePicture = (userId, profilePic) =>
  cloudinary.uploader.upload(toDataUri(profilePic), {
    folder: 'profile_picture',
    public_id: `user_${userId}_${Date.now()}`,
    overwrite: true,
  });

const uploadProfileUpdatePicture = (userId, profilePic) =>
  cloudinary.uploader.upload(toDataUri(profilePic), {
    folder: 'profile_picture',
    public_id: `user_${userId}_${Date.now()}`,
    overwrite: true,
    transformation: [
      { width: 400, height: 400, crop: 'fill', quality: 'auto' },
    ],
  });

module.exports = {
  toDataUri,
  uploadStandaloneProfilePicture,
  uploadProfileUpdatePicture,
};

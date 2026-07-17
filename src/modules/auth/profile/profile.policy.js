'use strict';

const errors = require('./profile.errors');

const STANDALONE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const UPDATE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_UPDATE_FILE_SIZE = 5 * 1024 * 1024;

const normalize = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (
      t === '' ||
      t.toLowerCase() === 'null' ||
      t.toLowerCase() === 'undefined'
    ) {
      return null;
    }
    return t;
  }
  return v;
};

const requireUser = (userId) => {
  if (!userId) throw errors.unauthorizedError();
};

const requireProfilePicture = (profilePic) => {
  if (!profilePic) throw errors.missingProfilePictureError();
};

const requireUpdateField = (name, address, gender, profilePic) => {
  if (!name && !address && !gender && !profilePic) throw errors.noUpdateFieldsError();
};

const validateStandalonePicture = (profilePic) => {
  if (!STANDALONE_TYPES.includes(profilePic.mimetype)) {
    throw errors.invalidStandaloneFileTypeError();
  }
};

const validateUpdatePicture = (profilePic) => {
  if (!UPDATE_TYPES.includes(profilePic.mimetype)) {
    throw errors.invalidUpdateFileTypeError();
  }
  if (profilePic.size > MAX_UPDATE_FILE_SIZE) throw errors.fileTooLargeError();
};

const validateProfileFields = (name, address, gender) => {
  if (name && name.length < 3) throw errors.nameTooShortError();
  if (address && address.length < 5) throw errors.addressTooShortError();
  if (gender && !['male', 'female'].includes(gender.toLowerCase())) {
    throw errors.invalidGenderError();
  }
};

module.exports = {
  normalize,
  requireUser,
  requireProfilePicture,
  requireUpdateField,
  validateStandalonePicture,
  validateUpdatePicture,
  validateProfileFields,
  MAX_UPDATE_FILE_SIZE,
};

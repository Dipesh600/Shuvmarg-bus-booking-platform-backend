'use strict';

const AppError = require('../../../shared/errors/app-error');

const unauthorizedError = () =>
  new AppError('Unauthorized', 401, {
    status: false,
    message: 'Unauthorized: User not authenticated',
  });

const missingProfilePictureError = () =>
  new AppError('Missing profile picture', 400, {
    status: false,
    message: 'Profile picture is required',
  });

const invalidStandaloneFileTypeError = () =>
  new AppError('Invalid file type', 400, {
    status: false,
    message: 'Invalid file type. Only JPEG, PNG, and GIF are allowed',
  });

const invalidUpdateFileTypeError = () =>
  new AppError('Invalid file type', 400, {
    status: false,
    message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
  });

const fileTooLargeError = () =>
  new AppError('File too large', 400, {
    status: false,
    message: 'File size too large. Maximum 5MB allowed',
  });

const noUpdateFieldsError = () =>
  new AppError('No update fields', 400, {
    status: false,
    message: 'At least one field (name, address, gender, or profilePic) is required to update',
  });

const userNotFoundError = () =>
  new AppError('User not found', 404, {
    status: false,
    message: 'User not found',
  });

const nameTooShortError = () =>
  new AppError('Invalid name', 400, {
    status: false,
    message: 'Name must be at least 3 characters long',
  });

const addressTooShortError = () =>
  new AppError('Invalid address', 400, {
    status: false,
    message: 'Address must be at least 5 characters long',
  });

const invalidGenderError = () =>
  new AppError('Invalid gender', 400, {
    status: false,
    message: "Gender must be either 'male' or 'female'",
  });

const profileUploadFailedError = () =>
  new AppError('Profile picture upload failed', 500, {
    status: false,
    message: 'Failed to upload profile picture',
  });

const validationError = (error) =>
  new AppError('Validation error', 400, {
    status: false,
    message: 'Validation error',
    errors: Object.values(error.errors).map((err) => err.message),
  });

const cloudinaryError = (error) =>
  new AppError('Cloudinary error', error.http_code, {
    status: false,
    message: `Cloudinary error: ${error.message}`,
  });

const internalError = (cause) =>
  new AppError('Profile internal error', 500, {
    status: false,
    message: 'Internal server error',
  }, null, cause);

module.exports = {
  unauthorizedError,
  missingProfilePictureError,
  invalidStandaloneFileTypeError,
  invalidUpdateFileTypeError,
  fileTooLargeError,
  noUpdateFieldsError,
  userNotFoundError,
  nameTooShortError,
  addressTooShortError,
  invalidGenderError,
  profileUploadFailedError,
  validationError,
  cloudinaryError,
  internalError,
};

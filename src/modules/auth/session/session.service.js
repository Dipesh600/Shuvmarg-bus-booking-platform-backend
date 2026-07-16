const tokenService = require('../../../../utils/tokenService');
const sessionRepository = require('./session.repository');
const { mapTokenError } = require('./session.errors');
const AppError = require('../../../shared/errors/app-error');

const refreshSession = async (input) => {
  try {
    if (!input.refreshToken) {
      throw new AppError(
        'Refresh token is required.',
        400,
        { success: false, message: 'Refresh token is required.' }
      );
    }

    const result = await tokenService.rotateRefreshToken(input.refreshToken, {
      deviceInfo: input.deviceInfo || null,
      ipAddress: input.ipAddress || null,
    });

    return {
      statusCode: 200,
      refreshToken: result.refreshToken,
      responseBody: {
        success: true,
        message: 'Token refreshed successfully.',
        accessToken: result.accessToken,
      }
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mapTokenError(error);
  }
};

const logoutSession = async (input) => {
  try {
    if (input.refreshToken) {
      await tokenService.revokeRefreshToken(input.refreshToken);
    }
    
    if (input.userId) {
      await sessionRepository.incrementTokenVersion(input.userId);
    }
  } catch (error) {
    console.error("Logout Error:", error);
  }
  
  return {
    statusCode: 200,
    clearCookie: 'refreshToken',
    responseBody: {
      success: true,
      message: 'Logged out successfully.',
    }
  };
};

module.exports = {
  refreshSession,
  logoutSession,
};

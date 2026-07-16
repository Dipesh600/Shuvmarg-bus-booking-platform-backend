process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';


// Prevent external providers from erroring out during import or invocation in test mode
process.env.SPARROW_SMS_TOKEN = 'test-stub';
process.env.CLOUDINARY_NAME = 'test';
process.env.CLOUDINARY_API_KEY = 'test';
process.env.CLOUDINARY_SECRET_KEY = 'test';
process.env.FCM_PROJECT_ID = 'test';
process.env.FCM_CLIENT_EMAIL = 'test';
process.env.FCM_PRIVATE_KEY = 'test';

const app = require('../../index');

module.exports = app;

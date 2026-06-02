/**
 * utils/passwordValidator.js
 * 
 * Centralized password policy enforcement.
 * 
 * Rules:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 number
 */

const PASSWORD_MIN_LENGTH = 8;

/**
 * Validate password strength.
 * @param {string} password 
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validatePassword = (password) => {
    const errors = [];

    if (!password || typeof password !== "string") {
        return { valid: false, errors: ["Password is required."] };
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
        errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
    }

    if (!/[A-Z]/.test(password)) {
        errors.push("Password must contain at least one uppercase letter.");
    }

    if (!/[0-9]/.test(password)) {
        errors.push("Password must contain at least one number.");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
};

module.exports = { validatePassword, PASSWORD_MIN_LENGTH };

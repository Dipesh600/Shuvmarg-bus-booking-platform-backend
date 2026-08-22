/**
 * utils/tokenService.js
 *
 * Centralized JWT access + refresh token management.
 *
 * Access Token:  Short-lived (15 min default), stateless, in response body.
 * Refresh Token: Long-lived (30 days default), stored as SHA-256 hash in DB.
 *
 * Flow:
 *   Login  → generateTokenPair() → { accessToken, refreshToken }
 *   Refresh → rotateRefreshToken() → new { accessToken, refreshToken }, old one deleted
 *   Logout  → revokeRefreshToken() → delete from DB
 *   Ban / Password change → revokeAllUserTokens() → delete ALL from DB
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/refreshTokenModel.js");

// ── Token Expiry Config ──────────────────────────────────────────────

const ACCESS_TOKEN_EXPIRY = {
    passenger: "15m",
    busOwner: "15m",
    agent: "15m",
    conductor: "15m",
    driver: "15m",
    admin: "8h",        // Admins: no refresh token, just longer access
};

const REFRESH_TOKEN_EXPIRY_DAYS = {
    passenger: 30,
    busOwner: 30,
    agent: 30,
    conductor: 7,
    driver: 7,
    admin: 0,           // Admin gets NO refresh token
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Hash a refresh token for storage.
 * We never store raw tokens — only their SHA-256 hash.
 */
const hashToken = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Generate a cryptographically secure random refresh token.
 */
const generateRefreshTokenString = () => {
    return crypto.randomBytes(40).toString("hex");
};

// ── Core Functions ───────────────────────────────────────────────────

/**
 * Build the JWT access token payload for a user.
 * Minimal payload — only what's needed for route authorization.
 *
 * @param {Object} user - User document
 * @param {string} activeRole - Which role this session is operating as
 */
const buildAccessTokenPayload = (user, activeRole) => {
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,              // backward compat — first registered role
        activeRole: activeRole,       // the role context for THIS session
        roles: user.roles || [],      // all roles the user holds
        isVerified: user.isVerified,
        purpose: "access",            // explicitly whitelist token capability
        // Snapshot of the user's tokenVersion at mint time.
        // verifyRoleFromDB compares this against the DB value on every request.
        // Logout and password change increment the DB counter, instantly
        // invalidating all previously issued access tokens.
        tokenVersion: user.tokenVersion ?? 0,
    };
};

/**
 * Sign a new access token for a user.
 * @param {Object} user - Mongoose user document or plain object with _id, role, etc.
 * @param {string} [activeRole] - Which role context this session operates in.
 *   Falls back to user.role for backward compat with old callers.
 * @returns {string} Signed JWT access token
 */
const signAccessToken = (user, activeRole) => {
    const effectiveRole = activeRole || user.role || "passenger";
    const expiry = ACCESS_TOKEN_EXPIRY[effectiveRole] || "15m";

    return jwt.sign(
        buildAccessTokenPayload(user, effectiveRole),
        process.env.SECRET_KEY,
        { expiresIn: expiry }
    );
};

/**
 * Generate an access + refresh token pair.
 * Stores the refresh token hash in the database.
 *
 * @param {Object} user - Mongoose user document
 * @param {Object} [meta] - Optional metadata
 * @param {string} [meta.deviceInfo] - User-Agent string
 * @param {string} [meta.ipAddress] - Client IP
 * @param {string} [meta.activeRole] - Which role context this session operates in
 * @returns {Promise<{accessToken: string, refreshToken: string|null}>}
 */
const generateTokenPair = async (user, meta = {}) => {
    const activeRole = meta.activeRole || user.role || "passenger";
    const accessToken = signAccessToken(user, activeRole);

    const refreshDays = REFRESH_TOKEN_EXPIRY_DAYS[activeRole] || REFRESH_TOKEN_EXPIRY_DAYS["passenger"];

    // No refresh token for zero-day roles
    if (refreshDays === 0) {
        return { accessToken, refreshToken: null };
    }

    // Generate and store refresh token with activeRole for rotation
    const rawRefreshToken = generateRefreshTokenString();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
        userId: user._id,
        tokenHash,
        expiresAt,
        deviceInfo: meta.deviceInfo || null,
        ipAddress: meta.ipAddress || null,
        activeRole,
    });

    return { accessToken, refreshToken: rawRefreshToken };
};

/**
 * Rotate a refresh token: validate the old one, delete it, issue a new pair.
 * This is "refresh token rotation" — prevents token reuse attacks.
 *
 * @param {string} oldRefreshToken - The raw refresh token from the client
 * @param {Object} [meta] - Optional metadata for the new token
 * @returns {Promise<{accessToken: string, refreshToken: string, user: Object}>}
 * @throws {Error} If token is invalid, expired, or not found
 */
const rotateRefreshToken = async (oldRefreshToken, meta = {}) => {
    const oldHash = hashToken(oldRefreshToken);

    const storedToken = await RefreshToken.findOne({ tokenHash: oldHash });
    if (!storedToken) {
        throw new Error("INVALID_REFRESH_TOKEN");
    }

    // Check expiry (belt-and-suspenders — TTL index handles cleanup, but check anyway)
    if (storedToken.expiresAt < new Date()) {
        await RefreshToken.deleteOne({ _id: storedToken._id });
        throw new Error("REFRESH_TOKEN_EXPIRED");
    }

    const sessionActiveRole = storedToken.activeRole || "passenger";

    if (meta.expectedActiveRole && sessionActiveRole !== meta.expectedActiveRole) throw new Error("SESSION_ROLE_MISMATCH");

    // Delete the old refresh token (single-use)
    await RefreshToken.deleteOne({ _id: storedToken._id });

    // Load the user to build a fresh access token with current DB state
    const User = require("../models/userModel.js");
    const user = await User.findById(storedToken.userId);

    if (!user) {
        throw new Error("USER_NOT_FOUND");
    }

    // Block if user is banned, deleted, or inactive
    if (user.deletedAt) throw new Error("ACCOUNT_DEACTIVATED");
    if (user.status === "banned") throw new Error("ACCOUNT_BANNED");

    // Verify the activeRole is still in the user's roles (role may have been revoked)
    if (!user.roles || !user.roles.includes(sessionActiveRole)) {
        throw new Error("ROLE_REVOKED");
    }

    // Generate new token pair with the preserved activeRole
    const newPair = await generateTokenPair(user, {
        ...meta,
        activeRole: sessionActiveRole,
    });

    return {
        accessToken: newPair.accessToken,
        refreshToken: newPair.refreshToken,
        user,
    };
};

/**
 * Revoke a specific refresh token (logout from one device).
 * @param {string} rawRefreshToken
 * @returns {Promise<boolean>} true if token was found and deleted
 */
const revokeRefreshToken = async (rawRefreshToken) => {
    const tokenHash = hashToken(rawRefreshToken);
    const result = await RefreshToken.deleteOne({ tokenHash });
    return result.deletedCount > 0;
};

/**
 * Revoke ALL refresh tokens for a user (force re-login everywhere).
 * Call this on: password change, account ban, role revoke.
 * @param {string} userId
 * @returns {Promise<number>} Number of tokens revoked
 */
const revokeAllUserTokens = async (userId) => {
    const result = await RefreshToken.deleteMany({ userId });
    return result.deletedCount;
};

module.exports = {
    signAccessToken,
    generateTokenPair,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    hashToken,
    ACCESS_TOKEN_EXPIRY,
    REFRESH_TOKEN_EXPIRY_DAYS,
};

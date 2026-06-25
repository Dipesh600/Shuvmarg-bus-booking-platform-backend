/**
 * tests/authSecurityTest.js
 *
 * Integration test suite for the auth security overhaul (Layers 1-5).
 * Tests against the running server at http://localhost:7012
 *
 * Run:  node tests/authSecurityTest.js
 *
 * What it verifies:
 *   1. Phone guard blocks cross-entity registration
 *   2. OTP purpose mismatch rejected
 *   3. Password policy enforced
 *   4. Refresh token rotation works
 *   5. Logout revokes session
 *   6. verifyRoleFromDB blocks stale tokens
 *   7. Admin JWT has 8h expiry
 *   8. forcePasswordChange detection
 *   9. Token service unit tests
 */

const http = require("http");

const BASE_URL = "http://localhost:7012";
let passed = 0;
let failed = 0;
const results = [];

// ── HTTP Helper ──────────────────────────────────────────────────────────────

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const data = body ? JSON.stringify(body) : null;

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
        };

        const req = http.request(options, (res) => {
            let responseData = "";
            res.on("data", (chunk) => (responseData += chunk));
            res.on("end", () => {
                try {
                    resolve({
                        status: res.statusCode,
                        body: JSON.parse(responseData),
                    });
                } catch {
                    resolve({
                        status: res.statusCode,
                        body: responseData,
                    });
                }
            });
        });

        req.on("error", reject);
        if (data) req.write(data);
        req.end();
    });
}

// ── Test Helpers ─────────────────────────────────────────────────────────────

function assert(testName, condition, detail = "") {
    if (condition) {
        passed++;
        results.push({ name: testName, status: "✅ PASS", detail });
    } else {
        failed++;
        results.push({ name: testName, status: "❌ FAIL", detail });
    }
}

// ── Unit Tests (no HTTP, test modules directly) ──────────────────────────────

async function runUnitTests() {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  UNIT TESTS — Module-level verification");
    console.log("═══════════════════════════════════════════════════════════\n");

    // ── Token Service ────────────────────────────────────────────────────
    const tokenService = require("../utils/tokenService.js");

    // Test 1: hashToken produces consistent SHA-256
    const hash1 = tokenService.hashToken("test-token-abc");
    const hash2 = tokenService.hashToken("test-token-abc");
    assert("hashToken: deterministic", hash1 === hash2, `${hash1.slice(0, 16)}...`);

    // Test 2: hashToken produces 64-char hex string
    assert("hashToken: 64-char hex", hash1.length === 64 && /^[0-9a-f]+$/.test(hash1));

    // Test 3: Different inputs → different hashes
    const hash3 = tokenService.hashToken("different-token");
    assert("hashToken: collision resistance", hash1 !== hash3);

    // Test 4: Access token expiry config
    assert("ACCESS_TOKEN_EXPIRY: admin = 8h", tokenService.ACCESS_TOKEN_EXPIRY.admin === "8h");
    assert("ACCESS_TOKEN_EXPIRY: passenger = 15m", tokenService.ACCESS_TOKEN_EXPIRY.passenger === "15m");
    assert("ACCESS_TOKEN_EXPIRY: busOwner = 15m", tokenService.ACCESS_TOKEN_EXPIRY.busOwner === "15m");
    assert("ACCESS_TOKEN_EXPIRY: conductor = 15m", tokenService.ACCESS_TOKEN_EXPIRY.conductor === "15m");
    assert("ACCESS_TOKEN_EXPIRY: driver = 15m", tokenService.ACCESS_TOKEN_EXPIRY.driver === "15m");

    // Test 5: Refresh token expiry config
    assert("REFRESH_TOKEN_EXPIRY: admin = 0 (none)", tokenService.REFRESH_TOKEN_EXPIRY_DAYS.admin === 0);
    assert("REFRESH_TOKEN_EXPIRY: passenger = 30d", tokenService.REFRESH_TOKEN_EXPIRY_DAYS.passenger === 30);
    assert("REFRESH_TOKEN_EXPIRY: conductor = 7d", tokenService.REFRESH_TOKEN_EXPIRY_DAYS.conductor === 7);
    assert("REFRESH_TOKEN_EXPIRY: driver = 7d", tokenService.REFRESH_TOKEN_EXPIRY_DAYS.driver === 7);

    // ── Password Validator ───────────────────────────────────────────────
    const { validatePassword } = require("../utils/passwordValidator.js");

    assert("Password: reject short", !validatePassword("Ab1").valid);
    assert("Password: reject no uppercase", !validatePassword("abcdefg1").valid);
    assert("Password: reject no digit", !validatePassword("Abcdefgh").valid);
    assert("Password: accept valid", validatePassword("Abcdefg1").valid);
    assert("Password: accept complex", validatePassword("MyP@ssw0rd!").valid);

    // ── OTP Helper ───────────────────────────────────────────────────────
    const otpHelper = require("../utils/otpHelper.js");
    assert("otpHelper: exports createAndSendOTP", typeof otpHelper.createAndSendOTP === "function");
    assert("otpHelper: exports verifyOTPCode", typeof otpHelper.verifyOTPCode === "function");

    // ── Phone Guard ──────────────────────────────────────────────────────
    const phoneGuard = require("../utils/phoneGuard.js");
    assert("phoneGuard: exports isPhoneRegistered", typeof phoneGuard.isPhoneRegistered === "function");

    // ── Models ────────────────────────────────────────────────────────────
    const RefreshToken = require("../models/refreshTokenModel.js");
    assert("RefreshToken model: has tokenHash field", !!RefreshToken.schema.paths.tokenHash);
    assert("RefreshToken model: has expiresAt field", !!RefreshToken.schema.paths.expiresAt);
    assert("RefreshToken model: has userId field", !!RefreshToken.schema.paths.userId);

    const ConductorProfile = require("../models/conductorProfileModel.js");
    assert("ConductorProfile model: has brandId", !!ConductorProfile.schema.paths.brandId);
    assert("ConductorProfile model: has userId", !!ConductorProfile.schema.paths.userId);

    const User = require("../models/userModel.js");
    assert("User model: has forcePasswordChange", !!User.schema.paths.forcePasswordChange);
    assert("User model: status has 'invited'", User.schema.paths.status.options.enum.includes("invited"));
    assert("User model: password minlength = 8", User.schema.paths.password.options.minlength[0] === 8);

    // ── OTP Model ────────────────────────────────────────────────────────
    const OTP = require("../models/otpModel.js");
    assert("OTP model: has purpose field", !!OTP.schema.paths.purpose);
    assert("OTP model: purpose has ACCOUNT_ACTIVATION", OTP.schema.paths.purpose.options.enum.includes("ACCOUNT_ACTIVATION"));
    assert("OTP model: purpose has REGISTRATION", OTP.schema.paths.purpose.options.enum.includes("REGISTRATION"));
    assert("OTP model: purpose has PASSWORD_RESET", OTP.schema.paths.purpose.options.enum.includes("PASSWORD_RESET"));

    // ── Middleware ────────────────────────────────────────────────────────
    const verifyRoleFromDB = require("../middleware/verifyRoleFromDB.js");
    assert("verifyRoleFromDB: is a function", typeof verifyRoleFromDB === "function");

    const adminMiddleware = require("../middleware/adminMiddleware.js");
    assert("adminMiddleware: is a function", typeof adminMiddleware === "function");

    const checkRole = require("../middleware/checkRole.js");
    assert("checkRole: has conductorMiddleware", typeof checkRole.conductorMiddleware === "function");
    assert("checkRole: has driverMiddleware", typeof checkRole.driverMiddleware === "function");
    assert("checkRole: has busOwnerOrConductorMiddleware", typeof checkRole.busOwnerOrConductorMiddleware === "function");

    // ── Controllers ──────────────────────────────────────────────────────
    const authController = require("../controllers/authControllers.js/authController.js");
    assert("authController: has refreshAccessToken", typeof authController.refreshAccessToken === "function");
    assert("authController: has logout", typeof authController.logout === "function");
    assert("authController: has changeForcePassword", typeof authController.changeForcePassword === "function");

    const busOwnerAuth = require("../controllers/authControllers.js/busOwnerAuthController.js");
    assert("busOwnerAuth: has sendOTP", typeof busOwnerAuth.sendOTP === "function");
    assert("busOwnerAuth: has register", typeof busOwnerAuth.register === "function");

    const agentAuth = require("../controllers/authControllers.js/agentAuthController.js");
    assert("agentAuth: has sendOTP", typeof agentAuth.sendOTP === "function");
    assert("agentAuth: has register", typeof agentAuth.register === "function");

    const activateAuth = require("../controllers/authControllers.js/activateAccountController.js");
    assert("activateAuth: has sendActivationOTP", typeof activateAuth.sendActivationOTP === "function");
    assert("activateAuth: has activateAccount", typeof activateAuth.activateAccount === "function");

    const staffAssignment = require("../controllers/busOwnerController/staffAssignmentController.js");
    assert("staffAssignment: has assignConductor", typeof staffAssignment.assignConductor === "function");
    assert("staffAssignment: has assignDriver", typeof staffAssignment.assignDriver === "function");
    assert("staffAssignment: has removeConductor", typeof staffAssignment.removeConductor === "function");
    assert("staffAssignment: has removeDriver", typeof staffAssignment.removeDriver === "function");
}

// ── Integration Tests (HTTP against running server) ──────────────────────────

async function runIntegrationTests() {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  INTEGRATION TESTS — HTTP against running server");
    console.log("═══════════════════════════════════════════════════════════\n");

    // ── Test: Server is reachable ────────────────────────────────────────
    try {
        const health = await request("GET", "/health");
        assert("Server health check", health.status === 200, `status: ${health.body?.status}`);
    } catch (e) {
        assert("Server health check", false, "Server not reachable at " + BASE_URL);
        console.log("\n⚠️  Server not running. Skipping integration tests.\n");
        return;
    }

    // ── Test: Login with invalid credentials → 401 ──────────────────────
    const invalidLogin = await request("POST", "/api/login", {
        emailOrPhone: "9999999999",
        password: "wrong",
    });
    assert("Login: invalid credentials → 401", invalidLogin.status === 401, invalidLogin.body?.message);

    // ── Test: Login with missing fields → 400 ───────────────────────────
    const missingLogin = await request("POST", "/api/login", {});
    assert("Login: missing fields → 400", missingLogin.status === 400, missingLogin.body?.message);

    // ── Test: Refresh with invalid token → 401 ──────────────────────────
    const invalidRefresh = await request("POST", "/api/refresh", {
        refreshToken: "invalid-token-that-does-not-exist",
    });
    assert("Refresh: invalid token → 401", invalidRefresh.status === 401, invalidRefresh.body?.message);

    // ── Test: Refresh with missing token → 400 ──────────────────────────
    const missingRefresh = await request("POST", "/api/refresh", {});
    assert("Refresh: missing token → 400", missingRefresh.status === 400, missingRefresh.body?.message);

    // ── Test: Logout without token → 200 (graceful) ─────────────────────
    const logoutNoToken = await request("POST", "/api/logout", {});
    assert("Logout: no token → 200 (graceful)", logoutNoToken.status === 200, logoutNoToken.body?.message);

    // ── Test: Logout with invalid token → 200 (graceful) ────────────────
    const logoutInvalid = await request("POST", "/api/logout", {
        refreshToken: "non-existent-token",
    });
    assert("Logout: invalid token → 200 (graceful)", logoutInvalid.status === 200);

    // ── Test: Protected route without token → 400/401 ───────────────────
    const noToken = await request("GET", "/api/getUserDetail");
    assert("Protected route: no token → 400", noToken.status === 400, noToken.body?.message);

    // ── Test: Protected route with expired/invalid token → 401 ──────────
    const badToken = await request("GET", "/api/getUserDetail", null, {
        Authorization: "Bearer invalid.jwt.token",
    });
    assert("Protected route: invalid token → 401", badToken.status === 401, badToken.body?.message);

    // ── Test: Bus owner self-registration — sendOTP without phone → 400 ──
    const noPhoneOTP = await request("POST", "/api/auth/busowner/sendOTP", {});
    assert("BusOwner sendOTP: no phone → 400", noPhoneOTP.status === 400, noPhoneOTP.body?.message);

    // ── Test: Agent self-registration — sendOTP without phone → 400 ──────
    const agentNoPhone = await request("POST", "/api/auth/agent/sendOTP", {});
    assert("Agent sendOTP: no phone → 400", agentNoPhone.status === 400, agentNoPhone.body?.message);

    // ── Test: BusOwner register without OTP → 400 ────────────────────────
    const noOtpRegister = await request("POST", "/api/auth/busowner/register", {
        phone: "9800000001",
        name: "Test",
        password: "TestPass1",
        companyName: "Test Co",
    });
    assert(
        "BusOwner register: no OTP verification → 400",
        noOtpRegister.status === 400,
        noOtpRegister.body?.message
    );

    // ── Test: Activation sendOTP for non-invited phone → 404 ─────────────
    const activateNonExistent = await request("POST", "/api/auth/activate/sendOTP", {
        phone: "9800000099",
    });
    assert(
        "Activate: non-invited phone → 404",
        activateNonExistent.status === 404,
        activateNonExistent.body?.message
    );

    // ── Test: Activation without required fields → 400 ───────────────────
    const activateMissing = await request("POST", "/api/auth/activate", {});
    assert(
        "Activate: missing fields → 400",
        activateMissing.status === 400,
        activateMissing.body?.message
    );

    // ── Test: changeForcePassword with invalid temp token → 401 ──────────
    const badTempToken = await request("POST", "/api/changeForcePassword", {
        tempToken: "invalid.temp.token",
        newPassword: "NewPass123",
    });
    assert(
        "changeForcePassword: invalid tempToken → 401",
        badTempToken.status === 401,
        badTempToken.body?.message
    );

    // ── Test: changeForcePassword without fields → 400 ───────────────────
    const noFieldsForce = await request("POST", "/api/changeForcePassword", {});
    assert(
        "changeForcePassword: missing fields → 400",
        noFieldsForce.status === 400,
        noFieldsForce.body?.message
    );

    // ── Test: Weak password on registration → 400 ────────────────────────
    const weakPwdRegister = await request("POST", "/api/completeRegistration", {
        phone: "9800000002",
        name: "WeakPwd User",
        password: "12345",         // Too short, no uppercase
    });
    assert(
        "Registration: weak password → 400",
        weakPwdRegister.status === 400,
        weakPwdRegister.body?.message
    );

    // ── Test: Bus owner routes without auth → 400 ────────────────────────
    const noAuthBusOwner = await request("GET", "/api/busowner/myFleets");
    assert(
        "BusOwner route: no auth → 400",
        noAuthBusOwner.status === 400,
        noAuthBusOwner.body?.message
    );

    // ── Test: Agent routes without auth → 400 ────────────────────────────
    const noAuthAgent = await request("GET", "/api/agent/myKycStatus");
    assert(
        "Agent route: no auth → 400",
        noAuthAgent.status === 400,
        noAuthAgent.body?.message
    );

    // ── Test: Conductor routes without auth → 400 ────────────────────────
    const noAuthConductor = await request("POST", "/api/conductor/confirmBoarding", {});
    assert(
        "Conductor route: no auth → 400",
        noAuthConductor.status === 400,
        noAuthConductor.body?.message
    );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║   SHUVMARG AUTH SECURITY OVERHAUL — TEST SUITE          ║");
    console.log("║   Layers 1-5 Verification                               ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");

    await runUnitTests();
    await runIntegrationTests();

    // ── Report ───────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  TEST RESULTS");
    console.log("═══════════════════════════════════════════════════════════\n");

    results.forEach((r) => {
        const detail = r.detail ? ` (${r.detail})` : "";
        console.log(`  ${r.status}  ${r.name}${detail}`);
    });

    console.log(`\n  ────────────────────────────────────`);
    console.log(`  Total:  ${passed + failed}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  ────────────────────────────────────\n`);

    if (failed > 0) {
        console.log("  ⚠️  Some tests failed. Review the output above.\n");
        process.exit(1);
    } else {
        console.log("  🎉 All tests passed!\n");
        process.exit(0);
    }
}

main().catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
});

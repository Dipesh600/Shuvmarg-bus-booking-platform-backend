/**
 * middleware/requireApprovedAgent.js
 *
 * DB-level authorization for agent routes that need the agent's own verification
 * to be complete before access is granted.
 *
 * Sits after `auth` and `agentMiddleware` (role check).
 * These checks run in sequence:
 *   1. auth              — valid JWT, user exists
 *   2. agentMiddleware   — JWT activeRole === "agent"
 *   3. this middleware   — the agent's verification clears them
 *
 * WHY THIS IS NOT `applicationStatus === "APPROVED"` ANY MORE. APPROVED is the
 * terminal state of the PLATFORM review machine alone. An OPERATOR-scope agent —
 * a bus owner's own agent, the near-term focus — never reaches it: that machine
 * ends at VERIFIED_BASIC, because we never pay these agents and so never review
 * their documents. The hardcoded comparison locked every one of them out of
 * /profile and /dashboard permanently, with a message about a review that was
 * never going to happen. `isAgentVerificationCleared` answers per scope, and the
 * `/me` mapper asks it the same question, so the API and this gate cannot
 * disagree about who is cleared.
 *
 * Clearing verification is still not permission to sell. Selling additionally
 * needs an ACTIVE assignment from the operator whose seats are being sold —
 * slice 3 adds that check on top of this one, it does not replace it.
 *
 * Applied to: /profile, /dashboard (anything past verification)
 * NOT applied to: /application/* routes (reachable while DRAFT/MORE_INFO)
 *
 * Returns the current applicationStatus in the 403 response so the frontend
 * can display the correct status screen without an extra API call.
 */

"use strict";

const Agent = require("../models/agentModel.js");
const { isAgentVerificationCleared } = require("../src/shared/identity/agent-verification.js");

/**
 * What the agent should do next, per status.
 *
 * Keyed flatly rather than per scope: each message describes the agent's own
 * state, and no status is reachable here under both scopes with two different
 * meanings — except VERIFIED_BASIC, which only lands here when a PLATFORM row
 * carries an OPERATOR-machine status. No self-service step fixes that, so it
 * routes to support rather than inventing an instruction.
 *
 * A Map, not an object literal: `applicationStatus` is compared against these
 * keys, and on a plain object a lookup of "constructor" resolves truthy off the
 * prototype chain. The identity enums use Maps for the same reason.
 */
const STATUS_MESSAGES = new Map([
    ["DRAFT", "Your application is incomplete. Please complete your setup to access this feature."],
    ["PHONE_VERIFIED", "Your phone is verified. Add your outlet details to finish verification."],
    ["VERIFIED_BASIC", "Your account needs review before you can continue. Please contact support."],
    ["PENDING", "Your application is under review. You will be notified once it is approved."],
    ["MORE_INFO", "Admin has requested additional information. Please update your application."],
    ["REJECTED", "Your application was not approved. Please check your status for details."],
    ["SUSPENDED", "Your agent account has been suspended. Please contact support."],
]);

const requireApprovedAgent = async (req, res, next) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized.",
            });
        }

        // `scope` and `agentType` are what decide this. scopeOf() reads `scope`
        // first and falls back to the legacy `agentType`; omitting both would make
        // every agent resolve to PLATFORM, which demands APPROVED — reintroducing
        // the exact bug this middleware was changed to fix, silently, while the
        // code above still reads as though it were fixed.
        const agent = await Agent.findOne({ user: userId })
            .select("scope agentType applicationStatus isPermanentlyRejected rejectedAt")
            .lean();

        if (!agent) {
            return res.status(403).json({
                success: false,
                message: "No agent application found. Please complete your setup.",
                errorCode: "NO_APPLICATION",
                applicationStatus: null,
            });
        }

        if (!isAgentVerificationCleared(agent)) {
            return res.status(403).json({
                success: false,
                message: STATUS_MESSAGES.get(agent.applicationStatus) || "Access denied.",
                // Deliberately unchanged. Clients branch on this string, and the
                // 403 still means what it always meant: verification is not
                // complete. Renaming it would be a client-visible break for no
                // gain — the rename pass is slice 5.
                errorCode: "APPLICATION_NOT_APPROVED",
                applicationStatus: agent.applicationStatus,
            });
        }

        // ✅ Verification cleared — allow through
        next();
    } catch (error) {
        console.error("[requireApprovedAgent] Error:", error.message);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = requireApprovedAgent;

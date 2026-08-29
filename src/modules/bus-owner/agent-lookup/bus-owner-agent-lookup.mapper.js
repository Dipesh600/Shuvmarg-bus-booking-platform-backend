'use strict';

const { displayAgentCode } = require('../../../shared/identity/agent-code-lookup');
const { outletTypeOf } = require('../../../shared/identity/agent-enums');

/**
 * The public preview of an agent, shown to an operator who typed their code.
 *
 * The rule is the master plan's: enough to confirm you have the right person,
 * and nothing more. Specifically absent, each for its own reason:
 *
 *   phone, email     the code is a handle for a business relationship, not a
 *                    lookup key for contact details. Returning them turns this
 *                    endpoint into a scraper keyed on a published string.
 *   other operators  would expose competitor relationships. An operator has no
 *                    business learning who else has hired this agent.
 *   the Mongo _id    the assign API takes the code, so nothing downstream needs
 *                    it, and an internal id handed out on a read is an id that
 *                    starts appearing in requests that were never designed for
 *                    it.
 *   photo            the master plan lists one, but no photo, avatar or image
 *                    field exists on Agent or on User. Returning null under a
 *                    key we do not populate would promise the client something
 *                    the schema cannot deliver; adding the field is a change to
 *                    KYC capture, not to this endpoint.
 *
 * `district` and `municipality` stand in for the plan's "city" — that is the
 * granularity KYC actually captures. `placeName` and `shopAddress` are held back
 * deliberately: a street address is a doorstep, and confirming an identity does
 * not need one.
 *
 * `kycStatus` is included alongside the badge so an operator whose agent is not
 * yet verified can see what is outstanding, rather than being told only that the
 * answer is no.
 */
const toPreviewResponse = ({ agent, kycStatus, isVerified }) => ({
  success: true,
  data: {
    agentCode: displayAgentCode(agent),
    name: agent?.user?.name || null,
    outletType: outletTypeOf(agent),
    businessName: agent.businessName || null,
    district: agent.district || null,
    municipality: agent.municipality || null,
    kycStatus,
    isVerified,
    /**
     * Whether this agent may be sent an invite. True here by construction — an
     * unassignable scope is refused before the mapper runs — but stated so the
     * client branches on a field rather than on the absence of an error.
     *
     * It does NOT mean "no invite exists yet". Whether this operator already has
     * a live assignment is settled by the partial unique index at insert time,
     * which is the only place it can be settled without a race.
     */
    canBeAssigned: true,
  },
});

module.exports = {
  toPreviewResponse,
};

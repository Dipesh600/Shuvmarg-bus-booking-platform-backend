# Module documentation

This directory documents current backend modules as implemented, not intended architecture.

Each module document is expected to include:

- Current implementation only.
- Verified endpoint table.
- Responsibilities and exclusions.
- Request/response and flow walkthroughs.
- Data effects.
- Security-sensitive ordering.
- Dependencies and middleware.
- Tests that protect the contract.
- Known limitations or inconsistencies.
- Safe-change guidance.
- Verification references.

Authentication documentation:

- [General authentication](auth/README.md)
- [Agent authentication](agent-auth/README.md)
- [Bus-owner authentication](bus-owner-auth/README.md)

KYC documentation:

- [KYC modules](kyc/README.md)

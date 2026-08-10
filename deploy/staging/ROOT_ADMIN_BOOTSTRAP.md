# Staging root administrator ceremony

The bootstrap command creates the database's only immutable root administrator. It is not an application startup step and must never be placed in a deploy hook.

## Preconditions

1. Store a random 32-byte `ADMIN_MFA_ENCRYPTION_KEY` in the staging secret manager.
2. Deploy the secured backend and admin UI.
3. Run `npm run preflight:admin-bootstrap`. Continue only when `safeForInitialBootstrap` is `true`.
4. Prepare a unique password in a password manager. Do not save bootstrap identity or password variables in the service environment.

## One-time creation

Run `npm run bootstrap:root-admin` as a controlled one-off process with:

- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_ID=SM-ADM-DIPESH`
- `SUPER_ADMIN_PASSWORD`
- `ADMIN_BOOTSTRAP_ENVIRONMENT=staging`
- `ADMIN_BOOTSTRAP_CONFIRM=CREATE_INITIAL_ROOT:staging`

The command returns a 30-minute enrollment token. It creates an inactive `MFA_PENDING` root and a permanent bootstrap record. Re-running the command cannot create another administrator.

## MFA activation

1. Open `/auth/enroll?kind=root` on the staging admin UI.
2. Paste the token and bootstrap password.
3. Scan the QR code with Google Authenticator.
4. Confirm with the current six-digit code.
5. Download the one-time recovery codes and store them in the approved password manager.
6. Sign in at `/auth/login` and confirm Settings → Administrator access shows one immutable root.
7. Run `npm run preflight:admin-bootstrap` again. `validSecuredDatabase` must be `true`.

If the enrollment token expires before activation, `npm run bootstrap:root-admin:renew` may rotate only that token. It requires `ADMIN_BOOTSTRAP_CONFIRM=REISSUE_ROOT_ENROLLMENT:staging` and the existing root's admin ID. It cannot create an administrator and refuses to run after activation.

All later administrators are created through a root-generated, 24-hour invitation. No seed or public administrator-creation route exists.

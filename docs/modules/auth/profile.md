# Profile

[Back to general authentication](README.md)

## Purpose

The profile module owns passenger/general profile picture updates, profile field updates, and user-detail reads.

## Who uses it

Authenticated users on `/api/UpdateProfilePic`, `/api/updateProfile`, and `/api/getUserDetail`.

## Responsibilities

- Update profile picture through Cloudinary.
- Update supported profile fields: `name`, `address`, `gender`, and optional `profilePic`.
- Return user details with the current legacy sanitization.
- Preserve route-specific file type, size, and error behavior.

## What this module does not do

- It does not manage coupons, wallet, KYC, or agent profile data.
- It does not delete previous Cloudinary assets.
- It does not update unsupported body fields.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| PUT | `/api/UpdateProfilePic` | `auth`, `verifyRoleFromDB`, `autoGenerateReferralCode` | `profileModule.updateProfilePicture` |
| PATCH | `/api/updateProfile` | `auth`, `verifyRoleFromDB`, `autoGenerateReferralCode` | `profileModule.updateProfile` |
| GET | `/api/getUserDetail` | `auth`, `verifyRoleFromDB` | `profileModule.getUserDetail` |

## Request and response walkthrough

`UpdateProfilePic` reads `req.userInfo?.id` and `req.files?.profilePic`. It requires a file, accepts JPEG/PNG/GIF only, performs no explicit 5 MB size check, uploads a base64 data URI with folder `profile_picture`, `public_id` `user_<id>_<Date.now()>`, and `overwrite: true`, then saves the user with `{ validateBeforeSave: true }`. Success uses `success: true`.

`updateProfile` reads only `name`, `address`, `gender`, and `profilePic`. It normalizes strings by trimming and mapping empty/`null`/`undefined` strings to `null`; non-strings are returned unchanged. At least one truthy normalized field or file is required. It performs user lookup before field validation. File uploads accept JPEG/PNG/GIF/WebP, reject size greater than 5 MB, and use a 400x400 fill transformation. Cloudinary failure inside the upload block maps to fixed `500 Failed to upload profile picture`.

`getUserDetail` reads `req.userInfo.id` with direct property access. The repository selects `-password -__v -otp -otpExpiry -createdAt -updatedAt`, converts with `toObject`, and deletes only `rewardPoints` and `referralPoints`.

## Flow walkthrough

Profile picture: require user → require file → validate type → find user → upload → assign URL → save → success.

Profile update: require user → normalize → require field → find user → validate fields → optional file validation/upload → build update data → `findByIdAndUpdate` with projection → success.

User detail: direct user ID access → require user → projected lookup → `toObject` → delete two fields → success.

## Authentication or ownership proof

All three routes rely on an access token through `auth`; `verifyRoleFromDB` verifies account state, role drift, `tokenVersion`, and force-password state.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | `findById`, detail projection, existing `profilePicture` | `UpdateProfilePic` saves `profilePicture`; `updateProfile` updates provided truthy `name`, `address`, `gender`, and changed `profilePicture`. |
| Cloudinary | None | Uploads profile images; previous assets are not deleted. |

## Dependencies

- `authMiddleware`, `verifyRoleFromDB`, and `autoGenerateReferralCode` protect/update request context.
- `handlers/cloudinary.js` is used only by `profile-picture.service.js`.
- `profile.repository` owns all User queries.

## Security-sensitive behavior

- `/UpdateProfilePic` rejects WebP; `/updateProfile` accepts WebP.
- Only `/updateProfile` enforces the strict greater-than 5 MB limit.
- `getUserDetail` deletes only `rewardPoints` and `referralPoints` after `toObject`.
- Do not add old Cloudinary asset deletion without changing behavior.

## Tests

Characterization tests cover auth, upload options, MIME differences, file size, projection/sanitization, and error mappings. Unit tests cover controller DTOs, policy normalization, service ordering, and repository query contracts.

## Known limitations or inconsistencies

`getUserDetail` uses direct `req.userInfo.id` access in the controller, while update endpoints use optional chaining. Missing `req.userInfo` therefore maps differently if a request bypasses middleware.

## Safe extension guidance

Before changing profile behavior, verify exact route casing, middleware order, file type differences, Cloudinary options, update projection, and user-detail sanitization.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`
- Entry point: `src/modules/auth/profile/index.js`
- Implementation:
  - `src/modules/auth/profile/profile.controller.js`
  - `src/modules/auth/profile/profile.service.js`
  - `src/modules/auth/profile/profile-picture.service.js`
  - `src/modules/auth/profile/profile.repository.js`
  - `src/modules/auth/profile/profile.policy.js`
  - `src/modules/auth/profile/profile.errors.js`
- Middleware:
  - `middleware/authMiddleware.js`
  - `middleware/verifyRoleFromDB.js`
  - `middleware/autoGenerateReferralCode.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `handlers/cloudinary.js`
- Characterization tests inspected:
  - `tests/characterization/auth-profile-picture.test.js`
  - `tests/characterization/auth-profile-update-errors.test.js`
  - `tests/characterization/auth-profile-update-success.test.js`
  - `tests/characterization/auth-user-detail-profile.test.js`
- Unit tests inspected:
  - `tests/unit/auth/profile-controller.test.js`
  - `tests/unit/auth/profile-policy.test.js`
  - `tests/unit/auth/profile-service.test.js`
  - `tests/unit/auth/profile-repository.test.js`
- Validation command: `npm run test:profile`

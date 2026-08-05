"use strict";

function formatAdminOwnerProfileResponse({
  ownerId,
  userId,
  verificationStatus,
  changedFields,
  updatedAt,
}) {
  return {
    success: true,
    message: "Bus Owner profile updated successfully.",
    data: {
      ownerId: String(ownerId),
      userId: String(userId),
      verificationStatus,
      changedFields: Array.isArray(changedFields) ? changedFields : [],
      updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
    },
  };
}

module.exports = { formatAdminOwnerProfileResponse };

"use strict";

function getKycDocumentReadActor(req) {
  if (!req || typeof req !== "object") return null;

  if (req.adminInfo && (req.adminInfo.id || req.adminInfo._id)) {
    return {
      type: "ADMIN",
      userId: String(req.adminInfo.id || req.adminInfo._id),
    };
  }

  const userObj = req.userInfo || req.user;
  if (userObj && (userObj.id || userObj._id)) {
    return {
      type: "BUS_OWNER",
      userId: String(userObj.id || userObj._id),
    };
  }

  return null;
}

module.exports = { getKycDocumentReadActor };

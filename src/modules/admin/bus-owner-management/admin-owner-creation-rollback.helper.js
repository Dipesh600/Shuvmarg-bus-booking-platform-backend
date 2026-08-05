"use strict";

async function runCreationRollback({ storageService, uploadedKeys, BusOwnerModel, busOwner, rollbackUser, commitResult, deps, logger }) {
  const logErr = (msg, err) => (logger && typeof logger.error === "function" ? logger.error(msg, err) : console.error(msg, err?.message || err));
  if (uploadedKeys && uploadedKeys.length > 0) {
    try { await storageService.deleteMany(uploadedKeys); }
    catch (e) { logErr("Admin owner creation upload rollback failed:", e); }
  }
  if (busOwner && busOwner._id) {
    try { await BusOwnerModel.findByIdAndDelete(busOwner._id); }
    catch (e) { logErr("Admin owner creation BusOwner rollback failed:", e); }
  }
  if (commitResult) {
    try { await rollbackUser(commitResult, deps); }
    catch (e) { logErr("Admin owner creation User rollback failed:", e); }
  }
}

module.exports = { runCreationRollback };

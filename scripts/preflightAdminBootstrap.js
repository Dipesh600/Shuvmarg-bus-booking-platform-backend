"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const dbConnection = require("../db/db");
const SuperAdmin = require("../models/adminModel");
const BootstrapState = require("../models/adminBootstrapStateModel");

async function inspectAdminBootstrap() {
  const [adminCount, roots, state, incomplete] = await Promise.all([
    SuperAdmin.countDocuments({}),
    SuperAdmin.find({ isRootAdmin: true })
      .select("adminId lifecycleStatus isActive twoFactorEnabled")
      .lean(),
    BootstrapState.findOne({ key: "INITIAL_ROOT_ADMIN" })
      .select("status environment completedAt")
      .lean(),
    SuperAdmin.countDocuments({
      $or: [
        { role: { $exists: false } },
        { lifecycleStatus: { $exists: false } },
        { sessionVersion: { $exists: false } },
      ],
    }),
  ]);
  const safeForInitialBootstrap = adminCount === 0 && !state && roots.length === 0;
  const validSecuredDatabase =
    adminCount > 0 &&
    roots.length === 1 &&
    state?.status === "COMPLETED" &&
    incomplete === 0;
  return {
    adminCount,
    roots,
    bootstrapState: state,
    incomplete,
    safeForInitialBootstrap,
    validSecuredDatabase,
  };
}

async function run() {
  try {
    await dbConnection();
    const report = await inspectAdminBootstrap();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode =
      report.safeForInitialBootstrap || report.validSecuredDatabase ? 0 : 2;
  } catch (error) {
    console.error(`Admin bootstrap preflight failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

module.exports = { inspectAdminBootstrap };
if (require.main === module) run();

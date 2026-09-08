"use strict";

async function withMongoTransaction(mongoose, existingSession, work) {
  if (existingSession) return work(existingSession);
  const session = await mongoose.startSession();
  try { return await session.withTransaction(() => work(session)); }
  finally { await session.endSession(); }
}

module.exports = { withMongoTransaction };

'use strict';
const mongoose = require('mongoose');

const withTransaction = async work => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
};
module.exports = { withTransaction };

"use strict";

function createSmLedgerCashbackService({
  mongoose,
  Booking,
  SMLedger,
  CashbackJob,
  ScratchCard,
  PlatformConfig,
  creditLedger,
  calculateCashbackAmount,
  selectScratchCardTheme,
  now = () => new Date(),
  warn = console.warn,
}) {
  return async function generateCashback({ userId, bookingId, baseTicketPrice }) {
    const config = await PlatformConfig.getConfig("cashback_config");
    const smConfig = await PlatformConfig.getConfig("sm_money_config");
    const amount = calculateCashbackAmount(baseTicketPrice, config);
    let theme = { name: "Default", imageKey: null };
    try {
      theme = selectScratchCardTheme(
        await PlatformConfig.getConfig("scratch_card_themes")
      );
    } catch (error) {
      warn(
        "[generateCashback] Theme selection failed, using default:",
        error.message
      );
    }
    return require("../../../shared/with-mongo-transaction").withMongoTransaction(mongoose, null, async session => {
      // This write serializes reward creation with booking cancellation and other retries.
      const booking = await Booking.findOneAndUpdate({ _id: bookingId, userId, status: "booked" },
        { $inc: { __v: 1 } }, { session, new: true });
      if (!booking) {
        const owned = await Booking.findOne({ _id: bookingId, userId }).session(session);
        if (!owned) throw new Error("Cashback booking does not belong to this user");
        await CashbackJob.updateOne({ _id: bookingId }, { $set: { status: "SKIPPED" } }, { session });
        return null;
      }
      if (booking.originalAmount !== baseTicketPrice) throw new Error("Cashback base differs from booked amount");
      const cards = await ScratchCard.find({ bookingId }).session(session);
      const credits = await SMLedger.find({ bookingId, type: "CASHBACK" }).session(session);
      if (cards.length || credits.length) {
        if (cards.length !== 1 || credits.length !== 1
          || String(cards[0].ledgerEntryId) !== String(credits[0]._id)
          || String(credits[0].userId) !== String(userId) || String(cards[0].userId) !== String(userId)
          || cards[0].amount !== credits[0].amount) throw new Error("Existing cashback requires review");
        await CashbackJob.updateOne({ _id: bookingId }, { $set: { status: "COMPLETED" } }, { session });
        return { ledgerEntry: credits[0], scratchCard: cards[0] };
      }
      const ledgerEntry = await creditLedger({
        userId,
        type: "CASHBACK",
        amount,
        bookingId,
        expiresInMonths: smConfig.creditExpiryMonths || 12,
        note: `Cashback earned on booking. Base ticket: Rs. ${baseTicketPrice}`,
        session,
      });
      const expiresAt = now();
      expiresAt.setDate(expiresAt.getDate() + (smConfig.scratchCardExpiryDays || 90));
      const scratchCard = (
        await ScratchCard.create(
          [
            {
              userId,
              bookingId,
              amount,
              status: "UNSCRATCHED",
              ledgerEntryId: ledgerEntry._id,
              expiresAt,
              themeName: theme.name,
              imageUrl: theme.imageKey,
            },
          ],
          { session }
        )
      )[0];
      await CashbackJob.updateOne({ _id: bookingId }, { $set: { status: "COMPLETED" } }, { session });
      return { ledgerEntry, scratchCard };
    });
  };
}

module.exports = { createSmLedgerCashbackService };

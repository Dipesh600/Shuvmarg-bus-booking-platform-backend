"use strict";

function createSmLedgerCashbackService({
  mongoose,
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
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
      await session.commitTransaction();
      return { ledgerEntry, scratchCard };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  };
}

module.exports = { createSmLedgerCashbackService };

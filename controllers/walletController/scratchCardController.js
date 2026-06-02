const ScratchCard = require("../../models/scratchCardModel");
const mongoose = require("mongoose");

/**
 * Get all scratch cards for a user.
 * Returns unscratched cards, and recently scratched cards (last 7 days).
 */
const getScratchCards = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const cards = await ScratchCard.find({
      userId,
      status: { $in: ["UNSCRATCHED", "SCRATCHED"] },
      $or: [
        { status: "UNSCRATCHED" },
        { status: "SCRATCHED", scratchedAt: { $gt: sevenDaysAgo } },
      ],
    })
      .populate("bookingId", "ticketId")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: true,
      data: cards,
    });
  } catch (error) {
    console.error("Error fetching scratch cards:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching scratch cards",
    });
  }
};

/**
 * Reveal a scratch card.
 * Marks the card as SCRATCHED. Note: the actual money was already credited
 * to the user's ledger when the booking was confirmed. This is a visual reveal.
 */
const scratchCard = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { cardId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({
        status: false,
        message: "Invalid scratch card ID",
      });
    }

    const card = await ScratchCard.findOne({ _id: cardId, userId });

    if (!card) {
      return res.status(404).json({
        status: false,
        message: "Scratch card not found",
      });
    }

    if (card.status === "SCRATCHED") {
      return res.status(400).json({
        status: false,
        message: "Scratch card has already been scratched",
        data: card,
      });
    }

    if (card.status === "EXPIRED" || card.status === "CLAWED_BACK") {
      return res.status(400).json({
        status: false,
        message: `Scratch card cannot be scratched because its status is ${card.status}`,
      });
    }

    if (new Date() > card.expiresAt) {
      card.status = "EXPIRED";
      await card.save();
      return res.status(400).json({
        status: false,
        message: "Scratch card has expired",
      });
    }

    card.status = "SCRATCHED";
    card.scratchedAt = new Date();
    await card.save();

    return res.status(200).json({
      status: true,
      message: "Card scratched successfully",
      data: card,
    });
  } catch (error) {
    console.error("Error scratching card:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error while scratching card",
    });
  }
};

module.exports = {
  getScratchCards,
  scratchCard,
};

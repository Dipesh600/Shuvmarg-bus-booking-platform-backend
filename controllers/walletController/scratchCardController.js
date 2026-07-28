const ScratchCard = require("../../models/scratchCardModel");
const mongoose = require("mongoose");
const { getPresignedUrl } = require("../../services/s3Service");

/**
 * Get all scratch cards for a user.
 * Returns unscratched cards, and recently scratched cards (last 7 days).
 * Resolves S3 image keys to presigned URLs for mobile rendering.
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

    // Resolve S3 image keys to presigned URLs (non-fatal per card)
    const enriched = await Promise.all(
      cards.map(async (card) => {
        if (card.imageUrl && !card.imageUrl.startsWith("http")) {
          try {
            card.imageUrl = await getPresignedUrl(card.imageUrl);
          } catch (_) {
            // S3 key invalid or deleted — mobile app will fallback to solid color
            card.imageUrl = null;
          }
        }
        return card;
      })
    );

    return res.status(200).json({
      status: true,
      data: enriched,
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

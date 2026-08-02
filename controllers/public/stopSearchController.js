"use strict";

const Stop = require("../../models/stopModel");
const { shapeStopSearchResult, escapeSearchRegex } = require("./stop-search-response");

const searchStops = async (req, res) => {
  try {
    const rawQuery = (req.query.q || "").trim();
    const limit = Math.min(10, parseInt(req.query.limit) || 8);

    if (rawQuery.length < 2) {
      const popular = await Stop.find({ status: "ACTIVE", isSearchable: true, verificationStatus: "VERIFIED" })
        .populate("parentStopId", "id name")
        .sort({ type: 1 })
        .limit(limit)
        .select("_id name code type province municipality district parentStopId")
        .lean();

      return res.status(200).json({ success: true, data: popular.map(shapeStopSearchResult) });
    }

    const textResults = await Stop.find(
      { $text: { $search: rawQuery }, status: "ACTIVE", isSearchable: true, verificationStatus: "VERIFIED" },
      { score: { $meta: "textScore" } }
    )
      .populate("parentStopId", "id name")
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .select("_id name code type province municipality district parentStopId")
      .lean();

    const prefixResults = await Stop.find({
      $or: [
        { name: { $regex: `^${escapeSearchRegex(rawQuery)}`, $options: "i" } },
        { code: { $regex: `^${escapeSearchRegex(rawQuery)}`, $options: "i" } },
        { aliases: { $regex: `^${escapeSearchRegex(rawQuery)}`, $options: "i" } }
      ],
      status: "ACTIVE",
      isSearchable: true,
      verificationStatus: "VERIFIED"
    })
      .populate("parentStopId", "id name")
      .limit(limit)
      .select("_id name code type province municipality district parentStopId")
      .lean();

    const seen = new Set();
    const merged = [];
    for (const stop of [...textResults, ...prefixResults]) {
      const id = stop._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(stop);
      }
      if (merged.length >= limit) break;
    }

    return res.status(200).json({ success: true, data: merged.map(shapeStopSearchResult) });
  } catch (err) {
    console.error("stopSearch error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const getPopularStops = async (req, res) => {
  try {
    const limit = Math.min(10, parseInt(req.query.limit) || 8);

    const stops = await Stop.find({ status: "ACTIVE", isSearchable: true, verificationStatus: "VERIFIED" })
      .populate("parentStopId", "id name")
      .sort({ popularityScore: -1, type: 1 })
      .limit(limit)
      .select("_id name code type province municipality district parentStopId")
      .lean();

    return res.status(200).json({ success: true, data: stops.map(shapeStopSearchResult) });
  } catch (err) {
    console.error("getPopularStops error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const recordStopSelection = async (req, res) => {
  res.status(204).end();

  try {
    const { stopId } = req.body;
    if (!stopId) return;

    const stop = await Stop.findByIdAndUpdate(
      stopId,
      { $inc: { selectionCount: 1, recentSelectionCount: 1 } },
      { new: true, select: "selectionCount recentSelectionCount" }
    ).lean();

    if (!stop) return;

    const score = stop.recentSelectionCount * 2 + stop.selectionCount * 0.2;
    await Stop.updateOne({ _id: stopId }, { $set: { popularityScore: score } });
  } catch (err) {
    console.error("recordStopSelection error:", err);
  }
};

module.exports = { searchStops, getPopularStops, recordStopSelection };

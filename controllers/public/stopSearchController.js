const Stop = require("../../models/stopModel");

/**
 * GET /api/public/stops/search?q=<query>&limit=<n>
 *
 * Production-grade stop autocomplete for the booking search bar.
 * Strategy:
 *   1. query >= 2 chars → text index search + prefix fallback, merged & deduped
 *   2. query < 2 chars  → return top CITY-type stops (fallback when no query)
 */
const searchStops = async (req, res) => {
  try {
    const rawQuery = (req.query.q || "").trim();
    const limit = Math.min(10, parseInt(req.query.limit) || 8);

    if (rawQuery.length < 2) {
      const popular = await Stop.find({ status: "ACTIVE", isSearchable: true, verificationStatus: "VERIFIED" })
        .populate("parentStopId", "id name")
        .sort({ type: 1 })
        .limit(limit)
        .select("_id name code type state municipality district parentStopId")
        .lean();

      return res.status(200).json({ success: true, data: popular.map(_shape) });
    }

    // Strategy A: MongoDB $text search (relevance ranked)
    const textResults = await Stop.find(
      { $text: { $search: rawQuery }, status: "ACTIVE", isSearchable: true, verificationStatus: "VERIFIED" },
      { score: { $meta: "textScore" } }
    )
      .populate("parentStopId", "id name")
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .select("_id name code type state municipality district parentStopId")
      .lean();

    // Strategy B: Prefix regex — catches partial matches $text misses
    const prefixResults = await Stop.find({
      name: { $regex: `^${_escapeRegex(rawQuery)}`, $options: "i" },
      status: "ACTIVE",
      isSearchable: true,
      verificationStatus: "VERIFIED"
    })
      .populate("parentStopId", "id name")
      .limit(limit)
      .select("_id name code type state municipality district parentStopId")
      .lean();

    // Merge & deduplicate, text-ranked first
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

    return res.status(200).json({ success: true, data: merged.map(_shape) });
  } catch (err) {
    console.error("stopSearch error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * GET /api/public/stops/popular?limit=<n>
 *
 * Returns top N stops ranked by popularityScore (trend-weighted).
 * Cached by the frontend for 24 h — this endpoint fires rarely.
 *
 * popularityScore = (recentSelectionCount × 2) + (selectionCount × 0.2)
 * Falls back to CITY-type ordering for fresh deployments (all scores = 0).
 */
const getPopularStops = async (req, res) => {
  try {
    const limit = Math.min(10, parseInt(req.query.limit) || 8);

    const stops = await Stop.find({ status: "ACTIVE", isSearchable: true, verificationStatus: "VERIFIED" })
      .populate("parentStopId", "id name")
      .sort({ popularityScore: -1, type: 1 })
      .limit(limit)
      .select("_id name code type state municipality district parentStopId")
      .lean();

    return res.status(200).json({ success: true, data: stops.map(_shape) });
  } catch (err) {
    console.error("getPopularStops error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * POST /api/public/stops/select
 * Body: { stopId: "<mongo id>" }
 *
 * Fire-and-forget popularity increment.
 * Responds 204 immediately; DB update runs async.
 * Called only when the user CONFIRMS a stop selection — not on search or hover.
 */
const recordStopSelection = async (req, res) => {
  // Respond immediately — popularity tracking is non-blocking
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

    // Recompute trend-aware popularity score inline
    const score = stop.recentSelectionCount * 2 + stop.selectionCount * 0.2;
    await Stop.updateOne({ _id: stopId }, { $set: { popularityScore: score } });
  } catch (err) {
    console.error("recordStopSelection error:", err);
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function _shape(stop) {
  return {
    id: stop._id,
    name: stop.name,
    code: stop.code,
    type: stop.type,
    state: stop.state || null,
    municipality: stop.municipality || null,
    district: stop.district || null,
    parentStop: stop.parentStopId ? {
      id: stop.parentStopId._id,
      name: stop.parentStopId.name
    } : null,
  };
}

function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { searchStops, getPopularStops, recordStopSelection };

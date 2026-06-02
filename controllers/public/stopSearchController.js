const Stop = require("../../models/stopModel");

/**
 * GET /api/public/stops/search?q=<query>&limit=<n>
 *
 * Production-grade stop autocomplete for the booking search bar.
 *
 * Strategy:
 *   1. If query >= 2 chars  → MongoDB text index search (fast, ranked by score)
 *   2. If query < 2 chars   → Return top-N popular/major stops (CITY type first)
 *   3. Always filter status = ACTIVE
 *   4. Results are shaped to the minimal payload the UI needs — no over-fetching.
 *
 * The text index on Stop is: { name: "text", code: 1 }
 * This means both full-name matches ("Kathmandu") and short-code matches ("KTM")
 * will rank correctly.
 */
const searchStops = async (req, res) => {
  try {
    const rawQuery = (req.query.q || "").trim();
    const limit = Math.min(10, parseInt(req.query.limit) || 8);

    // ── Case 1: No query — return default popular stops ──────────────────────
    if (rawQuery.length < 2) {
      const popular = await Stop.find({ status: "ACTIVE" })
        .sort({ type: 1 }) // CITY < JUNCTION < TOWN < BORDER alphabetically
        .limit(limit)
        .select("_id name code type state")
        .lean();

      return res.status(200).json({
        success: true,
        data: popular.map(_shape),
      });
    }

    // ── Case 2: Query present — text index search + prefix fallback ───────────
    // We run both strategies and merge, deduplicating by _id.
    // Strategy A: MongoDB $text search (ranks by relevance score)
    const textResults = await Stop.find(
      { $text: { $search: rawQuery }, status: "ACTIVE" },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .select("_id name code type state")
      .lean();

    // Strategy B: Prefix regex on name — catches partial matches $text misses
    // e.g., "Bira" matches "Biratnagar" even without a full word boundary
    const prefixResults = await Stop.find({
      name: { $regex: `^${_escapeRegex(rawQuery)}`, $options: "i" },
      status: "ACTIVE",
    })
      .limit(limit)
      .select("_id name code type state")
      .lean();

    // Merge, deduplicate, keep text-ranked results first
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

    return res.status(200).json({
      success: true,
      data: merged.map(_shape),
    });
  } catch (err) {
    console.error("stopSearch error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shape a raw Stop document into the minimal UI payload.
 * Keeping the payload tiny is important for autocomplete latency.
 */
function _shape(stop) {
  return {
    id: stop._id,
    name: stop.name,
    code: stop.code,
    type: stop.type,      // CITY | JUNCTION | TOWN | BORDER — drives the icon in Flutter
    state: stop.state || null,
  };
}

/**
 * Escape special regex characters in user input to prevent injection.
 * Production requirement — never pass raw user strings into RegExp.
 */
function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { searchStops };

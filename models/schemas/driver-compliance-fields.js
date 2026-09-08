"use strict";
module.exports = {
        // ─── COMPLIANCE DOCUMENTS (structured) ───────────────────────────────
        // Mirrors the fleetDocuments structure for consistent admin review
        documents: {
            license: {
                url:       { type: String, default: null },
                validTill: { type: Date,   default: null },
            },
            medical: {
                url:       { type: String, default: null },
                validTill: { type: Date,   default: null },
            },
            // Police clearance certificate — required for some intercity routes
            policeReport: {
                url:       { type: String, default: null },
                validTill: { type: Date,   default: null },
            },
        },

};

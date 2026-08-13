const FleetSeatLayoutAssignment = require("../models/fleetSeatLayoutAssignmentModel.js");
const SeatLayoutRevision = require("../models/seatLayoutRevisionModel.js");

async function buildCompatibilitySeatsFromV3(fleetId) {
    const assignment = await FleetSeatLayoutAssignment.findOne({ fleetId })
        .select("activeRevisionId").lean();
    if (!assignment?.activeRevisionId) return null;
    const revision = await SeatLayoutRevision.findById(assignment.activeRevisionId)
        .select("layout status").lean();
    if (!revision?.layout?.sections?.length || revision.status !== "PUBLISHED") return null;
    const result = { seata: [], seatb: [], seatc: [] };
    for (const section of [...revision.layout.sections].sort((a, b) => a.order - b.order)) {
        for (const place of [...section.elements]
            .filter((item) => ["SEAT", "BERTH"].includes(item.kind) && item.label)
            .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)) {
            const center = place.position.x + (place.size.width / 2);
            const bucket = center < section.widthUnits / 2 ? "seata"
                : center > section.widthUnits / 2 ? "seatb" : "seatc";
            result[bucket].push({ seatNo: place.label, booked: false });
        }
    }
    return result;
}

module.exports = { buildCompatibilitySeatsFromV3 };

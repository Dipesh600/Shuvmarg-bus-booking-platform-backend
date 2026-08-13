"use strict";

function passenger(id, kind, label, x, y, width = 1, height = 1) {
  return { elementId: id, kind, label, position: { x, y }, size: { width, height }, attributes: { comfort: "STANDARD", commercialClass: "STANDARD", accessible: false } };
}
function seats(prefix, rows, columns) { let count = 0; return Array.from({ length: rows }, (_, y) => columns.map((x) => passenger(`${prefix}-${++count}`, "SEAT", `${prefix}${count}`, x, y))).flat(); }
function berths(prefix, rows, columns) { let count = 0; return Array.from({ length: rows }, (_, row) => columns.map((x) => passenger(`${prefix}-${++count}`, "BERTH", `${prefix}${count}`, x, row * 2, 1, 2))).flat(); }
const section = (sectionId, name, role, order, widthUnits, heightUnits, elements) => ({ sectionId, name, role, order, widthUnits, heightUnits, elements });
const layout = (vehicleCategory, sections) => ({ schemaVersion: 3, vehicleCategory, sections });

const PLATFORM_SEAT_LAYOUT_PRESETS = [
  { templateCode: "BUS-STANDARD-2X2", name: "Standard bus · 2 + 2 seats", layout: layout("BUS", [section("lower", "Passenger cabin", "LOWER_CABIN", 0, 5, 8, seats("S", 8, [0, 1, 3, 4]))]) },
  { templateCode: "BUS-DELUXE-2X1", name: "Deluxe bus · 2 + 1 seats", layout: layout("BUS", [section("lower", "Passenger cabin", "LOWER_CABIN", 0, 4, 7, seats("D", 7, [0, 1, 3]))]) },
  { templateCode: "MINIBUS-STANDARD", name: "Mini bus", layout: layout("MINIBUS", [section("mini", "Passenger cabin", "LOWER_CABIN", 0, 4, 4, seats("M", 4, [0, 1, 3]))]) },
  { templateCode: "BUS-FULL-SLEEPER", name: "Full sleeper", layout: layout("BUS", [section("lower-berths", "Lower berths", "LOWER_BERTH_LEVEL", 0, 4, 6, berths("LB", 3, [0, 2])), section("upper-berths", "Upper berths", "UPPER_BERTH_LEVEL", 1, 4, 6, berths("UB", 3, [0, 2]))]) },
  { templateCode: "BUS-MIXED", name: "Seats and sleeper berths", layout: layout("BUS", [section("mixed", "Mixed cabin", "LOWER_CABIN", 0, 5, 7, [...seats("MX", 3, [0, 1, 3, 4]), passenger("MX-B1", "BERTH", "MB1", 0, 4, 1, 2), passenger("MX-B2", "BERTH", "MB2", 3, 4, 1, 2)])]) },
  { templateCode: "BUS-DOUBLE-LEVEL", name: "Lower seats and upper sleeper berths", layout: layout("BUS", [section("lower", "Lower seats", "LOWER_CABIN", 0, 5, 7, seats("L", 7, [0, 1, 3, 4])), section("upper", "Upper berths", "UPPER_BERTH_LEVEL", 1, 4, 6, berths("U", 3, [0, 2]))]) },
];

module.exports = { PLATFORM_SEAT_LAYOUT_PRESETS };

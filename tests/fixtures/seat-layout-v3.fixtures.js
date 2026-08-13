"use strict";

function passenger(id, kind, label, x, y, width = 1, height = 1, attributes = {}) {
  return {
    elementId: id, kind, label, position: { x, y }, size: { width, height },
    attributes: {
      comfort: attributes.comfort || "STANDARD",
      commercialClass: attributes.commercialClass || "STANDARD",
      accessible: attributes.accessible === true,
    },
  };
}

function seatRows(prefix, rows, columns) {
  let count = 0;
  return Array.from({ length: rows }, (_, y) => columns.map((x) => {
    count += 1;
    return passenger(`${prefix}-${count}`, "SEAT", `${prefix}${count}`, x, y);
  })).flat();
}

function berthRows(prefix, rows, columns) {
  let count = 0;
  return Array.from({ length: rows }, (_, index) => columns.map((x) => {
    count += 1;
    return passenger(`${prefix}-${count}`, "BERTH", `${prefix}${count}`, x, index * 2, 1, 2);
  })).flat();
}

function section(sectionId, name, role, order, widthUnits, heightUnits, elements) {
  return { sectionId, name, role, order, widthUnits, heightUnits, elements };
}

function layout(vehicleCategory, sections) {
  return { schemaVersion: 3, vehicleCategory, sections };
}

const standard2x2 = () => layout("BUS", [
  section("lower", "Lower cabin", "LOWER_CABIN", 0, 5, 8, seatRows("S", 8, [0, 1, 3, 4])),
]);

const deluxe2x1 = () => layout("BUS", [
  section("lower", "Lower cabin", "LOWER_CABIN", 0, 4, 7, seatRows("D", 7, [0, 1, 3])),
]);

const miniBus = () => layout("MINIBUS", [
  section("mini", "Passenger cabin", "LOWER_CABIN", 0, 4, 4, seatRows("M", 4, [0, 1, 3])),
]);

const fullSleeper = () => layout("BUS", [
  section("lower-berths", "Lower berths", "LOWER_BERTH_LEVEL", 0, 4, 6, berthRows("LB", 3, [0, 2])),
  section("upper-berths", "Upper berths", "UPPER_BERTH_LEVEL", 1, 4, 6, berthRows("UB", 3, [0, 2])),
]);

const mixedSeaterSleeper = () => layout("BUS", [
  section("mixed", "Mixed cabin", "LOWER_CABIN", 0, 5, 7, [
    ...seatRows("MX", 3, [0, 1, 3, 4]),
    passenger("MX-B1", "BERTH", "MB1", 0, 4, 1, 2),
    passenger("MX-B2", "BERTH", "MB2", 3, 4, 1, 2),
  ]),
]);

const seaterWithUpperBerths = () => layout("BUS", [
  section("lower", "Lower cabin", "LOWER_CABIN", 0, 5, 7, seatRows("L", 7, [0, 1, 3, 4])),
  section("upper", "Upper berths", "UPPER_BERTH_LEVEL", 1, 4, 6, berthRows("U", 3, [0, 2])),
]);

module.exports = {
  passenger, section, layout, standard2x2, deluxe2x1, miniBus,
  fullSleeper, mixedSeaterSleeper, seaterWithUpperBerths,
};

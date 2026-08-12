"use strict";

function projectLegacySeatArrays(seatConfig) {
  const groups = { seata: [], seatb: [], seatc: [] };
  for (const floor of seatConfig.floors || []) {
    for (const row of floor.rows || []) {
      for (const cell of row.cells || []) {
        if (cell.cellType !== "SEAT" || !cell.seatLabel) continue;
        let seatClass = "window";
        if (cell.seatType === "SLEEPER_LOWER") seatClass = "lower";
        else if (cell.seatType === "SLEEPER_UPPER") seatClass = "upper";
        else if (cell.seatType === "SEMI_SLEEPER") seatClass = "sleeper";
        else if ((cell.colIndex ?? 0) === 1 || cell.colIndex === 3) seatClass = "aisle";
        const entry = {
          seatNo: cell.seatLabel,
          booked: false,
          seatClass,
        };
        if ((cell.colIndex ?? 0) <= 1) groups.seata.push(entry);
        else if (cell.colIndex >= 3) groups.seatb.push(entry);
        else groups.seatc.push(entry);
      }
    }
  }
  return groups;
}

module.exports = { projectLegacySeatArrays };

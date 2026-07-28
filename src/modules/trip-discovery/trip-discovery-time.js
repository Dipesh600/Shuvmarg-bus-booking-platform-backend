function timeToMins(time) {
  if (!time || typeof time !== "string") return 0;
  const t = time.trim().toUpperCase();

  // 12-hour format: "05:20 PM" / "12:00 AM"
  const match12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const period = match12[3];
    if (period === "AM") {
      if (h === 12) h = 0;       // 12:xx AM → 00:xx
    } else {
      if (h !== 12) h += 12;    // x:xx PM → (x+12):xx, but 12:xx PM stays 12
    }
    return h * 60 + m;
  }

  // 24-hour format: "17:20"
  const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
  }

  return 0; // unparseable — treated as midnight
}

module.exports = {
  timeToMins
};

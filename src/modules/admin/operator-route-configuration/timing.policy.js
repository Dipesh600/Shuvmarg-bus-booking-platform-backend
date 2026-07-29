"use strict";

function to12hMinutes(time) {
  if (!time || typeof time !== "string") return -1;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const isPm = match[3].toUpperCase() === "PM";
  if (hours === 12) hours = 0;
  return (hours + (isPm ? 12 : 0)) * 60 + minutes;
}

function fromMinutes(totalMinutes) {
  const minutes = totalMinutes % 60;
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const isPm = hours24 >= 12;
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return `${String(hours12).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")} ${isPm ? "PM" : "AM"}`;
}

function recomputeTimingArray(entries) {
  if (!entries || entries.length === 0) return entries;
  let currentDay = 0;
  let previousMinutes = -1;
  return entries.map((timing, index) => {
    const arrival = (timing.estimatedArrival || "").trim();
    const halt = typeof timing.haltDuration === "number"
      ? timing.haltDuration : 5;
    if (index === 0) {
      const departure = to12hMinutes(
        (timing.estimatedDeparture || "").trim()
      );
      if (departure >= 0) previousMinutes = departure;
      return { ...timing, dayOffset: 0 };
    }
    const arrivalMinutes = to12hMinutes(arrival);
    if (
      arrival && arrivalMinutes >= 0 &&
      previousMinutes >= 0 && arrivalMinutes < previousMinutes
    ) {
      currentDay += 1;
    }
    if (index === entries.length - 1) {
      if (arrival && arrivalMinutes >= 0) previousMinutes = arrivalMinutes;
      return {
        ...timing, estimatedDeparture: "", dayOffset: currentDay,
      };
    }
    if (!arrival || arrivalMinutes < 0) {
      return { ...timing, dayOffset: currentDay };
    }
    const rawDeparture = arrivalMinutes + halt;
    const departure = rawDeparture % 1440;
    if (rawDeparture >= 1440) currentDay += 1;
    previousMinutes = departure;
    return {
      ...timing,
      estimatedDeparture: fromMinutes(departure),
      dayOffset: currentDay,
    };
  });
}

module.exports = { recomputeTimingArray };

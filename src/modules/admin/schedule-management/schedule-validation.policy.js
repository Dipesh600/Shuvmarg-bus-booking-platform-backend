"use strict";

const isValidTime = (value) => /^\d{2}:\d{2}$/.test(value);

const validateRecurrence = (recurrence, daysOfWeek) => {
  if (recurrence === "DAILY") return;
  if (["WEEKLY", "CUSTOM"].includes(recurrence)) {
    if (!daysOfWeek?.length) {
      throw new Error(
        `daysOfWeek is required when recurrence is "${recurrence}". ` +
          "Provide an array of 0–6 (Sun–Sat)."
      );
    }
    if (daysOfWeek.some((day) => day < 0 || day > 6)) {
      throw new Error("daysOfWeek must contain values 0–6 only.");
    }
  }
};

const validateCreation = (data) => {
  const required = [
    ["brandId", "brandId is required."],
    ["busId", "busId is required."],
    ["departureTime", "departureTime is required (HH:MM)."],
    ["arrivalTime", "arrivalTime is required (HH:MM)."],
    ["shift", "shift is required (day/night)."],
    ["recurrence", "recurrence is required (DAILY/WEEKLY/CUSTOM)."],
    ["effectiveFrom", "effectiveFrom is required."],
  ];
  for (const [field, message] of required) {
    if (!data[field]) throw new Error(message);
  }
  if (!isValidTime(data.departureTime)) {
    throw new Error("departureTime must be in HH:MM format.");
  }
  if (!isValidTime(data.arrivalTime)) {
    throw new Error("arrivalTime must be in HH:MM format.");
  }
  validateRecurrence(data.recurrence, data.daysOfWeek);
  if (
    data.effectiveUntil &&
    new Date(data.effectiveUntil) <= new Date(data.effectiveFrom)
  ) {
    throw new Error("effectiveUntil must be after effectiveFrom.");
  }
};

module.exports = { isValidTime, validateRecurrence, validateCreation };

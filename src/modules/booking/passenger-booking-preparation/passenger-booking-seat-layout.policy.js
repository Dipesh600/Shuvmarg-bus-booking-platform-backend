function calculateSeatLayoutOriginalAmount(layoutPricing, requestedLabels) {
  if (!layoutPricing?.snapshot) return null;
  const { snapshot, control } = layoutPricing;
  const elements = (snapshot.layout?.sections || [])
    .flatMap((section) => section.elements || [])
    .filter((element) => element.kind === "SEAT" || element.kind === "BERTH");
  const byLabel = new Map(elements.map((element) => [
    String(element.label || "").trim().toLowerCase(), element,
  ]));
  const stateOverrides = new Map((control?.stateOverrides || []).map((item) => [item.elementId, item.state]));
  const fareOverrides = new Map((control?.fareOverrides?.length
    ? control.fareOverrides
    : snapshot.pricing?.overrides || []).map((item) => [item.elementId, item.fare]));
  const defaultFare = control?.defaultFareOverride ?? snapshot.pricing?.defaultFare;

  let originalAmount = 0;
  for (const requestedLabel of requestedLabels) {
    const element = byLabel.get(String(requestedLabel).trim().toLowerCase());
    if (!element) {
      return {
        isValid: false, statusCode: 400,
        responseBody: {
          success: false, message: `Invalid seat: ${requestedLabel}`,
          errorCode: "INVALID_SEAT_SELECTION",
        },
      };
    }
    const state = stateOverrides.get(element.elementId)
      ?? snapshot.placeStates?.find((item) => item.elementId === element.elementId)?.state
      ?? "OPEN";
    if (state !== "OPEN") {
      return {
        isValid: false, statusCode: 409,
        responseBody: {
          success: false, message: `Seat ${requestedLabel} is unavailable.`,
          errorCode: "SEAT_UNAVAILABLE",
        },
      };
    }
    const fare = fareOverrides.get(element.elementId) ?? defaultFare;
    if (!Number.isFinite(fare) || fare <= 0) {
      return {
        isValid: false, statusCode: 409,
        responseBody: {
          success: false, message: `A valid fare is not configured for seat ${requestedLabel}.`,
          errorCode: "TRIP_FARE_UNAVAILABLE",
        },
      };
    }
    originalAmount += fare;
  }
  return { isValid: true, originalAmount };
}

module.exports = { calculateSeatLayoutOriginalAmount };

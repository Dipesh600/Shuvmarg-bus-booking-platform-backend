function createStopSelectionResolver({ repository }) {
  async function resolveStopScope(stopId) {
    if (!repository.isValidObjectId(stopId)) {
      const error = new Error("Invalid stop selection ID format.");
      error.errorCode = "INVALID_STOP_SELECTION";
      error.status = 400;
      throw error;
    }

    const stop = await repository.findStopById(stopId);

    if (!stop) {
      const error = new Error("The selected origin or destination stop was not found.");
      error.errorCode = "STOP_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    if (stop.status !== "ACTIVE") {
      const error = new Error("The selected stop is inactive.");
      error.errorCode = "STOP_NOT_SEARCHABLE";
      error.status = 400;
      throw error;
    }

    if (stop.verificationStatus !== "VERIFIED") {
      const error = new Error("The selected stop is unverified.");
      error.errorCode = "STOP_NOT_SEARCHABLE";
      error.status = 400;
      throw error;
    }

    if (stop.isSearchable === false) {
      const error = new Error("The selected stop is not available for search.");
      error.errorCode = "STOP_NOT_SEARCHABLE";
      error.status = 400;
      throw error;
    }

    let matchingStopIds = [stop._id];

    if (!stop.parentStopId) {
      const children = await repository.findChildStops(stop._id);
      if (children && children.length > 0) {
        matchingStopIds = [stop._id, ...children.map(c => c._id)];
      }
    }

    return {
      selectedStop: stop,
      matchingStopIds,
      canonicalName: stop.name,
      code: stop.code || "",
      metadata: {
        id: stop._id.toString(),
        code: stop.code || "",
        name: stop.name,
        municipality: stop.municipality || null,
        district: stop.district || null,
        province: stop.province || null,
      },
    };
  }

  async function resolveStopSelection({ fromStopId, toStopId, from, to }) {
    const hasFromId = Boolean(fromStopId);
    const hasToId = Boolean(toStopId);

    if (hasFromId !== hasToId) {
      const error = new Error("Both origin and destination stops must be specified when searching by stop ID.");
      error.errorCode = "INVALID_STOP_SELECTION";
      error.status = 400;
      throw error;
    }

    if (!hasFromId && !hasToId) {
      return { isIdentityMode: false };
    }

    if (fromStopId === toStopId) {
      const error = new Error("Origin and destination stops cannot be identical.");
      error.errorCode = "SAME_STOP_SELECTION";
      error.status = 400;
      throw error;
    }

    const [fromScope, toScope] = await Promise.all([
      resolveStopScope(fromStopId),
      resolveStopScope(toStopId),
    ]);

    return {
      isIdentityMode: true,
      fromScope,
      toScope,
    };
  }

  return { resolveStopScope, resolveStopSelection };
}

module.exports = {
  createStopSelectionResolver,
};

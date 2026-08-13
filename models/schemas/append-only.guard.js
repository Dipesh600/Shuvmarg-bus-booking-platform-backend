"use strict";

const DELETE_OPERATIONS = ["deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove"];
const UPDATE_OPERATIONS = ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"];

function lifecycleError(entity, operation) {
  const error = new Error(`${entity} is append-only and cannot be ${operation}.`);
  error.code = "APPEND_ONLY_RECORD";
  return error;
}

function preventDeletes(schema, entity) {
  schema.pre(DELETE_OPERATIONS, function rejectDelete() {
    throw lifecycleError(entity, "deleted");
  });
}

function makeAppendOnly(schema, entity) {
  preventDeletes(schema, entity);
  schema.pre(UPDATE_OPERATIONS, function rejectUpdate() {
    throw lifecycleError(entity, "updated");
  });
  schema.pre("save", function rejectExistingSave() {
    if (!this.isNew) throw lifecycleError(entity, "updated");
  });
}

module.exports = { preventDeletes, makeAppendOnly, lifecycleError };

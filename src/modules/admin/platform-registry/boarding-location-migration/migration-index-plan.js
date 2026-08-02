"use strict";

const BoardingLocation = require(
  "../../../../../models/boardingLocationModel.js"
);
const Assignment = require(
  "../../../../../models/operatorBoardingAssignmentModel.js"
);

const MODELS = [BoardingLocation, Assignment];

function defaultIndexName(key) {
  return Object.entries(key).map(([field, order]) => `${field}_${order}`).join("_");
}

async function currentIndexes(Model) {
  try {
    return await Model.collection.indexes();
  } catch (error) {
    if (error.code === 26 || error.codeName === "NamespaceNotFound") return [];
    throw error;
  }
}

function expectedIndexes(Model) {
  return Model.schema.indexes().map(([key, options]) => ({
    modelName: Model.modelName,
    key,
    options,
    name: options.name || defaultIndexName(key),
  }));
}

function sameIndex(expected, actual) {
  const textIndex = Object.values(expected.key).includes("text");
  const keyMatches = textIndex ||
    JSON.stringify(expected.key) === JSON.stringify(actual.key);
  return keyMatches && Boolean(expected.options.unique) === Boolean(actual.unique) &&
    JSON.stringify(expected.options.partialFilterExpression || null) ===
      JSON.stringify(actual.partialFilterExpression || null);
}

async function buildBoardingLocationIndexPlan() {
  const missing = [];
  const invalid = [];
  const correct = [];
  for (const Model of MODELS) {
    const existing = await currentIndexes(Model);
    const byName = new Map(existing.map((index) => [index.name, index]));
    for (const expected of expectedIndexes(Model)) {
      const actual = byName.get(expected.name);
      if (!actual) missing.push(expected);
      else if (sameIndex(expected, actual)) correct.push(expected.name);
      else invalid.push({ modelName: Model.modelName, expected, actual });
    }
  }
  return { missing, invalid, correct };
}

module.exports = { buildBoardingLocationIndexPlan, MODELS };

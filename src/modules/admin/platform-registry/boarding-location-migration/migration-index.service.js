"use strict";

const {
  buildBoardingLocationIndexPlan,
  MODELS,
} = require("./migration-index-plan.js");

async function applyBoardingLocationIndexes(indexPlan) {
  if (indexPlan.invalid.length > 0) {
    throw new Error("Existing boarding-location indexes have invalid definitions.");
  }
  const models = new Map(MODELS.map((Model) => [Model.modelName, Model]));
  const created = [];
  for (const index of indexPlan.missing) {
    const Model = models.get(index.modelName);
    const name = await Model.collection.createIndex(index.key, index.options);
    created.push({ modelName: index.modelName, name });
  }
  return { created, alreadyCorrect: indexPlan.correct };
}

async function verifyBoardingLocationIndexes() {
  const plan = await buildBoardingLocationIndexPlan();
  return {
    passed: plan.missing.length === 0 && plan.invalid.length === 0,
    missing: plan.missing.map((index) => ({
      modelName: index.modelName, name: index.name,
    })),
    invalid: plan.invalid,
  };
}

module.exports = {
  applyBoardingLocationIndexes, verifyBoardingLocationIndexes,
};

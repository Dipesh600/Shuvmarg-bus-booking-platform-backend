"use strict";

async function applyIndexPlan(collection, plan) {
  if (!plan || !plan.ok) {
    throw new Error(
      "applyIndexPlan called with an invalid plan. Call buildIndexPlan and check plan.ok === true before applying."
    );
  }

  const removed = [];
  const created = [];

  for (const indexName of plan.indexesToRemove) {
    await collection.dropIndex(indexName);
    removed.push(indexName);
  }

  for (const indexDef of plan.indexesToCreate) {
    await collection.createIndex(indexDef.key, indexDef.options);
    created.push(indexDef.name);
  }

  return {
    removed,
    created,
    alreadyCorrect: plan.indexesAlreadyCorrect,
    preserved: plan.preservedIndexes ? plan.preservedIndexes.map((i) => i.name) : [],
  };
}

module.exports = { applyIndexPlan };

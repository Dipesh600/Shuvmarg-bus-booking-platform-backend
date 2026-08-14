"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const Template = require("../models/seatLayoutTemplateModel");
const Revision = require("../models/seatLayoutRevisionModel");
const { PLATFORM_SEAT_LAYOUT_PRESETS } = require("../src/domain/seat-layout-v3/platform-seat-layout-presets");

const SYSTEM_ACTOR_ID = new mongoose.Types.ObjectId("000000000000000000000001");

async function seedPreset(preset) {
  const template = await Template.findOneAndUpdate(
    { templateCode: preset.templateCode },
    { $setOnInsert: { name: preset.name, scope: "PLATFORM", ownerId: null, sourceTemplateId: null, vehicleCategory: preset.layout.vehicleCategory, status: "ACTIVE", revisionCounter: 0, createdByType: "SYSTEM", createdById: SYSTEM_ACTOR_ID } },
    { new: true, upsert: true, runValidators: true }
  );
  if (template.currentPublishedRevisionId) return "unchanged";
  const existing = await Revision.findOne({ templateId: template._id, status: "PUBLISHED" });
  if (existing) { await Template.updateOne({ _id: template._id, currentPublishedRevisionId: null }, { $set: { currentPublishedRevisionId: existing._id } }); return "repaired"; }
  const allocated = await Template.findOneAndUpdate({ _id: template._id, currentPublishedRevisionId: null }, { $inc: { revisionCounter: 1 } }, { new: true, projection: { revisionCounter: 1 } });
  if (!allocated) return "unchanged";
  const revision = await Revision.create({ templateId: template._id, revisionNumber: allocated.revisionCounter, status: "PUBLISHED", layout: preset.layout, physicalFingerprint: "pending-validation", totalPlaces: 1, changeSummary: "Initial Shuvmarg platform preset", createdByType: "SYSTEM", createdById: SYSTEM_ACTOR_ID, publishedAt: new Date(), publishedById: SYSTEM_ACTOR_ID });
  await Template.updateOne({ _id: template._id, currentPublishedRevisionId: null }, { $set: { currentPublishedRevisionId: revision._id } });
  return "created";
}

async function main() {
  const uri = process.env.MONGODB_URL;
  if (!uri) throw new Error("MONGODB_URL is required.");
  await mongoose.connect(uri);
  const results = { created: 0, repaired: 0, unchanged: 0 };
  try { for (const preset of PLATFORM_SEAT_LAYOUT_PRESETS) results[await seedPreset(preset)] += 1; }
  finally { await mongoose.disconnect(); }
  console.log(JSON.stringify({ presets: PLATFORM_SEAT_LAYOUT_PRESETS.length, ...results }));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { seedPreset };

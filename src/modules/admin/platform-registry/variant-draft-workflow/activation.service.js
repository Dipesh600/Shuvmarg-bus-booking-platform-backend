"use strict";
const RouteVariant = require("../../../../../models/routeVariantModel.js");
const { activateCorridorIfReady } = require("../corridor-registry.service.js");
const { assertVariantCanActivate } = require("../variant-activation.policy.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { assertNoLivePathDuplicate } = require("../variant-path-identity.service.js");
const { getVariantById } = require("../route-variant-registry.service.js");
const { runVariantWrite } = require("../variant-write-transaction.service.js");
const { loadDraftVariant } = require("./context.service.js");
const { migrateOperationalReferences } = require("./operational-migration.service.js");

async function loadCompanion(variant) {
  let companion = variant.returnVariantId ? await RouteVariant.findById(variant.returnVariantId) : null;
  if (!companion) {
    companion = await RouteVariant.findOne({
      corridorId: variant.corridorId,
      direction: variant.direction === "FORWARD" ? "RETURN" : "FORWARD",
      routeFamilyId: variant.routeFamilyId,
      status: "DRAFT",
    });
  }
  return companion || null;
}

function isRecoverableActiveCompanion(variant, companion) {
  return companion?.status === "ACTIVE" &&
    String(companion.corridorId) === String(variant.corridorId) &&
    String(companion.routeFamilyId) === String(variant.routeFamilyId) &&
    companion.direction !== variant.direction &&
    String(companion.returnVariantId || "") === String(variant._id);
}

async function prepareActivationPair(variant, adminId) {
  const companion = await loadCompanion(variant);
  const recoveringPartialPair = isRecoverableActiveCompanion(variant, companion);
  if (!companion || (companion.status !== "DRAFT" && !recoveringPartialPair)) {
    throw routeVariantError(
      "ROUTE_FAMILY_COMPANION_REQUIRED",
      "Both forward and return drafts must exist before this route family can be activated.", 409
    );
  }
  if (recoveringPartialPair) {
    const repair = {
      ...(!String(variant.name || "").trim() && { name: companion.name }),
      ...(!variant.type && companion.type && { type: companion.type }),
      updatedBy: adminId || variant.updatedBy || null,
    };
    await RouteVariant.findByIdAndUpdate(variant._id, repair, { runValidators: true });
    Object.assign(variant, repair);
  } else {
    if (!String(companion.name || "").trim()) companion.name = variant.name;
    if (!companion.type && variant.type) companion.type = variant.type;
    companion.updatedBy = adminId || companion.updatedBy || null;
    if (companion.isModified()) await companion.save();
  }
  const selected = await getVariantById(variant._id);
  await assertVariantCanActivate(selected);
  const selectedIdentity = await assertNoLivePathDuplicate(selected);
  if (recoveringPartialPair) return { companion, selectedIdentity, recoveringPartialPair };
  const companionDetails = await getVariantById(companion._id);
  await assertVariantCanActivate(companionDetails);
  const companionIdentity = await assertNoLivePathDuplicate(companionDetails);
  return { companion, selectedIdentity, companionIdentity, recoveringPartialPair };
}

async function writeActivationPair(records, adminId, session = null) {
  const options = session ? { session } : {};
  for (const record of records) {
    if (record.source?.status === "ACTIVE") {
      await migrateOperationalReferences(record.source._id, record.variant._id, session);
    }
  }
  for (const record of records) {
    await RouteVariant.findByIdAndUpdate(record.variant._id, {
      status: "ACTIVE", pathFingerprint: record.identity.fingerprint,
      returnVariantId: record.companionId, updatedBy: adminId || null,
    }, { ...options, runValidators: true });
    if (record.source?.status === "ACTIVE") {
      await RouteVariant.findByIdAndUpdate(record.source._id, {
        status: "INACTIVE", supersededByVariantId: record.variant._id, updatedBy: adminId || null,
      }, { ...options, runValidators: true });
    }
  }
}

async function activateVariantDraft(variantId, adminId, dependencies = {}) {
  const variant = await loadDraftVariant(variantId);
  const prepared = await prepareActivationPair(variant, adminId);
  const companion = prepared.companion;
  const [source, companionSource] = await Promise.all([
    variant.revisionOfVariantId ? RouteVariant.findById(variant.revisionOfVariantId) : null,
    companion.revisionOfVariantId ? RouteVariant.findById(companion.revisionOfVariantId) : null,
  ]);
  const records = [{ variant, source, identity: prepared.selectedIdentity, companionId: companion._id }];
  if (!prepared.recoveringPartialPair) {
    records.push({ variant: companion, source: companionSource,
      identity: prepared.companionIdentity, companionId: variant._id });
  }
  await runVariantWrite({
    mongooseImpl: dependencies.mongoose,
    transactionWork: (session) => writeActivationPair(records, adminId, session),
    fallbackWork: () => writeActivationPair(records, adminId),
    fallbackOnTransient: false,
  });
  await activateCorridorIfReady(variant.corridorId, adminId);
  const [activated, activatedCompanion] = await Promise.all([
    RouteVariant.findById(variant._id).lean(), RouteVariant.findById(companion._id).lean(),
  ]);
  return { ...activated, companionVariant: activatedCompanion };
}

module.exports = { activateVariantDraft };

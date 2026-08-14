"use strict";

function createBrandFleetAuditReport() {
  const names = ["approvedOwnersWithoutBrands", "ownersWithMultipleDefaultBrands", "fleetsWithNoBrand", "fleetsReferencingMissingBrands", "fleetsReferencingForeignBrand", "inactiveBrandsUsedByFleets", "fleetsWithoutSeatLayoutAssignment", "unpublishedAssignedRevisions", "seatCountMismatches"];
  const summary = { totalApprovedOwners: 0, totalFleets: 0, schemaBlockersCount: 0, submissionBlockersCount: 0, operationalBlockersCount: 0, hasBlockingConflicts: false };
  const details = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) summary[name] = 0;
  return { summary, blockers: { schema: { count: 0, items: {} }, submission: { count: 0, items: {} }, operational: { count: 0, items: {} } }, details };
}

function finalizeBrandFleetAuditReport(report) {
  for (const [name, items] of Object.entries(report.details)) report.summary[name] = items.length;
  const schema = ["ownersWithMultipleDefaultBrands", "fleetsReferencingMissingBrands", "fleetsReferencingForeignBrand"];
  const submission = ["approvedOwnersWithoutBrands", "fleetsWithNoBrand", "inactiveBrandsUsedByFleets", "unpublishedAssignedRevisions", "seatCountMismatches"];
  const operational = ["fleetsWithoutSeatLayoutAssignment"];
  const count = (names) => names.reduce((total, name) => total + report.details[name].length, 0);
  for (const [category, names] of Object.entries({ schema, submission, operational })) {
    const total = count(names); report.summary[`${category}BlockersCount`] = total;
    report.blockers[category] = { count: total, ...Object.fromEntries(names.map((name) => [name, report.details[name]])) };
  }
  report.summary.hasBlockingConflicts = Boolean(report.summary.schemaBlockersCount || report.summary.submissionBlockersCount || report.summary.operationalBlockersCount);
  return report;
}

module.exports = { createBrandFleetAuditReport, finalizeBrandFleetAuditReport };

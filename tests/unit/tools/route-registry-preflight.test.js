"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSequencePreflightReport,
} = require("../../../tools/preflight-route-variant-sequences.js");
const {
  buildDiscoveryRetirementReport,
} = require("../../../tools/preflight-route-discovery-retirement.js");
const {
  classifyIssues,
  isLiveBlockingIssue,
} = require("../../../tools/preflight-route-graph-integrity.js");
describe("route registry rollout preflights", () => {
  it("reports duplicate sequence groups as a blocker before the unique index is deployed", () => {
    const report = buildSequencePreflightReport([
      {
        _id: { variantId: "variant-1", sequence: 2 },
        count: 2,
        routeStopIds: ["route-stop-1", "route-stop-2"],
        stopIds: ["stop-1", "stop-2"],
      },
    ]);
    assert.equal(report.safeToApply, false);
    assert.deepEqual(report.summary, {
      duplicateGroups: 1,
      duplicateRecords: 2,
    });
    assert.deepEqual(report.duplicateSequences[0], {
      variantId: "variant-1",
      sequence: 2,
      count: 2,
      routeStopIds: ["route-stop-1", "route-stop-2"],
      stopIds: ["stop-1", "stop-2"],
    });
  });
  it("passes the sequence preflight when no duplicate group is found", () => {
    const report = buildSequencePreflightReport([]);
    assert.equal(report.safeToApply, true);
    assert.equal(report.summary.duplicateGroups, 0);
    assert.equal(report.summary.duplicateRecords, 0);
  });
  it("passes retirement only when legacy discovery records are terminal and published variants exist", () => {
    const report = buildDiscoveryRetirementReport(
      [
        {
          _id: "published-discovery",
          status: "PUBLISHED",
          publishedVariant: { variantId: "variant-1" },
        },
        { _id: "rejected-discovery", status: "REJECTED" },
      ],
      ["variant-1"]
    );
    assert.equal(report.safeToRetire, true);
    assert.equal(report.summary.unfinishedRecords, 0);
    assert.equal(report.summary.publishedReferencesMissingVariants, 0);
    assert.equal(report.summary.statusCounts.PUBLISHED, 1);
    assert.equal(report.summary.statusCounts.REJECTED, 1);
  });
  it("blocks retirement for unfinished, unknown, and broken published discovery records", () => {
    const report = buildDiscoveryRetirementReport(
      [
        { _id: "draft", status: "DRAFT" },
        {
          _id: "missing-variant",
          status: "PUBLISHED",
          publishedVariant: { variantId: "deleted-variant" },
        },
        { _id: "missing-id", status: "PUBLISHED", publishedVariant: {} },
        { _id: "unknown", status: "LEGACY_UNKNOWN" },
      ],
      []
    );
    assert.equal(report.safeToRetire, false);
    assert.equal(report.summary.unfinishedRecords, 1);
    assert.equal(report.summary.publishedReferencesMissingVariants, 2);
    assert.equal(report.summary.unknownStatusRecords, 1);
    assert.equal(
      report.publishedReferencesMissingVariants.find(
        (record) => record.discoveryId === "missing-variant"
      ).reason,
      "ROUTE_VARIANT_NOT_FOUND"
    );
    assert.equal(
      report.publishedReferencesMissingVariants.find(
        (record) => record.discoveryId === "missing-id"
      ).reason,
      "MISSING_PUBLISHED_VARIANT_ID"
    );
  });
  it("accepts already-retired broken legacy discovery references", () => {
    const report = buildDiscoveryRetirementReport(
      [
        {
          _id: "retired-broken",
          status: "PUBLISHED",
          publishedVariant: {
            variantId: "deleted-variant",
            referenceStatus: "BROKEN_VARIANT_RETIRED",
          },
        },
      ],
      []
    );
    assert.equal(report.safeToRetire, true);
    assert.equal(report.summary.publishedReferencesMissingVariants, 0);
  });
  it("splits route graph live blockers from historical hygiene issues", () => {
    const activeSequenceIssue = {
      type: "ROUTE_STOP_MISSING_STOP",
      details: { variantStatus: "ACTIVE" },
    };
    const inactiveSequenceIssue = {
      type: "ROUTE_STOP_MISSING_STOP",
      details: { variantStatus: "INACTIVE" },
    };
    const inactiveScheduleIssue = {
      type: "SCHEDULE_MISSING_FLEET",
      details: { status: "INACTIVE" },
    };
    const liveScheduleIssue = {
      type: "SCHEDULE_MISSING_OPERATOR_CONFIG",
      details: { status: "SUSPENDED" },
    };
    assert.equal(isLiveBlockingIssue(activeSequenceIssue), true);
    assert.equal(isLiveBlockingIssue(inactiveSequenceIssue), false);
    assert.equal(isLiveBlockingIssue(inactiveScheduleIssue), false);
    assert.equal(isLiveBlockingIssue(liveScheduleIssue), true);
    const classified = classifyIssues([
      activeSequenceIssue,
      inactiveSequenceIssue,
      inactiveScheduleIssue,
      liveScheduleIssue,
    ]);
    assert.equal(classified.liveBlockingIssues.length, 2);
    assert.equal(classified.historicalHygieneIssues.length, 2);
  });
});

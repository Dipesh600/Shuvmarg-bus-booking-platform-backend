"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Types } = require("mongoose");
const DriverProfile = require("../../../models/driverProfileModel");
const { createDriverMutationsController } = require("../../../src/modules/admin/driver-management/driver-mutations.controller");
const { createDriverDocumentService } = require("../../../src/modules/admin/driver-management/driver-documents.service");
const adminId = new Types.ObjectId(), brandId = new Types.ObjectId(), ownerId = new Types.ObjectId();
const req = (body = {}) => ({ adminInfo: { id: adminId }, params: { id: new Types.ObjectId() }, body });
const res = () => ({ code: 0, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const fields = () => ({ brandId, ownerId, fullName: "Test Driver", phone: "9800000001", licenseNumber: "NL123",
  gender: "male", experienceYears: 5, licenseType: "HV", licenseExpiry: "2099-01-01", licenseDoc: "license.pdf" });
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const file = { name: "license.pdf", mimetype: "application/pdf", size: pdf.length, data: pdf };
function fixture(overrides = {}) {
  const state = { saves: 0, uploads: 0, cleaned: [], ...overrides };
  const document = new DriverProfile({ ...fields(), ...state.driverFields });
  document.save = async () => { state.saves++; if (state.saveError) throw state.saveError; return document; };
  function Model(data) {
    const created = new DriverProfile(data);
    created.save = async () => { state.saves++; if (state.saveError) throw state.saveError; return created; };
    state.created = created; return created;
  }
  Model.findById = async () => document;
  const docs = createDriverDocumentService({ DriverProfile: Model, logger: { warn() {} },
    malwareScanner: { async scanValidatedFiles() { return { status: "clean" }; } },
    fileProcessor: async upload => upload, storage: {
    buildS3Path: ({ brandId: brand, driverId, documentType }) => `brands/${brand}/drivers/${driverId}/docs/${documentType}`,
    async uploadFileToS3(upload, options) {
      state.uploads++; if (state.failUploadAt === state.uploads) throw new Error("upload failed");
      return `${options.folder}/${options.objectName}`;
    },
    async deleteObjectFromS3(key) { state.cleaned.push(key); },
  } });
  const controller = createDriverMutationsController({ DriverProfile: Model, documents: docs,
    OperatorBrand: { findById: () => ({ lean: async () => ({ _id: brandId, ownerId, status: "ACTIVE" }) }) },
    Fleet: { findById: () => ({ lean: async () => ({ _id: new Types.ObjectId(), brandId, status: "ACTIVE", approvalStatus: "APPROVED" }) }) },
    logger: { error() {} } });
  return { state, document, controller };
}
test("legacy manual approval route is removed so it cannot bypass secure document processing", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../../../routes/adminRoutes/adminRoutes.js"), "utf8");
  const { controller } = fixture();
  assert.doesNotMatch(routes, /router\.patch\("\/drivers\/:id\/approve"/);
  assert.equal(controller.approveDriver, undefined);
});
test("pending and rejected records require a fresh licence upload before automated approval", async () => {
  for (const approvalStatus of ["PENDING", "REJECTED"]) {
    const { controller, state } = fixture({ driverFields: { approvalStatus } }); const response = res();
    await controller.updateDriver(req({ fullName: "Corrected Driver" }), response);
    assert.equal(response.code, 400); assert.equal(state.saves, 0); assert.equal(state.uploads, 0);
    assert.match(response.body.message, /Re-upload the driving-license document/);
  }
});
test("review rejection records actor and does not erase suspension", async () => {
  const { document, controller } = fixture({ driverFields: { status: "SUSPENDED" } }); const response = res();
  await controller.rejectDriver(req({ reason: "Invalid evidence" }), response);
  assert.equal(response.code, 200); assert.equal(String(document.rejectedBy), String(adminId));
  assert.equal(document.status, "SUSPENDED"); assert.equal(document.approvalStatus, "REJECTED");
  assert.equal(document.accessStatus, "NOT_LINKED");
  assert.equal(document.accessStatusBeforeSuspension, null);
});
test("admin-validated expiry changes stay approved and synchronize structured validity", async () => {
  const { document, controller } = fixture({ driverFields: { approvalStatus: "APPROVED" } }); const response = res();
  await controller.updateDriver(req({ licenseExpiry: "2099-02-01" }), response);
  assert.equal(response.code, 200); assert.equal(document.approvalStatus, "APPROVED");
  assert.equal(document.documents.license.url, "license.pdf");
  assert.equal(document.documents.license.validTill.toISOString().slice(0, 10), "2099-02-01");
});
test("ordinary edits and securely replaced evidence do not create a second review", async () => {
  const { document, controller } = fixture({ driverFields: { approvalStatus: "APPROVED" } });
  const notes = res(); await controller.updateDriver(req({ notes: "Updated notes" }), notes);
  assert.equal(notes.code, 200); assert.equal(document.approvalStatus, "APPROVED");
  const upload = res(); await controller.updateDriver({ ...req(), files: { licenseDoc: file } }, upload);
  assert.equal(upload.code, 200); assert.equal(document.approvalStatus, "APPROVED"); assert.notEqual(document.licenseDoc, "license.pdf");
});
test("an admin-secured correction can restore a rejected driver without self-review", async () => {
  const { document, controller } = fixture({ driverFields: { approvalStatus: "REJECTED", status: "INACTIVE" } }); const response = res();
  await controller.updateDriver({ ...req(), files: { licenseDoc: file } }, response);
  assert.equal(response.code, 200); assert.equal(document.approvalStatus, "APPROVED");
  assert.equal(document.status, "AVAILABLE"); assert.equal(String(document.approvedBy), String(adminId));
});
test("linked account phone cannot be silently replaced by a profile edit", async () => {
  const { controller, state } = fixture({ driverFields: { userId: new Types.ObjectId() } }); const response = res();
  await controller.updateDriver(req({ phone: "9800000002" }), response);
  assert.equal(response.code, 409); assert.equal(state.saves, 0);
});
test("invalid license types and status values fail validation before uploads or writes", async () => {
  for (const body of [{ licenseType: "BIKE" }, { status: "INVALID" }, { licenseExpiry: "bad" }, { experienceYears: -1 }]) {
    const { controller, state } = fixture(); const response = res();
    await controller.updateDriver({ ...req(body), files: { licenseDoc: file } }, response);
    assert.equal(response.code, 400); assert.equal(state.saves, 0); assert.equal(state.uploads, 0);
  }
});
test("create upload failure leaves no database record", async () => {
  const { controller, state } = fixture({ failUploadAt: 1 }); const response = res();
  await controller.createDriver({ ...req(fields()), files: { licenseDoc: file } }, response);
  assert.equal(response.code, 500); assert.equal(state.saves, 0); assert.equal(state.cleaned.length, 0);
});
test("a securely processed admin driver is immediately approved without self-review", async () => {
  const { controller, state } = fixture(); const response = res();
  await controller.createDriver({ ...req(fields()), files: { licenseDoc: file } }, response);
  assert.equal(response.code, 201); assert.equal(state.saves, 1);
  assert.equal(state.created.approvalStatus, "APPROVED");
  assert.equal(String(state.created.approvedBy), String(adminId));
  assert.equal(String(state.created.adminCreatedBy), String(adminId));
});
test("an expired licence is rejected before upload or profile creation", async () => {
  const { controller, state } = fixture(); const response = res();
  await controller.createDriver({ ...req({ ...fields(), licenseExpiry: "2000-01-01" }),
    files: { licenseDoc: file } }, response);
  assert.equal(response.code, 400); assert.equal(state.uploads, 0); assert.equal(state.saves, 0);
});
test("ambiguous save failure retains new objects because the database may have committed", async () => {
  const { controller, state } = fixture({ saveError: new Error("network acknowledgement lost") }); const response = res();
  await controller.updateDriver({ ...req(), files: { licenseDoc: file } }, response);
  assert.equal(response.code, 500); assert.equal(state.cleaned.length, 0);
});
test("optimistic concurrency failure cleans uncommitted evidence and returns conflict", async () => {
  const error = new Error("stale version"); error.name = "VersionError";
  const { controller, state } = fixture({ saveError: error }); const response = res();
  await controller.updateDriver({ ...req(), files: { licenseDoc: file } }, response);
  assert.equal(response.code, 409); assert.equal(state.cleaned.length, 1);
});
test("invalid file type is rejected before an active profile is created", async () => {
  const { controller, state } = fixture(); const response = res();
  await controller.createDriver({ ...req(fields()), files: { licenseDoc: { ...file, mimetype: "text/html" } } }, response);
  assert.equal(response.code, 400); assert.equal(state.saves, 0); assert.equal(state.uploads, 0);
});

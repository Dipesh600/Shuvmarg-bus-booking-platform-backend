"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBusOwnerScheduleImageService } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule-image.service");

test("bus-owner schedule image service", async (t) => {
  await t.test("formats base64 data URI, passes exact folder, returns secure_url, and does not destroy existing assets", async () => {
    let uploadArgs = null;
    let destroyCalled = false;
    const fakeCloudinary = {
      uploader: {
        upload: async (uri, options) => {
          uploadArgs = { uri, options };
          return { secure_url: "https://cloudinary.com/thumb.png" };
        },
        destroy: async () => {
          destroyCalled = true;
        },
      },
    };

    const imageService = createBusOwnerScheduleImageService({ cloudinary: fakeCloudinary });
    const fakeFile = {
      mimetype: "image/jpeg",
      data: Buffer.from("hello world"),
    };

    const result = await imageService.uploadThumbnail(fakeFile);

    assert.equal(result, "https://cloudinary.com/thumb.png");
    assert.equal(uploadArgs.options.folder, "buss_ticket_thumbnail");
    assert.equal(
      uploadArgs.uri,
      `data:image/jpeg;base64,${Buffer.from("hello world").toString("base64")}`
    );
    assert.equal(destroyCalled, false);
  });

  await t.test("cloudinary error propagates cleanly", async () => {
    const fakeCloudinary = {
      uploader: {
        upload: async () => { throw new Error("Cloudinary Error"); },
      },
    };

    const imageService = createBusOwnerScheduleImageService({ cloudinary: fakeCloudinary });
    const fakeFile = { mimetype: "image/png", data: Buffer.from("data") };

    await assert.rejects(
      () => imageService.uploadThumbnail(fakeFile),
      { message: "Cloudinary Error" }
    );
  });
});

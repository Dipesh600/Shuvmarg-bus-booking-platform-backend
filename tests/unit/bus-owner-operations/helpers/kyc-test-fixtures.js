"use strict";

const PDF_BUFFER = Buffer.concat([Buffer.from("%PDF-1.4\n%"), Buffer.alloc(100)]);
const JPEG_BUFFER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const PNG_BUFFER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);

function makeFile(name, mimetype, buffer) {
  return {
    name,
    mimetype,
    data: buffer,
    size: buffer.length,
  };
}

function makeValidFiles() {
  return {
    companyRegistration: makeFile("company.pdf", "application/pdf", PDF_BUFFER),
    taxRegistration: makeFile("tax.jpg", "image/jpeg", JPEG_BUFFER),
    transportLicense: makeFile("license.png", "image/png", PNG_BUFFER),
  };
}

function responseRecorder() {
  let statusCode;
  let responseBody;
  return {
    status(val) { statusCode = val; return this; },
    json(val) { responseBody = val; return this; },
    result: () => ({ status: statusCode, body: responseBody }),
  };
}

module.exports = {
  PDF_BUFFER,
  JPEG_BUFFER,
  PNG_BUFFER,
  makeFile,
  makeValidFiles,
  responseRecorder,
};

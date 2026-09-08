"use strict";
const { processFile } = require("../../services/fileProcessor");
const { uploadFileToS3, buildS3Path } = require("../../services/s3Service");

async function uploadRefundProof(file, refundId) {
  if (!file) return null;
  if (!/^[a-f\d]{24}$/i.test(String(refundId))) throw Object.assign(new Error("Invalid refund ID"), { statusCode: 400 });
  const processed = await processFile(file, { preset: "proof" });
  return uploadFileToS3(processed, buildS3Path({ type: "dispute_proof", disputeType: "refund", transactionId: refundId }));
}

module.exports = { uploadRefundProof };

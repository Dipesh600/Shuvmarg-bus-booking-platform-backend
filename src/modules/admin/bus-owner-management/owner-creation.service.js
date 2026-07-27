"use strict";

const BusOwner = require("../../../../models/busOwnerModel.js");
const {
  uploadFileToS3,
  buildS3Path,
} = require("../../../../services/s3Service.js");
const {
  findOrCreateOwnerUser,
} = require("./owner-credentials.service.js");

const requiredDocumentsPresent = (files) =>
  files.companyRegistrationCert &&
  files.panCardImage &&
  files.ownerCitizenship;

const createSkeleton = async (body, user) => {
  const owner = new BusOwner({
    user: user._id,
    companyName: body.companyName,
    companyRegistration: { documentUrls: [], verified: false },
    ownerIdentity: { documentUrls: [], verified: false },
    taxRegistration: {
      panNumber: body.panNumber || null,
      registrationNumber: body.registrationNumber || null,
      documentUrls: [],
      verified: false,
    },
    bankDetails: {
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      accountHolderName: body.accountHolderName,
      branchName: body.branchName,
      swiftCode: body.swiftCode || null,
      documentUrls: [],
    },
    verificationStatus: "pending",
  });
  return owner.save();
};

const uploadDocuments = async (owner, files) => {
  const pathFor = (documentType) =>
    buildS3Path({
      type: "owner_kyc",
      ownerId: owner._id.toString(),
      documentType,
    });
  const company = await uploadFileToS3(
    files.companyRegistrationCert,
    pathFor("company-registration")
  );
  const tax = await uploadFileToS3(
    files.panCardImage,
    pathFor("tax-registration")
  );
  const identity = await uploadFileToS3(
    files.ownerCitizenship,
    pathFor("owner-identity")
  );
  const bank = files.bankAuthorizationLetter
    ? await uploadFileToS3(
        files.bankAuthorizationLetter,
        pathFor("bank-details")
      )
    : null;
  if (company) owner.companyRegistration.documentUrls = [company];
  if (identity) owner.ownerIdentity.documentUrls = [identity];
  if (tax) owner.taxRegistration.documentUrls = [tax];
  if (bank) owner.bankDetails.documentUrls = [bank];
  await owner.save();
};

const createBusOwner = async (body, files) => {
  const credentials = await findOrCreateOwnerUser(body);
  if (credentials.error) return credentials;
  if (!requiredDocumentsPresent(files)) {
    return {
      error: {
        success: false,
        message:
          "Mandatory KYC documents (Company Registration, PAN Card, " +
          "Citizenship) are missing from the upload.",
      },
    };
  }
  const owner = await createSkeleton(body, credentials.user);
  await uploadDocuments(owner, files);
  return { owner, user: credentials.user };
};

module.exports = { createBusOwner, requiredDocumentsPresent };

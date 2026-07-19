'use strict';

const s3Service = require('../../../../services/s3Service');

const resolveOne = async (doc) => {
  const docObj = doc.toObject ? doc.toObject() : { ...doc };
  if (docObj.fileKey && !docObj.fileKey.startsWith('http')) {
    docObj.previewUrl = await s3Service.getPresignedUrl(docObj.fileKey);
  }
  return docObj;
};

const resolveDocumentUrls = async (documents) => {
  if (!documents || documents.length === 0) return [];
  return Promise.all(documents.map(resolveOne));
};

module.exports = {
  resolveDocumentUrls,
};

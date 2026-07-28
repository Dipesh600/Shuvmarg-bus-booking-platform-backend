'use strict';

const s3Service = require('../../../../../services/s3Service');

const toPlainDocument = (doc) => (
  typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
);

const resolveDocumentUrls = async (documents) => {
  if (!documents || documents.length === 0) return [];

  return Promise.all(
    documents.map(async (doc) => {
      const docObj = toPlainDocument(doc);
      if (docObj.fileKey && !docObj.fileKey.startsWith('http')) {
        docObj.previewUrl = await s3Service.getPresignedUrl(docObj.fileKey);
      }
      return docObj;
    })
  );
};

module.exports = {
  resolveDocumentUrls,
};

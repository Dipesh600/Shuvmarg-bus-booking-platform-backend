'use strict';

const VALID_DOCUMENT_TYPES = [
    'citizenship_front',
    'citizenship_back',
    'national_id_front',
    'national_id_back',
    'shop_photo',
    'pan_card',
    'business_registration',
];

const UPLOADABLE_STATUSES = ['DRAFT', 'MORE_INFO'];

const isUploadableStatus = (status) => UPLOADABLE_STATUSES.includes(status);

module.exports = {
    VALID_DOCUMENT_TYPES,
    isUploadableStatus,
};

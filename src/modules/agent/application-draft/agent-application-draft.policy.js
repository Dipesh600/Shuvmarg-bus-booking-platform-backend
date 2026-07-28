const isEditableStatus = (status) => {
    return ["DRAFT", "MORE_INFO"].includes(status);
};

module.exports = {
    isEditableStatus,
};

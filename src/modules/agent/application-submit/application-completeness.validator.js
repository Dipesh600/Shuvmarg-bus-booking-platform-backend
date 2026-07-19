'use strict';

const validateCompleteness = (agent) => {
    const errors = [];

    // Step 1 — Location
    if (!agent.district)      errors.push("District is required.");
    if (!agent.municipality)  errors.push("Municipality is required.");
    if (!agent.placeName)     errors.push("Place name is required.");

    // Step 2 — Business
    if (!agent.operationType) errors.push("Agent type is required.");
    if (!agent.shopAddress)   errors.push("Shop / Office address is required.");
    
    // businessName is required for all types except individual
    if (agent.operationType !== "individual" && !agent.businessName) {
        errors.push("Business name is required for your agent type.");
    }

    // Step 3 — Identification numbers
    if (!agent.citizenshipNumber) errors.push("Citizenship number is required.");
    if (!agent.panNumber)         errors.push("PAN number is required.");

    // Step 3 — Documents
    const uploadedTypes = agent.documents.map((d) => d.type);
    const requiredDocs = ["citizenship_front", "citizenship_back", "pan_card"];
    for (const required of requiredDocs) {
        if (!uploadedTypes.includes(required)) {
            errors.push(`${required.replace(/_/g, " ")} document is required.`);
        }
    }

    if (errors.length > 0) {
        return { isValid: false, errors };
    }
    
    return { isValid: true };
};

module.exports = {
    validateCompleteness,
};

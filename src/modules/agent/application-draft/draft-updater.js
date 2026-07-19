const updateDraftFields = (agent, payload) => {
    const {
        // Step 1 — Location
        district, municipality, placeName,
        // Step 2 — Business
        businessName, shopAddress, operationType,
        claimedMonthlyVolume, currentOperators, referralSource,
        // Step 3 — Identification numbers
        citizenshipNumber, nationalIdNumber, panNumber,
        // Step 3 — Consents (saved on submit, but can be pre-saved)
        whatsappConsent,
        // Step 4 — Settlement
        settlementMethod, bankName, bankAccountNumber, bankAccountName,
        esewaNumber, khaltiNumber,
    } = payload;

    // Step 1 — Location
    if (district !== undefined)      agent.district      = district;
    if (municipality !== undefined)  agent.municipality  = municipality;
    if (placeName !== undefined)     agent.placeName     = placeName;

    // Step 2 — Business
    if (businessName !== undefined)         agent.businessName         = businessName;
    if (shopAddress !== undefined)          agent.shopAddress          = shopAddress;
    if (operationType !== undefined)        agent.operationType        = operationType;
    if (claimedMonthlyVolume !== undefined) agent.claimedMonthlyVolume = claimedMonthlyVolume;
    if (currentOperators !== undefined)     agent.currentOperators     = currentOperators;
    if (referralSource !== undefined)       agent.referralSource       = referralSource;

    // Step 3 — Identification
    if (citizenshipNumber !== undefined) agent.citizenshipNumber = citizenshipNumber;
    if (nationalIdNumber !== undefined)  agent.nationalIdNumber  = nationalIdNumber;
    if (panNumber !== undefined)         agent.panNumber         = panNumber;

    // Consents
    if (whatsappConsent !== undefined)   agent.whatsappConsent   = !!whatsappConsent;

    // Step 4 — Settlement
    if (settlementMethod !== undefined)    agent.settlementMethod    = settlementMethod;
    if (bankName !== undefined)            agent.bankName            = bankName;
    if (bankAccountNumber !== undefined)   agent.bankAccountNumber   = bankAccountNumber;
    if (bankAccountName !== undefined)     agent.bankAccountName     = bankAccountName;
    if (esewaNumber !== undefined)         agent.esewaNumber         = esewaNumber;
    if (khaltiNumber !== undefined)        agent.khaltiNumber        = khaltiNumber;
};

module.exports = {
    updateDraftFields,
};

"use strict";

// Nepal Rastra Bank: List of Banks and Financial Institutions, Mid June 2026.
// Class D microfinance institutions are not valid settlement-account choices.
const NEPAL_SETTLEMENT_INSTITUTION_GROUPS = Object.freeze([
  Object.freeze({
    category: "Commercial banks",
    institutions: Object.freeze([
      "Nepal Bank Ltd.", "Agricultural Development Bank Ltd.", "Nabil Bank Ltd.",
      "Nepal Investment Mega Bank Ltd.", "Standard Chartered Bank Nepal Ltd.",
      "Himalayan Bank Ltd.", "Nepal SBI Bank Ltd.", "Everest Bank Ltd.",
      "Kumari Bank Ltd.", "Laxmi Sunrise Bank Ltd.", "Citizens Bank International Ltd.",
      "Prime Commercial Bank Ltd.", "Sanima Bank Ltd.", "Machhapuchhre Bank Ltd.",
      "NIC Asia Bank Ltd.", "Global IME Bank Ltd.", "NMB Bank Ltd.",
      "Prabhu Bank Ltd.", "Siddhartha Bank Ltd.", "Rastriya Banijya Bank Ltd.",
    ]),
  }),
  Object.freeze({
    category: "Development banks",
    institutions: Object.freeze([
      "Narayani Development Bank Ltd.", "Karnali Development Bank Ltd.",
      "Excel Development Bank Ltd.", "Miteri Development Bank Ltd.",
      "Muktinath Bikas Bank Ltd.", "Corporate Development Bank Ltd.",
      "Sindhu Bikas Bank Ltd.", "Salapa Bikash Bank Ltd.",
      "Green Development Bank Ltd.", "Sangrila Development Bank Ltd.",
      "Shine Resunga Development Bank Ltd.", "Jyoti Bikas Bank Ltd.",
      "Garima Bikas Bank Ltd.", "Mahalaxmi Bikas Bank Ltd.",
      "Lumbini Bikas Bank Ltd.", "Kamana Sewa Bikas Bank Ltd.",
      "Saptakoshi Development Bank Ltd.",
    ]),
  }),
  Object.freeze({
    category: "Finance companies",
    institutions: Object.freeze([
      "Nepal Finance Ltd.", "Nepal Share Markets and Finance Ltd.",
      "Goodwill Finance Ltd.", "Progressive Finance Ltd.", "Janaki Finance Co. Ltd.",
      "Pokhara Finance Ltd.", "Multipurpose Finance Ltd.",
      "Samriddhi Finance Company Limited", "Capital Merchant Banking & Finance Ltd.",
      "Guheshwori Merchant Banking & Finance Ltd.", "ICFC Finance Ltd.",
      "Manjushree Finance Ltd.", "Reliance Finance Ltd.", "Gurkhas Finance Ltd.",
      "Shree Investment & Finance Co. Ltd.", "Central Finance Ltd.", "Best Finance Ltd.",
    ]),
  }),
]);

const NEPAL_SETTLEMENT_INSTITUTION_NAMES = new Set(
  NEPAL_SETTLEMENT_INSTITUTION_GROUPS.flatMap((group) => group.institutions)
);

const LEGACY_INSTITUTION_NAMES = Object.freeze({
  "Nepal Bank": "Nepal Bank Ltd.",
});

function normalizeNepalSettlementInstitutionName(value) {
  const trimmed = value.trim();
  return LEGACY_INSTITUTION_NAMES[trimmed] || trimmed;
}

module.exports = {
  NEPAL_SETTLEMENT_INSTITUTION_GROUPS,
  NEPAL_SETTLEMENT_INSTITUTION_NAMES,
  normalizeNepalSettlementInstitutionName,
};

"use strict";

const crypto = require("node:crypto");
const { validateSeatLayoutV3 } = require("./seat-layout-v3.validation");

function canonicalSeatLayoutV3(value) {
  const { layout } = validateSeatLayoutV3(value);
  return {
    ...layout,
    sections: [...layout.sections]
      .sort((left, right) => left.order - right.order)
      .map((section) => ({
        ...section,
        elements: [...section.elements].sort((left, right) =>
          left.elementId.localeCompare(right.elementId, "en-US")
        ),
      })),
  };
}

function seatLayoutV3Fingerprint(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalSeatLayoutV3(value)))
    .digest("hex");
}

module.exports = { canonicalSeatLayoutV3, seatLayoutV3Fingerprint };

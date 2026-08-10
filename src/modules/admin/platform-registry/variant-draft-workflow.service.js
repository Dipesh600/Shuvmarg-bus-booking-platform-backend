"use strict";

module.exports = {
  ...require("./variant-draft-workflow/creation.service.js"),
  ...require("./variant-draft-workflow/candidate-preparation.service.js"),
  ...require("./variant-draft-workflow/candidate-review.service.js"),
  ...require("./variant-draft-workflow/candidate-bulk-review.service.js"),
  ...require("./variant-draft-workflow/commit.service.js"),
  ...require("./variant-draft-workflow/context.service.js"),
  ...require("./variant-draft-workflow/guidance-search.service.js"),
};

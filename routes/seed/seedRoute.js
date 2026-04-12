const express = require("express");
const router = express.Router();
const seed = require("../../controllers/seed/seedController.js")
router.get("/admin", seed);

module.exports = router;
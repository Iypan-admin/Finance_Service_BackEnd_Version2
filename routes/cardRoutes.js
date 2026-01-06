const express = require("express");
const router = express.Router();
const { generateCard, generateCardFromGiveaway } = require("../controllers/cardController");

// API route - manual card generation from payment
router.post("/generate", generateCard);

// API route - manual card generation from giveaway
router.post("/generate-giveaway", generateCardFromGiveaway);

module.exports = router;

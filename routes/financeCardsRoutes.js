const express = require("express");
const router = express.Router();
const { getPendingCards, approveCard } = require("../controllers/financeCardsController");

router.get("/pending", getPendingCards);
router.patch("/approve/:id", approveCard);

module.exports = router;

const express = require("express");
const router = express.Router();
const giveawayController = require("../controllers/giveawayController");

// Finance admin → Get all giveaways (pending / approved / declined)
router.get("/giveaways/pending-approvals", giveawayController.getGiveawayApprovals);

// Approve a giveaway entry
router.post("/giveaways/:id/approve", giveawayController.approveGiveaway);

// Decline a giveaway entry
router.post("/giveaways/:id/decline", giveawayController.declineGiveaway);

module.exports = router;

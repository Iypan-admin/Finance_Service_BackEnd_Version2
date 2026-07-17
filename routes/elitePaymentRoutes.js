const express = require("express");
const router = express.Router();
const elitePaymentController = require("../controllers/elitePaymentController");

// Finance admin → Get all payments with status=success
router.get("/elite-payments/pending-approvals", elitePaymentController.getPendingApprovals);

// Approve a payment
router.post("/elite-payments/:id/approve", elitePaymentController.approvePayment);

// Decline a payment
router.post("/elite-payments/:id/decline", elitePaymentController.declinePayment);

module.exports = router;

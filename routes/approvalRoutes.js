const express = require('express');
const { approvePayment, getAllPayments, editPaymentDuration, getCenterPayments } = require('../controllers/approvalController');
const authMiddleware = require('../middleware/authMiddleware');
const centerAuthMiddleware = require('../middleware/centerAuthMiddleware');

const router = express.Router();

// ✅ Approve Payment (Requires 'financial' role)
router.post('/approve', authMiddleware, approvePayment);

// ✅ Get All Payments (Requires 'financial' role)
router.get('/payments', authMiddleware, getAllPayments);

// ✅ Edit Payment Duration (Requires 'financial' role)
router.put('/payment/edit', authMiddleware, editPaymentDuration);

// ✅ Get Center Payments (Requires 'center' role - filtered by center)
router.get('/center/payments', centerAuthMiddleware, getCenterPayments);

module.exports = router;

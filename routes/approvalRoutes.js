const express = require('express');
const { approvePayment, getAllPayments, editPaymentDuration, getCenterPayments, getStudentPaymentDetails } = require('../controllers/approvalController');
const authMiddleware = require('../middleware/authMiddleware');
const centerAuthMiddleware = require('../middleware/centerAuthMiddleware');
const academicAuthMiddleware = require('../middleware/academicAuthMiddleware');

const router = express.Router();

// ✅ Approve Payment (Requires 'financial' role)
router.post('/approve', authMiddleware, approvePayment);

// ✅ Get All Payments (Requires 'financial' role)
router.get('/payments', authMiddleware, getAllPayments);

// ✅ Edit Payment Duration (Requires 'financial' role)
router.put('/payment/edit', authMiddleware, editPaymentDuration);

// ✅ Get Center Payments (Requires 'center' role - filtered by center)
router.get('/center/payments', centerAuthMiddleware, getCenterPayments);

// ✅ Get Student Payment Details by Registration Number and Batch ID (Requires 'academic' or 'financial' role)
router.get('/student-payment/:registrationNumber/:batchId', academicAuthMiddleware, getStudentPaymentDetails);

module.exports = router;

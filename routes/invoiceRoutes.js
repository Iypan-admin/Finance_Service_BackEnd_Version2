const express = require('express');
const { 
    getCyclePayments, 
    generateInvoice, 
    getCenterInvoices, 
    getInvoiceItems,
    getStateAdminInvoices,
    getFinanceAdminInvoices,
    getManagerAdminInvoices,
    getStateAdminVerifiedInvoices,
    getFinanceAdminAcceptedInvoices,
    getManagerAdminPaidInvoices,
    updateInvoiceStatus
} = require('../controllers/invoiceController');
const centerAuthMiddleware = require('../middleware/centerAuthMiddleware');
const stateAuthMiddleware = require('../middleware/stateAuthMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const invoiceAuthMiddleware = require('../middleware/invoiceAuthMiddleware');

const router = express.Router();

// ✅ Get payments for current invoice cycle (Generate Invoice Tab)
// GET /api/financial/invoices/cycle-payments
router.get('/cycle-payments', centerAuthMiddleware, getCyclePayments);

// ✅ Generate invoice for current cycle
// POST /api/financial/invoices/generate
router.post('/generate', centerAuthMiddleware, generateInvoice);

// ✅ Get invoices for State Admin (Pending invoices)
// GET /api/financial/invoices/state-admin/pending
router.get('/state-admin/pending', stateAuthMiddleware, getStateAdminInvoices);

// ✅ Get verified invoices for State Admin (Approved Tab)
// GET /api/financial/invoices/state-admin/verified
router.get('/state-admin/verified', stateAuthMiddleware, getStateAdminVerifiedInvoices);

// ✅ Get invoices for Finance Admin (MF Verified invoices)
// GET /api/financial/invoices/finance-admin/verified
router.get('/finance-admin/verified', authMiddleware, getFinanceAdminInvoices);

// ✅ Get accepted invoices for Finance Admin (Approved Tab)
// GET /api/financial/invoices/finance-admin/accepted
router.get('/finance-admin/accepted', authMiddleware, getFinanceAdminAcceptedInvoices);

// ✅ Get invoices for Manager/Admin (Finance Accepted invoices)
// GET /api/financial/invoices/manager-admin/accepted
router.get('/manager-admin/accepted', centerAuthMiddleware, getManagerAdminInvoices);

// ✅ Get paid invoices for Manager/Admin (Approved Tab)
// GET /api/financial/invoices/manager-admin/paid
router.get('/manager-admin/paid', centerAuthMiddleware, getManagerAdminPaidInvoices);

// ✅ Get invoice items (student payment list) for a specific invoice
// This route must come before the status update route to avoid conflicts
// GET /api/financial/invoices/:invoice_id/items
// Allow all roles that need to view invoice items (state, financial, admin, manager, center)
router.get('/:invoice_id/items', invoiceAuthMiddleware, getInvoiceItems);

// ✅ Update invoice status (Verify/Approve)
// PATCH /api/financial/invoices/:invoice_id/status
// Allow state (verify), financial (approve), admin/manager (final approve) roles
router.patch('/:invoice_id/status', stateAuthMiddleware, updateInvoiceStatus);

// ✅ Get all invoices for center (History Tab)
// GET /api/financial/invoices
router.get('/', centerAuthMiddleware, getCenterInvoices);

module.exports = router;


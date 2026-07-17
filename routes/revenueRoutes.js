const express = require("express");
const router = express.Router();
const { getRevenueStats } = require("../controllers/revenueController");
const authMiddleware = require("../middleware/authMiddleware");

// ✅ Test endpoint - No auth required
// GET /api/financial/revenue/test
router.get("/revenue/test", (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: "Revenue API is working!",
        timestamp: new Date().toISOString()
    });
});

// ✅ Get Revenue Statistics for Admin Dashboard
// GET /api/financial/revenue/stats
router.get("/revenue/stats", authMiddleware, getRevenueStats);

// ✅ Debug endpoint - No auth required for testing
// GET /api/financial/revenue/debug
router.get("/revenue/debug", getRevenueStats);

module.exports = router;

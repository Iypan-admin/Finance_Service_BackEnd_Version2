const jwt = require("jsonwebtoken");
require("dotenv").config();

/**
 * Invoice Authentication Middleware
 * Allows state, financial, admin, manager, and center roles
 * Used for invoice-related operations that need access across multiple roles
 */
const invoiceAuthMiddleware = (req, res, next) => {
    const token = req.header("Authorization");
    
    if (!token) {
        return res.status(401).json({ error: "Access denied, no token provided" });
    }

    try {
        const decoded = jwt.verify(token.split(" ")[1], process.env.SECRET_KEY);

        // Allow state, financial, admin, manager, and center roles for invoice operations
        if (!["state", "financial", "admin", "manager", "center"].includes(decoded.role)) {
            return res.status(403).json({ error: "Access denied, you are not authorized" });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};

module.exports = invoiceAuthMiddleware;








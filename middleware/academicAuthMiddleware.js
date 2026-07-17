const jwt = require("jsonwebtoken");
require("dotenv").config();

/**
 * Academic Authentication Middleware
 * Allows academic and financial roles
 * Used for operations that need to be accessible by both Academic Coordinators and Finance team
 */
const academicAuthMiddleware = (req, res, next) => {
    const token = req.header("Authorization");
    
    if (!token) {
        return res.status(401).json({ error: "Access denied, no token provided" });
    }

    try {
        const decoded = jwt.verify(token.split(" ")[1], process.env.SECRET_KEY);

        // Allow academic, financial, admin, and manager roles
        const userRole = (decoded.role || "").toLowerCase();
        const allowedRoles = ["academic", "financial", "admin", "manager"];
        
        if (!allowedRoles.includes(userRole)) {
            console.error(`Forbidden: Role "${decoded.role}" not in allowed list:`, allowedRoles);
            return res.status(403).json({ 
                error: `Access denied (AcademicAuth): role "${decoded.role}" is not authorized.`,
                receivedRole: decoded.role 
            });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};

module.exports = academicAuthMiddleware;


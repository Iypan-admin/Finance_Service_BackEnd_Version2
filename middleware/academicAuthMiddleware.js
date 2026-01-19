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

        // Allow academic and financial roles
        if (!["academic", "financial"].includes(decoded.role)) {
            return res.status(403).json({ error: "Access denied, you are not authorized" });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};

module.exports = academicAuthMiddleware;


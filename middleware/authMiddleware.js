const jwt = require("jsonwebtoken");
require("dotenv").config();

const authMiddleware = (req, res, next) => {
    const token = req.header("Authorization");
    
    if (!token) {
        return res.status(401).json({ error: "Access denied, no token provided" });
    }

    try {
        const decoded = jwt.verify(token.split(" ")[1], process.env.SECRET_KEY);

        const role = decoded.role ? decoded.role.toLowerCase() : "";
        if (!["financial", "admin", "manager"].includes(role)) {
            return res.status(403).json({ error: `Access denied (FinanceAuth): role ${decoded.role} not authorized` });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};

module.exports = authMiddleware;

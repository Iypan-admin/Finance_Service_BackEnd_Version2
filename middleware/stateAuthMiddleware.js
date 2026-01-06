const jwt = require("jsonwebtoken");
require("dotenv").config();

const stateAuthMiddleware = (req, res, next) => {
    const token = req.header("Authorization");
    
    if (!token) {
        return res.status(401).json({ error: "Access denied, no token provided" });
    }

    try {
        const decoded = jwt.verify(token.split(" ")[1], process.env.SECRET_KEY);

        // Allow state, financial, admin, and manager roles
        if (!["state", "financial", "admin", "manager"].includes(decoded.role)) {
            return res.status(403).json({ error: "Access denied, you are not authorized" });
        }

        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};

module.exports = stateAuthMiddleware;








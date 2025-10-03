const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token
exports.generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            role: user.role 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Verify JWT token
exports.verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'No token provided' 
            });
        }
        
        const token = authHeader.substring(7);
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get fresh user data from database
        const [users] = await db.query(
            'SELECT id, name, email, role, credit_balance, is_active FROM tenants WHERE id = ? AND is_active = TRUE',
            [decoded.id]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ 
                error: 'User not found or inactive' 
            });
        }
        
        req.user = users[0];
        next();
        
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expired' 
            });
        }
        return res.status(401).json({ 
            error: 'Invalid token' 
        });
    }
};

// Verify API Key (for bridge connections)
exports.verifyApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey) {
            return res.status(401).json({ 
                error: 'No API key provided' 
            });
        }
        
        const [users] = await db.query(
            'SELECT id, name, email, role, credit_balance, is_active FROM tenants WHERE api_key = ? AND is_active = TRUE',
            [apiKey]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid API key' 
            });
        }
        
        req.user = users[0];
        next();
        
    } catch (error) {
        return res.status(500).json({ 
            error: 'Authentication error' 
        });
    }
};
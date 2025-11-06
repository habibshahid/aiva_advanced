const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token for user
exports.generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id,
            email: user.email,
            role: user.role,
            tenant_id: user.tenant_id
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Verify JWT token - Updated to use users table
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
        const [users] = await db.query(`
            SELECT 
                u.id,
                u.tenant_id,
                u.email,
                u.name,
                u.role,
                u.is_active,
                t.credit_balance,
                t.company_name as tenant_name
            FROM yovo_tbl_aiva_users u
            JOIN yovo_tbl_aiva_tenants t ON u.tenant_id = t.id
            WHERE u.id = ? AND u.is_active = TRUE
        `, [decoded.id]);
        
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

// Verify API Key (for bridge connections) - Updated to check tenant
exports.verifyApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey) {
            return res.status(401).json({ 
                error: 'No API key provided' 
            });
        }
        
        // API keys are still stored on tenants table
        const [tenants] = await db.query(
            'SELECT id, name, credit_balance, is_active FROM yovo_tbl_aiva_tenants WHERE api_key = ? AND is_active = TRUE',
            [apiKey]
        );
        
        if (tenants.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid API key' 
            });
        }
        
        // Set tenant info as user (for API key authentication)
        req.user = {
            id: tenants[0].id,
            tenant_id: tenants[0].id,
            name: tenants[0].name,
            role: 'admin', // API keys have admin role
            credit_balance: tenants[0].credit_balance,
            is_api_key_auth: true
        };
        
        next();
        
    } catch (error) {
        return res.status(500).json({ 
            error: 'Authentication error' 
        });
    }
};
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password required' 
            });
        }
        
        // Get user
        const [users] = await db.query(
            'SELECT * FROM tenants WHERE email = ? AND is_active = TRUE',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ 
                error: 'Invalid credentials' 
            });
        }
        
        const user = users[0];
        
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Invalid credentials' 
            });
        }
        
        // Generate token
        const token = generateToken(user);
        
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                credit_balance: parseFloat(user.credit_balance)
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Login failed' 
        });
    }
});

// Get current user
router.get('/me', verifyToken, async (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            credit_balance: parseFloat(req.user.credit_balance)
        }
    });
});

// Generate API key
router.post('/api-key/generate', verifyToken, async (req, res) => {
    try {
        const apiKey = `ak_${uuidv4().replace(/-/g, '')}`;
        
        await db.query(
            'UPDATE tenants SET api_key = ? WHERE id = ?',
            [apiKey, req.user.id]
        );
        
        res.json({ 
            api_key: apiKey 
        });
        
    } catch (error) {
        console.error('API key generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate API key' 
        });
    }
});

module.exports = router;
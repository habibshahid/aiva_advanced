const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const UserService = require('../services/UserService');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password required' 
            });
        }
        
        // Get user with password hash
        const user = await UserService.getUserByEmail(email);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid credentials' 
            });
        }
        
        // Verify password
        const validPassword = await UserService.verifyPassword(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Invalid credentials' 
            });
        }
        
        // Update last login
        await UserService.updateLastLogin(user.id);
        
        // Log action
        await UserService.logAction({
            user_id: user.id,
            tenant_id: user.tenant_id,
            action: 'login',
            ip_address: req.ip
        });
        
        // Generate token
        const token = generateToken(user);
        
        // Remove sensitive data
        delete user.password_hash;
        
        res.json({
            token,
            user: {
                id: user.id,
                tenant_id: user.tenant_id,
                name: user.name,
                email: user.email,
                role: user.role,
                tenant_name: user.tenant_name,
                company_name: user.company_name,
                credit_balance: parseFloat(user.tenant_credit_balance)
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Login failed' 
        });
    }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user
 * @access Private
 */
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await UserService.getUser(req.user.id);
        res.json({ user });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

/**
 * @route POST /api/auth/api-key/generate
 * @desc Generate API key for tenant
 * @access Private (admin or super_admin only)
 */
router.post('/api-key/generate', verifyToken, async (req, res) => {
    try {
        // Only admin and super_admin can generate API keys
        if (!['admin', 'super_admin'].includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions' 
            });
        }
        
        const apiKey = `ak_${uuidv4().replace(/-/g, '')}`;
        
        await db.query(
            'UPDATE yovo_tbl_aiva_tenants SET api_key = ? WHERE id = ?',
            [apiKey, req.user.tenant_id]
        );
        
        // Log action
        await UserService.logAction({
            user_id: req.user.id,
            tenant_id: req.user.tenant_id,
            action: 'api_key_generated',
            ip_address: req.ip
        });
        
        res.json({ api_key: apiKey });
        
    } catch (error) {
        console.error('API key generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate API key' 
        });
    }
});

/**
 * @route GET /api/auth/api-key
 * @desc Get current API key for tenant (masked)
 * @access Private (admin or super_admin only)
 */
router.get('/api-key', verifyToken, async (req, res) => {
    try {
        // Only admin and super_admin can view API keys
        if (!['admin', 'super_admin'].includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions' 
            });
        }
        
        const [tenants] = await db.query(
            'SELECT api_key, created_at, updated_at FROM yovo_tbl_aiva_tenants WHERE id = ?',
            [req.user.tenant_id]
        );
        
        if (tenants.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        
        const apiKey = tenants[0].api_key;
        
        res.json({ 
            api_key: apiKey || null,
            has_key: !!apiKey,
            // Show masked version for security
            masked_key: apiKey ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}` : null
        });
        
    } catch (error) {
        console.error('Get API key error:', error);
        res.status(500).json({ 
            error: 'Failed to get API key' 
        });
    }
});

/**
 * @route DELETE /api/auth/api-key
 * @desc Revoke/delete API key for tenant
 * @access Private (admin or super_admin only)
 */
router.delete('/api-key', verifyToken, async (req, res) => {
    try {
        // Only admin and super_admin can revoke API keys
        if (!['admin', 'super_admin'].includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions' 
            });
        }
        
        await db.query(
            'UPDATE yovo_tbl_aiva_tenants SET api_key = NULL WHERE id = ?',
            [req.user.tenant_id]
        );
        
        // Log action
        await UserService.logAction({
            user_id: req.user.id,
            tenant_id: req.user.tenant_id,
            action: 'api_key_revoked',
            ip_address: req.ip
        });
        
        res.json({ message: 'API key revoked successfully' });
        
    } catch (error) {
        console.error('Revoke API key error:', error);
        res.status(500).json({ 
            error: 'Failed to revoke API key' 
        });
    }
});

module.exports = router;
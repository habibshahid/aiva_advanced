const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const CreditService = require('../services/CreditService');

const router = express.Router();

// Get balance
router.get('/balance', verifyToken, async (req, res) => {
    try {
        const balance = await CreditService.getBalance(req.user.id);
        res.json({ balance });
    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({ error: 'Failed to get balance' });
    }
});

// Add credits (admin only)
router.post('/add', verifyToken, checkPermission('credits.add'), async (req, res) => {
    try {
        const { tenant_id, amount, note } = req.body;
        
        if (!tenant_id || !amount || amount <= 0) {
            return res.status(400).json({ 
                error: 'Invalid tenant_id or amount' 
            });
        }
        
        const result = await CreditService.addCredits(
            tenant_id,
            parseFloat(amount),
            req.user.id,
            note
        );
        
        res.json(result);
    } catch (error) {
        console.error('Add credits error:', error);
        res.status(500).json({ error: 'Failed to add credits' });
    }
});

// Get transaction history
router.get('/transactions', verifyToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const transactions = await CreditService.getTransactions(
            req.user.id,
            limit,
            offset
        );
        
        res.json({ transactions });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Failed to get transactions' });
    }
});

// Get usage statistics
router.get('/usage', verifyToken, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const stats = await CreditService.getUsageStats(req.user.id, days);
        res.json(stats);
    } catch (error) {
        console.error('Get usage stats error:', error);
        res.status(500).json({ error: 'Failed to get usage stats' });
    }
});

// Deduct credits (internal use by bridge)
router.post('/deduct', async (req, res) => {
    try {
        const { tenant_id, amount, call_log_id } = req.body;
        
        // Verify API key (bridge authentication)
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }
        
        // Verify it's a valid API key
        const [tenants] = await db.query(
            'SELECT id FROM tenants WHERE api_key = ?',
            [apiKey]
        );
        
        if (tenants.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        
        const result = await CreditService.deductCredits(
            tenant_id,
            parseFloat(amount),
            call_log_id
        );
        
        res.json(result);
    } catch (error) {
        console.error('Deduct credits error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
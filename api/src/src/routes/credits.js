const express = require('express');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const CreditService = require('../services/CreditService');

const router = express.Router();

// Middleware that accepts either JWT token OR API key
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (apiKey) {
        return verifyApiKey(req, res, next);
    } else {
        return verifyToken(req, res, next);
    }
};

// Get balance
router.get('/balance', authenticate, async (req, res) => {
    try {
        const balance = await CreditService.getBalance(req.user.tenant_id);
        res.json({ balance });
    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({ error: 'Failed to get balance' });
    }
});

// Add credits (admin only)
router.post('/add', authenticate, checkPermission('credits.add'), async (req, res) => {
    try {
        const { tenant_id, amount, note } = req.body;
        
        if (!tenant_id || !amount || amount <= 0) {
            return res.status(400).json({ 
                error: 'Invalid tenant_id or amount' 
            });
        }
        console.log(req.user)
        const result = await CreditService.addCredits(
            req.user.tenant_id,
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

// Deduct credits (internal use by bridge) - API Key only
router.post('/deduct', verifyApiKey, async (req, res) => {
    try {
        const { tenant_id, amount, call_log_id } = req.body;
        
        if (!tenant_id || !amount) {
            return res.status(400).json({ error: 'tenant_id and amount required' });
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

// Get transaction history
router.get('/transactions', authenticate, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const transactions = await CreditService.getTransactions(
            req.user.tenant_id,
            parseInt(limit),
            parseInt(offset)
        );
        
        res.json({ transactions });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Failed to get transactions' });
    }
});

// Get usage statistics
router.get('/usage', authenticate, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const stats = await CreditService.getUsageStats(req.user.tenant_id, parseInt(days));
        res.json(stats);
    } catch (error) {
        console.error('Get usage stats error:', error);
        res.status(500).json({ error: 'Failed to get usage stats' });
    }
});

module.exports = router;
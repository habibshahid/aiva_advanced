const express = require('express');
const { verifyToken } = require('../middleware/auth');
const https = require('https');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const router = express.Router();

// Get ephemeral token for realtime testing
router.post('/token', verifyToken, async (req, res) => {
    try {
        const { agent_id } = req.body;
        // Get agent to determine model
        const agent = await db.query(
            'SELECT model, voice FROM yovo_tbl_aiva_agents WHERE id = ?',
            [agent_id]
        );
        
        if (!agent || agent.length === 0) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        const model = agent[0].model || 'gpt-4o-mini-realtime-preview-2024-12-17';
        const voice = agent[0].voice || 'shimmer';
        
        // Get ephemeral key from OpenAI
        const postData = JSON.stringify({ model, voice });
        
        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/realtime/sessions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const request = https.request(options, (response) => {
            let data = '';
            
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', async () => {
                const jsonData = JSON.parse(data);
				const session_id = uuidv4();
				
				await db.query(
                    `INSERT INTO yovo_tbl_aiva_call_logs 
                    (id, session_id, tenant_id, agent_id, caller_id, start_time, status, asterisk_port) 
                    VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
                    [session_id, session_id, req.user.id, agent_id, 'web-test', 'in_progress', 0]
                );
				
                res.json({
                    ephemeral_key: jsonData.client_secret.value,
					session_id: session_id
                });
            });
        });
        
        request.on('error', (error) => {
            console.error('OpenAI API error:', error);
            res.status(500).json({ error: 'Failed to get ephemeral token' });
        });
        
        request.write(postData);
        request.end();
        
    } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

router.post('/finalize', verifyToken, async (req, res) => {
    try {
        const { session_id, duration_ms } = req.body;
        
        // Estimate cost (rough approximation)
        // Audio: ~$0.06/min for gpt-4o, ~$0.024/min for gpt-4o-mini
        // This is a simple estimate - for precise costs, track actual tokens/audio seconds
        const durationMinutes = duration_ms / 60000;
        const estimatedCost = durationMinutes * 0.024; // Using mini pricing
        
        // Update call log
        await db.query(
            `UPDATE yovo_tbl_aiva_call_logs 
            SET end_time = NOW(), 
                duration_seconds = ?,
                final_cost = ?,
                status = 'completed'
            WHERE session_id = ? AND tenant_id = ?`,
            [Math.floor(duration_ms / 1000), estimatedCost, session_id, req.user.id]
        );
        
        // Deduct credits
        await db.query(
            `UPDATE yovo_tbl_aiva_tenants 
            SET credit_balance = credit_balance - ? 
            WHERE id = ?`,
            [estimatedCost, req.user.id]
        );
        
		const logId = uuidv4();
        // Log transaction
		const [tenantDetails] = await db.query(
			'select * from yovo_tbl_aiva_tenants where id = ?',
			[req.user.id]
		);
		const balanceAfter = parseFloat(tenantDetails[0].credit_balance) - estimatedCost;
		
        await db.query(
            `INSERT INTO yovo_tbl_aiva_credit_transactions 
            (id, tenant_id, amount, reference_type, note, reference_id, balance_before, balance_after) 
            VALUES (?, ?, ?, 'call', ?, (SELECT id FROM yovo_tbl_aiva_call_logs WHERE session_id = ?), (SELECT credit_balance FROM yovo_tbl_aiva_tenants WHERE id = ?), ?)`,
            [logId, req.user.id, estimatedCost, 'Test call charge', session_id, req.user.id, balanceAfter]
        );
        
        res.json({ 
            success: true,
            cost: estimatedCost
        });
        
    } catch (error) {
        console.error('Finalize error:', error);
        res.status(500).json({ error: 'Failed to finalize cost' });
    }
});

module.exports = router;
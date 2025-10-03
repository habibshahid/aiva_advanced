const express = require('express');
const { verifyToken } = require('../middleware/auth');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const https = require('https');

const router = express.Router();

router.post('/generate-instructions', verifyToken, async (req, res) => {
    try {
        const { agent_name, agent_type, language, existing_instructions } = req.body;

        if (!agent_name) {
            return res.status(400).json({ error: 'Agent name is required' });
        }

        const prompt = `You are an expert AI agent designer. Generate professional, detailed instructions for a voice AI agent with the following specifications:

Agent Name: ${agent_name}
Agent Type: ${agent_type || 'general'}
Language: ${language || 'English'}
${existing_instructions ? `Current Instructions (refine these): ${existing_instructions}` : ''}

Create comprehensive instructions that include:
1. Agent's role and purpose
2. Communication style and tone
3. Key responsibilities
4. Handling edge cases and unclear requests
5. Constraints and what NOT to do

The instructions should be clear, actionable, and suitable for a voice conversation AI. Keep a conversational tone appropriate for phone calls.

Generate the instructions:`;

        const postData = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are an expert at creating instructions for voice AI agents. Generate clear, professional instructions optimized for natural phone conversations.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
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
                try {
                    const jsonData = JSON.parse(data);
                    
                    if (jsonData.error) {
                        return res.status(500).json({ error: jsonData.error.message });
                    }
                    
                    const generatedInstructions = jsonData.choices[0].message.content;
                    const inputTokens = jsonData.usage.prompt_tokens;
                    const outputTokens = jsonData.usage.completion_tokens;
                    
                    // Calculate cost (gpt-4o-mini pricing)
                    const inputCost = (inputTokens / 1000000) * 0.15;
                    const outputCost = (outputTokens / 1000000) * 0.60;
                    const totalCost = inputCost + outputCost;

                    console.log(`Generated instructions. Cost: $${totalCost.toFixed(6)}`);

                    // Deduct credits
                    await db.query(
                        'UPDATE yovo_tbl_aiva_tenants SET credit_balance = credit_balance - ? WHERE id = ?',
                        [totalCost, req.user.id]
                    );

                    // Log transaction
                    const logId = uuidv4();
					const referenceId = uuidv4();
					
					const [tenantDetails] = await db.query(
						'select * from yovo_tbl_aiva_tenants where id = ?',
						[req.user.id]
					);
					
					const balanceAfter = parseFloat(tenantDetails[0].credit_balance) - totalCost;
					// Log transaction
					await db.query(
						`INSERT INTO yovo_tbl_aiva_credit_transactions 
						(id, tenant_id, amount, reference_type, note, reference_id, balance_before, balance_after) 
						VALUES (?, ?, ?, 'debit', ?, ?, ?, ?)`,
						[logId, req.user.id, totalCost, `AI instruction generation for ${agent_name}`, referenceId, tenantDetails[0].credit_balance, balanceAfter]
					);

                    res.json({
                        instructions: generatedInstructions,
                        cost: totalCost,
                        tokens_used: {
                            input: inputTokens,
                            output: outputTokens,
                            total: inputTokens + outputTokens
                        }
                    });
                } catch (parseError) {
                    console.error('Parse error:', parseError);
                    res.status(500).json({ error: 'Failed to parse OpenAI response' });
                }
            });
        });

        request.on('error', (error) => {
            console.error('OpenAI API error:', error);
            res.status(500).json({ error: 'Failed to generate instructions' });
        });

        request.write(postData);
        request.end();

    } catch (error) {
        console.error('AI assist error:', error);
        res.status(500).json({ error: 'Failed to generate instructions' });
    }
});

module.exports = router;
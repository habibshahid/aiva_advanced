/**
 * Cost Calculator - Precise OpenAI Realtime API Cost Tracking
 * with configurable profit margin
 */

class CostCalculator {
    constructor(profitMarginPercent = 20) {
        this.profitMargin = profitMarginPercent / 100;
        
        // OpenAI Realtime API Pricing (as of Jan 2025)
        this.pricing = {
            'gpt-4o': {
                audio: {
                    input: 0.10 / 60,    // $0.10 per minute = $0.00166... per second
                    output: 0.40 / 60    // $0.40 per minute = $0.00666... per second
                },
                text: {
                    input: 5.00 / 1000000,   // $5.00 per 1M tokens
                    output: 15.00 / 1000000,  // $15.00 per 1M tokens
                    cached: 2.50 / 1000000    // $2.50 per 1M cached tokens
                }
            },
            'gpt-4o-mini': {
                audio: {
                    input: 0.06 / 60,    // $0.06 per minute
                    output: 0.24 / 60    // $0.24 per minute
                },
                text: {
                    input: 0.15 / 1000000,   // $0.15 per 1M tokens
                    output: 0.60 / 1000000,  // $0.60 per 1M tokens
                    cached: 0.075 / 1000000  // $0.075 per 1M cached tokens
                }
            },
            'gpt-4o-realtime-preview': {
                audio: {
                    input: 0.06 / 60,
                    output: 0.24 / 60
                },
                text: {
                    input: 2.50 / 1000000,
                    output: 10.00 / 1000000,
                    cached: 1.25 / 1000000
                }
            }
        };
        
        this.sessions = new Map();
    }
    
    initSession(sessionId, model = 'gpt-4o-mini') {
        this.sessions.set(sessionId, {
            model: model,
            startTime: Date.now(),
            audio: {
                inputSeconds: 0,
                outputSeconds: 0,
                inputStartTime: null,
                outputStartTime: null
            },
            text: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0
            },
            events: []
        });
    }
    
    startAudioInput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || session.audio.inputStartTime) return;
        
        session.audio.inputStartTime = Date.now();
        session.events.push({ type: 'audio_input_start', timestamp: Date.now() });
    }
    
    stopAudioInput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.audio.inputStartTime) return;
        
        const duration = (Date.now() - session.audio.inputStartTime) / 1000;
        session.audio.inputSeconds += duration;
        session.audio.inputStartTime = null;
        session.events.push({ 
            type: 'audio_input_stop', 
            timestamp: Date.now(),
            duration: duration
        });
    }
    
    startAudioOutput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || session.audio.outputStartTime) return;
        
        session.audio.outputStartTime = Date.now();
        session.events.push({ type: 'audio_output_start', timestamp: Date.now() });
    }
    
    stopAudioOutput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.audio.outputStartTime) return;
        
        const duration = (Date.now() - session.audio.outputStartTime) / 1000;
        session.audio.outputSeconds += duration;
        session.audio.outputStartTime = null;
        session.events.push({ 
            type: 'audio_output_stop', 
            timestamp: Date.now(),
            duration: duration
        });
    }
    
    updateTokenUsage(sessionId, usage) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        
        // Extract token details from OpenAI response
        const audioInputTokens = usage.input_token_details?.audio_tokens || 0;
        const audioOutputTokens = usage.output_token_details?.audio_tokens || 0;
        const cachedTokens = usage.input_token_details?.cached_tokens || 0;
        
        // Text tokens are total minus audio tokens
        session.text.inputTokens = usage.input_tokens - audioInputTokens;
        session.text.outputTokens = usage.output_tokens - audioOutputTokens;
        session.text.cachedTokens = cachedTokens;
        
        session.events.push({
            type: 'token_usage_update',
            timestamp: Date.now(),
            usage: usage
        });
    }
    
    calculateCost(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
			console.log(`[COST] No session found: ${sessionId}`);
			return null;
		}
        
        const rates = this.pricing[session.model] || this.pricing['gpt-4o-mini'];
        const sessionDuration = (Date.now() - session.startTime) / 1000;
        
		console.log(`[COST-DEBUG] Session: ${sessionId}`);
		console.log(`[COST-DEBUG] Audio input seconds: ${session.audio.inputSeconds}`);
		console.log(`[COST-DEBUG] Audio output seconds: ${session.audio.outputSeconds}`);
		console.log(`[COST-DEBUG] Text input tokens: ${session.text.inputTokens}`);
		console.log(`[COST-DEBUG] Text output tokens: ${session.text.outputTokens}`);
		
        // Calculate base costs
        const audioInputCost = session.audio.inputSeconds * rates.audio.input;
        const audioOutputCost = session.audio.outputSeconds * rates.audio.output;
        const textInputCost = session.text.inputTokens * rates.text.input;
        const textOutputCost = session.text.outputTokens * rates.text.output;
        const cachedCost = session.text.cachedTokens * rates.text.cached;
        
		console.log(`[COST-DEBUG] Audio input cost: $${audioInputCost.toFixed(4)}`);
		console.log(`[COST-DEBUG] Audio output cost: $${audioOutputCost.toFixed(4)}`);
		console.log(`[COST-DEBUG] Text input cost: $${textInputCost.toFixed(4)}`);
		console.log(`[COST-DEBUG] Text output cost: $${textOutputCost.toFixed(4)}`);
		
        const baseTotalCost = audioInputCost + audioOutputCost + textInputCost + textOutputCost + cachedCost;
        
		console.log(`[COST-DEBUG] Base total: $${baseTotalCost.toFixed(4)}`);
		
        // Apply profit margin
        const profitAmount = baseTotalCost * this.profitMargin;
        const finalCost = baseTotalCost + profitAmount;
        
        return {
            sessionId: sessionId,
            model: session.model,
            duration: {
                seconds: sessionDuration,
                formatted: this.formatDuration(sessionDuration)
            },
            audio: {
                input: {
                    seconds: session.audio.inputSeconds,
                    formatted: `${session.audio.inputSeconds.toFixed(2)}s`,
                    costPerSecond: rates.audio.input,
                    cost: audioInputCost
                },
                output: {
                    seconds: session.audio.outputSeconds,
                    formatted: `${session.audio.outputSeconds.toFixed(2)}s`,
                    costPerSecond: rates.audio.output,
                    cost: audioOutputCost
                },
                totalCost: audioInputCost + audioOutputCost
            },
            text: {
                input: {
                    tokens: session.text.inputTokens,
                    costPerToken: rates.text.input,
                    cost: textInputCost
                },
                output: {
                    tokens: session.text.outputTokens,
                    costPerToken: rates.text.output,
                    cost: textOutputCost
                },
                cached: {
                    tokens: session.text.cachedTokens,
                    costPerToken: rates.text.cached,
                    cost: cachedCost,
                    note: 'Cached tokens reduce input costs'
                },
                totalCost: textInputCost + textOutputCost + cachedCost
            },
            costs: {
                baseCost: baseTotalCost,
                profitMargin: `${(this.profitMargin * 100).toFixed(1)}%`,
                profitAmount: profitAmount,
                finalCost: finalCost
            },
            formatted: {
                baseCost: `$${baseTotalCost.toFixed(4)}`,
                profitAmount: `$${profitAmount.toFixed(4)}`,
                finalCost: `$${finalCost.toFixed(4)}`,
                costPerMinute: sessionDuration > 0 ? `$${(finalCost * 60 / sessionDuration).toFixed(3)}/min` : 'N/A',
                costPerHour: sessionDuration > 0 ? `$${(finalCost * 3600 / sessionDuration).toFixed(2)}/hr` : 'N/A'
            },
            breakdown: {
                audioCost: `$${(audioInputCost + audioOutputCost).toFixed(4)}`,
                textCost: `$${(textInputCost + textOutputCost + cachedCost).toFixed(4)}`,
                audioPercentage: baseTotalCost > 0 ? `${((audioInputCost + audioOutputCost) / baseTotalCost * 100).toFixed(1)}%` : '0%',
                textPercentage: baseTotalCost > 0 ? `${((textInputCost + textOutputCost + cachedCost) / baseTotalCost * 100).toFixed(1)}%` : '0%'
            }
        };
    }
    
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }
    
    getSessionEvents(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? session.events : [];
    }
    
    endSession(sessionId) {
        const finalCost = this.calculateCost(sessionId);
        this.sessions.delete(sessionId);
        return finalCost;
    }
    
    setProfitMargin(percent) {
        this.profitMargin = percent / 100;
    }
}

module.exports = CostCalculator;
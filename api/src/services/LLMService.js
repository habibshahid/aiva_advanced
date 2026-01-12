/**
 * Multi-Provider LLM Service
 * 
 * Supports: OpenAI, Groq, Anthropic, DeepSeek, Moonshot (Kimi)
 * All providers use OpenAI-compatible format except Anthropic
 * 
 * Usage:
 *   const llmService = require('./llm-service');
 *   const result = await llmService.chat(messages, { model: 'groq/llama-3.3-70b-versatile' });
 */

require('dotenv').config();
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

// ============================================
// PROVIDER CONFIGURATION
// ============================================
const PROVIDERS = {
    openai: {
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        apiKeyEnv: 'OPENAI_API_KEY',
        supportsJsonMode: true,
        supportsVision: true
    },
    groq: {
        name: 'Groq',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKeyEnv: 'GROQ_API_KEY',
        supportsJsonMode: true,
        supportsVision: false  // Groq vision is limited
    },
    deepseek: {
        name: 'DeepSeek',
        baseURL: 'https://api.deepseek.com/v1',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        supportsJsonMode: true,
        supportsVision: false
    },
    anthropic: {
        name: 'Anthropic',
        baseURL: 'https://api.anthropic.com',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        supportsJsonMode: false,  // Uses different method
        supportsVision: true,
        isNonOpenAI: true
    },
    moonshot: {
        name: 'Moonshot (Kimi)',
        baseURL: 'https://api.moonshot.cn/v1',
        apiKeyEnv: 'MOONSHOT_API_KEY',
        supportsJsonMode: true,
        supportsVision: true
    }
};

// ============================================
// MODEL PRICING (per 1M tokens)
// Updated: December 2024
// ============================================
const MODEL_PRICING = {
    // OpenAI Models
    'gpt-4o': { input: 2.50, output: 10.00, cached_input: 1.25, provider: 'openai' },
    'gpt-4o-mini': { input: 0.15, output: 0.60, cached_input: 0.075, provider: 'openai' },
    'gpt-4-turbo': { input: 10.00, output: 30.00, provider: 'openai' },
    'gpt-4': { input: 30.00, output: 60.00, provider: 'openai' },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50, provider: 'openai' },
    'o1': { input: 15.00, output: 60.00, provider: 'openai' },
    'o1-mini': { input: 3.00, output: 12.00, provider: 'openai' },
    
	// ============================================
	// GROQ MODELS (Updated December 2024)
	// ============================================
	'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.11, output: 0.34, provider: 'groq' },
	'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.20, output: 0.60, provider: 'groq' },
	'qwen/qwen3-32b': { input: 0.29, output: 0.59, provider: 'groq' },
	'openai/gpt-oss-120b': { input: 0.15, output: 0.60, provider: 'groq' },
	'openai/gpt-oss-20b': { input: 0.075, output: 0.30, provider: 'groq' },
    
    // Anthropic Models
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00, cached_input: 0.30, provider: 'anthropic' },
    'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00, cached_input: 0.08, provider: 'anthropic' },
    'claude-3-opus-20240229': { input: 15.00, output: 75.00, cached_input: 1.50, provider: 'anthropic' },
    'claude-3-sonnet-20240229': { input: 3.00, output: 15.00, provider: 'anthropic' },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25, cached_input: 0.03, provider: 'anthropic' },
    
    // DeepSeek Models (very cheap)
    'deepseek-chat': { input: 0.14, output: 0.28, cached_input: 0.014, provider: 'deepseek' },
    'deepseek-coder': { input: 0.14, output: 0.28, cached_input: 0.014, provider: 'deepseek' },
    'deepseek-reasoner': { input: 0.55, output: 2.19, cached_input: 0.14, provider: 'deepseek' },
    
    // Moonshot/Kimi Models
    'moonshot-v1-8k': { input: 0.12, output: 0.12, provider: 'moonshot' },
    'moonshot-v1-32k': { input: 0.24, output: 0.24, provider: 'moonshot' },
    'moonshot-v1-128k': { input: 0.60, output: 0.60, provider: 'moonshot' },
    'kimi-latest': { input: 0.60, output: 0.60, provider: 'moonshot' }
};

// Model aliases for convenience
const MODEL_ALIASES = {
    // Shortcuts
    'groq': 'llama-3.3-70b-versatile',
    'groq-fast': 'llama-3.1-8b-instant',
    'groq-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'groq-maverick': 'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama4': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen': 'qwen/qwen3-32b',
    'gpt-oss': 'openai/gpt-oss-120b',
    'claude': 'claude-3-5-sonnet-20241022',
    'claude-haiku': 'claude-3-5-haiku-20241022',
    'claude-opus': 'claude-3-opus-20240229',
    'deepseek': 'deepseek-chat',
    'deepseek-r1': 'deepseek-reasoner',
    'kimi': 'moonshot-v1-128k',
    'kimi-v2': 'moonshot-v1-32k',
    'kimi-v3': 'kimi-latest',
    
    // Provider prefixes (provider/model format)
    'openai/gpt-4o': 'gpt-4o',
    'openai/gpt-4o-mini': 'gpt-4o-mini',
    'groq/llama-3.3-70b': 'llama-3.3-70b-versatile',
    'groq/llama-3.1-8b': 'llama-3.1-8b-instant',
    'anthropic/claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
    'anthropic/claude-3.5-haiku': 'claude-3-5-haiku-20241022',
    'deepseek/chat': 'deepseek-chat',
    'deepseek/reasoner': 'deepseek-reasoner',
    'moonshot/kimi': 'kimi-latest'
};

class LLMService {
    constructor() {
        this.clients = {};
        this.profitMargin = parseFloat(process.env.PROFIT_MARGIN_PERCENT || 20) / 100;
        this._initializeClients();
    }
    
    /**
     * Initialize API clients for each provider
     */
    _initializeClients() {
        // OpenAI
        if (process.env.OPENAI_API_KEY) {
            this.clients.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }
        
        // Groq (OpenAI-compatible)
        if (process.env.GROQ_API_KEY) {
            this.clients.groq = new OpenAI({
                apiKey: process.env.GROQ_API_KEY,
                baseURL: PROVIDERS.groq.baseURL
            });
        }
        
        // DeepSeek (OpenAI-compatible)
        if (process.env.DEEPSEEK_API_KEY) {
            this.clients.deepseek = new OpenAI({
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: PROVIDERS.deepseek.baseURL
            });
        }
        
        // Anthropic (different SDK)
        if (process.env.ANTHROPIC_API_KEY) {
            this.clients.anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY
            });
        }
        
        // Moonshot/Kimi (OpenAI-compatible)
        if (process.env.MOONSHOT_API_KEY) {
            this.clients.moonshot = new OpenAI({
                apiKey: process.env.MOONSHOT_API_KEY,
                baseURL: PROVIDERS.moonshot.baseURL
            });
        }
        
        console.log('🤖 LLM Service initialized with providers:', Object.keys(this.clients).join(', '));
    }
    
    /**
     * Resolve model name from alias
     */
    _resolveModel(model) {
        return MODEL_ALIASES[model] || model;
    }
    
    /**
     * Get provider for a model
     */
    _getProvider(model) {
		const resolvedModel = this._resolveModel(model);
		const pricing = MODEL_PRICING[resolvedModel];
		
		if (!pricing) {
			// Try to infer from model name
			if (resolvedModel.startsWith('gpt-') || resolvedModel.startsWith('o1')) return 'openai';
			if (resolvedModel.startsWith('claude-')) return 'anthropic';
			// UPDATED: Handle Groq model prefixes
			if (resolvedModel.startsWith('llama-') || 
				resolvedModel.startsWith('meta-llama/') ||    // ADD THIS
				resolvedModel.startsWith('qwen/') ||          // ADD THIS
				resolvedModel.startsWith('openai/gpt-oss') || // ADD THIS (GPT-OSS on Groq)
				resolvedModel.startsWith('mixtral') || 
				resolvedModel.startsWith('gemma')) return 'groq';
			if (resolvedModel.startsWith('deepseek-')) return 'deepseek';
			if (resolvedModel.startsWith('moonshot-') || resolvedModel.startsWith('kimi')) return 'moonshot';
			return 'openai'; // Default
		}
		
		return pricing.provider;
	}
    
    /**
     * Get client for a model
     */
    _getClient(model) {
        const provider = this._getProvider(model);
        const client = this.clients[provider];
        
        if (!client) {
            throw new Error(`No API key configured for provider: ${provider}. Set ${PROVIDERS[provider]?.apiKeyEnv} in .env`);
        }
        
        return { client, provider };
    }
    
    /**
     * Calculate cost for a completion
     */
    calculateCost(usage, model) {
        const resolvedModel = this._resolveModel(model);
        const pricing = MODEL_PRICING[resolvedModel] || MODEL_PRICING['gpt-4o-mini'];
        
        const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
        const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
        const cachedTokens = usage.cached_tokens || usage.cache_read_input_tokens || 0;
        
        // Calculate costs
        const inputCost = (inputTokens / 1_000_000) * pricing.input;
        const outputCost = (outputTokens / 1_000_000) * pricing.output;
        const cachedCost = pricing.cached_input 
            ? (cachedTokens / 1_000_000) * pricing.cached_input 
            : 0;
        
        const baseCost = inputCost + outputCost + cachedCost;
        const profitAmount = baseCost * this.profitMargin;
        const finalCost = baseCost + profitAmount;
        
        return {
            provider: pricing.provider,
            model: resolvedModel,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cached_tokens: cachedTokens,
            input_cost: inputCost,
            output_cost: outputCost,
            cached_cost: cachedCost,
            base_cost: baseCost,
            profit_amount: profitAmount,
            final_cost: finalCost,
            pricing_per_1m: {
                input: pricing.input,
                output: pricing.output,
                cached_input: pricing.cached_input || null
            }
        };
    }
    
    /**
     * Main chat completion method
     * 
     * @param {Array} messages - Array of message objects
     * @param {Object} options - Options
     * @param {string} options.model - Model name (can include provider prefix)
     * @param {number} options.temperature - Temperature (0-2)
     * @param {number} options.max_tokens - Max output tokens
     * @param {boolean} options.json_mode - Request JSON response
     * @param {string} options.system - System prompt (for Anthropic)
     * @returns {Object} { content, usage, cost, provider, model }
     */
    async chat(messages, options = {}) {
        const {
            model = 'gpt-4o-mini',
            temperature = 0.7,
            max_tokens = 4096,
            json_mode = false,
            system = null
        } = options;
        
        const resolvedModel = this._resolveModel(model);
        const { client, provider } = this._getClient(resolvedModel);
        
        console.log(`🤖 LLM Request: ${provider}/${resolvedModel}`);
        
        let result;
        
        if (provider === 'anthropic') {
            result = await this._chatAnthropic(client, messages, {
                model: resolvedModel,
                temperature,
                max_tokens,
                json_mode,
                system
            });
        } else {
            result = await this._chatOpenAICompatible(client, messages, {
                model: resolvedModel,
                temperature,
                max_tokens,
                json_mode,
                provider
            });
        }
        
        // Calculate cost
        const cost = this.calculateCost(result.usage, resolvedModel);
        
        console.log(`💰 LLM Cost: $${cost.final_cost.toFixed(6)} (${cost.input_tokens} in / ${cost.output_tokens} out)`);
        
        return {
            content: result.content,
            usage: result.usage,
            cost: cost,
            provider: provider,
            model: resolvedModel,
            raw_response: result.raw
        };
    }
    
    /**
     * Chat with OpenAI-compatible API (OpenAI, Groq, DeepSeek, Moonshot)
     */
    async _chatOpenAICompatible(client, messages, options) {
        const { model, temperature, max_tokens, json_mode, provider } = options;
        
        const requestParams = {
            model: model,
            messages: messages,
            temperature: temperature,
            max_tokens: max_tokens
        };
        
        // Add JSON mode if supported and requested
        if (json_mode && PROVIDERS[provider]?.supportsJsonMode) {
            requestParams.response_format = { type: "json_object" };
        }
        
        const completion = await client.chat.completions.create(requestParams);
        
        return {
            content: completion.choices[0].message.content,
            usage: {
                prompt_tokens: completion.usage.prompt_tokens,
                completion_tokens: completion.usage.completion_tokens,
                total_tokens: completion.usage.total_tokens,
                cached_tokens: completion.usage.prompt_tokens_details?.cached_tokens || 0
            },
            raw: completion
        };
    }
    
    /**
     * Chat with Anthropic API
     */
    async _chatAnthropic(client, messages, options) {
        const { model, temperature, max_tokens, json_mode, system } = options;
        
        // Extract system message from messages array or use provided system
        let systemPrompt = system;
        let filteredMessages = messages;
        
        if (!systemPrompt) {
            const systemMsg = messages.find(m => m.role === 'system');
            if (systemMsg) {
                systemPrompt = systemMsg.content;
                filteredMessages = messages.filter(m => m.role !== 'system');
            }
        }
        
        // Convert messages to Anthropic format
        const anthropicMessages = filteredMessages.map(msg => {
            // Handle vision messages
            if (Array.isArray(msg.content)) {
                return {
                    role: msg.role,
                    content: msg.content.map(part => {
                        if (part.type === 'text') {
                            return { type: 'text', text: part.text };
                        } else if (part.type === 'image_url') {
                            // Extract base64 from data URL or use URL directly
                            const url = part.image_url.url;
                            if (url.startsWith('data:')) {
                                const [mediaInfo, base64Data] = url.split(',');
                                const mediaType = mediaInfo.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                                return {
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: mediaType,
                                        data: base64Data
                                    }
                                };
                            } else {
                                return {
                                    type: 'image',
                                    source: {
                                        type: 'url',
                                        url: url
                                    }
                                };
                            }
                        }
                        return part;
                    })
                };
            }
            return {
                role: msg.role,
                content: msg.content
            };
        });
        
        // Add JSON instruction if json_mode requested
        if (json_mode && systemPrompt) {
            systemPrompt += '\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no explanation, just pure JSON.';
        }
        
        const requestParams = {
            model: model,
            max_tokens: max_tokens,
            messages: anthropicMessages
        };
        
        if (systemPrompt) {
            requestParams.system = systemPrompt;
        }
        
        // Anthropic doesn't support temperature > 1
        if (temperature <= 1) {
            requestParams.temperature = temperature;
        }
        
        const response = await client.messages.create(requestParams);
        
        return {
            content: response.content[0].text,
            usage: {
                prompt_tokens: response.usage.input_tokens,
                completion_tokens: response.usage.output_tokens,
                total_tokens: response.usage.input_tokens + response.usage.output_tokens,
                cached_tokens: response.usage.cache_read_input_tokens || 0
            },
            raw: response
        };
    }
    
    /**
     * Get available models grouped by provider
     */
    getAvailableModels() {
        const models = {};
        
        for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
            const provider = pricing.provider;
            if (!models[provider]) {
                models[provider] = [];
            }
            models[provider].push({
                model: model,
                input_per_1m: pricing.input,
                output_per_1m: pricing.output,
                cached_input_per_1m: pricing.cached_input || null,
                available: !!this.clients[provider]
            });
        }
        
        return models;
    }
    
    /**
     * Get pricing comparison for a sample request
     */
    getPricingComparison(inputTokens = 1000, outputTokens = 500) {
        const comparison = [];
        
        for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
            const inputCost = (inputTokens / 1_000_000) * pricing.input;
            const outputCost = (outputTokens / 1_000_000) * pricing.output;
            const totalCost = inputCost + outputCost;
            
            comparison.push({
                model: model,
                provider: pricing.provider,
                input_cost: inputCost,
                output_cost: outputCost,
                total_cost: totalCost,
                available: !!this.clients[pricing.provider]
            });
        }
        
        // Sort by total cost
        comparison.sort((a, b) => a.total_cost - b.total_cost);
        
        return comparison;
    }
    
    /**
     * Check which providers are configured
     */
    getConfiguredProviders() {
        return Object.entries(this.clients).map(([provider, client]) => ({
            provider: provider,
            name: PROVIDERS[provider]?.name || provider,
            configured: !!client
        }));
    }
}

// Export singleton
module.exports = new LLMService();

// Also export class for testing
module.exports.LLMService = LLMService;
module.exports.MODEL_PRICING = MODEL_PRICING;
module.exports.PROVIDERS = PROVIDERS;
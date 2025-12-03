/**
 * LLM Handler
 * Handles text completion with Groq (primary) and OpenAI (fallback)
 * 
 * Features:
 * - Streaming responses for low latency
 * - Function calling support
 * - Automatic fallback on errors
 * - Conversation context management
 */

const EventEmitter = require('events');
const https = require('https');

class LLMHandler extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Primary: Groq
            groqApiKey: config.groqApiKey || process.env.GROQ_API_KEY,
            groqModel: config.groqModel || 'llama-3.3-70b-versatile',
            
            // Fallback: OpenAI
            openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
            openaiModel: config.openaiModel || 'gpt-4o-mini',
            
            // Which provider to try first: 'groq' or 'openai'
            preferredProvider: config.preferredProvider || 'groq',
            
            // Settings
            temperature: config.temperature || 0.7,
            maxTokens: config.maxTokens || 1024,
            
            ...config
        };
        
        console.log(`[LLM] Initialized: preferred=${this.config.preferredProvider}, groqModel=${this.config.groqModel}, openaiModel=${this.config.openaiModel}`);
        
        // Conversation context
        this.conversationHistory = [];
        this.systemPrompt = '';
        this.functions = [];
        
        // Metrics
        this.metrics = {
            groqCalls: 0,
            openaiCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            errors: 0
        };
        
        // State
        this.isProcessing = false;
        this.currentAbortController = null;
    }
    
    /**
     * Configure the LLM with system prompt and functions
     */
    configure(config) {
        if (config.systemPrompt) {
            this.systemPrompt = config.systemPrompt;
        }
        
        if (config.functions) {
            this.functions = this.formatFunctions(config.functions);
        }
        
        if (config.conversationHistory) {
            this.conversationHistory = config.conversationHistory;
        }
        
        console.log('[LLM] Configured with:', {
            systemPromptLength: this.systemPrompt.length,
            functionsCount: this.functions.length
        });
    }
    
    /**
     * Format functions for API consumption
     * Handles multiple input formats:
     * 1. Already correct: { type: 'function', function: { name, description, parameters } }
     * 2. Wrong wrapper: { type: 'function', name, description, parameters }
     * 3. Simple format: { name, description, parameters }
     * 4. Database format with extra fields: { id, name, description, parameters, handler_type, ... }
     */
    formatFunctions(functions) {
        if (!functions || !Array.isArray(functions)) {
            return [];
        }
        
        return functions
            .filter(fn => fn && fn.name) // Filter out invalid functions
            .map(fn => {
                // Case 1: Already in correct format with nested function object
                if (fn.type === 'function' && fn.function && fn.function.name) {
                    return fn;
                }
                
                // Case 2: Wrong format - has type but name is at top level, not nested
                // { type: 'function', name: '...', description: '...', parameters: {...} }
                if (fn.type === 'function' && fn.name) {
                    return {
                        type: 'function',
                        function: {
                            name: fn.name,
                            description: fn.description || '',
                            parameters: fn.parameters || { type: 'object', properties: {} }
                        }
                    };
                }
                
                // Case 3 & 4: Simple format or database format
                // { name: '...', description: '...', parameters: {...}, ... }
                return {
                    type: 'function',
                    function: {
                        name: fn.name,
                        description: fn.description || '',
                        parameters: fn.parameters || { type: 'object', properties: {} }
                    }
                };
            });
    }
    
    /**
     * Generate a response to user input
     * @param {string} userMessage - User's message
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response object
     */
    async generateResponse(userMessage, options = {}) {
        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });
        
        // Limit history to prevent context overflow
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }
        
        this.isProcessing = true;
        
        try {
            // Use preferred provider first
            const useGroqFirst = this.config.preferredProvider === 'groq';
            
            if (useGroqFirst && this.config.groqApiKey) {
                // Try Groq first
                try {
                    const response = await this.callGroq(options);
                    this.isProcessing = false;
                    return response;
                } catch (error) {
                    console.warn('[LLM] Groq failed, falling back to OpenAI:', error.message);
                    this.metrics.errors++;
                }
                
                // Fallback to OpenAI
                if (this.config.openaiApiKey) {
                    const response = await this.callOpenAI(options);
                    this.isProcessing = false;
                    return response;
                }
            } else if (this.config.openaiApiKey) {
                // Try OpenAI first (preferred or Groq not available)
                try {
                    const response = await this.callOpenAI(options);
                    this.isProcessing = false;
                    return response;
                } catch (error) {
                    console.warn('[LLM] OpenAI failed, falling back to Groq:', error.message);
                    this.metrics.errors++;
                }
                
                // Fallback to Groq
                if (this.config.groqApiKey) {
                    const response = await this.callGroq(options);
                    this.isProcessing = false;
                    return response;
                }
            }
            
            throw new Error('No LLM API key configured');
            
        } catch (error) {
            this.isProcessing = false;
            this.metrics.errors++;
            throw error;
        }
    }
    
    /**
     * Generate streaming response
     * Emits 'token' events for each chunk
     */
    async generateStreamingResponse(userMessage, options = {}) {
        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });
        
        // Limit history
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }
        
        this.isProcessing = true;
        this.currentAbortController = new AbortController();
        
        try {
            // Use preferred provider first
            const useGroqFirst = this.config.preferredProvider === 'groq';
            
            if (useGroqFirst && this.config.groqApiKey) {
                // Try Groq streaming first
                try {
                    return await this.streamGroq(options);
                } catch (error) {
                    console.warn('[LLM] Groq streaming failed, falling back to OpenAI:', error.message);
                }
                
                // Fallback to OpenAI streaming
                if (this.config.openaiApiKey) {
                    return await this.streamOpenAI(options);
                }
            } else if (this.config.openaiApiKey) {
                // Try OpenAI streaming first (preferred or Groq not available)
                try {
                    return await this.streamOpenAI(options);
                } catch (error) {
                    console.warn('[LLM] OpenAI streaming failed, falling back to Groq:', error.message);
                }
                
                // Fallback to Groq streaming
                if (this.config.groqApiKey) {
                    return await this.streamGroq(options);
                }
            }
            
            throw new Error('No LLM API key configured');
            
        } finally {
            this.isProcessing = false;
            this.currentAbortController = null;
        }
    }
    
    /**
     * Call Groq API (non-streaming)
     */
    async callGroq(options = {}) {
        const messages = this.buildMessages();
        
        const body = {
            model: this.config.groqModel,
            messages: messages,
            temperature: options.temperature || this.config.temperature,
            max_tokens: options.maxTokens || this.config.maxTokens
        };
        
        // Add tools if available
        if (this.functions.length > 0) {
            body.tools = this.functions;
            body.tool_choice = 'auto';
        }
        
        const response = await this.httpRequest({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.groqApiKey}`,
                'Content-Type': 'application/json'
            }
        }, JSON.stringify(body));
        
        this.metrics.groqCalls++;
        
        return this.processResponse(response, 'groq');
    }
    
    /**
     * Call OpenAI API (non-streaming)
     */
    async callOpenAI(options = {}) {
        const messages = this.buildMessages();
        
        const body = {
            model: this.config.openaiModel,
            messages: messages,
            temperature: options.temperature || this.config.temperature,
            max_tokens: options.maxTokens || this.config.maxTokens
        };
        
        // Add tools if available
        if (this.functions.length > 0) {
            body.tools = this.functions;
            body.tool_choice = 'auto';
        }
        
        const response = await this.httpRequest({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.openaiApiKey}`,
                'Content-Type': 'application/json'
            }
        }, JSON.stringify(body));
        
        this.metrics.openaiCalls++;
        
        return this.processResponse(response, 'openai');
    }
    
    /**
     * Stream from Groq API
     */
    async streamGroq(options = {}) {
        const messages = this.buildMessages();
        
        const body = {
            model: this.config.groqModel,
            messages: messages,
            temperature: options.temperature || this.config.temperature,
            max_tokens: options.maxTokens || this.config.maxTokens,
            stream: true
        };
        
        // Add tools if available
        if (this.functions.length > 0) {
            body.tools = this.functions;
            body.tool_choice = 'auto';
        }
        
        this.metrics.groqCalls++;
        
        return this.streamRequest({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.groqApiKey}`,
                'Content-Type': 'application/json'
            }
        }, JSON.stringify(body), 'groq');
    }
    
    /**
     * Stream from OpenAI API
     */
    async streamOpenAI(options = {}) {
        const messages = this.buildMessages();
        
        const body = {
            model: this.config.openaiModel,
            messages: messages,
            temperature: options.temperature || this.config.temperature,
            max_tokens: options.maxTokens || this.config.maxTokens,
            stream: true
        };
        
        // Add tools if available
        if (this.functions.length > 0) {
            body.tools = this.functions;
            body.tool_choice = 'auto';
        }
        
        this.metrics.openaiCalls++;
        
        return this.streamRequest({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.openaiApiKey}`,
                'Content-Type': 'application/json'
            }
        }, JSON.stringify(body), 'openai');
    }
    
    /**
     * Build messages array with system prompt and history
     */
    buildMessages() {
        const messages = [];
        
        if (this.systemPrompt) {
            messages.push({
                role: 'system',
                content: this.systemPrompt
            });
        }
        
        messages.push(...this.conversationHistory);
        
        return messages;
    }
    
    /**
     * Process non-streaming response
     */
    processResponse(response, provider) {
        const choice = response.choices?.[0];
        
        if (!choice) {
            throw new Error('No response from LLM');
        }
        
        // Update metrics
        if (response.usage) {
            this.metrics.inputTokens += response.usage.prompt_tokens || 0;
            this.metrics.outputTokens += response.usage.completion_tokens || 0;
        }
        
        const result = {
            provider: provider,
            content: choice.message?.content || '',
            finishReason: choice.finish_reason,
            functionCall: null
        };
        
        // Check for function/tool calls
        if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
            const toolCall = choice.message.tool_calls[0];
            result.functionCall = {
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: toolCall.function.arguments
            };
        }
        
        // Add assistant response to history
        if (result.content) {
            this.conversationHistory.push({
                role: 'assistant',
                content: result.content
            });
        }
        
        return result;
    }
    
    /**
     * HTTP request helper
     */
    httpRequest(options, body) {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        
                        if (res.statusCode >= 400) {
                            reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
                        } else {
                            resolve(json);
                        }
                    } catch (e) {
                        reject(new Error(`Invalid JSON response: ${data.substring(0, 100)}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
    
    /**
     * Streaming request helper
     */
    streamRequest(options, body, provider) {
        return new Promise((resolve, reject) => {
            let fullContent = '';
            let functionCall = null;
            let functionArgs = '';
            
            const req = https.request(options, (res) => {
                if (res.statusCode >= 400) {
                    let errorData = '';
                    res.on('data', chunk => errorData += chunk);
                    res.on('end', () => {
                        reject(new Error(`HTTP ${res.statusCode}: ${errorData}`));
                    });
                    return;
                }
                
                res.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            
                            if (data === '[DONE]') {
                                continue;
                            }
                            
                            try {
                                const json = JSON.parse(data);
                                const delta = json.choices?.[0]?.delta;
                                
                                if (delta?.content) {
                                    fullContent += delta.content;
                                    this.emit('token', {
                                        content: delta.content,
                                        provider: provider
                                    });
                                }
                                
                                // Handle tool calls
                                if (delta?.tool_calls) {
                                    const toolCall = delta.tool_calls[0];
                                    if (toolCall.function?.name) {
                                        functionCall = {
                                            id: toolCall.id,
                                            name: toolCall.function.name,
                                            arguments: ''
                                        };
                                    }
                                    if (toolCall.function?.arguments) {
                                        functionArgs += toolCall.function.arguments;
                                    }
                                }
                                
                                // Check finish reason
                                if (json.choices?.[0]?.finish_reason) {
                                    if (functionCall) {
                                        functionCall.arguments = functionArgs;
                                    }
                                }
                                
                            } catch (e) {
                                // Ignore parse errors for partial chunks
                            }
                        }
                    }
                });
                
                res.on('end', () => {
                    // Add to history
                    if (fullContent) {
                        this.conversationHistory.push({
                            role: 'assistant',
                            content: fullContent
                        });
                    }
                    
                    this.emit('stream.end', {
                        content: fullContent,
                        functionCall: functionCall,
                        provider: provider
                    });
                    
                    resolve({
                        content: fullContent,
                        functionCall: functionCall,
                        provider: provider
                    });
                });
            });
            
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
    
    /**
     * Add function result to conversation
     */
    addFunctionResult(functionName, result) {
        this.conversationHistory.push({
            role: 'function',
            name: functionName,
            content: typeof result === 'string' ? result : JSON.stringify(result)
        });
    }
    
    /**
     * Cancel current processing
     */
    cancel() {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        this.isProcessing = false;
    }
    
    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
    }
    
    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            historyLength: this.conversationHistory.length
        };
    }
    
    /**
     * Estimate cost based on token usage
     */
    getCost() {
        // Groq pricing (example - check current rates)
        const groqInputCost = 0.0000005; // per token
        const groqOutputCost = 0.0000015;
        
        // OpenAI GPT-4o-mini pricing
        const openaiInputCost = 0.00000015;
        const openaiOutputCost = 0.0000006;
        
        // Simplified cost estimation
        const estimatedCost = 
            (this.metrics.inputTokens * groqInputCost) +
            (this.metrics.outputTokens * groqOutputCost);
        
        return {
            inputTokens: this.metrics.inputTokens,
            outputTokens: this.metrics.outputTokens,
            estimatedCost: estimatedCost
        };
    }
}

module.exports = LLMHandler;

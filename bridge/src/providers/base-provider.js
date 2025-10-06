/**
 * Base Provider Interface
 * All providers (OpenAI, Deepgram) must implement these methods
 */

const EventEmitter = require('events');

class BaseProvider extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.isConnected = false;
    }
    
    /**
     * Connect to the provider's service
     * @returns {Promise<boolean>}
     */
    async connect() {
        throw new Error('connect() must be implemented by provider');
    }
    
    /**
     * Configure session with agent settings
     * @param {Object} agentConfig - Agent configuration
     * @returns {Promise<boolean>}
     */
    async configureSession(agentConfig) {
        throw new Error('configureSession() must be implemented by provider');
    }
    
    /**
     * Send audio to provider
     * @param {Buffer} audioData - Audio buffer (PCM16)
     * @returns {Promise<boolean>}
     */
    async sendAudio(audioData) {
        throw new Error('sendAudio() must be implemented by provider');
    }
    
    /**
     * Handle function call
     * @param {string} functionName
     * @param {Object} args
     * @returns {Promise<Object>}
     */
    async handleFunctionCall(functionName, args) {
        throw new Error('handleFunctionCall() must be implemented by provider');
    }
    
    /**
     * Send function response back to provider
     * @param {string} callId
     * @param {Object} result
     * @returns {Promise<boolean>}
     */
    async sendFunctionResponse(callId, result) {
        throw new Error('sendFunctionResponse() must be implemented by provider');
    }
    
    /**
     * Disconnect from provider
     */
    async disconnect() {
        throw new Error('disconnect() must be implemented by provider');
    }
    
    /**
     * Get provider name
     */
    getProviderName() {
        throw new Error('getProviderName() must be implemented by provider');
    }
    
    /**
     * Get current cost metrics
     * @returns {Object} - Cost breakdown
     */
    getCostMetrics() {
        throw new Error('getCostMetrics() must be implemented by provider');
    }
}

module.exports = BaseProvider;
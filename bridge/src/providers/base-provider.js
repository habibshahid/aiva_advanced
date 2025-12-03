/**
 * Mock Base Provider
 * Used for standalone testing of CustomVoiceProvider
 * 
 * In production, this would be replaced by the actual
 * bridge/src/providers/base-provider.js
 */

const EventEmitter = require('events');

class BaseProvider extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.isConnected = false;
    }
    
    async connect() {
        this.isConnected = true;
        return true;
    }
    
    async disconnect() {
        this.isConnected = false;
    }
    
    async sendAudio(audioData) {
        // Override in subclass
        return true;
    }
    
    getProviderName() {
        return 'base';
    }
}

module.exports = BaseProvider;

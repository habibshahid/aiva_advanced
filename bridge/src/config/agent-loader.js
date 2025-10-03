/**
 * Agent Configuration Loader
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const logger = require('../utils/logger');

class AgentLoader {
    constructor(agentsDir = 'agents') {
        this.agentsDir = path.join(process.cwd(), agentsDir);
        this.currentAgent = null;
    }
    
    /**
     * Load agent configuration from file
     */
    loadAgent(agentType) {
        try {
            const configPath = path.join(this.agentsDir, `${agentType}-agent.js`);
            
            if (!fs.existsSync(configPath)) {
                logger.error(`Agent configuration not found: ${configPath}`);
                return this.getDefaultAgent();
            }
            
            const fileContent = fs.readFileSync(configPath, 'utf8');
            
            // Create sandbox for execution
            const mockWindow = {};
            const context = { window: mockWindow };
            vm.runInNewContext(fileContent, context);
            
            // Extract agent config
            const agentConfig = mockWindow[`${agentType}Agent`];
            
            if (!agentConfig || !agentConfig.instructions) {
                logger.error(`Invalid agent configuration: ${agentType}`);
                return this.getDefaultAgent();
            }
            
            this.currentAgent = {
                type: agentType,
                name: agentConfig.name || 'AI Assistant',
                greeting: agentConfig.greeting || 'Hello! How can I help you?',
                instructions: agentConfig.instructions,
                tools: agentConfig.tools || []
            };
            
            logger.info(`Agent loaded: ${agentType} (${this.currentAgent.name})`);
            return this.currentAgent;
            
        } catch (error) {
            logger.error(`Error loading agent ${agentType}:`, error);
            return this.getDefaultAgent();
        }
    }
    
    /**
     * Get default agent configuration
     */
    getDefaultAgent() {
        return {
            type: 'default',
            name: 'AI Assistant',
            greeting: 'Hello! How can I help you today?',
            instructions: 'You are a helpful voice assistant. Keep responses concise and natural for phone conversations.',
            tools: []
        };
    }
    
    /**
     * Get current agent
     */
    getCurrentAgent() {
        return this.currentAgent || this.getDefaultAgent();
    }
    
    /**
     * List available agents
     */
    listAvailableAgents() {
        try {
            const files = fs.readdirSync(this.agentsDir);
            const agents = files
                .filter(f => f.endsWith('-agent.js'))
                .map(f => f.replace('-agent.js', ''));
            
            return agents;
        } catch (error) {
            logger.error('Error listing agents:', error);
            return [];
        }
    }
}

module.exports = AgentLoader;
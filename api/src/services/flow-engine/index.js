/**
 * Flow Engine v2.1 - Intelligent Flow Engine
 * 
 * Enhanced industry-agnostic conversation engine with:
 * - Configurable flows
 * - Rapid-fire message handling
 * - Session lifecycle management
 * - Context switching support
 * - Intelligent flow execution (Phase 2)
 * - Sync message consolidation (Phase 3)
 * - Image-to-flow integration (Phase 4)
 * 
 * Usage:
 *   const FlowEngine = require('./services/flow-engine');
 *   
 *   const result = await FlowEngine.processMessage({
 *       agentId: 'agent-123',
 *       channelId: 'whatsapp:923001234567',
 *       message: 'Hello, I need help with my order',
 *       customerInfo: { phone: '923001234567' }
 *   });
 */

// Import singleton and class separately
const flowEngineSingleton = require('./FlowEngine');
const { FlowEngine } = require('./FlowEngine');

// Import IntelligentFlowEngine class
const IntelligentFlowEngine = require('./IntelligentFlowEngine');

// Other services
const MessageBufferService = require('./MessageBufferService');
const SyncMessageConsolidator = require('./SyncMessageConsolidator');
const SessionStateService = require('./SessionStateService');
const ChatFlowService = require('./ChatFlowService');
const FlowExecutor = require('./FlowExecutor');
const ImageFlowBridge = require('./ImageFlowBridge');

// Create singleton instance of IntelligentFlowEngine
const intelligentFlowEngineSingleton = new IntelligentFlowEngine();

// Export IntelligentFlowEngine singleton as default (upgraded engine)
module.exports = intelligentFlowEngineSingleton;

// Named exports for direct access
module.exports.FlowEngine = FlowEngine;
module.exports.FlowEngineSingleton = flowEngineSingleton;
module.exports.IntelligentFlowEngine = IntelligentFlowEngine;
module.exports.IntelligentFlowEngineSingleton = intelligentFlowEngineSingleton;
module.exports.MessageBufferService = MessageBufferService;
module.exports.SyncMessageConsolidator = SyncMessageConsolidator;
module.exports.SessionStateService = SessionStateService;
module.exports.ChatFlowService = ChatFlowService;
module.exports.FlowExecutor = FlowExecutor;
module.exports.ImageFlowBridge = ImageFlowBridge;

// Convenience exports
module.exports.ACTIONS = FlowEngine.ACTIONS;
module.exports.SESSION_ACTIONS = FlowEngine.SESSION_ACTIONS;
module.exports.FLOW_MODES = IntelligentFlowEngine.FLOW_MODES;
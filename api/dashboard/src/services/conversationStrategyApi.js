/**
 * Conversation Strategy API Service
 * File: api/dashboard/src/services/conversationStrategyApi.js
 * 
 * API methods for conversation strategy management
 */

import api from './api';

/**
 * Get conversation strategy for an agent
 * @param {string} agentId - Agent ID
 * @returns {Promise} Strategy configuration
 */
export const getConversationStrategy = (agentId) => {
  return api.get(`/conversation-strategy/${agentId}`);
};

/**
 * Update conversation strategy for an agent
 * @param {string} agentId - Agent ID
 * @param {Object} strategy - Strategy configuration
 * @returns {Promise} Updated strategy
 */
export const updateConversationStrategy = (agentId, strategy) => {
  return api.put(`/conversation-strategy/${agentId}`, strategy);
};

/**
 * Get available strategy presets
 * @returns {Promise} Array of presets
 */
export const getStrategyPresets = () => {
  return api.get('/conversation-strategy/presets');
};

/**
 * Apply a preset to an agent
 * @param {string} agentId - Agent ID
 * @param {string} presetId - Preset ID
 * @returns {Promise} Applied strategy
 */
export const applyStrategyPreset = (agentId, presetId) => {
  return api.post(`/conversation-strategy/apply-preset/${agentId}`, {
    preset_id: presetId
  });
};

/**
 * Test conversation strategy with sample messages
 * @param {string} agentId - Agent ID
 * @param {Array<string>} messages - Test messages
 * @returns {Promise} Test results
 */
export const testConversationStrategy = (agentId, messages) => {
  return api.post(`/conversation-strategy/test/${agentId}`, {
    messages
  });
};
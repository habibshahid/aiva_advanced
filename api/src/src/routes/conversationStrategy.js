/**
 * Conversation Strategy Routes
 * File: api/src/routes/conversationStrategy.js
 * 
 * Endpoints for managing agent conversation strategy configuration
 */

const express = require('express');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const AgentService = require('../services/AgentService');
const { validateProvider } = require('../middleware/provider-validation');
const ConversationStrategyService = require('../services/ConversationStrategy');

const router = express.Router();

const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (apiKey) {
        // Use API key authentication
        return verifyApiKey(req, res, next);
    } else {
        // Use JWT token authentication
        return verifyToken(req, res, next);
    }
};

/**
 * GET /api/agents/:agentId/conversation-strategy
 * Get agent's conversation strategy configuration
 */
router.get(
  '/:agentId',
  verifyToken,
  validateProvider,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      
      const strategy = await ConversationStrategyService.getStrategy(agentId);
      
      res.json({
        success: true,
        data: strategy
      });
      
    } catch (error) {
      console.error('Error getting conversation strategy:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * PUT /api/agents/:agentId/conversation-strategy
 * Update agent's conversation strategy
 */
router.put(
  '/:agentId',
  verifyToken,
  validateProvider,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { preference_collection, knowledge_search } = req.body;
      
      // Validate strategy data
      const validation = ConversationStrategyService.validateStrategy({
        preference_collection,
        knowledge_search
      });
      
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid strategy configuration',
          details: validation.errors
        });
      }
      
      const updatedStrategy = await ConversationStrategyService.updateStrategy(
        agentId,
        { preference_collection, knowledge_search }
      );
      
      res.json({
        success: true,
        data: updatedStrategy,
        message: 'Conversation strategy updated successfully'
      });
      
    } catch (error) {
      console.error('Error updating conversation strategy:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /api/agents/:agentId/conversation-strategy/test
 * Test conversation strategy with sample messages
 */
router.post(
  '/test/:agentId',
  verifyToken,
  validateProvider,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { messages } = req.body;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
          success: false,
          error: 'messages array is required'
        });
      }
      
      const testResults = await ConversationStrategyService.testStrategy(
        agentId,
        messages
      );
      
      res.json({
        success: true,
        data: testResults
      });
      
    } catch (error) {
      console.error('Error testing conversation strategy:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/conversation-strategy/presets
 * Get predefined strategy presets
 */
router.get(
  '/presets',
  verifyToken,
  async (req, res) => {
    try {
      const presets = ConversationStrategyService.getPresets();
      
      res.json({
        success: true,
        data: presets
      });
      
    } catch (error) {
      console.error('Error getting strategy presets:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /api/agents/:agentId/conversation-strategy/apply-preset
 * Apply a preset strategy to an agent
 */
router.post(
  '/apply-preset/:agentId',
  verifyToken,
  validateProvider,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { presetId } = req.body;
      
      if (!presetId) {
        return res.status(400).json({
          success: false,
          error: 'presetId is required'
        });
      }
      
      const strategy = await ConversationStrategyService.applyPreset(
        agentId,
        presetId
      );
      
      res.json({
        success: true,
        data: strategy,
        message: `Preset "${presetId}" applied successfully`
      });
      
    } catch (error) {
      console.error('Error applying preset:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
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

// ============================================================================
// IMPORTANT: Static routes MUST come before parameterized routes
// Otherwise /presets would be matched as /:agentId
// ============================================================================

/**
 * GET /api/conversation-strategy/presets
 * Get predefined strategy presets
 */
router.get('/presets', verifyToken, async (req, res) => {
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
});

/**
 * POST /api/conversation-strategy/test/:agentId
 * Test conversation strategy with sample messages
 */
router.post('/test/:agentId', verifyToken, async (req, res) => {
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
});

/**
 * POST /api/conversation-strategy/apply-preset/:agentId
 * Apply a preset strategy to an agent
 */
router.post('/apply-preset/:agentId', verifyToken, async (req, res) => {
    try {
      const { agentId } = req.params;
      const { presetId, preset_id } = req.body;
      
      const selectedPresetId = presetId || preset_id;
      
      if (!selectedPresetId) {
        return res.status(400).json({
          success: false,
          error: 'presetId is required'
        });
      }
      
      const strategy = await ConversationStrategyService.applyPreset(
        agentId,
        selectedPresetId
      );
      
      res.json({
        success: true,
        data: strategy,
        message: `Preset "${selectedPresetId}" applied successfully`
      });
      
    } catch (error) {
      console.error('Error applying preset:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
});

// ============================================================================
// Parameterized routes come AFTER static routes
// ============================================================================

/**
 * GET /api/conversation-strategy/:agentId
 * Get agent's conversation strategy configuration
 */
router.get('/:agentId', verifyToken, async (req, res) => {
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
});

/**
 * PUT /api/conversation-strategy/:agentId
 * Update agent's conversation strategy
 */
router.put('/:agentId', verifyToken, async (req, res) => {
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
});

module.exports = router;
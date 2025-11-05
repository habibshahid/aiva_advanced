/**
 * Conversation Strategy Service
 * File: api/src/services/ConversationStrategyService.js
 * 
 * Manages conversation strategy configuration for agents
 */

const db = require('../config/database');

class ConversationStrategyService {
  
  /**
   * Get agent's conversation strategy
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Strategy configuration
   */
  async getStrategy(agentId) {
    const [agents] = await db.query(
      'SELECT conversation_strategy FROM yovo_tbl_aiva_agents WHERE id = ?',
      [agentId]
    );
    
    if (agents.length === 0) {
      throw new Error('Agent not found');
    }
    
    let strategy = agents[0].conversation_strategy;
    
    // Parse if string
    if (typeof strategy === 'string') {
      strategy = JSON.parse(strategy);
    }
    
    // Return default if null
    if (!strategy) {
      strategy = this.getDefaultStrategy();
    }
    
    return strategy;
  }
  
  /**
   * Update agent's conversation strategy
   * @param {string} agentId - Agent ID
   * @param {Object} strategy - Strategy configuration
   * @returns {Promise<Object>} Updated strategy
   */
  async updateStrategy(agentId, strategy) {
    // Ensure strategy has required structure
    const fullStrategy = {
      preference_collection: strategy.preference_collection || this.getDefaultStrategy().preference_collection,
      knowledge_search: strategy.knowledge_search || this.getDefaultStrategy().knowledge_search
    };
    
    await db.query(
      'UPDATE yovo_tbl_aiva_agents SET conversation_strategy = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(fullStrategy), agentId]
    );
    
    return fullStrategy;
  }
  
  /**
   * Get default strategy
   * @returns {Object} Default strategy
   */
  getDefaultStrategy() {
    return {
      preference_collection: {
        strategy: 'immediate_search',
        preferences_to_collect: [],
        min_preferences_before_search: 0,
        max_questions: 0
      },
      knowledge_search: {
        strategy: 'auto',
        search_threshold: 'medium',
        search_types: ['text', 'image', 'product']
      }
    };
  }
  
  /**
   * Validate strategy configuration
   * @param {Object} strategy - Strategy to validate
   * @returns {Object} Validation result
   */
  validateStrategy(strategy) {
    const errors = [];
    
    // Validate preference_collection
    if (strategy.preference_collection) {
      const pc = strategy.preference_collection;
      
      // Validate strategy type
      const validStrategies = ['immediate_search', 'ask_questions', 'minimal_questions', 'adaptive'];
      if (pc.strategy && !validStrategies.includes(pc.strategy)) {
        errors.push(`Invalid strategy: ${pc.strategy}. Must be one of: ${validStrategies.join(', ')}`);
      }
      
      // Validate preferences array
      if (pc.preferences_to_collect && !Array.isArray(pc.preferences_to_collect)) {
        errors.push('preferences_to_collect must be an array');
      }
      
      // Validate each preference
      if (pc.preferences_to_collect && Array.isArray(pc.preferences_to_collect)) {
        pc.preferences_to_collect.forEach((pref, index) => {
          if (!pref.name) {
            errors.push(`Preference ${index}: name is required`);
          }
          if (!pref.label) {
            errors.push(`Preference ${index}: label is required`);
          }
          if (typeof pref.required !== 'boolean') {
            errors.push(`Preference ${index}: required must be boolean`);
          }
        });
      }
      
      // Validate min_preferences_before_search
      if (pc.min_preferences_before_search !== undefined) {
        if (typeof pc.min_preferences_before_search !== 'number' || pc.min_preferences_before_search < 0) {
          errors.push('min_preferences_before_search must be a non-negative number');
        }
      }
      
      // Validate max_questions
      if (pc.max_questions !== undefined) {
        if (typeof pc.max_questions !== 'number' || pc.max_questions < 0) {
          errors.push('max_questions must be a non-negative number');
        }
      }
    }
    
    // Validate knowledge_search
    if (strategy.knowledge_search) {
      const ks = strategy.knowledge_search;
      
      // Validate strategy
      const validKsStrategies = ['auto', 'always', 'on_demand'];
      if (ks.strategy && !validKsStrategies.includes(ks.strategy)) {
        errors.push(`Invalid knowledge search strategy: ${ks.strategy}`);
      }
      
      // Validate search_threshold
      const validThresholds = ['low', 'medium', 'high'];
      if (ks.search_threshold && !validThresholds.includes(ks.search_threshold)) {
        errors.push(`Invalid search_threshold: ${ks.search_threshold}`);
      }
      
      // Validate search_types
      if (ks.search_types && !Array.isArray(ks.search_types)) {
        errors.push('search_types must be an array');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Test strategy with sample messages
   * @param {string} agentId - Agent ID
   * @param {Array<string>} messages - Test messages
   * @returns {Promise<Object>} Test results
   */
  async testStrategy(agentId, messages) {
    // This would simulate a conversation with the strategy
    // For now, return a placeholder
    const strategy = await this.getStrategy(agentId);
    
    return {
      agent_id: agentId,
      strategy: strategy,
      test_messages: messages,
      results: messages.map((msg, index) => ({
        message: msg,
        step: index + 1,
        expected_behavior: this._predictBehavior(strategy, msg, index)
      }))
    };
  }
  
  /**
   * Predict behavior based on strategy
   * @private
   */
  _predictBehavior(strategy, message, stepIndex) {
    const pc = strategy.preference_collection;
    
    if (pc.strategy === 'immediate_search') {
      return {
        action: 'search',
        description: 'Will search immediately'
      };
    }
    
    if (pc.strategy === 'ask_questions') {
      if (stepIndex === 0) {
        return {
          action: 'ask_question',
          description: 'Will ask for preferences'
        };
      } else if (stepIndex < pc.min_preferences_before_search) {
        return {
          action: 'ask_question',
          description: `Collecting preference ${stepIndex + 1}/${pc.min_preferences_before_search}`
        };
      } else {
        return {
          action: 'search',
          description: 'Minimum preferences collected, will search'
        };
      }
    }
    
    if (pc.strategy === 'minimal_questions') {
      if (stepIndex < 2) {
        return {
          action: 'ask_question',
          description: 'Will ask 1-2 questions'
        };
      } else {
        return {
          action: 'search',
          description: 'Will search after minimal questions'
        };
      }
    }
    
    return {
      action: 'adaptive',
      description: 'AI will decide based on context'
    };
  }
  
  /**
   * Get predefined strategy presets
   * @returns {Array<Object>} Presets
   */
  getPresets() {
    return [
      {
        id: 'clothing',
        name: 'Clothing Store',
        description: 'Ask about color, occasion, and budget before showing products',
        icon: 'shirt',
        best_for: ['Fashion', 'Clothing', 'Apparel'],
        strategy: {
          preference_collection: {
            strategy: 'ask_questions',
            preferences_to_collect: [
              {
                name: 'color',
                label: 'Color',
                required: false,
                question: 'What color would you like?',
                type: 'text'
              },
              {
                name: 'occasion',
                label: 'Occasion',
                required: false,
                question: 'What\'s the occasion?',
                type: 'text'
              },
              {
                name: 'budget',
                label: 'Budget',
                required: false,
                question: 'What\'s your budget?',
                type: 'range'
              }
            ],
            min_preferences_before_search: 2,
            max_questions: 3
          },
          knowledge_search: {
            strategy: 'auto',
            search_threshold: 'medium',
            search_types: ['text', 'image', 'product']
          }
        }
      },
      {
        id: 'electronics',
        name: 'Electronics Store',
        description: 'Ask about use case and budget, then search',
        icon: 'laptop',
        best_for: ['Electronics', 'Gadgets', 'Tech'],
        strategy: {
          preference_collection: {
            strategy: 'minimal_questions',
            preferences_to_collect: [
              {
                name: 'use_case',
                label: 'Use Case',
                required: true,
                question: 'What will you use it for?',
                type: 'text'
              },
              {
                name: 'budget',
                label: 'Budget',
                required: false,
                question: 'What\'s your budget?',
                type: 'range'
              }
            ],
            min_preferences_before_search: 1,
            max_questions: 2
          },
          knowledge_search: {
            strategy: 'auto',
            search_threshold: 'medium',
            search_types: ['text', 'product']
          }
        }
      },
      {
        id: 'furniture',
        name: 'Furniture Store',
        description: 'Show products immediately without questions',
        icon: 'couch',
        best_for: ['Furniture', 'Home Decor', 'Appliances'],
        strategy: {
          preference_collection: {
            strategy: 'immediate_search',
            preferences_to_collect: [],
            min_preferences_before_search: 0,
            max_questions: 0
          },
          knowledge_search: {
            strategy: 'auto',
            search_threshold: 'low',
            search_types: ['text', 'image', 'product']
          }
        }
      },
      {
        id: 'food',
        name: 'Restaurant/Food',
        description: 'Show menu immediately',
        icon: 'utensils',
        best_for: ['Restaurant', 'Food Delivery', 'Cafe'],
        strategy: {
          preference_collection: {
            strategy: 'immediate_search',
            preferences_to_collect: [],
            min_preferences_before_search: 0,
            max_questions: 0
          },
          knowledge_search: {
            strategy: 'auto',
            search_threshold: 'low',
            search_types: ['text', 'product']
          }
        }
      }
    ];
  }
  
  /**
   * Apply a preset to an agent
   * @param {string} agentId - Agent ID
   * @param {string} presetId - Preset ID
   * @returns {Promise<Object>} Applied strategy
   */
  async applyPreset(agentId, presetId) {
    const presets = this.getPresets();
    const preset = presets.find(p => p.id === presetId);
    
    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`);
    }
    
    return this.updateStrategy(agentId, preset.strategy);
  }
}

module.exports = new ConversationStrategyService();
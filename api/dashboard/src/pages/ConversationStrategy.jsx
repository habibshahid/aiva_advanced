/**
 * Conversation Strategy Settings Component (Phase 1 - Basic)
 * File: api/dashboard/src/pages/Agents/ConversationStrategy.jsx
 * 
 * Basic UI for selecting conversation strategy
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Save, Loader, Info, CheckCircle, 
  AlertCircle, Shirt, Laptop, Sofa, Utensils
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getConversationStrategy, 
  updateConversationStrategy,
  getStrategyPresets,
  applyStrategyPreset
} from '../services/conversationStrategyApi';

const ConversationStrategy = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [strategy, setStrategy] = useState(null);
  const [presets, setPresets] = useState([]);
  
  useEffect(() => {
    loadData();
  }, [id]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      
      const [strategyRes, presetsRes] = await Promise.all([
        getConversationStrategy(id),
        getStrategyPresets()
      ]);
      
      setStrategy(strategyRes.data.data);
      setPresets(presetsRes.data.data);
      
    } catch (error) {
      console.error('Error loading conversation strategy:', error);
      toast.error('Failed to load conversation strategy');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSave = async () => {
    try {
      setSaving(true);
      
      await updateConversationStrategy(id, strategy);
      
      toast.success('Conversation strategy saved successfully');
      
    } catch (error) {
      console.error('Error saving strategy:', error);
      toast.error('Failed to save conversation strategy');
    } finally {
      setSaving(false);
    }
  };
  
  const handleApplyPreset = async (presetId) => {
    try {
      setSaving(true);
      
      const response = await applyStrategyPreset(id, presetId);
      
      setStrategy(response.data.data);
      toast.success(`Preset applied successfully`);
      
    } catch (error) {
      console.error('Error applying preset:', error);
      toast.error('Failed to apply preset');
    } finally {
      setSaving(false);
    }
  };
  
  const handleStrategyChange = (newStrategy) => {
    setStrategy({
      ...strategy,
      preference_collection: {
        ...strategy.preference_collection,
        strategy: newStrategy
      }
    });
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader className="animate-spin" size={32} />
      </div>
    );
  }
  
  if (!strategy) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
          <p className="text-gray-600">Failed to load conversation strategy</p>
        </div>
      </div>
    );
  }
  
  const currentStrategy = strategy.preference_collection?.strategy || 'immediate_search';
  
  return (
    <div className="p-6 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/agents/${id}`)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Conversation Strategy</h1>
            <p className="text-gray-600 text-sm mt-1">
              Configure how your agent collects preferences and searches
            </p>
          </div>
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader size={18} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={18} />
              Save Changes
            </>
          )}
        </button>
      </div>
      
      {/* Quick Presets */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Info size={20} className="text-blue-500" />
          <h2 className="text-lg font-semibold">Quick Presets</h2>
        </div>
        <p className="text-gray-600 text-sm mb-4">
          Apply a preset configuration based on your business type
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {presets.map(preset => {
            const Icon = {
              shirt: Shirt,
              laptop: Laptop,
              couch: Sofa,
              utensils: Utensils
            }[preset.icon] || Info;
            
            return (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset.id)}
                disabled={saving}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon size={24} className="text-blue-600" />
                  <h3 className="font-semibold">{preset.name}</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">{preset.description}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                    {preset.strategy.preference_collection.max_questions === 0 
                      ? 'No questions' 
                      : `${preset.strategy.preference_collection.max_questions} questions`
                    }
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Product Search Strategy */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">🛍️ Product Search Strategy</h2>
        <p className="text-gray-600 text-sm mb-6">
          Configure how your agent searches for products
        </p>
        
        <div className="space-y-4">
          
          {/* Immediate Search */}
          <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="strategy"
              value="immediate_search"
              checked={currentStrategy === 'immediate_search'}
              onChange={(e) => handleStrategyChange(e.target.value)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">Immediate Search</span>
                <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Fast</span>
              </div>
              <p className="text-sm text-gray-600">
                Search as soon as user requests products. No questions asked.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Best for: Furniture, Food, Low-ticket items
              </p>
            </div>
          </label>
          
          {/* Ask Questions */}
          <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="strategy"
              value="ask_questions"
              checked={currentStrategy === 'ask_questions'}
              onChange={(e) => handleStrategyChange(e.target.value)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">Ask Questions First</span>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">Personalized</span>
              </div>
              <p className="text-sm text-gray-600">
                Collect user preferences before searching for products.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Best for: Clothing, Fashion, High-value items
              </p>
              {currentStrategy === 'ask_questions' && (
                <div className="mt-3 p-3 bg-blue-50 rounded text-sm text-blue-700">
                  <Info size={16} className="inline mr-1" />
                  Advanced configuration coming in Phase 2
                </div>
              )}
            </div>
          </label>
          
          {/* Minimal Questions */}
          <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="strategy"
              value="minimal_questions"
              checked={currentStrategy === 'minimal_questions'}
              onChange={(e) => handleStrategyChange(e.target.value)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">Minimal Questions (1-2)</span>
                <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">Balanced</span>
              </div>
              <p className="text-sm text-gray-600">
                Ask only 1-2 critical questions before searching.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Best for: Electronics, Mid-range items
              </p>
            </div>
          </label>
          
          {/* Adaptive */}
          <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="strategy"
              value="adaptive"
              checked={currentStrategy === 'adaptive'}
              onChange={(e) => handleStrategyChange(e.target.value)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">Adaptive (Smart)</span>
                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">Intelligent</span>
              </div>
              <p className="text-sm text-gray-600">
                AI decides based on product type, value, and context.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Best for: Multi-category stores
              </p>
            </div>
          </label>
          
        </div>
      </div>
      
      {/* Current Configuration Summary */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <CheckCircle size={20} className="text-green-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-green-900 mb-1">Current Configuration</h3>
            <p className="text-sm text-green-700">
              Your agent is using <strong>{currentStrategy.replace('_', ' ')}</strong> strategy.
              {currentStrategy === 'immediate_search' && ' Products will be shown immediately.'}
              {currentStrategy === 'ask_questions' && ' Agent will collect preferences before searching.'}
              {currentStrategy === 'minimal_questions' && ' Agent will ask 1-2 quick questions.'}
              {currentStrategy === 'adaptive' && ' AI will decide the best approach.'}
            </p>
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default ConversationStrategy;
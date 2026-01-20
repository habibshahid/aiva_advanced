/**
 * Agent Editor Tab Components - Part 1: Overview & Chat
 */

import React, { useState, useEffect } from 'react';
import { Zap, Info, Shirt, Laptop, Sofa, Utensils, AlertCircle, Phone, MessageSquare, TrendingUp, DollarSign, Loader } from 'lucide-react';
import { getOverviewSummary } from '../../services/AnalyticsService';

// ============================================================================
// OVERVIEW TAB
// ============================================================================

export const OverviewTab = ({ agent, setAgent }) => {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Fetch agent stats when agent ID is available
  useEffect(() => {
    const fetchStats = async () => {
      if (!agent.id) return;
      
      try {
        setLoadingStats(true);
        // Get stats for last 30 days for this agent
        const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dateTo = new Date().toISOString().split('T')[0];
        
        const response = await getOverviewSummary({
          agent_id: agent.id,
          date_from: dateFrom,
          date_to: dateTo
        });
        
        if (response.data?.data) {
          setStats(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching agent stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [agent.id]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Agent Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={agent.name}
              onChange={(e) => setAgent({ ...agent, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Sales Assistant"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={agent.type}
              onChange={(e) => setAgent({ ...agent, type: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="sales">Sales</option>
              <option value="support">Support</option>
              <option value="banking">Banking</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={agent.description || ''}
              onChange={(e) => setAgent({ ...agent, description: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Describe what this agent does..."
            />
          </div>
        </div>
      </div>

      {/* Quick Stats - Only show for existing agents */}
      {agent.id && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Performance (Last 30 Days)</h3>
            {loadingStats && <Loader className="w-5 h-5 animate-spin text-gray-400" />}
          </div>
          
          {loadingStats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-gray-50 rounded-lg p-4 animate-pulse">
                  <div className="h-8 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Interactions */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <span className="text-2xl font-bold text-blue-700">
                    {(stats.total_interactions || 0).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-blue-600">Total Interactions</div>
              </div>
              
              {/* Voice Calls */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-5 h-5 text-purple-600" />
                  <span className="text-2xl font-bold text-purple-700">
                    {(stats.total_calls || 0).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-purple-600">Voice Calls</div>
                {stats.avg_call_duration > 0 && (
                  <div className="text-xs text-purple-500 mt-1">
                    Avg: {Math.floor(stats.avg_call_duration / 60)}:{String(Math.round(stats.avg_call_duration % 60)).padStart(2, '0')}
                  </div>
                )}
              </div>
              
              {/* Chat Sessions */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                  <span className="text-2xl font-bold text-green-700">
                    {(stats.total_chats || 0).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-green-600">Chat Sessions</div>
                {stats.avg_messages_per_session > 0 && (
                  <div className="text-xs text-green-500 mt-1">
                    Avg: {stats.avg_messages_per_session.toFixed(1)} msgs/session
                  </div>
                )}
              </div>
              
              {/* Total Cost */}
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-amber-600" />
                  <span className="text-2xl font-bold text-amber-700">
                    ${(stats.total_cost || 0).toFixed(2)}
                  </span>
                </div>
                <div className="text-sm text-amber-600">Total Cost</div>
                {(stats.call_costs > 0 || stats.chat_costs > 0) && (
                  <div className="text-xs text-amber-500 mt-1">
                    Calls: ${(stats.call_costs || 0).toFixed(2)} | Chats: ${(stats.chat_costs || 0).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No analytics data available yet</p>
              <p className="text-sm text-gray-400 mt-1">Stats will appear after the agent handles interactions</p>
            </div>
          )}
          
          {/* Additional Stats Row */}
          {stats && (stats.satisfaction_rate > 0 || stats.resolution_rate > 0 || stats.positive_percentage > 0) && (
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
              {stats.satisfaction_rate > 0 && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900">{stats.satisfaction_rate.toFixed(1)}%</div>
                  <div className="text-xs text-gray-500">Satisfaction</div>
                </div>
              )}
              {stats.resolution_rate > 0 && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900">{stats.resolution_rate.toFixed(1)}%</div>
                  <div className="text-xs text-gray-500">Resolution Rate</div>
                </div>
              )}
              {stats.positive_percentage > 0 && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900">{stats.positive_percentage.toFixed(1)}%</div>
                  <div className="text-xs text-gray-500">Positive Sentiment</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CHAT TAB
// ============================================================================

export const ChatTab = ({ 
  agent, setAgent, chatModelGroups, generateAIInstructions, generatingAI,
  strategyPresets, loadingPresets, applyStrategyPreset, updateConversationStrategy,
  // Advanced strategy handlers
  addPreference, updatePreference, removePreference, updateMinPreferences, updateMaxQuestions,
  showAdvancedConfig, setShowAdvancedConfig
}) => (
  <div className="space-y-6">
    {/* Instructions */}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Instructions</h3>
        <button
          type="button"
          onClick={generateAIInstructions}
          disabled={!agent.name || generatingAI}
          className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {generatingAI ? (
            <>
              <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              AI Generate
            </>
          )}
        </button>
      </div>
      
      <textarea
        value={agent.instructions}
        onChange={(e) => setAgent({ ...agent, instructions: e.target.value })}
        rows={12}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        placeholder="You are a helpful assistant..."
      />
      <p className="mt-2 text-sm text-gray-500">
        System instructions that define the agent's behavior and personality.
      </p>
    </div>

    {/* Greeting */}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Greeting Message</h3>
      <textarea
        value={agent.greeting || ''}
        onChange={(e) => setAgent({ ...agent, greeting: e.target.value })}
        rows={3}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        placeholder="Hello! How can I help you today?"
      />
      <p className="mt-2 text-sm text-gray-500">
        <strong>Inbound:</strong> Plays automatically when call connects. <strong>Outbound:</strong> Not recommended.
      </p>
    </div>

    {/* Chat Model */}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Chat Model</h3>
      
      <select
        value={agent.chat_model || 'gpt-4o-mini'}
        onChange={(e) => setAgent({ ...agent, chat_model: e.target.value })}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      >
        {chatModelGroups.map(group => (
          <optgroup key={group.label} label={group.label}>
            {group.models.map(model => (
              <option key={model.value} value={model.value}>
                {model.label} ({model.cost}/1M) {model.badge || ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>💡 Recommendations:</strong> Llama 3.3 70B for best value, GPT-4o-mini for Urdu, GPT-4o for complex tasks.
        </p>
      </div>
    </div>

    {/* Chat Audio Settings */}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">🎤 Chat Audio Settings</h3>
      <p className="text-sm text-gray-500 mb-4">
        Configure speech-to-text and text-to-speech for audio messages in web/mobile chat.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chat STT Provider</label>
          <select
            value={agent.chat_stt_provider || 'deepgram'}
            onChange={(e) => setAgent({ ...agent, chat_stt_provider: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500"
          >
            <option value="deepgram">Deepgram</option>
            <option value="openai">OpenAI Whisper</option>
            <option value="soniox">Soniox</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chat TTS Provider</label>
          <select
            value={agent.chat_tts_provider || 'openai'}
            onChange={(e) => setAgent({ ...agent, chat_tts_provider: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500"
          >
            <option value="openai">OpenAI TTS</option>
            <option value="deepgram">Deepgram Aura</option>
            <option value="uplift">Uplift AI</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chat TTS Voice</label>
          <select
            value={agent.chat_tts_voice || 'nova'}
            onChange={(e) => setAgent({ ...agent, chat_tts_voice: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500"
          >
            <option value="alloy">Alloy</option>
            <option value="echo">Echo</option>
            <option value="fable">Fable</option>
            <option value="onyx">Onyx</option>
            <option value="nova">Nova</option>
            <option value="shimmer">Shimmer</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chat STT Language</label>
          <select
            value={agent.chat_stt_language || 'en'}
            onChange={(e) => setAgent({ ...agent, chat_stt_language: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500"
          >
            <option value="multi">🌍 Multi (Auto-detect)</option>
            <option value="en">🇺🇸 English</option>
            <option value="ur">🇵🇰 Urdu</option>
            <option value="hi">🇮🇳 Hindi</option>
            <option value="ar">🇸🇦 Arabic</option>
          </select>
        </div>
      </div>
    </div>

    {/* Conversation Strategy - Only show when Flow Engine is disabled */}
    {!agent.use_flow_engine ? (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Conversation Strategy</h3>
        <p className="text-sm text-gray-500 mb-4">Configure how your agent collects preferences before searching products.</p>
        
        {/* Quick Presets */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Quick Presets</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {loadingPresets ? (
              <div className="col-span-4 text-center py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              strategyPresets.map(preset => {
                const IconComponent = {
                  shirt: Shirt,
                  laptop: Laptop,
                  couch: Sofa,
                  utensils: Utensils
                }[preset.icon] || Info;
                
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyStrategyPreset(preset.id)}
                    className="p-3 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <IconComponent size={18} className="text-primary-600" />
                      <span className="font-medium text-sm">{preset.name}</span>
                    </div>
                    <p className="text-xs text-gray-600">{preset.description}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Strategy Options */}
        <div className="space-y-3">
          {[
            { value: 'immediate_search', label: 'Immediate Search', badge: 'Fast', badgeColor: 'green', desc: 'Search as soon as user requests products.' },
            { value: 'ask_questions', label: 'Ask Questions First', badge: 'Personalized', badgeColor: 'blue', desc: 'Collect preferences before searching.' },
            { value: 'minimal_questions', label: 'Minimal Questions (1-2)', badge: 'Balanced', badgeColor: 'yellow', desc: 'Ask only critical questions.' },
            { value: 'adaptive', label: 'Adaptive (Smart)', badge: 'Intelligent', badgeColor: 'purple', desc: 'AI decides based on context.' },
          ].map(strategy => (
            <label key={strategy.value} className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
              agent.conversation_strategy?.preference_collection?.strategy === strategy.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
            }`}>
              <input
                type="radio"
                name="conversation_strategy"
                value={strategy.value}
                checked={agent.conversation_strategy?.preference_collection?.strategy === strategy.value}
                onChange={(e) => updateConversationStrategy('strategy', e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{strategy.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded bg-${strategy.badgeColor}-100 text-${strategy.badgeColor}-700`}>
                    {strategy.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{strategy.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Advanced Configuration - Show when ask_questions or minimal_questions selected */}
        {(agent.conversation_strategy?.preference_collection?.strategy === 'ask_questions' || 
          agent.conversation_strategy?.preference_collection?.strategy === 'minimal_questions') && (
          <div className="mt-6 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
            
            {/* Toggle Advanced Config */}
            <button
              type="button"
              onClick={() => setShowAdvancedConfig && setShowAdvancedConfig(!showAdvancedConfig)}
              className="w-full flex items-center justify-between text-left mb-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                <span className="font-semibold text-gray-900">Advanced Configuration</span>
                {!showAdvancedConfig && (
                  <span className="text-xs text-gray-500">
                    ({(agent.conversation_strategy?.preference_collection?.preferences_to_collect || []).length} preferences configured)
                  </span>
                )}
              </div>
              <span className="text-gray-600">{showAdvancedConfig ? '▼' : '▶'}</span>
            </button>
            
            {showAdvancedConfig && (
              <div className="space-y-4">
                
                {/* Preferences List */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferences to Collect
                  </label>
                  <p className="text-xs text-gray-600 mb-3">
                    Define what information to gather before searching
                  </p>
                  
                  <div className="space-y-3">
                    {(agent.conversation_strategy?.preference_collection?.preferences_to_collect || []).map((pref, index) => (
                      <div key={index} className="p-3 bg-white rounded-lg border border-gray-300 shadow-sm">
                        
                        {/* Preference Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                            <input
                              type="text"
                              placeholder="Preference name (e.g., color, size)"
                              value={pref.name || ''}
                              onChange={(e) => updatePreference(index, 'name', e.target.value)}
                              className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 px-2 py-1"
                            />
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={pref.required}
                                onChange={(e) => updatePreference(index, 'required', e.target.checked)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              Required
                            </label>
                            
                            <button
                              type="button"
                              onClick={() => removePreference(index)}
                              className="text-red-600 hover:text-red-700 p-1"
                              title="Remove preference"
                            >
                              <span className="text-lg">🗑️</span>
                            </button>
                          </div>
                        </div>
                        
                        {/* Preference Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Display Label
                            </label>
                            <input
                              type="text"
                              placeholder="e.g., Color Preference"
                              value={pref.label || ''}
                              onChange={(e) => updatePreference(index, 'label', e.target.value)}
                              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 px-2 py-1"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Field Type
                            </label>
                            <select
                              value={pref.type || 'text'}
                              onChange={(e) => updatePreference(index, 'type', e.target.value)}
                              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 px-2 py-1"
                            >
                              <option value="text">Text (Open-ended)</option>
                              <option value="choice">Multiple Choice</option>
                              <option value="range">Range (e.g., budget)</option>
                            </select>
                          </div>
                        </div>
                        
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Question to Ask
                          </label>
                          <input
                            type="text"
                            placeholder="e.g., What color would you like?"
                            value={pref.question || ''}
                            onChange={(e) => updatePreference(index, 'question', e.target.value)}
                            className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 px-2 py-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            AI will use this as guidance and may rephrase naturally
                          </p>
                        </div>
                        
                        {/* Options for Multiple Choice */}
                        {pref.type === 'choice' && (
                          <div className="mt-3">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Options (comma-separated)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g., Red, Blue, Green, Pink, Black"
                              value={pref.options?.join(', ') || ''}
                              onChange={(e) => updatePreference(index, 'options', e.target.value.split(',').map(o => o.trim()))}
                              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 px-2 py-1"
                            />
                          </div>
                        )}
                        
                      </div>
                    ))}
                  </div>
                  
                  {/* Add Preference Button */}
                  <button
                    type="button"
                    onClick={addPreference}
                    className="mt-3 w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    + Add Preference
                  </button>
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-300 my-4"></div>
                
                {/* Search Timing Configuration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Timing
                  </label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Min Preferences */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">
                        Minimum Preferences Before Search
                      </label>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(5, (agent.conversation_strategy?.preference_collection?.preferences_to_collect || []).length)}
                        value={agent.conversation_strategy?.preference_collection?.min_preferences_before_search || 0}
                        onChange={(e) => updateMinPreferences(e.target.value)}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>0 (immediate)</span>
                        <span className="font-semibold">
                          {agent.conversation_strategy?.preference_collection?.min_preferences_before_search || 0}
                        </span>
                        <span>All preferences</span>
                      </div>
                    </div>
                    
                    {/* Max Questions */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">
                        Maximum Questions to Ask
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={agent.conversation_strategy?.preference_collection?.max_questions || 3}
                        onChange={(e) => updateMaxQuestions(e.target.value)}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>1</span>
                        <span className="font-semibold">
                          {agent.conversation_strategy?.preference_collection?.max_questions || 3}
                        </span>
                        <span>10</span>
                      </div>
                    </div>
                    
                  </div>
                </div>
                
                {/* Info Box */}
                <div className="bg-white border border-blue-300 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 text-lg">💡</span>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">How It Works</h4>
                      <ul className="text-xs text-blue-800 space-y-1">
                        <li>• AI asks questions ONE AT A TIME naturally in conversation</li>
                        <li>• Stops asking when minimum preferences collected</li>
                        <li>• Never exceeds maximum question limit</li>
                        <li>• Required preferences are always asked</li>
                        <li>• Optional preferences may be skipped if user provides enough info</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
              </div>
            )}
          </div>
        )}
      </div>
    ) : (
      /* Flow Engine enabled - show info message */
      <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-amber-900">Conversation Strategy Disabled</h4>
            <p className="text-sm text-amber-700 mt-1">
              Flow Engine is enabled for this agent. Conversation flows are now managed through the <strong>Flows</strong> tab instead of conversation strategy.
            </p>
          </div>
        </div>
      </div>
    )}
  </div>
);
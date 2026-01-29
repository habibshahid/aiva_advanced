/**
 * Agent Editor Tab Components - Part 2: Voice, Flows, Knowledge
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, ArrowRight, Database, ExternalLink, Settings } from 'lucide-react';

// ============================================================================
// VOICE TAB
// ============================================================================

export const VoiceTab = ({ agent, setAgent, handleProviderChange, agentId }) => (
  <div className="space-y-6">
    {/* Voice Provider */}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Voice Provider</h3>
      
      <select
        value={agent.provider || 'openai'}
        onChange={(e) => handleProviderChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      >
        <option value="openai">OpenAI Realtime API</option>
        <option value="deepgram">Deepgram</option>
        <option value="custom">Custom (Intellicon AiVA)</option>
        <option value="intent-ivr">Intent IVR (Pre-recorded Audio)</option>
      </select>
      
      <p className="mt-2 text-sm text-gray-500">
        {agent.provider === 'deepgram' && 'Deepgram provides more natural sounding voices'}
        {agent.provider === 'custom' && 'Custom provider using Soniox STT + Groq LLM + Uplift TTS'}
        {agent.provider === 'intent-ivr' && 'Intent-based IVR with pre-recorded/cached audio (lowest cost)'}
        {(agent.provider === 'openai' || !agent.provider) && 'OpenAI Realtime provides integrated voice experience'}
      </p>
    </div>

    {/* OpenAI Voice Settings */}
    {agent.provider === 'openai' && (
      <>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">OpenAI Voice</h3>
          <select
            value={agent.voice}
            onChange={(e) => setAgent({ ...agent, voice: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'].map(v => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* OpenAI Model Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Model Settings</h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Realtime Model</label>
              <select
                value={agent.model}
                onChange={(e) => setAgent({ ...agent, model: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500"
              >
                <option value="gpt-4o-realtime-preview-2024-12-17">GPT-4o Realtime (Latest)</option>
                <option value="gpt-4o-mini-realtime-preview-2024-12-17">GPT-4o Mini Realtime (Faster, Cheaper)</option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                <strong>GPT-4o:</strong> Most capable, ~$0.06/min. <strong>GPT-4o Mini:</strong> Faster, ~$0.024/min.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperature: <span className="text-primary-600 font-semibold">{agent.temperature}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={agent.temperature}
                onChange={(e) => setAgent({ ...agent, temperature: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0 (Focused)</span>
                <span>0.5 (Balanced)</span>
                <span>1.0 (Creative)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Response Tokens</label>
              <input
                type="number"
                min="200"
                max="8192"
                step="100"
                value={agent.max_tokens}
                onChange={(e) => setAgent({ ...agent, max_tokens: parseInt(e.target.value) || 200 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      </>
    )}

    {/* Deepgram Settings */}
    {agent.provider === 'deepgram' && (
      <>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Speech-to-Text (STT)</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <select
                value={agent.deepgram_model || 'nova-2'}
                onChange={(e) => setAgent({ ...agent, deepgram_model: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <optgroup label="Nova-3 (Best Accuracy)">
                  <option value="nova-3">Nova-3 General</option>
                  <option value="nova-3-phonecall">Nova-3 Phone Call</option>
                  <option value="nova-3-conversationalai">Nova-3 Conversational AI</option>
                </optgroup>
                <optgroup label="Nova-2 (Good for Non-English)">
                  <option value="nova-2">Nova-2 General</option>
                  <option value="nova-2-phonecall">Nova-2 Phone Call</option>
                </optgroup>
                <optgroup label="Flux (Voice Agents)">
                  <option value="flux">Flux (Conversational Flow)</option>
                </optgroup>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <select
                value={agent.deepgram_language || 'en'}
                onChange={(e) => setAgent({ ...agent, deepgram_language: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="multi">🌍 Multi (10 Languages)</option>
                <option value="en">🇺🇸 English</option>
                <option value="en-US">🇺🇸 English (US)</option>
                <option value="en-GB">🇬🇧 English (UK)</option>
                <option value="es">🇪🇸 Spanish</option>
                <option value="fr">🇫🇷 French</option>
                <option value="de">🇩🇪 German</option>
                <option value="hi">🇮🇳 Hindi</option>
                <option value="ur">🇵🇰 Urdu</option>
                <option value="ar">🇸🇦 Arabic</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Text-to-Speech (TTS)</h3>
          <select
            value={agent.deepgram_voice || 'shimmer'}
            onChange={(e) => setAgent({ ...agent, deepgram_voice: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <optgroup label="OpenAI Voices">
              {['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'].map(v => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </optgroup>
            <optgroup label="Deepgram Aura Voices">
              <option value="aura-asteria-en">Asteria (Female)</option>
              <option value="aura-luna-en">Luna (Female)</option>
              <option value="aura-orion-en">Orion (Male)</option>
              <option value="aura-arcas-en">Arcas (Male)</option>
            </optgroup>
          </select>
        </div>

        {/* Deepgram Model Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Model Settings</h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperature: <span className="text-primary-600 font-semibold">{agent.temperature}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={agent.temperature}
                onChange={(e) => setAgent({ ...agent, temperature: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0 (Focused)</span>
                <span>0.5 (Balanced)</span>
                <span>1.0 (Creative)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Response Tokens</label>
              <input
                type="number"
                min="200"
                max="8192"
                step="100"
                value={agent.max_tokens}
                onChange={(e) => setAgent({ ...agent, max_tokens: parseInt(e.target.value) || 200 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      </>
    )}

    {/* Custom Provider Settings */}
    {agent.provider === 'custom' && (
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200 p-6">
        <h3 className="text-lg font-medium text-purple-900 mb-4">🎯 Custom Voice Provider</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">TTS Provider</label>
            <select
              value={agent.tts_provider || 'uplift'}
              onChange={(e) => {
                const newTtsProvider = e.target.value;
                let defaultVoice = 'ur-PK-female';
                if (newTtsProvider === 'azure') defaultVoice = 'ur-PK-UzmaNeural';
                if (newTtsProvider === 'openai') defaultVoice = 'nova';
                setAgent({ ...agent, tts_provider: newTtsProvider, custom_voice: defaultVoice });
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="uplift">🇵🇰 Uplift AI (Pakistani Languages)</option>
              <option value="azure">☁️ Azure TTS (Microsoft)</option>
              <option value="openai">🤖 OpenAI TTS (High Quality)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
            {(agent.tts_provider === 'uplift' || !agent.tts_provider) && (
              <select
                value={agent.custom_voice || 'v_meklc281'}
                onChange={(e) => setAgent({ ...agent, custom_voice: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <optgroup label="🇵🇰 Urdu Voices">
                  <option value="v_meklc281">👩 Ayesha - Info/Education V2</option>
                  <option value="v_8eelc901">👩 Fatima - Info/Education</option>
                  <option value="v_30s70t3a">👨 Asad - News Anchor</option>
                  <option value="v_yypgzenx">👴 Dada Jee - Storyteller</option>
                </optgroup>
              </select>
            )}
            {agent.tts_provider === 'openai' && (
              <select
                value={agent.custom_voice || 'nova'}
                onChange={(e) => setAgent({ ...agent, custom_voice: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                {['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map(v => (
                  <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                ))}
              </select>
            )}
            {agent.tts_provider === 'azure' && (
              <select
                value={agent.custom_voice || 'ur-PK-UzmaNeural'}
                onChange={(e) => setAgent({ ...agent, custom_voice: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="ur-PK-UzmaNeural">👩 Uzma (Female - Urdu)</option>
                <option value="ur-PK-AsadNeural">👨 Asad (Male - Urdu)</option>
                <option value="en-US-JennyNeural">👩 Jenny (Female - English)</option>
              </select>
            )}
          </div>
		  {/* LLM Model Selection */}
			<div>
			  <label className="block text-sm font-medium text-gray-700 mb-1">LLM Model</label>
			  <select
				value={agent.llm_model || 'llama-3.3-70b-versatile'}
				onChange={(e) => setAgent({ ...agent, llm_model: e.target.value })}
				className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
			  >
				<optgroup label="Groq (Fast & Free)">
				  <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Recommended)</option>
				  <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
				  <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
				  <option value="gemma2-9b-it">Gemma 2 9B</option>
				</optgroup>
				<optgroup label="OpenAI">
				  <option value="gpt-4o-mini">GPT-4o Mini</option>
				  <option value="gpt-4o">GPT-4o</option>
				  <option value="gpt-4-turbo">GPT-4 Turbo</option>
				</optgroup>
			  </select>
			  <p className="text-xs text-gray-500 mt-1">
				Groq models are faster and free. OpenAI models may be more accurate.
			  </p>
			</div>
        </div>
      </div>
    )}

    {/* Intent IVR Settings */}
    {agent.provider === 'intent-ivr' && (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 p-6">
        <h3 className="text-lg font-medium text-amber-900 mb-4">📞 Intent IVR Settings</h3>
        <p className="text-sm text-amber-700 mb-4">
          Intent IVR uses pre-recorded audio responses for cost-effective automated call handling.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">TTS Provider</label>
            <select
              value={agent.tts_provider || 'uplift'}
              onChange={(e) => setAgent({ ...agent, tts_provider: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
            >
              <option value="uplift">🇵🇰 Uplift AI</option>
              <option value="azure">☁️ Azure TTS</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
            <select
              value={agent.custom_voice || 'ur-PK-female'}
              onChange={(e) => setAgent({ ...agent, custom_voice: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
            >
              <option value="ur-PK-female">👩 Female (Urdu)</option>
              <option value="ur-PK-male">👨 Male (Urdu)</option>
            </select>
          </div>
        </div>
        
        {/* Intent Configuration Link */}
        {agentId && (
          <Link
            to={`/agents/${agentId}/ivr`}
            className="mt-4 flex items-center justify-between p-4 bg-white rounded-lg border border-amber-300 hover:border-amber-500 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Configure Intents</h4>
                <p className="text-sm text-gray-500">Set up IVR intents and responses</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </Link>
        )}
      </div>
    )}

    {/* Voice Detection Settings */}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Voice Detection (VAD)</h3>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            VAD Threshold: <span className="text-primary-600 font-semibold">{agent.vad_threshold}</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={agent.vad_threshold}
            onChange={(e) => setAgent({ ...agent, vad_threshold: parseFloat(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.1 (Sensitive)</span>
            <span>0.5 (Balanced)</span>
            <span>1.0 (Strict)</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Lower values pick up quiet speech but may detect background noise.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Silence Duration (ms)</label>
          <input
            type="number"
            min="200"
            max="2000"
            step="100"
            value={agent.silence_duration_ms}
            onChange={(e) => setAgent({ ...agent, silence_duration_ms: parseInt(e.target.value) || 500 })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500"
          />
          <p className="mt-2 text-sm text-gray-500">
            How long to wait after user stops speaking. Recommended: 500ms English, 700ms Urdu.
          </p>
        </div>
      </div>
    </div>
  </div>
);

// ============================================================================
// FLOWS TAB
// ============================================================================

export const FlowsTab = ({ agent, setAgent, agentId }) => (
  <div className="space-y-6">
    {/* Flow Engine Toggle */}
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Flow Engine</h3>
          <p className="text-sm text-gray-500">Enable conversation flows for structured data collection.</p>
        </div>
        <button
          type="button"
          onClick={() => setAgent({ ...agent, use_flow_engine: !agent.use_flow_engine })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            agent.use_flow_engine ? 'bg-primary-600' : 'bg-gray-200'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            agent.use_flow_engine ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {agent.use_flow_engine && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Flow Mode</label>
              <select
                value={agent.flow_mode || 'intelligent'}
                onChange={(e) => setAgent({ ...agent, flow_mode: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              >
                <option value="guided">🔒 Guided (Strict)</option>
                <option value="intelligent">🧠 Intelligent (Recommended)</option>
                <option value="adaptive">🔄 Adaptive (Flexible)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message Buffer (sec)</label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={agent.message_buffer_seconds || 2}
                onChange={(e) => setAgent({ ...agent, message_buffer_seconds: parseFloat(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Timeout (min)</label>
              <input
                type="number"
                min="5"
                max="1440"
                value={agent.session_timeout_minutes || 30}
                onChange={(e) => setAgent({ ...agent, session_timeout_minutes: parseInt(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          
          {(agent.flow_mode === 'intelligent' || !agent.flow_mode) && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                <strong>🧠 Intelligent Mode:</strong> AI extracts all data from messages and can call functions directly.
              </p>
            </div>
          )}
          
          {agent.flow_mode === 'adaptive' && (
            <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <p className="text-sm text-purple-700">
                <strong>🔄 Adaptive Mode:</strong> AI can pause flows to handle tangent questions, then resume.
              </p>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Manage Flows Link */}
    <Link
      to={`/agents/${agentId}/flows`}
      className="flex items-center justify-between p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
          <GitBranch className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900">Manage Flows</h3>
          <p className="text-sm text-gray-500">Create and configure conversation workflows</p>
        </div>
      </div>
      <ArrowRight className="w-5 h-5 text-gray-400" />
    </Link>
  </div>
);

// ============================================================================
// KNOWLEDGE TAB
// ============================================================================

export const KnowledgeTab = ({ agent, setAgent, knowledgeBases }) => (
  <div className="space-y-6">
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Knowledge Base</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Knowledge Base</label>
          <select
            value={agent.kb_id || ''}
            onChange={(e) => setAgent({ ...agent, kb_id: e.target.value || null })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">-- No Knowledge Base --</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name} ({kb.stats?.document_count || 0} docs)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Behavior</label>
          <select
            value={agent.knowledge_search_mode || 'auto'}
            onChange={(e) => setAgent({ ...agent, knowledge_search_mode: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="auto">Auto - LLM decides when to search</option>
            <option value="always">Always search the knowledge base</option>
            <option value="never">Follow instructions only</option>
          </select>
        </div>
      </div>
    </div>

    {/* Quick Link to KB Management */}
    <Link
      to="/knowledge"
      className="flex items-center justify-between p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <Database className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900">Manage Knowledge Bases</h3>
          <p className="text-sm text-gray-500">Upload documents, manage products, configure Shopify</p>
        </div>
      </div>
      <ExternalLink className="w-5 h-5 text-gray-400" />
    </Link>
  </div>
);
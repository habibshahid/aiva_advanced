/**
 * Pipecat Voice Configuration Tab
 * 
 * React component for configuring Pipecat voice agent settings.
 * Add this to the agent editor tabs.
 * 
 * File: api/dashboard/src/pages/agent-editor/TabsPipecat.jsx
 */

import React from 'react';
import { Info, Cpu, Mic, MessageSquare, Volume2, Zap, Settings2 } from 'lucide-react';

// ============================================================================
// PIPECAT PROVIDER OPTIONS
// ============================================================================

const sttProviders = [
  { value: 'soniox', label: 'Soniox', description: 'Ultra-low latency, optimized for IVR/telephony', cost: '$0.0035/min' },
  { value: 'deepgram', label: 'Deepgram', description: 'Fast, accurate, best for real-time', cost: '$0.0043/min' },
  { value: 'whisper', label: 'OpenAI Whisper', description: 'High accuracy, supports many languages', cost: '$0.006/min' },
  { value: 'azure', label: 'Azure Speech', description: 'Microsoft Azure, enterprise ready', cost: '$0.006/min' },
  { value: 'assembly', label: 'AssemblyAI', description: 'Good accuracy, speaker diarization', cost: '$0.006/min' },
];

const sttModels = {
  deepgram: [
    { value: 'nova-2', label: 'Nova-2 (Recommended)', description: 'Best accuracy and speed' },
    { value: 'nova-2-phonecall', label: 'Nova-2 Phonecall', description: 'Optimized for phone audio' },
    { value: 'nova-2-meeting', label: 'Nova-2 Meeting', description: 'Optimized for meetings' },
  ],
  whisper: [
    { value: 'whisper-1', label: 'Whisper-1', description: 'Standard model' },
  ],
  azure: [
    { value: 'default', label: 'Default', description: 'Standard recognition' },
  ],
};

const llmProviders = [
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o, GPT-4o-mini', cost: 'From $0.15/1M tokens' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude 3.5, Claude 3', cost: 'From $3/1M tokens' },
  { value: 'groq', label: 'Groq', description: 'Ultra-fast Llama, Mixtral', cost: 'From $0.05/1M tokens' },
  { value: 'together', label: 'Together AI', description: 'Various open models', cost: 'From $0.20/1M tokens' },
];

const llmModels = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Recommended)', description: 'Fast, cost-effective' },
    { value: 'gpt-4o', label: 'GPT-4o', description: 'Most capable' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Balanced performance' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', description: 'Best balance' },
    { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', description: 'Fast and capable' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', description: 'Fastest' },
  ],
  groq: [
    { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B', description: 'Best quality' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', description: 'Ultra fast' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', description: 'Good balance' },
  ],
  together: [
    { value: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo', description: 'Fast inference' },
    { value: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo', description: 'Very fast' },
  ],
};

const ttsProviders = [
  { value: 'cartesia', label: 'Cartesia', description: 'Ultra-low latency, natural voices', cost: '$0.042/min' },
  { value: 'elevenlabs', label: 'ElevenLabs', description: 'Highly expressive, voice cloning', cost: '$0.30/1K chars' },
  { value: 'deepgram', label: 'Deepgram Aura', description: 'Fast, natural, good value', cost: '$0.015/min' },
  { value: 'openai', label: 'OpenAI TTS', description: 'Simple, reliable', cost: '$0.015/min' },
  { value: 'playht', label: 'PlayHT', description: 'Voice cloning, many voices', cost: '$0.03/min' },
];

const ttsVoices = {
  cartesia: [
    { value: 'a0e99841-438c-4a64-b679-ae501e7d6091', label: 'Barbershop Man', description: 'Male, professional' },
    { value: '79a125e8-cd45-4c13-8a67-188112f4dd22', label: 'British Lady', description: 'Female, British' },
    { value: '638efaaa-4d0c-442e-b701-3fae16aad012', label: 'Sarah', description: 'Female, friendly' },
  ],
  elevenlabs: [
    { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', description: 'Female, American' },
    { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella', description: 'Female, soft' },
    { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni', description: 'Male, professional' },
  ],
  deepgram: [
    { value: 'aura-asteria-en', label: 'Asteria', description: 'Female, American' },
    { value: 'aura-luna-en', label: 'Luna', description: 'Female, soft' },
    { value: 'aura-helios-en', label: 'Helios', description: 'Male, British' },
    { value: 'aura-orion-en', label: 'Orion', description: 'Male, deep' },
  ],
  openai: [
    { value: 'nova', label: 'Nova', description: 'Female, natural' },
    { value: 'alloy', label: 'Alloy', description: 'Neutral' },
    { value: 'echo', label: 'Echo', description: 'Male' },
    { value: 'fable', label: 'Fable', description: 'Female, British' },
    { value: 'onyx', label: 'Onyx', description: 'Male, deep' },
    { value: 'shimmer', label: 'Shimmer', description: 'Female, warm' },
  ],
  playht: [
    { value: 's3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d20a1/original/manifest.json', label: 'Jennifer', description: 'Female, American' },
  ],
};

// ============================================================================
// COMPONENT
// ============================================================================

export const PipecatTab = ({ agent, setAgent }) => {
  // Get current models based on selected providers
  const currentSttModels = sttModels[agent.pipecat_stt] || [];
  const currentLlmModels = llmModels[agent.pipecat_llm] || [];
  const currentTtsVoices = ttsVoices[agent.pipecat_tts] || [];
  
  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-medium text-purple-900">Pipecat Voice Pipeline</h3>
            <p className="text-sm text-purple-700 mt-1">
              Configure a custom voice pipeline with your choice of STT, LLM, and TTS providers. 
              Pipecat offers maximum flexibility and often lower latency than all-in-one solutions.
            </p>
          </div>
        </div>
      </div>

      {/* STT Configuration */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-medium text-gray-900">Speech-to-Text (STT)</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
            <select
              value={agent.pipecat_stt || 'deepgram'}
              onChange={(e) => setAgent({ 
                ...agent, 
                pipecat_stt: e.target.value,
                pipecat_stt_model: sttModels[e.target.value]?.[0]?.value || null
              })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
            >
              {sttProviders.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label} - {p.cost}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {sttProviders.find(p => p.value === (agent.pipecat_stt || 'deepgram'))?.description}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select
              value={agent.pipecat_stt_model || currentSttModels[0]?.value || ''}
              onChange={(e) => setAgent({ ...agent, pipecat_stt_model: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
              disabled={currentSttModels.length === 0}
            >
              {currentSttModels.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* LLM Configuration */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-medium text-gray-900">Language Model (LLM)</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
            <select
              value={agent.pipecat_llm || 'openai'}
              onChange={(e) => setAgent({ 
                ...agent, 
                pipecat_llm: e.target.value,
                pipecat_llm_model: llmModels[e.target.value]?.[0]?.value || null
              })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
            >
              {llmProviders.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label} - {p.cost}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {llmProviders.find(p => p.value === (agent.pipecat_llm || 'openai'))?.description}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select
              value={agent.pipecat_llm_model || currentLlmModels[0]?.value || ''}
              onChange={(e) => setAgent({ ...agent, pipecat_llm_model: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
            >
              {currentLlmModels.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {currentLlmModels.find(m => m.value === agent.pipecat_llm_model)?.description}
            </p>
          </div>
        </div>
        
        {/* LLM Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temperature: <span className="text-purple-600">{agent.temperature || 0.7}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={agent.temperature || 0.7}
              onChange={(e) => setAgent({ ...agent, temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Focused</span>
              <span>Creative</span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Response Tokens</label>
            <input
              type="number"
              min="50"
              max="2000"
              value={agent.max_tokens || 150}
              onChange={(e) => setAgent({ ...agent, max_tokens: parseInt(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-xs text-gray-500">Keep low (100-200) for natural conversation</p>
          </div>
        </div>
      </div>

      {/* TTS Configuration */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Volume2 className="w-5 h-5 text-orange-600" />
          <h3 className="text-lg font-medium text-gray-900">Text-to-Speech (TTS)</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
            <select
              value={agent.pipecat_tts || 'cartesia'}
              onChange={(e) => setAgent({ 
                ...agent, 
                pipecat_tts: e.target.value,
                pipecat_voice: ttsVoices[e.target.value]?.[0]?.value || null
              })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
            >
              {ttsProviders.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label} - {p.cost}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {ttsProviders.find(p => p.value === (agent.pipecat_tts || 'cartesia'))?.description}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
            <select
              value={agent.pipecat_voice || currentTtsVoices[0]?.value || ''}
              onChange={(e) => setAgent({ ...agent, pipecat_voice: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
            >
              {currentTtsVoices.map(v => (
                <option key={v.value} value={v.value}>
                  {v.label} - {v.description}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* TTS Speed */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Speech Speed: <span className="text-purple-600">{agent.pipecat_tts_speed || 1.0}x</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={agent.pipecat_tts_speed || 1.0}
            onChange={(e) => setAgent({ ...agent, pipecat_tts_speed: parseFloat(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0.5x (Slow)</span>
            <span>1.0x</span>
            <span>2.0x (Fast)</span>
          </div>
        </div>
      </div>

      {/* Cost Estimate */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Estimated Cost per Minute</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-blue-600">
              ${sttProviders.find(p => p.value === (agent.pipecat_stt || 'deepgram'))?.cost?.replace('$', '').replace('/min', '') || '0.00'}
            </div>
            <div className="text-xs text-gray-500">STT</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-green-600">~$0.01</div>
            <div className="text-xs text-gray-500">LLM (varies)</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-orange-600">
              ${ttsProviders.find(p => p.value === (agent.pipecat_tts || 'cartesia'))?.cost?.replace('$', '').replace('/min', '').replace('/1K chars', '') || '0.00'}
            </div>
            <div className="text-xs text-gray-500">TTS</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PipecatTab;

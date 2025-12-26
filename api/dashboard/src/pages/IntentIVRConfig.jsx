/**
 * Intent IVR Configuration Page
 * Configure intents, audio files, templates, and caching for Intent-based IVR
 * 
 * MULTI-LANGUAGE SUPPORT:
 * - Greeting message (greeting_text)
 * - No-match fallback (no_match_text)
 * - KB not found fallback (fallback_text)
 * - Intent responses (response_text)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Save, Plus, Trash2, Edit2, Play, Pause, 
  Upload, Volume2, Settings, Database, Zap, 
  RefreshCw, ChevronDown, ChevronUp, GripVertical,
  Mic, FileAudio, MessageSquare, Phone, ArrowRight,
  CheckCircle, XCircle, AlertCircle, Loader2, GitBranch
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAgent } from '../services/api';
import * as ivrApi from '../services/ivrApi';
import { MultiLangAudioTextInput } from '../components/ivr/multilang';

// Intent type options
const INTENT_TYPES = [
  { value: 'static', label: 'Static Response', icon: MessageSquare, description: 'Pre-defined response played directly' },
  { value: 'kb_lookup', label: 'Knowledge Base', icon: Database, description: 'Search KB and respond with results' },
  { value: 'function_call', label: 'Function Call', icon: Zap, description: 'Execute function and respond with result' },
  { value: 'transfer', label: 'Transfer Call', icon: Phone, description: 'Transfer to human agent/queue' },
  { value: 'collect_input', label: 'Collect Input', icon: Mic, description: 'Collect specific information from caller' },
  { value: 'flow', label: 'Start Flow', description: 'Start a conversation flow' } 
];

const IntentIVRConfig = () => {
  const { id: agentId } = useParams();
  const navigate = useNavigate();
  
  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState(null);
  const [config, setConfig] = useState(null);
  const [intents, setIntents] = useState([]);
  const [audioFiles, setAudioFiles] = useState([]);
  const [cacheStats, setCacheStats] = useState(null);
  const [flows, setFlows] = useState([]);
  const [languages, setLanguages] = useState([]);
  
  // UI state
  const [activeTab, setActiveTab] = useState('intents');
  const [showIntentModal, setShowIntentModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [editingIntent, setEditingIntent] = useState(null);
  const [playingAudio, setPlayingAudio] = useState(null);
  
  // Audio player ref
  const audioRef = useRef(null);
  
  // Load data
  useEffect(() => {
    loadData();
  }, [agentId]);
  
  useEffect(() => {
    const loadFlows = async () => {
      try {
        const res = await ivrApi.getFlows(agentId, true);
        setFlows(res.data?.data || res.data || []);
      } catch (error) {
		setFlows([]);
        console.error('Failed to load flows:', error);
      }
    };
    loadFlows();
  }, [agentId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [agentRes, configRes, intentsRes, audioRes, cacheRes, langRes] = await Promise.all([
		getAgent(agentId),
		ivrApi.getIVRConfig(agentId),
		ivrApi.getIntents(agentId, true),
		ivrApi.getAudioFiles(agentId),
		ivrApi.getCacheStats(agentId),
		ivrApi.getAgentLanguages(agentId)
	  ]);
      
      setAgent(agentRes.data.agent);
      setConfig(configRes.data);
      setIntents(intentsRes.data || []);
	  setAudioFiles(audioRes.data || []);
      setCacheStats(cacheRes.data);
	  setLanguages(langRes.data || []);
      
    } catch (error) {
      console.error('Failed to load IVR config:', error);
      toast.error('Failed to load IVR configuration');
    } finally {
      setLoading(false);
    }
  };
  
  // Save config
  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      await ivrApi.updateIVRConfig(agentId, config);
      toast.success('Configuration saved');
    } catch (error) {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };
  
  // Play audio
  const handlePlayAudio = (audioId) => {
    if (playingAudio === audioId) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    } else {
      const url = ivrApi.getAudioStreamUrl(agentId, audioId);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setPlayingAudio(audioId);
      }
    }
  };
  
  // Audio ended handler
  const handleAudioEnded = () => {
    setPlayingAudio(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden audio element */}
      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(`/agents/${agentId}`)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Intent IVR Configuration</h1>
            <p className="text-sm text-gray-500">{agent?.name}</p>
          </div>
        </div>
        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Configuration
        </button>
      </div>
      
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'intents', label: 'Intents', icon: MessageSquare },
            { id: 'audio', label: 'Audio Library', icon: FileAudio },
            { id: 'cache', label: 'Response Cache', icon: Database },
            { id: 'settings', label: 'Settings', icon: Settings }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'intents' && (
          <IntentsTab 
            agentId={agentId}
            intents={intents}
            audioFiles={audioFiles}
            flows={flows}
            languages={languages}
            onRefresh={loadData}
            onPlayAudio={handlePlayAudio}
            playingAudio={playingAudio}
          />
        )}
        
        {activeTab === 'audio' && (
          <AudioTab 
            agentId={agentId}
            audioFiles={audioFiles}
            onRefresh={loadData}
            onPlayAudio={handlePlayAudio}
            playingAudio={playingAudio}
          />
        )}
        
        {activeTab === 'cache' && (
          <CacheTab 
            agentId={agentId}
            cacheStats={cacheStats}
            onRefresh={loadData}
          />
        )}
        
        {activeTab === 'settings' && (
          <SettingsTab 
            config={config}
            audioFiles={audioFiles}
            onChange={setConfig}
            languages={languages}
            agentId={agentId}
          />
        )}
      </div>
    </div>
  );
};

// =============================================================================
// INTENTS TAB
// =============================================================================

const IntentsTab = ({ agentId, intents, audioFiles, flows, languages, onRefresh, onPlayAudio, playingAudio }) => {

  const [showModal, setShowModal] = useState(false);
  const [editingIntent, setEditingIntent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  
  const [form, setForm] = useState({
    intent_name: '',
    intent_type: 'static',
    description: '',
    trigger_phrases: [''],
    response_text: '',
    response_audio_id: '',
    auto_regenerate: true,
    kb_search_query_template: '',
    action_type: 'respond',
    transfer_queue: '',
    function_name: '',
    confidence_threshold: 0.70,
    priority: 0,
    is_active: true,
	flow_id: ''
  });
  
  const [generatingAudio, setGeneratingAudio] = useState(false);
  
  const openModal = (intent = null) => {
    if (intent) {
      setEditingIntent(intent);
      setForm({
        intent_name: intent.intent_name || '',
        intent_type: intent.intent_type || 'static',
        description: intent.description || '',
        trigger_phrases: intent.trigger_phrases?.length ? intent.trigger_phrases : [''],
        response_text: intent.response_text || '',
        response_audio_id: intent.response_audio_id || '',
        auto_regenerate: intent.auto_regenerate !== false,
        kb_search_query_template: intent.kb_search_query_template || '',
        action_type: intent.action_type || 'respond',
        transfer_queue: intent.transfer_queue || '',
        function_name: intent.function_name || '',
        confidence_threshold: intent.confidence_threshold || 0.70,
        priority: intent.priority || 0,
        is_active: intent.is_active !== false,
		flow_id: intent.flow_id || '',
      });
    } else {
      setEditingIntent(null);
      setForm({
        intent_name: '',
        intent_type: 'static',
        description: '',
        trigger_phrases: [''],
        response_text: '',
        response_audio_id: '',
        auto_regenerate: true,
        kb_search_query_template: '',
        action_type: 'respond',
        transfer_queue: '',
        function_name: '',
        confidence_threshold: 0.70,
        priority: 0,
        is_active: true,
		flow_id: ''
      });
    }
    setShowModal(true);
  };
  
  const handleSave = async () => {
    if (!form.intent_name) {
      toast.error('Intent name is required');
      return;
    }
    
    const validPhrases = form.trigger_phrases.filter(p => p.trim());
    if (validPhrases.length === 0) {
      toast.error('At least one trigger phrase is required');
      return;
    }
    
	if (form.intent_type === 'flow' && !form.flow_id) {
      toast.error('Please select a conversation flow');
      return;
    }
	
    try {
      setSaving(true);
      
      const data = {
        ...form,
        trigger_phrases: validPhrases
      };
      
      if (editingIntent) {
        await ivrApi.updateIntent(agentId, editingIntent.id, data);
        toast.success('Intent updated');
      } else {
        await ivrApi.createIntent(agentId, data);
        toast.success('Intent created');
      }
      
      setShowModal(false);
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save intent');
    } finally {
      setSaving(false);
    }
  };
  
  const handleDelete = async (intentId) => {
    if (!window.confirm('Delete this intent?')) return;
    
    try {
      setDeleting(intentId);
      await ivrApi.deleteIntent(agentId, intentId);
      toast.success('Intent deleted');
      onRefresh();
    } catch (error) {
      toast.error('Failed to delete intent');
    } finally {
      setDeleting(null);
    }
  };
  
  const handleGenerateAudio = async (intent) => {
    if (!intent.response_text) {
      toast.error('No response text to generate audio from');
      return;
    }
    
    try {
      setGeneratingAudio(true);
      const result = await ivrApi.generateTTS(agentId, intent.response_text);
      
      if (result.data?.id) {
        await ivrApi.updateIntent(agentId, intent.id, {
          response_audio_id: result.data.id
        });
        toast.success('Audio generated and saved');
        onRefresh();
      }
    } catch (error) {
      toast.error('Failed to generate audio');
    } finally {
      setGeneratingAudio(false);
    }
  };
  
  const addTriggerPhrase = () => {
    setForm({ ...form, trigger_phrases: [...form.trigger_phrases, ''] });
  };
  
  const updateTriggerPhrase = (index, value) => {
    const updated = [...form.trigger_phrases];
    updated[index] = value;
    setForm({ ...form, trigger_phrases: updated });
  };
  
  const removeTriggerPhrase = (index) => {
    const updated = form.trigger_phrases.filter((_, i) => i !== index);
    setForm({ ...form, trigger_phrases: updated.length ? updated : [''] });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Intent Configuration</h2>
          <p className="text-sm text-gray-500">Define intents and their responses</p>
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Intent
        </button>
      </div>
      
      {/* Intents List */}
      {intents.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Intents</h3>
          <p className="text-gray-500 mb-4">Create intents to handle caller requests</p>
          <button
            onClick={() => openModal()}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add First Intent
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {intents.map(intent => (
            <div 
              key={intent.id}
              className={`bg-white rounded-lg border p-4 ${!intent.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-medium text-gray-900">{intent.intent_name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      intent.intent_type === 'static' ? 'bg-blue-100 text-blue-700' :
                      intent.intent_type === 'kb_lookup' ? 'bg-purple-100 text-purple-700' :
                      intent.intent_type === 'function_call' ? 'bg-yellow-100 text-yellow-700' :
                      intent.intent_type === 'transfer' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {intent.intent_type}
                    </span>
                    {intent.response_audio_id && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full flex items-center">
                        <Volume2 className="w-3 h-3 mr-1" />
                        Audio Ready
                      </span>
                    )}
					{intent.flow_id && (
                      <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center">
                        <GitBranch className="w-3 h-3 mr-1" />
                        Flow
                      </span>
                    )}
                    {!intent.is_active && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                  
                  {intent.description && (
                    <p className="text-sm text-gray-500 mt-1">{intent.description}</p>
                  )}
                  
                  <div className="mt-2 flex flex-wrap gap-2">
                    {intent.trigger_phrases?.slice(0, 3).map((phrase, i) => (
                      <span key={i} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                        "{phrase}"
                      </span>
                    ))}
                    {intent.trigger_phrases?.length > 3 && (
                      <span className="px-2 py-1 text-xs text-gray-500">
                        +{intent.trigger_phrases.length - 3} more
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-500">
                    Matched {intent.match_count || 0} times
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {intent.response_audio_id && (
                    <button
                      onClick={() => onPlayAudio(intent.response_audio_id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="Play audio"
                    >
                      {playingAudio === intent.response_audio_id ? (
                        <Pause className="w-4 h-4 text-primary-600" />
                      ) : (
                        <Play className="w-4 h-4 text-gray-600" />
                      )}
                    </button>
                  )}
                  
                  {intent.response_text && !intent.response_audio_id && (
                    <button
                      onClick={() => handleGenerateAudio(intent)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="Generate audio"
                    >
                      <Volume2 className="w-4 h-4 text-gray-600" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => openModal(intent)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4 text-gray-600" />
                  </button>
                  
                  <button
                    onClick={() => handleDelete(intent.id)}
                    disabled={deleting === intent.id}
                    className="p-2 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    {deleting === intent.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-600" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Intent Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowModal(false)} />
            
            <div className="relative bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white px-6 py-4 border-b z-10">
                <h3 className="text-lg font-semibold">
                  {editingIntent ? 'Edit Intent' : 'Create Intent'}
                </h3>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Intent Name *
                    </label>
                    <input
                      type="text"
                      value={form.intent_name}
                      onChange={(e) => setForm({ ...form, intent_name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="e.g., greeting, order_status"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Intent Type
                    </label>
                    <select
                      value={form.intent_type}
                      onChange={(e) => setForm({ ...form, intent_type: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      {INTENT_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
				  {/* Flow Selection - Required when intent_type is 'flow' */}
					{form.intent_type === 'flow' && (
					  <div className="md:col-span-2 p-4 bg-purple-50 border border-purple-200 rounded-lg">
						<label className="block text-sm font-medium text-purple-700 mb-1">
						  <span className="flex items-center gap-2">
							<GitBranch className="w-4 h-4" />
							Select Conversation Flow *
						  </span>
						</label>
						<select
						  value={form.flow_id || ''}
						  onChange={(e) => setForm({ ...form, flow_id: e.target.value || null })}
						  className="w-full border border-purple-300 rounded-lg px-3 py-2 bg-white"
						  required
						>
						  <option value="">-- Select a Flow --</option>
						  {flows.filter(f => f.is_active).map(flow => (
							<option key={flow.id} value={flow.id}>
							  {flow.flow_name} {flow.description ? `- ${flow.description}` : ''}
							</option>
						  ))}
						</select>
						{flows.filter(f => f.is_active).length === 0 && (
						  <p className="text-sm text-red-600 mt-2">
							⚠️ No active flows available. Please create a flow first in the Flows tab.
						  </p>
						)}
						<p className="text-xs text-purple-600 mt-1">
						  When this intent matches, the selected flow will be started
						</p>
					  </div>
					)}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Brief description of this intent"
                  />
                </div>
                
                {/* Trigger Phrases */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Trigger Phrases *
                  </label>
                  <div className="space-y-2">
                    {form.trigger_phrases.map((phrase, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={phrase}
                          onChange={(e) => updateTriggerPhrase(index, e.target.value)}
                          className="flex-1 border rounded-lg px-3 py-2"
                          placeholder="e.g., السلام علیکم, hello, hi"
                        />
                        {form.trigger_phrases.length > 1 && (
                          <button
                            onClick={() => removeTriggerPhrase(index)}
                            className="p-2 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addTriggerPhrase}
                    className="mt-2 text-sm text-primary-600 hover:text-primary-700"
                  >
                    + Add another phrase
                  </button>
                </div>
                
                {/* Response Text */}
				{form.intent_type === 'static' && (
				  <div>
					<MultiLangAudioTextInput
					  label="Response Text"
					  entityType="intent"
					  entityId={editingIntent?.id}
					  fieldName="response_text"
					  baseTextValue={form.response_text}
					  baseAudioId={form.response_audio_id}
					  onBaseTextChange={(v) => setForm({ ...form, response_text: v })}
					  onBaseAudioChange={(id) => setForm({ ...form, response_audio_id: id })}
					  languages={languages}
					  defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
					  audioFiles={audioFiles}
					  agentId={agentId}
					  placeholder="السلام علیکم! میں آپ کی کیا مدد کر سکتا ہوں؟"
					  multiline={true}
					/>
					<p className="text-xs text-gray-500 mt-1">
					  This text will be converted to speech or you can upload pre-recorded audio
					</p>
				  </div>
				)}
                
                {/* Audio File Selection - Only for kb_lookup (response_text MultiLang handles audio for static) */}
				{form.intent_type === 'kb_lookup' && (
				  <div>
					<label className="block text-sm font-medium text-gray-700 mb-1">
					  Response Audio File (Optional)
					</label>
					<select
					  value={form.response_audio_id || ''}
					  onChange={(e) => setForm({ ...form, response_audio_id: e.target.value || null })}
					  className="w-full border rounded-lg px-3 py-2"
					>
					  <option value="">None - Use generated TTS</option>
					  {audioFiles.map(audio => (
						<option key={audio.id} value={audio.id}>
						  {audio.name}
						</option>
					  ))}
					</select>
				  </div>
				)}
                
                {/* KB Search Query for kb_lookup */}
                {form.intent_type === 'kb_lookup' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      KB Search Query
                    </label>
                    <input
                      type="text"
                      value={form.kb_search_query_template || ''}
                      onChange={(e) => setForm({ ...form, kb_search_query_template: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="e.g., sales CRM features benefits pricing"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Keywords to search in KB. Use {'{query}'} to include user's question. Leave empty to use intent description.
                    </p>
                  </div>
                )}
                
                {/* Auto-regenerate option for kb_lookup */}
                {form.intent_type === 'kb_lookup' && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <input
                      type="checkbox"
                      id="auto_regenerate"
                      checked={form.auto_regenerate}
                      onChange={(e) => setForm({ ...form, auto_regenerate: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded"
                    />
                    <label htmlFor="auto_regenerate" className="text-sm">
                      <span className="font-medium text-gray-900">Auto-generate & cache audio</span>
                      <p className="text-gray-500">Generate audio on first call and cache for future use. Regenerates if audio is deleted.</p>
                    </label>
                  </div>
                )}
                
                {/* Transfer Queue (for transfer type) */}
                {form.intent_type === 'transfer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Transfer Queue
                    </label>
                    <input
                      type="text"
                      value={form.transfer_queue}
                      onChange={(e) => setForm({ ...form, transfer_queue: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="e.g., support, sales"
                    />
                  </div>
                )}
                
                {/* Function Name (for function_call type) */}
                {form.intent_type === 'function_call' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Function Name
                    </label>
                    <input
                      type="text"
                      value={form.function_name}
                      onChange={(e) => setForm({ ...form, function_name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="e.g., check_order_status"
                    />
                  </div>
                )}
                
                {/* Advanced Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confidence Threshold
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={form.confidence_threshold}
                      onChange={(e) => setForm({ ...form, confidence_threshold: parseFloat(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <input
                      type="number"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
                {/* Link to Conversation Flow */}
                {/* Link to Conversation Flow - Only show for non-flow intent types */}
				{form.intent_type !== 'flow' && (
				  <div className="border-t pt-4">
					<label className="block text-sm font-medium text-gray-700 mb-1">
					  <span className="flex items-center gap-2">
						<GitBranch className="w-4 h-4 text-purple-600" />
						Link to Conversation Flow (Optional)
					  </span>
					</label>
					<select
					  value={form.flow_id || ''}
					  onChange={(e) => setForm({ ...form, flow_id: e.target.value || null })}
					  className="w-full border rounded-lg px-3 py-2"
					>
					  <option value="">No flow - use response above</option>
					  {flows.filter(f => f.is_active).map(flow => (
						<option key={flow.id} value={flow.id}>
						  {flow.flow_name} {flow.description ? `- ${flow.description}` : ''}
						</option>
					  ))}
					</select>
					<p className="text-xs text-gray-500 mt-1">
					  If selected, this intent will start the conversation flow instead of responding directly
					</p>
				  </div>
				)}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 text-primary-600 rounded"
                  />
                  <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                    Active (enable matching)
                  </label>
                </div>
              </div>
              
              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex justify-end space-x-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingIntent ? 'Update' : 'Create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// AUDIO TAB
// =============================================================================

const AudioTab = ({ agentId, audioFiles, onRefresh, onPlayAudio, playingAudio }) => {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [ttsText, setTtsText] = useState('');
  const [ttsName, setTtsName] = useState('');
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setUploading(true);
      await ivrApi.uploadAudio(agentId, file);
      toast.success('Audio uploaded');
      onRefresh();
    } catch (error) {
      toast.error('Failed to upload audio');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const handleDelete = async (audioId) => {
    if (!window.confirm('Delete this audio file?')) return;
    
    try {
      setDeleting(audioId);
      await ivrApi.deleteAudio(agentId, audioId);
      toast.success('Audio deleted');
      onRefresh();
    } catch (error) {
      toast.error('Failed to delete audio');
    } finally {
      setDeleting(null);
    }
  };
  
  const handleGenerateTTS = async () => {
    if (!ttsText.trim()) {
      toast.error('Enter text to generate');
      return;
    }
    
    try {
      setGenerating(true);
      await ivrApi.generateTTS(agentId, { text: ttsText, name: ttsName || 'Generated Audio' });
      toast.success('Audio generated');
      setTtsText('');
      setTtsName('');
      onRefresh();
    } catch (error) {
      toast.error('Failed to generate audio');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload & Generate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload */}
        <div className="bg-gray-50 rounded-lg p-6 border-2 border-dashed">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Audio</h3>
            <p className="text-sm text-gray-500 mb-4">MP3, WAV, or other audio formats</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Select File
            </button>
          </div>
        </div>
        
        {/* Generate TTS */}
        <div className="bg-gray-50 rounded-lg p-6 border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Generate from Text</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={ttsName}
              onChange={(e) => setTtsName(e.target.value)}
              placeholder="Audio name (optional)"
              className="w-full border rounded-lg px-3 py-2"
            />
            <textarea
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              placeholder="Enter text to convert to speech..."
              rows={3}
              className="w-full border rounded-lg px-3 py-2"
            />
            <button
              onClick={handleGenerateTTS}
              disabled={generating || !ttsText.trim()}
              className="w-full inline-flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mic className="w-4 h-4 mr-2" />
              )}
              Generate Audio
            </button>
          </div>
        </div>
      </div>
      
      {/* Audio List */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Audio Library</h3>
        {audioFiles.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FileAudio className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No audio files yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {audioFiles.map(audio => (
              <div key={audio.id} className="bg-white rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{audio.name}</h4>
                    <p className="text-xs text-gray-500">
                      {audio.duration ? `${Math.round(audio.duration)}s` : 'Unknown duration'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onPlayAudio(audio.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      {playingAudio === audio.id ? (
                        <Pause className="w-4 h-4 text-primary-600" />
                      ) : (
                        <Play className="w-4 h-4 text-gray-600" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(audio.id)}
                      disabled={deleting === audio.id}
                      className="p-2 hover:bg-red-50 rounded-lg"
                    >
                      {deleting === audio.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-red-600" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// CACHE TAB
// =============================================================================

const CacheTab = ({ agentId, cacheStats, onRefresh }) => {
  const [clearing, setClearing] = useState(false);
  
  const handleClearCache = async (cacheType) => {
    if (!window.confirm(`Clear ${cacheType} cache? This cannot be undone.`)) return;
    
    try {
      setClearing(true);
      await ivrApi.clearCache(agentId, cacheType);
      toast.success('Cache cleared');
      onRefresh();
    } catch (error) {
      toast.error('Failed to clear cache');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cache Stats */}
      {cacheStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-700">Response Cache</h3>
            <div className="mt-2">
              <div className="text-2xl font-bold text-blue-900">{cacheStats.response_cache?.entry_count || 0}</div>
              <div className="text-sm text-blue-600">entries</div>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              {cacheStats.response_cache?.total_hits || 0} hits • {cacheStats.response_cache?.total_size_mb || 0} MB
            </div>
          </div>
          
          <div className="bg-orange-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-orange-700">Audio Cache</h3>
            <div className="mt-2">
              <div className="text-2xl font-bold text-orange-900">{cacheStats.audio_cache?.entry_count || 0}</div>
              <div className="text-sm text-orange-600">entries</div>
            </div>
            <div className="mt-2 text-xs text-orange-600">
              {cacheStats.audio_cache?.total_hits || 0} hits • {cacheStats.audio_cache?.total_size_mb || 0} MB
            </div>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-purple-700">Variable Cache</h3>
            <div className="mt-2">
              <div className="text-2xl font-bold text-purple-900">{cacheStats.variable_cache?.entry_count || 0}</div>
              <div className="text-sm text-purple-600">entries</div>
            </div>
            <div className="mt-2 text-xs text-purple-600">
              {cacheStats.variable_cache?.total_hits || 0} hits • {cacheStats.variable_cache?.total_size_mb || 0} MB
            </div>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-green-700">Cost Saved</h3>
            <div className="mt-2">
              <div className="text-2xl font-bold text-green-900">${(cacheStats.total_cost_saved || 0).toFixed(4)}</div>
              <div className="text-sm text-green-600">estimated</div>
            </div>
            <div className="mt-2 text-xs text-green-600">
              Based on TTS costs avoided
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Cache Management</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Responses are automatically cached when generated. Cached responses are served instantly without TTS costs.
          Cache entries expire based on your TTL settings.
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// SETTINGS TAB
// =============================================================================

const SettingsTab = ({ config, audioFiles, onChange, languages, agentId }) => {
  if (!config) return null;
  
  const update = (field, value) => {
    onChange({ ...config, [field]: value });
  };

  // STT Models per provider
  const STT_MODELS = {
    soniox: [
      { value: 'stt-rt-preview', label: 'STT RT Preview (Real-time)' }
    ],
    deepgram: [
      { value: 'nova-2', label: 'Nova 2 (Latest)' },
      { value: 'nova-3', label: 'Nova 3' },
      { value: 'enhanced', label: 'Enhanced' }
    ],
    openai: [
      { value: 'whisper-1', label: 'Whisper-1' }
    ],
    groq: [
      { value: 'whisper-large-v3', label: 'Whisper Large V3' },
      { value: 'whisper-large-v3-turbo', label: 'Whisper Large V3 Turbo (Faster)' }
    ]
  };

  // LLM Models per provider
  const LLM_MODELS = {
    groq: [
      { value: 'llama-3.3-70b-versatile', label: '🦙 Llama 3.3 70B (Best for English)' },
      { value: 'llama-3.1-8b-instant', label: '⚡ Llama 3.1 8B Instant (Fastest)' },
      { value: 'mixtral-8x7b-32768', label: '🔀 Mixtral 8x7B (Good balance)' }
    ],
    openai: [
      { value: 'gpt-4o-mini', label: '🤖 GPT-4o Mini (Best for Urdu/multilingual)' },
      { value: 'gpt-4o', label: '🧠 GPT-4o (Most capable, slower)' },
      { value: 'gpt-3.5-turbo', label: '💨 GPT-3.5 Turbo (Fast, cheaper)' }
    ]
  };

  // TTS Voices per provider
  const TTS_VOICES = {
    uplift: [
      { value: 'v_meklc281', label: '🇵🇰 Fatima (Urdu Female - Natural)' },
      { value: 'v_8eelc901', label: '🇵🇰 Ayesha (Urdu Female - Professional)' },
      { value: 'v_kl3mc456', label: '🇵🇰 Ahmed (Urdu Male - Professional)' }
    ],
    azure: [
      { value: 'ur-PK-UzmaNeural', label: '🇵🇰 Uzma (Urdu Female - Neural)' },
      { value: 'ur-PK-AsadNeural', label: '🇵🇰 Asad (Urdu Male - Neural)' },
      { value: 'en-US-JennyNeural', label: '🇺🇸 Jenny (English Female - Neural)' },
      { value: 'en-US-GuyNeural', label: '🇺🇸 Guy (English Male - Neural)' },
      { value: 'en-GB-SoniaNeural', label: '🇬🇧 Sonia (British Female - Neural)' }
    ],
    openai: [
      { value: 'nova', label: '🌟 Nova (Friendly, Upbeat)' },
      { value: 'alloy', label: '⚖️ Alloy (Neutral, Balanced)' },
      { value: 'echo', label: '💬 Echo (Warm, Conversational)' },
      { value: 'fable', label: '📖 Fable (Expressive, Narrative)' },
      { value: 'onyx', label: '🎭 Onyx (Deep, Authoritative)' },
      { value: 'shimmer', label: '✨ Shimmer (Clear, Pleasant)' }
    ]
  };

  // Language hints options
  const LANGUAGE_HINTS = [
    { value: '["ur", "en"]', label: '🇵🇰 Urdu + 🇬🇧 English (Recommended)' },
    { value: '["ur"]', label: '🇵🇰 Urdu Only' },
    { value: '["en"]', label: '🇬🇧 English Only' },
    { value: '["ur", "en", "pa"]', label: 'Urdu + English + Punjabi' },
    { value: '["hi", "en"]', label: '🇮🇳 Hindi + English' },
    { value: '["ar", "en"]', label: '🇸🇦 Arabic + English' }
  ];

  // Get current selections
  const sttProvider = config.stt_provider || 'soniox';
  const llmProvider = config.classifier_provider || 'groq';
  const ttsProvider = config.tts_provider || 'uplift';

  return (
    <div className="p-6 space-y-8">
      {/* STT Settings */}
      <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🎙️</span> Speech Recognition (STT)
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure how the IVR converts caller speech to text.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">STT Provider</label>
            <select
              value={sttProvider}
              onChange={(e) => {
                const provider = e.target.value;
                const defaultModel = STT_MODELS[provider]?.[0]?.value || 'stt-rt-preview';
                update('stt_provider', provider);
                update('stt_model', defaultModel);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="soniox">Soniox ($0.10/hr) - Best for Urdu</option>
              <option value="deepgram">Deepgram ($0.26/hr) - Best for English</option>
              <option value="openai">OpenAI Whisper ($0.36/hr) - Most Languages</option>
              <option value="groq">Groq Whisper ($0.006/hr) - Cheapest</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {sttProvider === 'soniox' && 'Excellent Urdu/English code-switching support'}
              {sttProvider === 'deepgram' && 'Fast with great English accuracy'}
              {sttProvider === 'openai' && 'Best accuracy across 50+ languages'}
              {sttProvider === 'groq' && 'Very cheap but may have latency'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">STT Model</label>
            <select
              value={config.stt_model || STT_MODELS[sttProvider]?.[0]?.value}
              onChange={(e) => update('stt_model', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {STT_MODELS[sttProvider]?.map(model => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Speech Recognition Languages</label>
            <select
              value={JSON.stringify(config.language_hints || ['ur', 'en'])}
              onChange={(e) => update('language_hints', JSON.parse(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {LANGUAGE_HINTS.map(hint => (
                <option key={hint.value} value={hint.value}>{hint.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Languages the STT should expect - improves accuracy
            </p>
          </div>
        </div>
      </div>
      
      {/* Intent Classification (LLM) */}
      <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🧠</span> Intent Classification (LLM)
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure how the IVR understands caller intent and generates KB responses.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classifier Type</label>
            <select
              value={config.classifier_type || 'llm'}
              onChange={(e) => update('classifier_type', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="llm">🤖 LLM (Most Accurate)</option>
              <option value="embedding">📊 Embedding Similarity (Faster)</option>
              <option value="keyword">🔍 Keyword Matching (Fastest)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confidence Threshold</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={config.confidence_threshold || 0.7}
              onChange={(e) => update('confidence_threshold', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum confidence to match an intent (0.0 - 1.0)
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classifier LLM Provider</label>
            <select
              value={llmProvider}
              onChange={(e) => {
                const provider = e.target.value;
                const defaultModel = provider === 'openai' ? 'gpt-4o-mini' : 'llama-3.3-70b-versatile';
                update('classifier_provider', provider);
                update('classifier_model', defaultModel);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="groq">Groq (Fast, good for English)</option>
              <option value="openai">OpenAI (Best for Urdu/multilingual)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classifier Model</label>
            <select
              value={config.classifier_model || LLM_MODELS[llmProvider]?.[0]?.value}
              onChange={(e) => update('classifier_model', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {LLM_MODELS[llmProvider]?.map(model => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">KB Response Provider</label>
            <select
              value={config.kb_response_provider || 'openai'}
              onChange={(e) => {
                const provider = e.target.value;
                const defaultModel = provider === 'openai' ? 'gpt-4o-mini' : 'llama-3.3-70b-versatile';
                update('kb_response_provider', provider);
                update('kb_response_model', defaultModel);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="openai">OpenAI (Recommended for Urdu)</option>
              <option value="groq">Groq (Faster, English only)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">KB Response Model</label>
            <select
              value={config.kb_response_model || 'gpt-4o-mini'}
              onChange={(e) => update('kb_response_model', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {LLM_MODELS[config.kb_response_provider || 'openai']?.map(model => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* TTS Settings */}
      <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🔊</span> Text-to-Speech (TTS)
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure how the IVR generates spoken responses.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">TTS Provider</label>
            <select
              value={ttsProvider}
              onChange={(e) => {
                const provider = e.target.value;
                const defaultVoice = TTS_VOICES[provider]?.[0]?.value;
                update('tts_provider', provider);
                update('tts_voice', defaultVoice);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="uplift">Uplift AI (Pakistani voices) - Best for Urdu</option>
              <option value="azure">Azure Neural TTS (Many languages)</option>
              <option value="openai">OpenAI TTS (Natural English voices)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {ttsProvider === 'uplift' && '✅ Best quality Urdu voices'}
              {ttsProvider === 'azure' && 'Good Urdu support with ur-PK voices'}
              {ttsProvider === 'openai' && '⚠️ No native Urdu voices - English only'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">TTS Voice</label>
            <select
              value={config.tts_voice || TTS_VOICES[ttsProvider]?.[0]?.value}
              onChange={(e) => update('tts_voice', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {TTS_VOICES[ttsProvider]?.map(voice => (
                <option key={voice.value} value={voice.value}>{voice.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Audio Output Format</label>
            <select
              value={config.tts_output_format || 'mulaw_8000'}
              onChange={(e) => update('tts_output_format', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="mulaw_8000">μ-Law 8kHz (Phone standard)</option>
              <option value="pcm_16000">PCM 16kHz (Better quality)</option>
              <option value="mp3">MP3 (Compressed)</option>
              <option value="wav">WAV (Uncompressed)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              μ-Law 8kHz recommended for phone calls
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">TTS Model (Optional)</label>
            <input
              type="text"
              value={config.tts_model || ''}
              onChange={(e) => update('tts_model', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Default model"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty for provider default
            </p>
          </div>
        </div>
      </div>
      
      {/* Caching */}
      <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">💾</span> Caching
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-700">Response Cache</div>
              <div className="text-sm text-gray-500">Cache full responses to avoid TTS costs</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enable_response_cache}
                onChange={(e) => update('enable_response_cache', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-700">Variable Cache</div>
              <div className="text-sm text-gray-500">Cache common variable values (names, amounts)</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enable_variable_cache}
                onChange={(e) => update('enable_variable_cache', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cache TTL (days)</label>
              <input
                type="number"
                value={config.cache_ttl_days || 30}
                onChange={(e) => update('cache_ttl_days', parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Cache Size (MB)</label>
              <input
                type="number"
                value={config.cache_max_size_mb || 500}
                onChange={(e) => update('cache_max_size_mb', parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Greeting & Fallback Messages - MULTI-LANGUAGE SUPPORT */}
      <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">👋</span> Greeting & Messages
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure greeting and response messages with multi-language support.
        </p>
        
        <div className="space-y-6">
          {/* Greeting Message - Multi-language */}
          <MultiLangAudioTextInput
            label="Greeting Message"
            entityType="config"
            entityId={config.id}
            fieldName="greeting_text"
            baseTextValue={config.greeting_text || ''}
            baseAudioId={config.greeting_audio_id}
            onBaseTextChange={(v) => update('greeting_text', v)}
            onBaseAudioChange={(id) => update('greeting_audio_id', id)}
            languages={languages}
            defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
            audioFiles={audioFiles}
            agentId={agentId}
            placeholder="السلام علیکم! میں آپ کی کیا مدد کر سکتی ہوں؟"
            multiline={true}
          />
          <p className="text-xs text-gray-500 -mt-4">
            Played when caller connects. Add translations for each language your IVR supports.
          </p>
          
          {/* No Match Fallback - Multi-language */}
          <MultiLangAudioTextInput
            label="No Match Response"
            entityType="config"
            entityId={config.id}
            fieldName="no_match_text"
            baseTextValue={config.no_match_text || config.not_found_message || ''}
            baseAudioId={config.no_match_audio_id || config.fallback_audio_id}
            onBaseTextChange={(v) => {
              update('no_match_text', v);
              update('not_found_message', v); // Keep backward compatibility
            }}
            onBaseAudioChange={(id) => {
              update('no_match_audio_id', id);
              update('fallback_audio_id', id); // Keep backward compatibility
            }}
            languages={languages}
            defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
            audioFiles={audioFiles}
            agentId={agentId}
            placeholder="معذرت، میں آپ کی بات نہیں سمجھ سکی۔ براہ کرم دوبارہ کوشش کریں۔"
            multiline={true}
          />
          <p className="text-xs text-gray-500 -mt-4">
            Spoken when no intent matches the caller's speech.
          </p>
          
          {/* KB Not Found - Multi-language */}
          <MultiLangAudioTextInput
            label="KB Not Found Response"
            entityType="config"
            entityId={config.id}
            fieldName="fallback_text"
            baseTextValue={config.fallback_text || config.kb_not_found_message || ''}
            baseAudioId={config.kb_no_result_audio_id}
            onBaseTextChange={(v) => {
              update('fallback_text', v);
              update('kb_not_found_message', v);
            }}
            onBaseAudioChange={(id) => update('kb_no_result_audio_id', id)}
            languages={languages}
            defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
            audioFiles={audioFiles}
            agentId={agentId}
            placeholder="معذرت، مجھے اس سوال کا جواب نہیں مل سکا۔"
            multiline={true}
          />
          <p className="text-xs text-gray-500 -mt-4">
            Spoken when Knowledge Base search returns no results.
          </p>
        </div>
      </div>
      
      {/* Transfer & Other Audio */}
      <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🔄</span> Transfer & System Audio
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Fallback Count</label>
            <input
              type="number"
              value={config.max_fallback_count || 3}
              onChange={(e) => update('max_fallback_count', parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of unrecognized inputs before transfer
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Transfer Queue</label>
            <input
              type="text"
              value={config.default_transfer_queue || 'support'}
              onChange={(e) => update('default_transfer_queue', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Audio</label>
            <select
              value={config.transfer_audio_id || ''}
              onChange={(e) => update('transfer_audio_id', e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">None</option>
              {audioFiles.map(audio => (
                <option key={audio.id} value={audio.id}>{audio.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Played before transferring to agent</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Closing Audio</label>
            <select
              value={config.closing_audio_id || ''}
              onChange={(e) => update('closing_audio_id', e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">None</option>
              {audioFiles.map(audio => (
                <option key={audio.id} value={audio.id}>{audio.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Played when call ends</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Please Wait Audio</label>
            <select
              value={config.please_wait_audio_id || ''}
              onChange={(e) => update('please_wait_audio_id', e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">None</option>
              {audioFiles.map(audio => (
                <option key={audio.id} value={audio.id}>{audio.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Played while processing KB lookups</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">KB Lookup Prefix Audio</label>
            <select
              value={config.kb_lookup_prefix_audio_id || ''}
              onChange={(e) => update('kb_lookup_prefix_audio_id', e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">None</option>
              {audioFiles.map(audio => (
                <option key={audio.id} value={audio.id}>{audio.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Played before searching KB (e.g., "Let me check...")</p>
          </div>
        </div>
      </div>
      
      {/* KB Lookup Settings */}
      <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">📚</span> Knowledge Base Settings
        </h3>
        <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
          <div>
            <div className="font-medium text-gray-700">Enable KB Lookup</div>
            <div className="text-sm text-gray-500">Allow intents to search Knowledge Base</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_kb_lookup !== false}
              onChange={(e) => update('enable_kb_lookup', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default IntentIVRConfig;
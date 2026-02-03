/**
 * AgentEditorV2 - Redesigned Agent Editor with Tabbed Interface
 * 
 * Tab Structure:
 * 1. Overview - Name, description, status, type
 * 2. Chat - Instructions, language, tone, greetings, chat model
 * 3. Voice - TTS/STT providers, voice selection, VAD settings
 * 4. Flows - Flow engine settings and link to flow builder
 * 5. Knowledge - KB selection, search behavior
 * 6. Functions - API functions configuration
 * 7. Advanced - Model settings, temperature, tokens, debug
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Save, X, Play } from 'lucide-react';
import toast from 'react-hot-toast';

// API Services
import { 
  getAgent, createAgent, updateAgent, 
  getFunctions, createFunction, updateFunction, deleteFunction,
  generateInstructions, testFunction
} from '../services/api';
import { getKnowledgeBases } from '../services/knowledgeApi';
import { getStrategyPresets } from '../services/conversationStrategyApi';

// Local Components
import { TABS, chatModelGroups, DEFAULT_AGENT, DEFAULT_FUNCTION_FORM, FUNCTION_EXAMPLES } from './agent-editor/constants';
import { OverviewTab, ChatTab } from './agent-editor/TabsOverviewChat';
import { VoiceTab, FlowsTab, KnowledgeTab } from './agent-editor/TabsVoiceFlowsKnowledge';
import { FunctionsTab } from './agent-editor/TabsFunctionsAdvanced';
import { FunctionModal, TestFunctionModal, AIInstructionsModal } from './agent-editor/Modals';
//import { PipecatTab } from './agent-editor/TabsPipecat';  

const AgentEditorV2 = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Core state
  const [loading, setLoading] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Agent state
  const [agent, setAgent] = useState({ ...DEFAULT_AGENT });

  // Related data
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [strategyPresets, setStrategyPresets] = useState([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  
  // Function modal state
  const [showFunctionModal, setShowFunctionModal] = useState(false);
  const [editingFunction, setEditingFunction] = useState(null);
  const [savingFunction, setSavingFunction] = useState(false);
  const [functionForm, setFunctionForm] = useState({ ...DEFAULT_FUNCTION_FORM });
  
  // Function form helpers
  const [headerForm, setHeaderForm] = useState({ key: '', value: '' });
  const [showHeaderForm, setShowHeaderForm] = useState(false);
  const [bodyFormData, setBodyFormData] = useState([]);
  const [bodyRawJson, setBodyRawJson] = useState('');
  const [bodyKeyValue, setBodyKeyValue] = useState({ key: '', value: '', type: 'text' });
  const [parameterJson, setParameterJson] = useState('');
  const [showParameterJson, setShowParameterJson] = useState(false);
  const [parameterForm, setParameterForm] = useState({
    name: '', type: 'string', description: '', required: false, enum: '', properties: '', items: ''
  });
  const [showParameterForm, setShowParameterForm] = useState(false);
  
  // Test function modal
  const [showTestModal, setShowTestModal] = useState(false);
  const [testingFunction, setTestingFunction] = useState(null);
  const [testParameters, setTestParameters] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [isTestRunning, setIsTestRunning] = useState(false);
  
  // AI Instructions modal
  const [showAIModal, setShowAIModal] = useState(false);
  const [generatedInstructions, setGeneratedInstructions] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiCost, setAiCost] = useState(0);
  
  // Conversation Strategy advanced config
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    loadKnowledgeBases();
    loadStrategyPresets();
  }, []);

  useEffect(() => {
    if (id) {
      loadAgent();
    }
  }, [id]);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadKnowledgeBases = async () => {
    try {
      const response = await getKnowledgeBases();
      setKnowledgeBases(response.data?.data?.knowledge_bases || []);
    } catch (error) {
      console.error('Failed to load knowledge bases:', error);
      setKnowledgeBases([]);
    }
  };

  const loadStrategyPresets = async () => {
    try {
      setLoadingPresets(true);
      const response = await getStrategyPresets();
      if (response.success) {
        setStrategyPresets(response.data);
      }
    } catch (error) {
      console.error('Error loading strategy presets:', error);
    } finally {
      setLoadingPresets(false);
    }
  };

  const loadAgent = async () => {
    try {
      setLoading(true);
      const response = await getAgent(id);
      const loadedAgent = response.data.agent;
      
      // Set defaults based on provider
      const agentWithDefaults = {
        ...DEFAULT_AGENT,
        ...loadedAgent,
        provider: loadedAgent.provider || 'openai',
        voice: loadedAgent.voice || 'shimmer',
        model: loadedAgent.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
        chat_model: loadedAgent.chat_model || 'gpt-4o-mini',
        language: loadedAgent.language || 'en',
        kb_id: loadedAgent.kb_id || null,
      };
      
      setAgent(agentWithDefaults);
      
      // Load functions
      const functionsResponse = await getFunctions(id);
      setFunctions(functionsResponse.data.functions || []);
    } catch (error) {
      toast.error('Failed to load agent');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleProviderChange = (newProvider) => {
    const updates = { provider: newProvider };
    
    if (newProvider === 'openai') {
      updates.voice = agent.voice || 'shimmer';
      updates.model = agent.model || 'gpt-4o-mini-realtime-preview-2024-12-17';
      updates.language = agent.language || 'en';
    } else if (newProvider === 'deepgram') {
      updates.deepgram_model = agent.deepgram_model || 'nova-2';
      updates.deepgram_voice = agent.deepgram_voice || 'shimmer';
      updates.deepgram_language = agent.deepgram_language || 'en';
    } else if (newProvider === 'custom') {
      updates.tts_provider = agent.tts_provider || 'uplift';
      updates.custom_voice = agent.custom_voice || 'v_meklc281';
      updates.language_hints = agent.language_hints || ['ur', 'en'];
      updates.llm_model = agent.llm_model || 'llama-3.3-70b-versatile';
    } else if (newProvider === 'intent-ivr') {
      updates.tts_provider = agent.tts_provider || 'uplift';
      updates.custom_voice = agent.custom_voice || 'ur-PK-female';
      updates.language_hints = agent.language_hints || ['ur', 'en'];
    } else if (newProvider === 'pipecat') {
      // Pipecat defaults
      updates.pipecat_stt = agent.pipecat_stt || 'deepgram';
      updates.pipecat_stt_model = agent.pipecat_stt_model || 'nova-2';
      updates.pipecat_llm = agent.pipecat_llm || 'openai';
      updates.pipecat_llm_model = agent.pipecat_llm_model || 'gpt-4o-mini';
      updates.pipecat_tts = agent.pipecat_tts || 'cartesia';
      updates.pipecat_voice = agent.pipecat_voice || null;
      updates.pipecat_tts_speed = agent.pipecat_tts_speed || 1.0;
    }

    
    setAgent({ ...agent, ...updates });
  };

  const handleSave = async () => {
    if (!agent.name || !agent.instructions) {
      toast.error('Please fill in required fields (Name and Instructions)');
      return;
    }

    setSavingAgent(true);
    try {
      if (id) {
        await updateAgent(id, agent);
        toast.success('Agent updated successfully');
      } else {
        const response = await createAgent(agent);
        toast.success('Agent created successfully');
        navigate(`/agents/${response.data.agent.id}/edit-v2`);
      }
    } catch (error) {
      toast.error('Failed to save agent');
      console.error(error);
    } finally {
      setSavingAgent(false);
    }
  };

  // AI Instructions
  const generateAIInstructions = async () => {
    if (!agent.name) {
      toast.error('Please enter an agent name first');
      return;
    }

    setGeneratingAI(true);
    setShowAIModal(true);

    try {
      const response = await generateInstructions({
        agent_name: agent.name,
        agent_type: agent.type,
        language: agent.language,
        existing_instructions: agent.instructions
      });

      setGeneratedInstructions(response.data.instructions);
      setAiCost(response.data.cost);
      toast.success(`Instructions generated! Cost: $${response.data.cost.toFixed(6)}`);
    } catch (error) {
      toast.error('Failed to generate instructions');
      setShowAIModal(false);
    } finally {
      setGeneratingAI(false);
    }
  };

  const acceptAIInstructions = () => {
    setAgent({ ...agent, instructions: generatedInstructions });
    setShowAIModal(false);
    toast.success('Instructions applied');
  };

  const rejectAIInstructions = () => {
    setShowAIModal(false);
    setGeneratedInstructions('');
    toast.info('Instructions discarded');
  };

  // Conversation Strategy
  const handleApplyStrategyPreset = async (presetId) => {
    try {
      const preset = strategyPresets.find(p => p.id === presetId);
      if (preset) {
        setAgent({
          ...agent,
          conversation_strategy: preset.strategy
        });
        toast.success(`${preset.name} preset applied`);
      }
    } catch (error) {
      console.error('Error applying preset:', error);
      toast.error('Failed to apply preset');
    }
  };

  const updateConversationStrategyField = (field, value) => {
    setAgent({
      ...agent,
      conversation_strategy: {
        ...agent.conversation_strategy,
        preference_collection: {
          ...(agent.conversation_strategy?.preference_collection || {}),
          [field]: value
        }
      }
    });
  };

  // Preference management for conversation strategy
  const addPreference = () => {
    const preferences = agent.conversation_strategy?.preference_collection?.preferences_to_collect || [];
    const newPreferences = [...preferences, {
      name: '',
      label: '',
      required: false,
      question: '',
      type: 'text'
    }];
    
    setAgent({
      ...agent,
      conversation_strategy: {
        ...agent.conversation_strategy,
        preference_collection: {
          ...agent.conversation_strategy?.preference_collection,
          preferences_to_collect: newPreferences
        }
      }
    });
  };

  const updatePreference = (index, field, value) => {
    const preferences = [...(agent.conversation_strategy?.preference_collection?.preferences_to_collect || [])];
    preferences[index] = {
      ...preferences[index],
      [field]: value
    };
    
    setAgent({
      ...agent,
      conversation_strategy: {
        ...agent.conversation_strategy,
        preference_collection: {
          ...agent.conversation_strategy?.preference_collection,
          preferences_to_collect: preferences
        }
      }
    });
  };

  const removePreference = (index) => {
    const preferences = agent.conversation_strategy?.preference_collection?.preferences_to_collect || [];
    const newPreferences = preferences.filter((_, i) => i !== index);
    
    setAgent({
      ...agent,
      conversation_strategy: {
        ...agent.conversation_strategy,
        preference_collection: {
          ...agent.conversation_strategy?.preference_collection,
          preferences_to_collect: newPreferences
        }
      }
    });
  };

  const updateMinPreferences = (value) => {
    setAgent({
      ...agent,
      conversation_strategy: {
        ...agent.conversation_strategy,
        preference_collection: {
          ...agent.conversation_strategy?.preference_collection,
          min_preferences_before_search: parseInt(value)
        }
      }
    });
  };

  const updateMaxQuestions = (value) => {
    setAgent({
      ...agent,
      conversation_strategy: {
        ...agent.conversation_strategy,
        preference_collection: {
          ...agent.conversation_strategy?.preference_collection,
          max_questions: parseInt(value)
        }
      }
    });
  };

  // Function handlers
  const openFunctionModal = (func = null) => {
    if (func) {
      setEditingFunction(func);
      setFunctionForm({
        name: func.name,
        description: func.description,
        execution_mode: func.execution_mode || 'sync',
        handler_type: func.handler_type || 'inline',
        api_endpoint: func.api_endpoint || '',
        api_method: func.api_method || 'POST',
        api_headers: func.api_headers || [],
        api_body_type: func.api_body_type || 'json',
        api_body: func.api_body,
        timeout_ms: func.timeout_ms || 30000,
        retries: func.retries || 2,
        skip_ssl_verify: func.skip_ssl_verify || false,
        parameters: func.parameters || { type: 'object', properties: {}, required: [] }
      });
      setParameterJson(JSON.stringify(func.parameters || { type: 'object', properties: {}, required: [] }, null, 2));
      
      if (func.api_body_type === 'json' && func.api_body) {
        setBodyRawJson(JSON.stringify(func.api_body, null, 2));
      }
    } else {
      setEditingFunction(null);
      setFunctionForm({ ...DEFAULT_FUNCTION_FORM });
      setParameterJson('{\n  "type": "object",\n  "properties": {},\n  "required": []\n}');
      setBodyRawJson('');
    }
    setShowFunctionModal(true);
  };

  const handleFunctionSave = async () => {
	  if (!functionForm.name || !functionForm.description) {
		toast.error('Please fill in function name and description');
		return;
	  }

	  setSavingFunction(true);
	  try {
		let body = null;
		if (functionForm.api_body_type === 'json' && bodyRawJson) {
		  try {
			body = JSON.parse(bodyRawJson);
		  } catch (e) {
			toast.error('Invalid JSON body');
			setSavingFunction(false);
			return;
		  }
		} else if (['form-data', 'urlencoded'].includes(functionForm.api_body_type)) {
		  body = bodyFormData.reduce((acc, item) => {
			acc[item.key] = item.value;
			return acc;
		  }, {});
		}

		const functionData = {
		  ...functionForm,
		  api_body: body,
		  agent_id: id
		};

		if (editingFunction) {
		  await updateFunction(editingFunction.id, functionData);
		  toast.success('Function updated');
		} else {
		  await createFunction(id, functionData);  // ✅ FIXED: Added id as first parameter
		  toast.success('Function created');
		}

		setShowFunctionModal(false);
		const functionsResponse = await getFunctions(id);
		setFunctions(functionsResponse.data.functions || []);
	  } catch (error) {
		toast.error('Failed to save function');
		console.error(error);
	  } finally {
		setSavingFunction(false);
	  }
  };

  const handleFunctionDelete = async (funcId) => {
    if (!window.confirm('Are you sure you want to delete this function?')) return;
    
    try {
      await deleteFunction(funcId);
      toast.success('Function deleted');
      setFunctions(functions.filter(f => f.id !== funcId));
    } catch (error) {
      toast.error('Failed to delete function');
    }
  };

  // Header management
  const addHeader = () => {
    if (!headerForm.key) {
      toast.error('Header key is required');
      return;
    }
    setFunctionForm({
      ...functionForm,
      api_headers: [...functionForm.api_headers, { ...headerForm }]
    });
    setHeaderForm({ key: '', value: '' });
    setShowHeaderForm(false);
  };

  const removeHeader = (index) => {
    setFunctionForm({
      ...functionForm,
      api_headers: functionForm.api_headers.filter((_, i) => i !== index)
    });
  };

  // Body type change
  const handleBodyTypeChange = (newType) => {
    const existingHeaders = functionForm.api_headers.filter(h => h.key.toLowerCase() !== 'content-type');
    let contentTypeHeader = { key: 'Content-Type', value: '' };
    
    if (newType === 'json') contentTypeHeader.value = 'application/json';
    else if (newType === 'urlencoded') contentTypeHeader.value = 'application/x-www-form-urlencoded';
    else if (newType === 'form-data') contentTypeHeader.value = 'multipart/form-data';
    
    if (contentTypeHeader.value) {
      setFunctionForm({
        ...functionForm,
        api_body_type: newType,
        api_headers: [...existingHeaders, contentTypeHeader]
      });
    } else {
      setFunctionForm({ ...functionForm, api_body_type: newType });
    }
  };

  // Parameter management
  const addParameter = () => {
    if (!parameterForm.name) {
      toast.error('Parameter name is required');
      return;
    }

    const newParam = {
      type: parameterForm.type,
      description: parameterForm.description
    };

    if (parameterForm.enum && parameterForm.type === 'string') {
      newParam.enum = parameterForm.enum.split(',').map(v => v.trim());
    }

    if (parameterForm.type === 'object' && parameterForm.properties) {
      try {
        newParam.properties = JSON.parse(parameterForm.properties);
      } catch (e) {
        toast.error('Invalid JSON for object properties');
        return;
      }
    }

    if (parameterForm.type === 'array' && parameterForm.items) {
      try {
        newParam.items = JSON.parse(parameterForm.items);
      } catch (e) {
        toast.error('Invalid JSON for array items');
        return;
      }
    }

    const updatedProperties = {
      ...functionForm.parameters.properties,
      [parameterForm.name]: newParam
    };

    const updatedRequired = parameterForm.required
      ? [...functionForm.parameters.required, parameterForm.name]
      : functionForm.parameters.required;

    const updatedParams = {
      ...functionForm.parameters,
      properties: updatedProperties,
      required: updatedRequired
    };

    setFunctionForm({ ...functionForm, parameters: updatedParams });
    setParameterJson(JSON.stringify(updatedParams, null, 2));
    setParameterForm({
      name: '', type: 'string', description: '', required: false, enum: '', properties: '', items: ''
    });
    setShowParameterForm(false);
  };

  const removeParameter = (paramName) => {
    const { [paramName]: removed, ...remainingProperties } = functionForm.parameters.properties;
    const updatedRequired = functionForm.parameters.required.filter(r => r !== paramName);
    const updatedParams = {
      ...functionForm.parameters,
      properties: remainingProperties,
      required: updatedRequired
    };
    setFunctionForm({ ...functionForm, parameters: updatedParams });
    setParameterJson(JSON.stringify(updatedParams, null, 2));
  };

  const updateParametersFromJson = () => {
    try {
      const parsed = JSON.parse(parameterJson);
      setFunctionForm({ ...functionForm, parameters: parsed });
      setShowParameterJson(false);
      toast.success('Parameters updated from JSON');
    } catch (e) {
      toast.error('Invalid JSON: ' + e.message);
    }
  };

  // Example function loader
  const loadExampleFunction = (type) => {
    const example = FUNCTION_EXAMPLES[type];
    if (example) {
      setFunctionForm(example);
      setParameterJson(JSON.stringify(example.parameters, null, 2));
      if (example.api_body_type === 'json' && example.api_body) {
        setBodyRawJson(JSON.stringify(example.api_body, null, 2));
        setBodyFormData([]);
      }
    }
  };

  // Test function
  const openTestModal = (func) => {
    setTestingFunction(func);
    setTestParameters({});
    setTestResult(null);
    setShowTestModal(true);
  };

  const handleTestFunction = async () => {
    if (!testingFunction) return;
    
    setIsTestRunning(true);
    setTestResult(null);
    
    try {
      const response = await testFunction(testingFunction.id, testParameters);
      setTestResult(response.data);
    } catch (error) {
      setTestResult({
        success: false,
        test_result: {
          error: error.response?.data?.error || error.message,
          message: error.response?.data?.message || 'Failed to execute test'
        }
      });
    } finally {
      setIsTestRunning(false);
    }
  };

  const closeTestModal = () => {
    setShowTestModal(false);
    setTestingFunction(null);
    setTestParameters({});
    setTestResult(null);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/agents')}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {id ? agent.name || 'Edit Agent' : 'Create Agent'}
                </h1>
                <p className="text-sm text-gray-500">
                  {id ? 'Configure your AI agent' : 'Set up a new AI agent'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Link
                to="/agent-test"
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Play className="w-4 h-4 mr-2" />
                Test Chat
              </Link>
              <button
                onClick={handleSave}
                disabled={savingAgent}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                {savingAgent ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDisabled = !id && ['flows', 'functions'].includes(tab.id);
              
              return (
                <button
                  key={tab.id}
                  onClick={() => !isDisabled && setActiveTab(tab.id)}
                  disabled={isDisabled}
                  className={`
                    flex items-center px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                    ${isActive 
                      ? 'border-primary-500 text-primary-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && (
          <OverviewTab agent={agent} setAgent={setAgent} />
        )}
        
        {activeTab === 'chat' && (
          <ChatTab 
            agent={agent} 
            setAgent={setAgent}
            chatModelGroups={chatModelGroups}
            generateAIInstructions={generateAIInstructions}
            generatingAI={generatingAI}
            strategyPresets={strategyPresets}
            loadingPresets={loadingPresets}
            applyStrategyPreset={handleApplyStrategyPreset}
            updateConversationStrategy={updateConversationStrategyField}
            addPreference={addPreference}
            updatePreference={updatePreference}
            removePreference={removePreference}
            updateMinPreferences={updateMinPreferences}
            updateMaxQuestions={updateMaxQuestions}
            showAdvancedConfig={showAdvancedConfig}
            setShowAdvancedConfig={setShowAdvancedConfig}
          />
        )}
        
        {activeTab === 'voice' && (
          <VoiceTab 
            agent={agent} 
            setAgent={setAgent}
            handleProviderChange={handleProviderChange}
            agentId={id}
          />
        )}
    
        {activeTab === 'flows' && id && (
          <FlowsTab agent={agent} setAgent={setAgent} agentId={id} />
        )}
        
        {activeTab === 'knowledge' && (
          <KnowledgeTab 
            agent={agent} 
            setAgent={setAgent}
            knowledgeBases={knowledgeBases}
          />
        )}
        
        {activeTab === 'functions' && id && (
          <FunctionsTab 
            functions={functions}
            openFunctionModal={openFunctionModal}
            openTestModal={openTestModal}
            handleFunctionDelete={handleFunctionDelete}
          />
        )}
      </div>

      {/* Function Modal */}
      {showFunctionModal && (
        <FunctionModal
          editingFunction={editingFunction}
          functionForm={functionForm}
          setFunctionForm={setFunctionForm}
          headerForm={headerForm}
          setHeaderForm={setHeaderForm}
          showHeaderForm={showHeaderForm}
          setShowHeaderForm={setShowHeaderForm}
          addHeader={addHeader}
          removeHeader={removeHeader}
          handleBodyTypeChange={handleBodyTypeChange}
          bodyRawJson={bodyRawJson}
          setBodyRawJson={setBodyRawJson}
          bodyFormData={bodyFormData}
          setBodyFormData={setBodyFormData}
          parameterJson={parameterJson}
          setParameterJson={setParameterJson}
          showParameterJson={showParameterJson}
          setShowParameterJson={setShowParameterJson}
          parameterForm={parameterForm}
          setParameterForm={setParameterForm}
          showParameterForm={showParameterForm}
          setShowParameterForm={setShowParameterForm}
          addParameter={addParameter}
          removeParameter={removeParameter}
          updateParametersFromJson={updateParametersFromJson}
          loadExampleFunction={loadExampleFunction}
          savingFunction={savingFunction}
          onSave={handleFunctionSave}
          onClose={() => setShowFunctionModal(false)}
        />
      )}

      {/* Test Function Modal */}
      {showTestModal && testingFunction && (
        <TestFunctionModal
          testingFunction={testingFunction}
          testParameters={testParameters}
          setTestParameters={setTestParameters}
          testResult={testResult}
          isTestRunning={isTestRunning}
          onTest={handleTestFunction}
          onClose={closeTestModal}
        />
      )}

      {/* AI Instructions Modal */}
      {showAIModal && (
        <AIInstructionsModal
          generatingAI={generatingAI}
          generatedInstructions={generatedInstructions}
          setGeneratedInstructions={setGeneratedInstructions}
          aiCost={aiCost}
          onAccept={acceptAIInstructions}
          onReject={rejectAIInstructions}
        />
      )}
    </div>
  );
};

export default AgentEditorV2;
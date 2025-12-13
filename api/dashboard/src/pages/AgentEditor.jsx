import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, X, Plus, Trash2, Edit2, Info, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getAgent, 
  createAgent, 
  updateAgent, 
  getFunctions, 
  createFunction, 
  updateFunction, 
  deleteFunction,
  generateInstructions
} from '../services/api';
import { getKnowledgeBases } from '../services/knowledgeApi';

import { 
  getConversationStrategy, 
  updateConversationStrategy,
  getStrategyPresets,
  applyStrategyPreset
} from '../services/conversationStrategyApi';

const chatModelGroups = [
  {
    label: '⚡ Groq (Fastest & Cheapest)',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', cost: '$0.59 / $0.79', badge: '🔥 Reliable' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', cost: '$0.05 / $0.08', badge: '💰 Cheapest' },
      // Preview models
      { value: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout (Preview)', cost: '$0.11 / $0.34', badge: '🆕 Preview' },
      { value: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick (Preview)', cost: '$0.20 / $0.60', badge: '🆕 Preview' },
      { value: 'qwen/qwen3-32b', label: 'Qwen3 32B', cost: '$0.29 / $0.59', badge: '🧠 Reasoning' },
      // OpenAI GPT-OSS on Groq
      { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', cost: '$0.15 / $0.60', badge: '🆕 OpenAI OSS' },
      { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', cost: '$0.075 / $0.30', badge: '⚡ Fast' },
    ]
  },
  {
    label: '🤖 OpenAI',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini', cost: '$0.15 / $0.60', badge: '⭐ Default' },
      { value: 'gpt-4o', label: 'GPT-4o', cost: '$2.50 / $10.00', badge: '🏆 Best Quality' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', cost: '$10.00 / $30.00' },
      { value: 'o1-mini', label: 'o1 Mini (Reasoning)', cost: '$3.00 / $12.00' },
      { value: 'o1', label: 'o1 (Advanced Reasoning)', cost: '$15.00 / $60.00' },
    ]
  },
  {
    label: '🧠 Anthropic (Claude)',
    models: [
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', cost: '$0.80 / $4.00', badge: '⚡ Fast' },
      { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', cost: '$3.00 / $15.00', badge: '✨ Great Quality' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', cost: '$15.00 / $75.00' },
    ]
  },
  {
    label: '🇨🇳 DeepSeek (Very Cheap)',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat', cost: '$0.14 / $0.28', badge: '💰 Budget' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', cost: '$0.55 / $2.19', badge: '🧠 Reasoning' },
    ]
  },
  {
    label: '🌙 Moonshot/Kimi (Chinese AI)',
    models: [
      { value: 'moonshot-v1-8k', label: 'Moonshot v1 8K', cost: '$0.17 / $0.17' },
      { value: 'moonshot-v1-32k', label: 'Moonshot v1 32K', cost: '$0.34 / $0.34' },
      { value: 'moonshot-v1-128k', label: 'Moonshot v1 128K', cost: '$0.85 / $0.85', badge: '📚 Long Context' },
    ]
  },
];

// Flat array for backward compatibility
const chatModels = chatModelGroups.flatMap(group => group.models);

const AgentEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [strategyPresets, setStrategyPresets] = useState([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  
  const [agent, setAgent] = useState({
	  name: '',
	  type: 'sales',
	  instructions: '',
	  voice: 'shimmer',
	  language: 'ur',
	  model: 'gpt-4o-mini-realtime-preview-2024-12-17',
	  model: 'gpt-4o-mini',
	  provider: 'openai',  // ADD THIS
	  deepgram_model: 'nova-2',  // ADD THIS
	  deepgram_voice: 'aura-asteria-en',  // ADD THIS
	  deepgram_language: 'en',  // ADD THIS
	  temperature: 0.6,
	  max_tokens: 4096,
	  vad_threshold: 0.5,
	  silence_duration_ms: 500,
	  greeting: '',
	  kb_id: null 
  });

  const [functions, setFunctions] = useState([]);
  const [showFunctionModal, setShowFunctionModal] = useState(false);
  const [editingFunction, setEditingFunction] = useState(null);
  const [savingFunction, setSavingFunction] = useState(false);
  
  const [showAIModal, setShowAIModal] = useState(false);
  const [generatedInstructions, setGeneratedInstructions] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiCost, setAiCost] = useState(0);

  // Function form state - matches your bridge format
  const [functionForm, setFunctionForm] = useState({
    name: '',
    description: '',
    execution_mode: 'sync',
    handler_type: 'inline',
    api_endpoint: '',
    api_method: 'POST',
    api_headers: [],
    api_body_type: 'json', // json, form-data, urlencoded, none
    api_body: null,
    timeout_ms: 30000,
    retries: 2,
	skip_ssl_verify: false,
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  });
  
  // State for adding headers
  const [headerForm, setHeaderForm] = useState({ key: '', value: '' });
  const [showHeaderForm, setShowHeaderForm] = useState(false);
  
  // State for body builder
  const [bodyFormData, setBodyFormData] = useState([]); // For form-data and urlencoded
  const [bodyRawJson, setBodyRawJson] = useState(''); // For raw JSON
  const [showBodyForm, setShowBodyForm] = useState(false);
  const [bodyKeyValue, setBodyKeyValue] = useState({ key: '', value: '', type: 'text' });
  
  // State for parameters - supports nested JSON objects
  const [parameterJson, setParameterJson] = useState('');
  const [showParameterJson, setShowParameterJson] = useState(false);
  const [parameterForm, setParameterForm] = useState({
    name: '',
    type: 'string',
    description: '',
    required: false,
    enum: '',
    properties: '', // for object type
    items: '' // for array type
  });
  const [showParameterForm, setShowParameterForm] = useState(false);

  // Add this handler function after your state declarations
	/*const handleProviderChange = (newProvider) => {
	  if (newProvider === 'openai') {
		setAgent({
		  ...agent,
		  provider: 'openai',
		  voice: 'shimmer',
		  model: 'gpt-4o-mini-realtime-preview-2024-12-17',
		  language: 'en',
		  deepgram_model: null,
		  deepgram_voice: null,
		  deepgram_language: null
		});
		toast.success('Switched to OpenAI - defaults applied');
	  } else if (newProvider === 'deepgram') {
		setAgent({
		  ...agent,
		  provider: 'deepgram',
		  deepgram_model: 'nova-2',
		  deepgram_voice: 'shimmer',
		  deepgram_language: 'en',
		  voice: null,
		  model: null
		});
		toast.success('Switched to Deepgram - defaults applied');
	  }
	};*/
	const handleProviderChange = (newProvider) => {
	  if (newProvider === 'openai') {
		setAgent({
		  ...agent,
		  provider: newProvider,
		  voice: agent.voice || 'shimmer',
		  model: agent.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
		  language: agent.language || 'en'
		});
	  } else if (newProvider === 'deepgram') {
		setAgent({
		  ...agent,
		  provider: newProvider,
		  deepgram_model: agent.deepgram_model || 'nova-2',
		  deepgram_voice: agent.deepgram_voice || 'shimmer',
		  deepgram_language: agent.deepgram_language || 'en'
		});
	  } else if (newProvider === 'custom') {
		// NEW: Custom provider defaults
		setAgent({
		  ...agent,
		  provider: newProvider,
		  tts_provider: agent.tts_provider || 'uplift',
		  custom_voice: agent.custom_voice || 'v_meklc281',
		  language_hints: agent.language_hints || ['ur', 'en'],
		  llm_model: agent.llm_model || 'llama-3.3-70b-versatile'
		});
	  }
	};
	
	useEffect(() => {
	  loadStrategyPresets();
	}, []);
	
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

	const applyStrategyPreset = async (presetId) => {
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

	const updateConversationStrategy = (field, value) => {
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

	useEffect(() => {
	  const loadKnowledgeBases = async () => {
		try {
		  const response = await getKnowledgeBases();
		  setKnowledgeBases(response.data?.data?.knowledge_bases || []);
		} catch (error) {
		  console.error('Failed to load knowledge bases:', error);
		  setKnowledgeBases([]);
		}
	  };

	  loadKnowledgeBases();
	}, []);
	
  useEffect(() => {
    if (id) {
      loadAgent();
    }
  }, [id]);

	const loadAgent = async () => {
	  try {
		setLoading(true);
		const response = await getAgent(id);
		const loadedAgent = response.data.agent;
		
		// Ensure provider-specific fields have defaults
		if (loadedAgent.provider === 'openai') {
		  setAgent({
			...loadedAgent,
			voice: loadedAgent.voice || 'shimmer',
			model: loadedAgent.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
			chat_model: loadedAgent.chat_model || 'gpt-4o-mini',
			language: loadedAgent.language || 'en',
			kb_id: loadedAgent.kb_id || null
		  });
		} else if (loadedAgent.provider === 'deepgram') {
		  setAgent({
			...loadedAgent,
			deepgram_model: loadedAgent.deepgram_model || 'nova-2',
			deepgram_voice: loadedAgent.deepgram_voice || 'shimmer',
			deepgram_language: loadedAgent.deepgram_language || 'en',
			chat_model: loadedAgent.chat_model || 'gpt-4o-mini',
			kb_id: loadedAgent.kb_id || null
		  });
		} else if (loadedAgent.provider === 'custom') {
		  setAgent({
			...loadedAgent,
			tts_provider: loadedAgent.tts_provider || 'uplift',
			custom_voice: loadedAgent.custom_voice || 'v_meklc281',
			language_hints: loadedAgent.language_hints || ['ur', 'en'],
			llm_model: loadedAgent.llm_model || 'llama-3.3-70b-versatile',
			chat_model: loadedAgent.chat_model || 'gpt-4o-mini',
			kb_id: loadedAgent.kb_id || null
		  });
		} else {
		  // Default to OpenAI if no provider set
		  setAgent({
			...loadedAgent,
			provider: 'openai',
			voice: loadedAgent.voice || 'shimmer',
			chat_model: loadedAgent.chat_model || 'gpt-4o-mini',
			model: loadedAgent.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
			language: loadedAgent.language || 'en',
			kb_id: loadedAgent.kb_id || null
		  });
		}
		
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

  const handleSave = async () => {
    if (!agent.name || !agent.instructions) {
      toast.error('Name and instructions are required');
      return;
    }

	const agentData = {
	  ...agent,
	  conversation_strategy: agent.conversation_strategy || {
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
	  }
	};

    setSavingAgent(true);
    try {
      if (id) {
        await updateAgent(id, agentData);
        toast.success('Agent updated');
      } else {
        const response = await createAgent(agentData);
        toast.success('Agent created');
        navigate(`/agents/${response.data.agent.id}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save agent');
    } finally {
      setSavingAgent(false);
    }
  };

  const openFunctionModal = (func = null) => {
    if (func) {
      setEditingFunction(func);
      
      // Parse body based on type
      let bodyType = func.api_body_type || 'json';
      let bodyData = [];
      let rawJson = '';
      
      if (func.api_body) {
        if (bodyType === 'json') {
          rawJson = typeof func.api_body === 'string' ? func.api_body : JSON.stringify(func.api_body, null, 2);
        } else if (bodyType === 'form-data' || bodyType === 'urlencoded') {
          bodyData = Object.entries(func.api_body).map(([key, value]) => ({
            key,
            value,
            type: 'text'
          }));
        }
      }
      
      setFunctionForm({
        name: func.name,
        description: func.description,
        execution_mode: func.execution_mode,
        handler_type: func.handler_type,
        api_endpoint: func.api_endpoint || '',
        api_method: func.api_method || 'POST',
        api_headers: Array.isArray(func.api_headers) ? func.api_headers : 
                     (func.api_headers ? Object.entries(func.api_headers).map(([key, value]) => ({ key, value })) : []),
        api_body_type: bodyType,
        api_body: func.api_body,
        timeout_ms: func.timeout_ms,
        retries: func.retries,
		skip_ssl_verify: func.skip_ssl_verify || false,
        parameters: func.parameters
      });
      
      setBodyFormData(bodyData);
      setBodyRawJson(rawJson);
      setParameterJson(JSON.stringify(func.parameters, null, 2));
    } else {
      setEditingFunction(null);
      setFunctionForm({
        name: '',
        description: '',
        execution_mode: 'sync',
        handler_type: 'inline',
        api_endpoint: '',
        api_method: 'POST',
        api_headers: [],
        api_body_type: 'json',
        api_body: null,
        timeout_ms: 30000,
        retries: 2,
		skip_ssl_verify: false,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      });
      setBodyFormData([]);
      setBodyRawJson('');
      setParameterJson(JSON.stringify({
        type: 'object',
        properties: {},
        required: []
      }, null, 2));
    }
    setShowFunctionModal(true);
  };

  const handleFunctionSave = async () => {
    if (!functionForm.name || !functionForm.description) {
      toast.error('Name and description are required');
      return;
    }

    // Convert headers array to object for storage
    const headersObj = {};
    functionForm.api_headers.forEach(h => {
      headersObj[h.key] = h.value;
    });

    // Prepare body based on type
    let apiBody = null;
    if (functionForm.handler_type === 'api' && functionForm.api_method !== 'GET') {
      if (functionForm.api_body_type === 'json') {
        try {
          apiBody = bodyRawJson ? JSON.parse(bodyRawJson) : null;
        } catch (e) {
          toast.error('Invalid JSON in body');
          return;
        }
      } else if (functionForm.api_body_type === 'form-data' || functionForm.api_body_type === 'urlencoded') {
        apiBody = {};
        bodyFormData.forEach(item => {
          apiBody[item.key] = item.value;
        });
      }
    }

    const dataToSave = {
      ...functionForm,
      api_headers: headersObj,
      api_body: apiBody
    };

    setSavingFunction(true);
    try {
      if (editingFunction) {
        await updateFunction(editingFunction.id, dataToSave);
        toast.success('Function updated');
      } else {
        await createFunction(id, dataToSave);
        toast.success('Function added');
      }
      setShowFunctionModal(false);
      loadAgent();
    } catch (error) {
      toast.error('Failed to save function');
    } finally {
      setSavingFunction(false);
    }
  };

  const handleFunctionDelete = async (functionId) => {
    if (!window.confirm('Delete this function?')) return;
    
    try {
      await deleteFunction(functionId);
      toast.success('Function deleted');
      loadAgent();
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

  // Body form-data/urlencoded management
  const addBodyField = () => {
    if (!bodyKeyValue.key) {
      toast.error('Key is required');
      return;
    }

    setBodyFormData([...bodyFormData, { ...bodyKeyValue }]);
    setBodyKeyValue({ key: '', value: '', type: 'text' });
    setShowBodyForm(false);
  };

  const removeBodyField = (index) => {
    setBodyFormData(bodyFormData.filter((_, i) => i !== index));
  };

  // Update body when type changes
  const handleBodyTypeChange = (newType) => {
    // Auto-set Content-Type header
    const existingHeaders = functionForm.api_headers.filter(h => h.key.toLowerCase() !== 'content-type');
    
    let contentTypeHeader = { key: 'Content-Type', value: '' };
    
    if (newType === 'json') {
      contentTypeHeader.value = 'application/json';
    } else if (newType === 'urlencoded') {
      contentTypeHeader.value = 'application/x-www-form-urlencoded';
    } else if (newType === 'form-data') {
      contentTypeHeader.value = 'multipart/form-data';
    }
    
    if (contentTypeHeader.value) {
      setFunctionForm({
        ...functionForm,
        api_body_type: newType,
        api_headers: [...existingHeaders, contentTypeHeader]
      });
    } else {
      setFunctionForm({
        ...functionForm,
        api_body_type: newType
      });
    }
  };

  // Parameter management - Simple form
  const addParameter = () => {
    if (!parameterForm.name) {
      toast.error('Parameter name is required');
      return;
    }

    const newParam = {
      type: parameterForm.type,
      description: parameterForm.description
    };

    // Add enum if provided
    if (parameterForm.enum && parameterForm.type === 'string') {
      newParam.enum = parameterForm.enum.split(',').map(v => v.trim());
    }

    // Add nested properties for object type
    if (parameterForm.type === 'object' && parameterForm.properties) {
      try {
        newParam.properties = JSON.parse(parameterForm.properties);
      } catch (e) {
        toast.error('Invalid JSON for object properties');
        return;
      }
    }

    // Add items for array type
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

    setFunctionForm({
      ...functionForm,
      parameters: updatedParams
    });

    setParameterJson(JSON.stringify(updatedParams, null, 2));

    // Reset parameter form
    setParameterForm({
      name: '',
      type: 'string',
      description: '',
      required: false,
      enum: '',
      properties: '',
      items: ''
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

    setFunctionForm({
      ...functionForm,
      parameters: updatedParams
    });

    setParameterJson(JSON.stringify(updatedParams, null, 2));
  };

  // Update from JSON editor
  const updateParametersFromJson = () => {
    try {
      const parsed = JSON.parse(parameterJson);
      setFunctionForm({
        ...functionForm,
        parameters: parsed
      });
      setShowParameterJson(false);
      toast.success('Parameters updated from JSON');
    } catch (e) {
      toast.error('Invalid JSON: ' + e.message);
    }
  };

  // Generate example based on existing bridge functions
  const loadExampleFunction = (type) => {
    const examples = {
      checkBalance: {
        name: 'check_balance',
        description: 'Check customer account balance',
        execution_mode: 'sync',
        handler_type: 'api',
        api_endpoint: 'https://api.example.com/balance/{{customer_id}}',
        api_method: 'GET',
        api_headers: [
          { key: 'Authorization', value: 'Bearer YOUR_API_KEY' }
        ],
        api_body_type: 'none',
        api_body: null,
        timeout_ms: 30000,
        retries: 2,
        parameters: {
          type: 'object',
          properties: {
            customer_id: {
              type: 'string',
              description: 'Customer unique identifier'
            }
          },
          required: ['customer_id']
        }
      },
      bookAppointment: {
        name: 'book_appointment',
        description: 'Book an appointment for the customer',
        execution_mode: 'async',
        handler_type: 'api',
        api_endpoint: 'https://api.example.com/appointments',
        api_method: 'POST',
        api_headers: [
          { key: 'Authorization', value: 'Bearer YOUR_API_KEY' },
          { key: 'Content-Type', value: 'application/json' }
        ],
        api_body_type: 'json',
        api_body: {
          customer_id: '{{customer_id}}',
          date: '{{date}}',
          time: '{{time}}',
          service_type: '{{service_type}}'
        },
        timeout_ms: 30000,
        retries: 2,
        parameters: {
          type: 'object',
          properties: {
            customer_id: { type: 'string', description: 'Customer unique identifier' },
            date: { type: 'string', description: 'Appointment date in YYYY-MM-DD format' },
            time: { type: 'string', description: 'Appointment time in HH:MM format' },
            service_type: { type: 'string', description: 'Type of service', enum: ['consultation', 'followup', 'emergency'] }
          },
          required: ['customer_id', 'date', 'time']
        }
      },
      sendSMS: {
        name: 'send_sms',
        description: 'Send SMS to customer',
        execution_mode: 'async',
        handler_type: 'api',
        api_endpoint: 'https://api.example.com/sms/send',
        api_method: 'POST',
        api_headers: [
          { key: 'Authorization', value: 'Bearer YOUR_API_KEY' },
          { key: 'Content-Type', value: 'application/x-www-form-urlencoded' }
        ],
        api_body_type: 'urlencoded',
        api_body: {
          to: '{{phone_number}}',
          message: '{{message}}',
          from: 'YourCompany'
        },
        timeout_ms: 15000,
        retries: 3,
        parameters: {
          type: 'object',
          properties: {
            phone_number: { type: 'string', description: 'Customer phone number' },
            message: { type: 'string', description: 'SMS message content' }
          },
          required: ['phone_number', 'message']
        }
      },
      transferCall: {
        name: 'transfer_call',
        description: 'Transfer call to another department',
        execution_mode: 'sync',
        handler_type: 'inline',
        api_endpoint: '',
        api_method: 'POST',
        api_headers: [],
        api_body_type: 'none',
        api_body: null,
        timeout_ms: 5000,
        retries: 1,
        parameters: {
          type: 'object',
          properties: {
            department: {
              type: 'string',
              description: 'Department to transfer to',
              enum: ['sales', 'support', 'billing', 'technical']
            },
            reason: {
              type: 'string',
              description: 'Reason for transfer'
            }
          },
          required: ['department']
        }
      }
    };

    const example = examples[type];
    if (example) {
      setFunctionForm(example);
      setParameterJson(JSON.stringify(example.parameters, null, 2));
      
      // Set body data
      if (example.api_body_type === 'json') {
        setBodyRawJson(JSON.stringify(example.api_body, null, 2));
        setBodyFormData([]);
      } else if (example.api_body_type === 'form-data' || example.api_body_type === 'urlencoded') {
        setBodyFormData(Object.entries(example.api_body).map(([key, value]) => ({ key, value, type: 'text' })));
        setBodyRawJson('');
      } else {
        setBodyRawJson('');
        setBodyFormData([]);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {id ? 'Edit Agent' : 'Create Agent'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure your AI voice agent
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => navigate('/agents')}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <X className="w-5 h-5 mr-2" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={savingAgent}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="w-5 h-5 mr-2" />
            {savingAgent ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Agent Basic Info */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Agent Name</label>
              <input
                type="text"
                value={agent.name}
                onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Sales Assistant"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select
                value={agent.type}
                onChange={(e) => setAgent({ ...agent, type: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="sales">Sales</option>
                <option value="support">Support</option>
                <option value="banking">Banking</option>
                <option value="custom">Custom</option>
              </select>
            </div>
			<div>
			  <label className="block text-sm font-medium text-gray-700">Provider</label>
			  <select
				value={agent.provider || 'openai'}
				onChange={(e) => handleProviderChange(e.target.value)}
				className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
			  >
				<option value="openai">OpenAI Realtime API</option>
				<option value="deepgram">Deepgram</option>
				<option value="custom">Custom (Intellicon AiVA)</option>
			  </select>
			  <p className="mt-1 text-xs text-gray-500">
				{agent.provider === 'deepgram' 
				  ? 'Deepgram provides more natural sounding voices'
				  : agent.provider === 'custom'
				  ? 'Custom stack: Best for Urdu/Pakistani languages, lowest cost (~$0.01/min)'
				  : 'OpenAI provides superior conversation handling and function calling'}
			  </p>
			</div>
            {agent.provider === 'openai' && (
			  <div>
				<label className="block text-sm font-medium text-gray-700">Voice</label>
				<select
				  value={agent.voice}
				  onChange={(e) => setAgent({ ...agent, voice: e.target.value })}
				  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
				>
				  <option value="alloy">Alloy</option>
				  <option value="ash">Ash</option>
				  <option value="ballad">Ballad</option>
				  <option value="coral">Coral</option>
				  <option value="echo">Echo</option>
				  <option value="sage">Sage</option>
				  <option value="shimmer">Shimmer</option>
				  <option value="verse">Verse</option>
				  <option value="marin">Marin</option>
				  <option value="cedar">Cedar</option>
				</select>
			  </div>
			)}
			{agent.provider === 'deepgram' && (
			  <>
				<div>
				  <label className="block text-sm font-medium text-gray-700">
					Speech-to-Text (STT) Model
				  </label>
				  <select
					value={agent.deepgram_model || 'nova-2'}
					onChange={(e) => setAgent({ ...agent, deepgram_model: e.target.value })}
					className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
				  >
					<optgroup label="Nova-3 (Recommended - Best Accuracy)">
					  <option value="nova-3">Nova-3 General</option>
					  <option value="nova-3-general">Nova-3 General (Explicit)</option>
					  <option value="nova-3-phonecall">Nova-3 Phone Call</option>
					  <option value="nova-3-medical">Nova-3 Medical</option>
					  <option value="nova-3-finance">Nova-3 Finance</option>
					  <option value="nova-3-conversationalai">Nova-3 Conversational AI</option>
					  <option value="nova-3-voicemail">Nova-3 Voicemail</option>
					  <option value="nova-3-video">Nova-3 Video</option>
					  <option value="nova-3-meeting">Nova-3 Meeting</option>
					  <option value="nova-3-drive_thru">Nova-3 Drive-Thru</option>
					  <option value="nova-3-automotive">Nova-3 Automotive</option>
					</optgroup>
					<optgroup label="Nova-2 (Good for Non-English)">
					  <option value="nova-2">Nova-2 General</option>
					  <option value="nova-2-general">Nova-2 General (Explicit)</option>
					  <option value="nova-2-phonecall">Nova-2 Phone Call</option>
					  <option value="nova-2-meeting">Nova-2 Meeting</option>
					  <option value="nova-2-voicemail">Nova-2 Voicemail</option>
					  <option value="nova-2-finance">Nova-2 Finance</option>
					  <option value="nova-2-conversationalai">Nova-2 Conversational AI</option>
					  <option value="nova-2-video">Nova-2 Video</option>
					  <option value="nova-2-medical">Nova-2 Medical</option>
					  <option value="nova-2-drivethru">Nova-2 Drive-Thru</option>
					  <option value="nova-2-automotive">Nova-2 Automotive</option>
					</optgroup>
					<optgroup label="Flux (Voice Agents - NEW)">
					  <option value="flux">Flux (Conversational Flow)</option>
					</optgroup>
					<optgroup label="Legacy Models">
					  <option value="nova">Nova-1</option>
					  <option value="enhanced">Enhanced General</option>
					  <option value="enhanced-general">Enhanced General (Explicit)</option>
					  <option value="enhanced-phonecall">Enhanced Phone Call</option>
					  <option value="enhanced-meeting">Enhanced Meeting</option>
					  <option value="base">Base General</option>
					  <option value="base-general">Base General (Explicit)</option>
					  <option value="base-phonecall">Base Phone Call</option>
					  <option value="base-meeting">Base Meeting</option>
					</optgroup>
					<optgroup label="Whisper (Slower, Limited)">
					  <option value="whisper-tiny">Whisper Tiny</option>
					  <option value="whisper-base">Whisper Base</option>
					  <option value="whisper-small">Whisper Small</option>
					  <option value="whisper-medium">Whisper Medium</option>
					  <option value="whisper-large">Whisper Large</option>
					</optgroup>
				  </select>
				  <p className="mt-1 text-xs text-gray-500">
					Nova-3 offers best accuracy. Flux is optimized for voice agents with built-in turn detection.
				  </p>
				</div>

				<div>
				  <label className="block text-sm font-medium text-gray-700">
					STT Language
				  </label>
				  <select
					value={agent.deepgram_language || 'en'}
					onChange={(e) => setAgent({ ...agent, deepgram_language: e.target.value })}
					className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
				  >
					<optgroup label="Multilingual (Nova-2 & Nova-3)">
					  <option value="multi">🌍 Multi (10 Languages - Code Switching)</option>
					</optgroup>
					<optgroup label="Common Languages">
					  <option value="en">🇺🇸 English</option>
					  <option value="en-US">🇺🇸 English (US)</option>
					  <option value="en-GB">🇬🇧 English (UK)</option>
					  <option value="en-AU">🇦🇺 English (Australia)</option>
					  <option value="en-NZ">🇳🇿 English (New Zealand)</option>
					  <option value="en-IN">🇮🇳 English (India)</option>
					  <option value="es">🇪🇸 Spanish</option>
					  <option value="es-419">🇲🇽 Spanish (Latin America)</option>
					  <option value="fr">🇫🇷 French</option>
					  <option value="fr-CA">🇨🇦 French (Canada)</option>
					  <option value="de">🇩🇪 German</option>
					  <option value="hi">🇮🇳 Hindi</option>
					  <option value="pt">🇵🇹 Portuguese</option>
					  <option value="pt-BR">🇧🇷 Portuguese (Brazil)</option>
					  <option value="ru">🇷🇺 Russian</option>
					  <option value="ja">🇯🇵 Japanese</option>
					  <option value="it">🇮🇹 Italian</option>
					  <option value="nl">🇳🇱 Dutch</option>
					  <option value="zh">🇨🇳 Chinese (Simplified)</option>
					  <option value="zh-CN">🇨🇳 Chinese (Mandarin)</option>
					  <option value="zh-TW">🇹🇼 Chinese (Taiwan)</option>
					  <option value="ko">🇰🇷 Korean</option>
					  <option value="tr">🇹🇷 Turkish</option>
					  <option value="ar">🇸🇦 Arabic</option>
					</optgroup>
					<optgroup label="European Languages">
					  <option value="pl">🇵🇱 Polish</option>
					  <option value="uk">🇺🇦 Ukrainian</option>
					  <option value="sv">🇸🇪 Swedish</option>
					  <option value="da">🇩🇰 Danish</option>
					  <option value="no">🇳🇴 Norwegian</option>
					  <option value="fi">🇫🇮 Finnish</option>
					  <option value="el">🇬🇷 Greek</option>
					  <option value="cs">🇨🇿 Czech</option>
					  <option value="ro">🇷🇴 Romanian</option>
					  <option value="hu">🇭🇺 Hungarian</option>
					  <option value="bg">🇧🇬 Bulgarian</option>
					</optgroup>
					<optgroup label="Asian Languages">
					  <option value="th">🇹🇭 Thai</option>
					  <option value="vi">🇻🇳 Vietnamese</option>
					  <option value="id">🇮🇩 Indonesian</option>
					  <option value="ms">🇲🇾 Malay</option>
					  <option value="ta">🇮🇳 Tamil</option>
					</optgroup>
					<optgroup label="Other Languages">
					  <option value="he">🇮🇱 Hebrew</option>
					  <option value="ur">🇵🇰 Urdu</option>
					</optgroup>
				  </select>
				  <p className="mt-1 text-xs text-gray-500">
					{agent.deepgram_language === 'multi' 
					  ? '🌍 Multi supports: English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, Dutch'
					  : 'Select language for speech recognition. Use "Multi" for code-switching conversations.'}
				  </p>
				</div>

				<div>
				  <label className="block text-sm font-medium text-gray-700">
					Text-to-Speech (TTS) Voice
				  </label>
				  <select
					value={agent.deepgram_voice || 'shimmer'}
					onChange={(e) => setAgent({ ...agent, deepgram_voice: e.target.value })}
					className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
				  >
					<optgroup label="OpenAI Voices (Used with Deepgram STT)">
					  <option value="alloy">Alloy (Neutral)</option>
					  <option value="ash">Ash (Warm Male)</option>
					  <option value="ballad">Ballad (Expressive)</option>
					  <option value="coral">Coral (Friendly Female)</option>
					  <option value="echo">Echo (Professional Male)</option>
					  <option value="sage">Sage (Calm Female)</option>
					  <option value="shimmer">Shimmer (Clear Female)</option>
					  <option value="verse">Verse (Conversational)</option>
					</optgroup>
					<optgroup label="Deepgram Aura Voices (Alternative)">
					  <option value="aura-asteria-en">Asteria (English - Female)</option>
					  <option value="aura-luna-en">Luna (English - Female)</option>
					  <option value="aura-stella-en">Stella (English - Female)</option>
					  <option value="aura-athena-en">Athena (English - Female)</option>
					  <option value="aura-hera-en">Hera (English - Female)</option>
					  <option value="aura-orion-en">Orion (English - Male)</option>
					  <option value="aura-arcas-en">Arcas (English - Male)</option>
					  <option value="aura-perseus-en">Perseus (English - Male)</option>
					  <option value="aura-angus-en">Angus (English - Irish Male)</option>
					  <option value="aura-orpheus-en">Orpheus (English - Male)</option>
					  <option value="aura-helios-en">Helios (English - Male)</option>
					  <option value="aura-zeus-en">Zeus (English - Male)</option>
					</optgroup>
				  </select>
				  <p className="mt-1 text-xs text-gray-500">
					Currently using OpenAI TTS with Deepgram STT for best quality. Deepgram Aura voices coming soon.
				  </p>
				</div>
			  </>
			)}
			{/* Custom Provider Configuration */}
			{agent.provider === 'custom' && (
			  <div className="col-span-2 space-y-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
				<div className="flex items-center gap-2 mb-3">
				  <span className="text-2xl">🎯</span>
				  <h4 className="font-semibold text-purple-900">Custom Voice Provider Settings</h4>
				</div>
				
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				  {/* TTS Provider Selection - NOW WITH OPENAI! */}
				  <div>
					<label className="block text-sm font-medium text-gray-700">
					  Text-to-Speech Provider
					</label>
					<select
					  value={agent.tts_provider || 'uplift'}
					  onChange={(e) => {
						const newTtsProvider = e.target.value;
						let defaultVoice = 'ur-PK-female';
						if (newTtsProvider === 'azure') defaultVoice = 'ur-PK-UzmaNeural';
						if (newTtsProvider === 'openai') defaultVoice = 'nova';
						setAgent({ 
						  ...agent, 
						  tts_provider: newTtsProvider,
						  custom_voice: defaultVoice
						});
					  }}
					  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
					>
					  <option value="uplift">🇵🇰 Uplift AI (Pakistani Languages)</option>
					  <option value="azure">☁️ Azure TTS (Microsoft)</option>
					  <option value="openai">🤖 OpenAI TTS (High Quality)</option>
					</select>
					<p className="mt-1 text-xs text-gray-500">
					  {agent.tts_provider === 'uplift' 
						? 'Best for Urdu/Punjabi - ~$0.004/min'
						: agent.tts_provider === 'openai'
						? 'Same voices as Realtime API - ~$0.009/min'
						: 'Azure neural voices - ~$0.005/min'}
					</p>
				  </div>
				  
				  {/* Voice Selection - DYNAMIC BASED ON TTS PROVIDER */}
				  <div>
					<label className="block text-sm font-medium text-gray-700">Voice</label>
					
					{/* Uplift Voices */}
					{(agent.tts_provider === 'uplift' || !agent.tts_provider) && (
					  <select
						value={agent.custom_voice || 'v_meklc281'}
						onChange={(e) => setAgent({ ...agent, custom_voice: e.target.value })}
						className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
					  >
						<optgroup label="🇵🇰 Urdu Voices">
						  <option value="v_meklc281">👩 Ayesha - Info/Education V2 (Default)</option>
						  <option value="v_8eelc901">👩 Fatima - Info/Education</option>
						  <option value="v_30s70t3a">👨 Asad - News Anchor</option>
						  <option value="v_yypgzenx">👴 Dada Jee - Storyteller</option>
						  <option value="v_kwmp7zxt">👧 Zara - Gen Z (Beta)</option>
						</optgroup>
						<optgroup label="🏔️ Sindhi Voices">
						  <option value="v_sd0kl3m9">👩 Samina - Female</option>
						  <option value="v_sd6mn4p2">👨 Waqar - Male (Calm)</option>
						  <option value="v_sd9qr7x5">👨 Imran - Male (News)</option>
						</optgroup>
						<optgroup label="⛰️ Balochi Voices">
						  <option value="v_bl0ab8c4">👨 Karim - Male</option>
						  <option value="v_bl1de2f7">👩 Nazia - Female</option>
						</optgroup>
					  </select>
					)}
					
					{/* Azure Voices */}
					{agent.tts_provider === 'azure' && (
					  <select
						value={agent.custom_voice || 'ur-PK-UzmaNeural'}
						onChange={(e) => setAgent({ ...agent, custom_voice: e.target.value })}
						className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
					  >
						<option value="ur-PK-UzmaNeural">👩 Uzma (Female - Urdu)</option>
						<option value="ur-PK-AsadNeural">👨 Asad (Male - Urdu)</option>
						<option value="en-US-JennyNeural">👩 Jenny (Female - English)</option>
						<option value="en-US-GuyNeural">👨 Guy (Male - English)</option>
					  </select>
					)}
					
					
					{/* OpenAI Voices - NEW! */}
					{agent.tts_provider === 'openai' && (
					  <select
						value={agent.custom_voice || 'nova'}
						onChange={(e) => setAgent({ ...agent, custom_voice: e.target.value })}
						className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
					  >
						<option value="nova">🌟 Nova (Friendly, Upbeat)</option>
						<option value="alloy">⚖️ Alloy (Neutral, Balanced)</option>
						<option value="echo">💬 Echo (Warm, Conversational)</option>
						<option value="fable">📖 Fable (Expressive, Narrative)</option>
						<option value="onyx">🎭 Onyx (Deep, Authoritative)</option>
						<option value="shimmer">✨ Shimmer (Clear, Pleasant)</option>
					  </select>
					)}
				  </div>
				  
				  {/* Language Hints */}
				  <div>
					<label className="block text-sm font-medium text-gray-700">
					  Speech Recognition Languages
					</label>
					<select
					  value={JSON.stringify(agent.language_hints || ['ur', 'en'])}
					  onChange={(e) => setAgent({ ...agent, language_hints: JSON.parse(e.target.value) })}
					  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
					>
					  <optgroup label="Common">
						<option value='["ur", "en"]'>🇵🇰 Urdu + 🇬🇧 English (Recommended)</option>
						<option value='["ur"]'>🇵🇰 Urdu Only</option>
						<option value='["en"]'>🇬🇧 English Only</option>
					  </optgroup>
					  <optgroup label="Pakistani Languages">
						<option value='["ur", "en", "pa"]'>Urdu + English + Punjabi</option>
						<option value='["sd", "ur", "en"]'>Sindhi + Urdu + English</option>
						<option value='["sd", "en"]'>Sindhi + English</option>
						<option value='["bal", "ur", "en"]'>Balochi + Urdu + English</option>
						<option value='["ps", "ur", "en"]'>Pashto + Urdu + English</option>
					  </optgroup>
					  <optgroup label="Other">
						<option value='["hi", "en"]'>🇮🇳 Hindi + English</option>
						<option value='["ar", "en"]'>🇸🇦 Arabic + English</option>
					  </optgroup>
					</select>
					<p className="mt-1 text-xs text-gray-500">
					  Languages the STT should expect - improves accuracy
					</p>
				  </div>
				  
				  {/* LLM Model Selection */}
				  <div>
					<label className="block text-sm font-medium text-gray-700">
					  AI Model (LLM)
					</label>
					<select
					  value={agent.llm_model || 'llama-3.3-70b-versatile'}
					  onChange={(e) => setAgent({ ...agent, llm_model: e.target.value })}
					  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
					>
					  <option value="llama-3.3-70b-versatile">🦙 Llama 3.3 70B (Groq - Fast & Free)</option>
					  <option value="llama-3.3-70b-specdec">⚡ Llama 3.3 70B Specdec (Fastest)</option>
					  <option value="gpt-4o-mini">🤖 GPT-4o Mini (OpenAI)</option>
					  <option value="gpt-4o">🧠 GPT-4o (OpenAI - Best)</option>
					</select>
					<p className="mt-1 text-xs text-gray-500">
					  Groq is 10x faster and mostly free tier
					</p>
				  </div>
				</div>
				
				{/* Cost Comparison Card - UPDATED WITH OPENAI TTS */}
				<div className="mt-4 p-4 bg-white rounded-lg border border-green-200 shadow-sm">
				  <div className="flex items-start gap-3">
					<div className="text-3xl">💰</div>
					<div className="flex-1">
					  <h5 className="font-semibold text-green-800">Cost Comparison</h5>
					  <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
						<div className="text-center p-2 bg-red-50 rounded">
						  <div className="font-bold text-red-600">$0.30</div>
						  <div className="text-xs text-gray-500">OpenAI Realtime</div>
						</div>
						<div className="text-center p-2 bg-yellow-50 rounded">
						  <div className="font-bold text-yellow-600">$0.05</div>
						  <div className="text-xs text-gray-500">Deepgram</div>
						</div>
						<div className={`text-center p-2 rounded ${agent.tts_provider === 'openai' ? 'bg-blue-50 border-2 border-blue-400' : 'bg-blue-50'}`}>
						  <div className="font-bold text-blue-600">$0.02</div>
						  <div className="text-xs text-gray-500">Custom+OpenAI</div>
						</div>
						<div className={`text-center p-2 rounded ${agent.tts_provider !== 'openai' ? 'bg-green-50 border-2 border-green-400' : 'bg-green-50'}`}>
						  <div className="font-bold text-green-600">$0.01</div>
						  <div className="text-xs text-gray-500">Custom+Uplift ✓</div>
						</div>
					  </div>
					  <p className="mt-2 text-xs text-green-700">
						{agent.tts_provider === 'openai' 
						  ? 'OpenAI TTS: High quality voices, ~$0.02/min total'
						  : agent.tts_provider === 'azure'
						  ? 'Azure TTS: Good quality, ~$0.01/min total'
						  : 'Uplift TTS: Best for Urdu, ~$0.01/min total'}
					  </p>
					</div>
				  </div>
				</div>
				
				{/* Features Badge */}
				<div className="flex flex-wrap gap-2 mt-3">
				  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
					✅ {agent.tts_provider === 'openai' ? 'High Quality' : 'Urdu Native'}
				  </span>
				  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
					✅ Code-Switching
				  </span>
				  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
					✅ Function Calling
				  </span>
				  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
					✅ ~300ms Latency
				  </span>
				</div>
			  </div>
			)}

            <div>
              <label className="block text-sm font-medium text-gray-700">Language</label>
              <select
                value={agent.language}
                onChange={(e) => setAgent({ ...agent, language: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="ur">Urdu/English</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
          </div>
		  
		  <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-4">
              Chat Model Configuration
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              This model is used for text-based chat conversations in the dashboard. 
              Voice calls use the realtime model configured above.
            </p>
            
            <div>
			  <label className="block text-sm font-medium text-gray-700 mb-2">
				Chat Model
			  </label>
			  <select
				value={agent.chat_model || 'gpt-4o-mini'}
				onChange={(e) => setAgent({ ...agent, chat_model: e.target.value })}
				className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
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
			  
			  {/* Model Info Card */}
			  <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
				<div className="flex items-start gap-2">
				  <span className="text-xl">💡</span>
				  <div className="flex-1 text-sm">
					<p className="font-medium text-blue-900 mb-1">Model Recommendations:</p>
					<ul className="text-blue-800 space-y-1 text-xs">
					  <li><strong>Best Value:</strong> Llama 3.3 70B (Groq) - Fast, cheap, great quality</li>
					  <li><strong>Cheapest:</strong> Llama 3.1 8B or DeepSeek Chat - For simple queries</li>
					  <li><strong>Best Quality:</strong> GPT-4o or Claude Sonnet - Complex reasoning</li>
					  <li><strong>Best for Urdu:</strong> GPT-4o-mini or GPT-4o - Better multilingual</li>
					</ul>
				  </div>
				</div>
			  </div>
			  
			  {/* Cost Comparison */}
			  <div className="mt-2 grid grid-cols-4 gap-1 text-xs">
				<div className="text-center p-1.5 bg-green-50 rounded border border-green-200">
				  <div className="font-bold text-green-700">$0.05</div>
				  <div className="text-green-600">Llama 8B</div>
				</div>
				<div className="text-center p-1.5 bg-blue-50 rounded border border-blue-200">
				  <div className="font-bold text-blue-700">$0.15</div>
				  <div className="text-blue-600">GPT-4o-mini</div>
				</div>
				<div className="text-center p-1.5 bg-purple-50 rounded border border-purple-200">
				  <div className="font-bold text-purple-700">$0.59</div>
				  <div className="text-purple-600">Llama 70B</div>
				</div>
				<div className="text-center p-1.5 bg-amber-50 rounded border border-amber-200">
				  <div className="font-bold text-amber-700">$2.50</div>
				  <div className="text-amber-600">GPT-4o</div>
				</div>
			  </div>
			  <p className="mt-1 text-xs text-gray-500 text-center">
				Cost per 1M input tokens (output costs vary)
			  </p>
			</div>
			
			<div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Knowledge Search
              </label>
              <select
                value={agent.knowledge_search_mode || 'auto'}
                onChange={(e) => setAgent({ ...agent, knowledge_search_mode: e.target.value })}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                
				<option key="auto" value="auto">
				  Auto - LLM will decide
				</option>
				<option key="always" value="always">
				  Always search the knowledge base
				</option>
				<option key="never" value="never">
				  Follow Instructions only
				</option>
              </select>
            </div>
          </div>
		  
		  {/* Provider Status */}
			<div className="mt-4 p-3 bg-gray-50 rounded-lg border">
			  <label className="block text-sm font-medium text-gray-700 mb-2">
				Configured Providers
			  </label>
			  <div className="flex flex-wrap gap-2">
				<span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
				  ✅ OpenAI
				</span>
				<span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
				  ✅ Groq
				</span>
				<span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
				  ⚙️ Anthropic
				</span>
				<span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
				  ⚙️ DeepSeek
				</span>
				<span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
				  ⚙️ Moonshot
				</span>
			  </div>
			  <p className="mt-2 text-xs text-gray-500">
				Gray providers need API keys in .env file. Models will fall back to OpenAI if provider unavailable.
			  </p>
			</div>
		  
		  
          <div>
			  <div className="flex items-center justify-between mb-2">
				<label className="block text-sm font-medium text-gray-700">Instructions</label>
				<button
				  type="button"
				  onClick={generateAIInstructions}
				  disabled={!agent.name || generatingAI}
				  className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
					  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
					  </svg>
					  AI Generate
					</>
				  )}
				</button>
			  </div>
			  <textarea
				value={agent.instructions}
				onChange={(e) => setAgent({ ...agent, instructions: e.target.value })}
				rows={10}
				className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
				placeholder="You are a helpful sales assistant..."
			  />
			  <p className="mt-1 text-xs text-gray-500">
				System instructions that define the agent's behavior. Click "AI Generate" for assistance.
			  </p>
		  </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Greeting</label>
            <textarea
              value={agent.greeting}
              onChange={(e) => setAgent({ ...agent, greeting: e.target.value })}
              rows={2}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="Hello! How can I help you today?"
            />
			<p className="mt-2 text-sm text-gray-500">
                <strong>Inbound Call:</strong> On an inbound call setting a greeting will automatically start playback when the call connects with AiVA
                <br />
                <strong>Outbound Call:</strong> Not recommended to set up greeting on an Outbound Call because the AiVA should respond once the Caller answers the call and Starts Speaking
			</p>
          </div>
        </div>
      </div>

	  {/* Knowledge Base Section - THIS SHOULD ALREADY EXIST */}
		<div className="bg-white shadow rounded-lg p-6">
		  <h3 className="text-lg font-medium text-gray-900 mb-4">Knowledge Base</h3>
		  
		  <div className="space-y-4">
			{/* Selection dropdown */}
			<div>
			  <label className="block text-sm font-medium text-gray-700 mb-2">
				Select Knowledge Base
			  </label>
			  <select
				value={agent.kb_id || ''}
				onChange={(e) => setAgent({
				  ...agent,
				  kb_id: e.target.value || null
				})}
				className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
			  >
				<option value="">-- No Knowledge Base --</option>
				{knowledgeBases.map((kb) => (
				  <option key={kb.id} value={kb.id}>
					{kb.name} ({kb.stats?.document_count || 0} docs)
				  </option>
				))}
			  </select>
			</div>
		  </div>
		</div>
		
		
	  {/* Conversation Strategy Section */}
  <div className="bg-white shadow rounded-lg p-6">
	<div className="flex items-center justify-between mb-4">
		<div>
			<h3 className="text-lg font-medium text-gray-900">Conversation Strategy</h3>
			<p className="text-sm text-gray-500 mt-1">
				Configure how your agent collects preferences before searching
			</p>
		</div>
	</div>

	  {/* Quick Presets */}
	  <div className="mb-6">
		<div className="flex items-center gap-2 mb-3">
		  <Info size={18} className="text-blue-500" />
		  <label className="block text-sm font-medium text-gray-700">
			Quick Presets
		  </label>
		</div>
		<p className="text-xs text-gray-500 mb-3">
		  Apply a preset configuration based on your business type
		</p>
		
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
				  className="p-3 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
				>
				  <div className="flex items-center gap-2 mb-2">
					<IconComponent size={20} className="text-blue-600" />
					<span className="font-semibold text-sm">{preset.name}</span>
				  </div>
				  <p className="text-xs text-gray-600 mb-2">{preset.description}</p>
				  <span className="inline-block text-xs px-2 py-1 bg-gray-100 rounded">
					{preset.strategy.preference_collection.max_questions === 0 
					  ? 'No questions' 
					  : `${preset.strategy.preference_collection.max_questions} questions`
					}
				  </span>
				</button>
			  );
			})
		  )}
		</div>
	  </div>

	  {/* Strategy Selection */}
		  <div className="space-y-3">
			<label className="block text-sm font-medium text-gray-700 mb-2">
			  Search Strategy
			</label>
			
			{/* Immediate Search */}
			<label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
			  <input
				type="radio"
				name="conversation_strategy"
				value="immediate_search"
				checked={agent.conversation_strategy?.preference_collection?.strategy === 'immediate_search'}
				onChange={(e) => updateConversationStrategy('strategy', e.target.value)}
				className="mt-1"
			  />
			  <div className="flex-1">
				<div className="flex items-center gap-2 mb-1">
				  <span className="font-medium text-sm">Immediate Search</span>
				  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Fast</span>
				</div>
				<p className="text-xs text-gray-600">
				  Search as soon as user requests products. No questions asked.
				</p>
				<p className="text-xs text-gray-500 mt-1">
				  Best for: Furniture, Food, Low-ticket items
				</p>
			  </div>
			</label>
			
			{/* Ask Questions */}
			<label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
			  <input
				type="radio"
				name="conversation_strategy"
				value="ask_questions"
				checked={agent.conversation_strategy?.preference_collection?.strategy === 'ask_questions'}
				onChange={(e) => updateConversationStrategy('strategy', e.target.value)}
				className="mt-1"
			  />
			  <div className="flex-1">
				<div className="flex items-center gap-2 mb-1">
				  <span className="font-medium text-sm">Ask Questions First</span>
				  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Personalized</span>
				</div>
				<p className="text-xs text-gray-600">
				  Collect user preferences before searching for products.
				</p>
				<p className="text-xs text-gray-500 mt-1">
				  Best for: Clothing, Fashion, High-value items
				</p>
			  </div>
			</label>
			
			{/* Minimal Questions */}
			<label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
			  <input
				type="radio"
				name="conversation_strategy"
				value="minimal_questions"
				checked={agent.conversation_strategy?.preference_collection?.strategy === 'minimal_questions'}
				onChange={(e) => updateConversationStrategy('strategy', e.target.value)}
				className="mt-1"
			  />
			  <div className="flex-1">
				<div className="flex items-center gap-2 mb-1">
				  <span className="font-medium text-sm">Minimal Questions (1-2)</span>
				  <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">Balanced</span>
				</div>
				<p className="text-xs text-gray-600">
				  Ask only 1-2 critical questions before searching.
				</p>
				<p className="text-xs text-gray-500 mt-1">
				  Best for: Electronics, Mid-range items
				</p>
			  </div>
			</label>
			
			{/* Adaptive */}
			<label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
			  <input
				type="radio"
				name="conversation_strategy"
				value="adaptive"
				checked={agent.conversation_strategy?.preference_collection?.strategy === 'adaptive'}
				onChange={(e) => updateConversationStrategy('strategy', e.target.value)}
				className="mt-1"
			  />
			  <div className="flex-1">
				<div className="flex items-center gap-2 mb-1">
				  <span className="font-medium text-sm">Adaptive (Smart)</span>
				  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">Intelligent</span>
				</div>
				<p className="text-xs text-gray-600">
				  AI decides based on product type, value, and context.
				</p>
				<p className="text-xs text-gray-500 mt-1">
				  Best for: Multi-category stores
				</p>
			  </div>
			</label>
		  </div>

		  {/* Current Strategy Info */}
		  {agent.conversation_strategy?.preference_collection?.strategy && (
			<div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
			  <div className="flex items-start gap-2">
				<CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
				<div>
				  <h4 className="text-sm font-semibold text-green-900">Current Strategy</h4>
				  <p className="text-xs text-green-700 mt-1">
					Using <strong>{agent.conversation_strategy.preference_collection.strategy.replace('_', ' ')}</strong> strategy.
					{agent.conversation_strategy.preference_collection.strategy === 'immediate_search' && 
					  ' Products will be shown immediately.'}
					{agent.conversation_strategy.preference_collection.strategy === 'ask_questions' && 
					  ' Agent will collect preferences before searching.'}
					{agent.conversation_strategy.preference_collection.strategy === 'minimal_questions' && 
					  ' Agent will ask 1-2 quick questions.'}
					{agent.conversation_strategy.preference_collection.strategy === 'adaptive' && 
					  ' AI will decide the best approach.'}
				  </p>
				</div>
			  </div>
			</div>
		  )}
		</div>
	
	{/* Advanced Configuration - Show when ask_questions or minimal_questions selected */}
{(agent.conversation_strategy?.preference_collection?.strategy === 'ask_questions' || 
  agent.conversation_strategy?.preference_collection?.strategy === 'minimal_questions') && (
  <div className="mt-6 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
    
    {/* Toggle Advanced Config */}
    <button
      type="button"
      onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
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
                      className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
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
                      value={pref.label}
                      onChange={(e) => updatePreference(index, 'label', e.target.value)}
                      className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Field Type
                    </label>
                    <select
                      value={pref.type || 'text'}
                      onChange={(e) => updatePreference(index, 'type', e.target.value)}
                      className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
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
                    value={pref.question}
                    onChange={(e) => updatePreference(index, 'question', e.target.value)}
                    className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
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
                      className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
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
              <p className="text-xs text-gray-500 mt-2">
                Agent will search once it collects at least this many preferences
              </p>
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
              <p className="text-xs text-gray-500 mt-2">
                Limit total questions to avoid frustrating users (recommended: 2-4)
              </p>
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

{/* Conversation Preview */}
{agent.conversation_strategy?.preference_collection?.strategy === 'ask_questions' && 
 agent.conversation_strategy?.preference_collection?.preferences_to_collect?.length > 0 && (
  <div className="mt-6 bg-gray-50 border border-gray-300 rounded-lg p-4">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">👁️</span>
      <h4 className="font-semibold text-gray-900">Conversation Preview</h4>
    </div>
    
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm">
          👤
        </div>
        <div className="flex-1 bg-white rounded-lg p-2 shadow-sm">
          <p className="text-sm">Show me dresses</p>
        </div>
      </div>
      
      {agent.conversation_strategy.preference_collection.preferences_to_collect.slice(0, 2).map((pref, index) => (
        <React.Fragment key={index}>
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">
              🤖
            </div>
            <div className="flex-1 bg-green-50 rounded-lg p-2 shadow-sm border border-green-200">
              <p className="text-sm">{pref.question || `What ${pref.name}?`}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm">
              👤
            </div>
            <div className="flex-1 bg-white rounded-lg p-2 shadow-sm">
              <p className="text-sm text-gray-400 italic">[User responds...]</p>
            </div>
          </div>
        </React.Fragment>
      ))}
      
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">
          🤖
        </div>
        <div className="flex-1 bg-green-50 rounded-lg p-2 shadow-sm border border-green-200">
          <p className="text-sm">Perfect! Here are the products...</p>
          <div className="flex gap-2 mt-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="w-12 h-12 bg-gray-200 rounded border"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
)}

      {/* Advanced Settings */}
      <div className="border-t pt-6 mt-6">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center text-sm font-medium text-primary-600 hover:text-primary-800 mb-4"
        >
          {showAdvanced ? (
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          Advanced Settings
        </button>

        {showAdvanced && (
          <div className="space-y-6 bg-gray-50 p-6 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                value={agent.model}
                onChange={(e) => setAgent({ ...agent, model: e.target.value })}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="gpt-4o-realtime-preview-2024-12-17">
                  GPT-4o Realtime (Latest)
                </option>
                <option value="gpt-4o-mini-realtime-preview-2024-12-17">
                  GPT-4o Mini Realtime (Faster, Cheaper)
                </option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                <strong>GPT-4o:</strong> Most capable model with better understanding and responses. Higher cost (~$0.06/min audio).
                <br />
                <strong>GPT-4o Mini:</strong> Faster responses, lower cost (~$0.024/min audio), suitable for simple conversations.
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
              <p className="mt-2 text-sm text-gray-500">
                Controls response randomness and creativity.
                <br />
                <strong>Lower (0.0-0.4):</strong> More focused, consistent, and deterministic. Best for factual Q&A, customer support.
                <br />
                <strong>Medium (0.5-0.7):</strong> Balanced between consistency and variety. Good for most use cases.
                <br />
                <strong>Higher (0.8-1.0):</strong> More creative and varied responses. Good for creative writing, brainstorming.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Response Tokens
              </label>
              <input
                type="number"
                min="200"
                max="8192"
                step="100"
                value={agent.max_tokens}
                onChange={(e) => setAgent({ ...agent, max_tokens: parseInt(e.target.value) || 200 })}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-2 text-sm text-gray-500">
                Maximum length of each agent response (200-8192 tokens).
                <br />
                <strong>Lower (200-1000):</strong> Short, concise responses. Faster and cheaper. Good for quick Q&A.
                <br />
                <strong>Medium (1000-4096):</strong> Standard length responses. Balanced cost/quality.
                <br />
                <strong>Higher (4096-8192):</strong> Longer, detailed explanations. Higher cost per response.
                <br />
                <span className="text-xs">Note: ~1 token ≈ 0.75 words. 4096 tokens ≈ 3000 words.</span>
              </p>
            </div>

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
                Voice Activity Detection sensitivity - determines how sensitive the AI is to detecting speech.
                <br />
                <strong>Lower (0.1-0.3):</strong> Very sensitive. Picks up quiet speech and whispers. May detect background noise as speech.
                <br />
                <strong>Medium (0.4-0.6):</strong> Balanced. Good for normal phone conversations.
                <br />
                <strong>Higher (0.7-1.0):</strong> Only detects clear, loud speech. Good for noisy environments but may miss quiet speakers.
                <br />
                <span className="text-amber-600">⚠️ If users complain the agent doesn't respond, lower this value. If it responds to background noise, increase it.</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Silence Duration (ms)
              </label>
              <input
                type="number"
                min="200"
                max="2000"
                step="100"
                value={agent.silence_duration_ms}
                onChange={(e) => setAgent({ ...agent, silence_duration_ms: parseInt(e.target.value) || 500 })}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-2 text-sm text-gray-500">
                How long (in milliseconds) to wait after user stops speaking before agent responds (200-2000ms).
                <br />
                <strong>Lower (200-400ms):</strong> Agent responds very quickly. May interrupt users who pause mid-sentence.
                <br />
                <strong>Medium (500-700ms):</strong> Balanced. Good for most conversations.
                <br />
                <strong>Higher (800-2000ms):</strong> Agent waits longer. Better for users who speak slowly or pause often.
                <br />
                <span className="text-xs">Recommended: 500ms for English, 700ms for Urdu (allows for thinking pauses)</span>
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">💡 Quick Tips</h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Start with default values and adjust based on user feedback</li>
                <li>Test calls in your actual environment before going live</li>
                <li>Lower temperature for consistent banking/support, higher for sales/creative</li>
                <li>Higher VAD threshold if you have noisy call centers</li>
                <li>Monitor call costs - higher tokens and GPT-4o increase costs significantly</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Functions Section */}
      {id && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Functions</h3>
            <button
              onClick={() => openFunctionModal()}
              className="inline-flex items-center px-3 py-1 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Function
            </button>
          </div>
          <div className="px-6 py-5">
            {functions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No functions defined. Add functions to extend agent capabilities.
              </p>
            ) : (
              <ul className="space-y-3">
                {functions.map((func) => (
                  <li key={func.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">{func.name}</h4>
                        <p className="mt-1 text-sm text-gray-500">{func.description}</p>
                        <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {func.execution_mode}
                          </span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                            {func.handler_type}
                          </span>
                          {func.api_endpoint && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                              {func.api_method}
                            </span>
                          )}
                        </div>
                        {func.api_endpoint && (
                          <div className="mt-2 text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded">
                            {func.api_endpoint}
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => openFunctionModal(func)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleFunctionDelete(func.id)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Function Modal */}
      {showFunctionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowFunctionModal(false)} />
            
            <div className="relative bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 z-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    {editingFunction ? 'Edit Function' : 'Add Function'}
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => loadExampleFunction('checkBalance')}
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      Example: Check Balance
                    </button>
                    <button
                      onClick={() => loadExampleFunction('bookAppointment')}
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      Example: Book Appointment
                    </button>
                    <button
                      onClick={() => loadExampleFunction('sendSMS')}
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      Example: Send SMS
                    </button>
                    <button
                      onClick={() => loadExampleFunction('transferCall')}
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      Example: Transfer Call
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Function Name *
                    </label>
                    <input
                      type="text"
                      value={functionForm.name}
                      onChange={(e) => setFunctionForm({ ...functionForm, name: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                      placeholder="check_customer_balance"
                    />
                    <p className="mt-1 text-xs text-gray-500">Use snake_case for function names</p>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Description *
                    </label>
                    <textarea
                      value={functionForm.description}
                      onChange={(e) => setFunctionForm({ ...functionForm, description: e.target.value })}
                      rows={3}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Check the current balance of a customer account. Returns balance information including available credit and pending transactions."
                    />
                    <p className="mt-1 text-xs text-gray-500">Clear description helps the AI understand when to call this function</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Execution Mode
                    </label>
                    <select
                      value={functionForm.execution_mode}
                      onChange={(e) => setFunctionForm({ ...functionForm, execution_mode: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="sync">Synchronous (wait for response)</option>
                      <option value="async">Asynchronous (fire and forget)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Handler Type
                    </label>
                    <select
                      value={functionForm.handler_type}
                      onChange={(e) => setFunctionForm({ ...functionForm, handler_type: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="inline">Inline (handled by bridge)</option>
                      <option value="api">External API</option>
                    </select>
                  </div>
                </div>

                {/* API Configuration - Postman-like */}
                {functionForm.handler_type === 'api' && (
                  <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                    <h4 className="text-sm font-medium text-gray-900 mb-4">API Configuration</h4>
                    
                    <div className="space-y-4">
                      {/* Method and Endpoint */}
                      <div className="flex space-x-2">
                        <div className="w-32">
                          <select
                            value={functionForm.api_method}
                            onChange={(e) => setFunctionForm({ ...functionForm, api_method: e.target.value })}
                            className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-semibold"
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="PATCH">PATCH</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={functionForm.api_endpoint}
                            onChange={(e) => setFunctionForm({ ...functionForm, api_endpoint: e.target.value })}
                            className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                            placeholder="https://api.example.com/v1/customers/{{customer_id}}/balance"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Use {`{{parameter_name}}`} for dynamic values from function parameters</p>

                      {/* Headers */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Headers
                          </label>
                          <button
                            onClick={() => setShowHeaderForm(!showHeaderForm)}
                            className="text-sm text-primary-600 hover:text-primary-700"
                          >
                            {showHeaderForm ? 'Cancel' : '+ Add Header'}
                          </button>
                        </div>

                        {showHeaderForm && (
                          <div className="mb-3 p-3 border border-gray-300 rounded-md bg-white">
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={headerForm.key}
                                onChange={(e) => setHeaderForm({ ...headerForm, key: e.target.value })}
                                className="block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm font-mono"
                                placeholder="Authorization"
                              />
                              <input
                                type="text"
                                value={headerForm.value}
                                onChange={(e) => setHeaderForm({ ...headerForm, value: e.target.value })}
                                className="block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm font-mono"
                                placeholder="Bearer YOUR_API_KEY"
                              />
                            </div>
                            <button
                              onClick={addHeader}
                              className="mt-2 w-full px-3 py-1 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700"
                            >
                              Add Header
                            </button>
                          </div>
                        )}

                        {functionForm.api_headers.length > 0 && (
                          <div className="space-y-2">
                            {functionForm.api_headers.map((header, index) => (
                              <div key={index} className="flex items-center space-x-2 p-2 bg-white border border-gray-200 rounded">
                                <span className="text-sm font-mono text-gray-700 flex-1">
                                  <span className="text-blue-600">{header.key}</span>: {header.value}
                                </span>
                                <button
                                  onClick={() => removeHeader(index)}
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Body - Only for POST, PUT, PATCH */}
                      {['POST', 'PUT', 'PATCH'].includes(functionForm.api_method) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Body
                          </label>

                          {/* Body Type Tabs */}
                          <div className="flex space-x-2 mb-3">
                            <button
                              onClick={() => handleBodyTypeChange('none')}
                              className={`px-3 py-1 text-sm rounded ${
                                functionForm.api_body_type === 'none'
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              None
                            </button>
                            <button
                              onClick={() => handleBodyTypeChange('json')}
                              className={`px-3 py-1 text-sm rounded ${
                                functionForm.api_body_type === 'json'
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              JSON (raw)
                            </button>
                            <button
                              onClick={() => handleBodyTypeChange('urlencoded')}
                              className={`px-3 py-1 text-sm rounded ${
                                functionForm.api_body_type === 'urlencoded'
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              x-www-form-urlencoded
                            </button>
                            <button
                              onClick={() => handleBodyTypeChange('form-data')}
                              className={`px-3 py-1 text-sm rounded ${
                                functionForm.api_body_type === 'form-data'
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              form-data
                            </button>
                          </div>

                          {/* JSON Body */}
                          {functionForm.api_body_type === 'json' && (
                            <div>
                              <textarea
                                value={bodyRawJson}
                                onChange={(e) => setBodyRawJson(e.target.value)}
                                rows={10}
                                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 font-mono text-xs focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-gray-900 text-green-400"
                                placeholder={`{\n  "customer_id": "{{customer_id}}",\n  "amount": "{{amount}}"\n}`}
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                Use {`{{parameter_name}}`} to inject parameter values into the body
                              </p>
                            </div>
                          )}

                          {/* Form-data / URL-encoded Body */}
                          {(functionForm.api_body_type === 'form-data' || functionForm.api_body_type === 'urlencoded') && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-500">Key-Value Pairs</span>
                                <button
                                  onClick={() => setShowBodyForm(!showBodyForm)}
                                  className="text-sm text-primary-600 hover:text-primary-700"
                                >
                                  {showBodyForm ? 'Cancel' : '+ Add Field'}
                                </button>
                              </div>

                              {showBodyForm && (
                                <div className="mb-3 p-3 border border-gray-300 rounded-md bg-white">
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="text"
                                      value={bodyKeyValue.key}
                                      onChange={(e) => setBodyKeyValue({ ...bodyKeyValue, key: e.target.value })}
                                      className="block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm font-mono"
                                      placeholder="field_name"
                                    />
                                    <input
                                      type="text"
                                      value={bodyKeyValue.value}
                                      onChange={(e) => setBodyKeyValue({ ...bodyKeyValue, value: e.target.value })}
                                      className="block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm font-mono"
                                      placeholder="{{parameter_name}} or value"
                                    />
                                  </div>
                                  <button
                                    onClick={addBodyField}
                                    className="mt-2 w-full px-3 py-1 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700"
                                  >
                                    Add Field
                                  </button>
                                </div>
                              )}

                              {bodyFormData.length > 0 ? (
                                <div className="space-y-2">
                                  {bodyFormData.map((field, index) => (
                                    <div key={index} className="flex items-center space-x-2 p-2 bg-white border border-gray-200 rounded">
                                      <span className="text-sm font-mono text-gray-700 flex-1">
                                        <span className="text-blue-600">{field.key}</span> = {field.value}
                                      </span>
                                      <button
                                        onClick={() => removeBodyField(index)}
                                        className="text-red-400 hover:text-red-600"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500 text-center py-4 bg-white border border-gray-200 rounded">
                                  No fields added
                                </p>
                              )}
                              <p className="mt-2 text-xs text-gray-500">
                                Use {`{{parameter_name}}`} to inject parameter values
                              </p>
                            </div>
                          )}

                          {functionForm.api_body_type === 'none' && (
                            <p className="text-sm text-gray-500 text-center py-4 bg-white border border-gray-200 rounded">
                              No body will be sent with this request
                            </p>
                          )}
                        </div>
                      )}

                      {/* Timeout and Retries */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Timeout (ms)
                          </label>
                          <input
                            type="number"
                            value={functionForm.timeout_ms}
                            onChange={(e) => setFunctionForm({ ...functionForm, timeout_ms: parseInt(e.target.value) })}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Retries
                          </label>
                          <input
                            type="number"
                            value={functionForm.retries}
                            onChange={(e) => setFunctionForm({ ...functionForm, retries: parseInt(e.target.value) })}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                      </div>
					  {/* SSL Verification Toggle */}
						<div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
						  <div className="flex-1">
							<label className="block text-sm font-medium text-gray-700">
							  Skip SSL Verification
							</label>
							<p className="text-xs text-gray-500 mt-1">
							  Enable for endpoints with self-signed or invalid SSL certificates. Use with caution.
							</p>
						  </div>
						  <div className="ml-4">
							<button
							  type="button"
							  onClick={() => setFunctionForm({ ...functionForm, skip_ssl_verify: !functionForm.skip_ssl_verify })}
							  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
								functionForm.skip_ssl_verify ? 'bg-yellow-500' : 'bg-gray-200'
							  }`}
							>
							  <span
								className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
								  functionForm.skip_ssl_verify ? 'translate-x-5' : 'translate-x-0'
								}`}
							  />
							</button>
						  </div>
						</div>
						{functionForm.skip_ssl_verify && (
						  <div className="flex items-center p-2 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-xs">
							<svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
							  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
							</svg>
							SSL verification is disabled. Only use for internal/development APIs with self-signed certificates.
						  </div>
						)}
                    </div>
                  </div>
                )}

                {/* Parameters */}
                <div className="border border-gray-300 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-900">
                      Parameters
                    </label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setShowParameterJson(!showParameterJson)}
                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        {showParameterJson ? 'Form View' : 'JSON View'}
                      </button>
                      <button
                        onClick={() => setShowParameterForm(!showParameterForm)}
                        className="text-sm text-primary-600 hover:text-primary-700"
                      >
                        {showParameterForm ? 'Cancel' : '+ Add Parameter'}
                      </button>
                    </div>
                  </div>

                  {/* JSON Editor */}
                  {showParameterJson && (
                    <div className="mb-4">
                      <textarea
                        value={parameterJson}
                        onChange={(e) => setParameterJson(e.target.value)}
                        rows={15}
                        className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 font-mono text-xs focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-gray-900 text-green-400"
                      />
                      <button
                        onClick={updateParametersFromJson}
                        className="mt-2 px-3 py-1 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700"
                      >
                        Update from JSON
                      </button>
                    </div>
                  )}

                  {/* Form Builder */}
                  {!showParameterJson && showParameterForm && (
                    <div className="mb-4 p-4 border border-gray-300 rounded-md bg-gray-50">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700">Name</label>
                            <input
                              type="text"
                              value={parameterForm.name}
                              onChange={(e) => setParameterForm({ ...parameterForm, name: e.target.value })}
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm"
                              placeholder="customer_id"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700">Type</label>
                            <select
                              value={parameterForm.type}
                              onChange={(e) => setParameterForm({ ...parameterForm, type: e.target.value })}
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm"
                            >
                              <option value="string">String</option>
                              <option value="number">Number</option>
                              <option value="boolean">Boolean</option>
                              <option value="object">Object</option>
                              <option value="array">Array</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700">Description</label>
                          <input
                            type="text"
                            value={parameterForm.description}
                            onChange={(e) => setParameterForm({ ...parameterForm, description: e.target.value })}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm"
                            placeholder="The customer's unique identifier"
                          />
                        </div>

                        {parameterForm.type === 'string' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700">
                              Enum Values (comma-separated, optional)
                            </label>
                            <input
                              type="text"
                              value={parameterForm.enum}
                              onChange={(e) => setParameterForm({ ...parameterForm, enum: e.target.value })}
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm"
                              placeholder="active, pending, inactive"
                            />
                          </div>
                        )}

                        {parameterForm.type === 'object' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700">
                              Properties (JSON)
                            </label>
                            <textarea
                              value={parameterForm.properties}
                              onChange={(e) => setParameterForm({ ...parameterForm, properties: e.target.value })}
                              rows={4}
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm font-mono"
                              placeholder={`{\n  "name": { "type": "string" },\n  "age": { "type": "number" }\n}`}
                            />
                          </div>
                        )}

                        {parameterForm.type === 'array' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700">
                              Items Schema (JSON)
                            </label>
                            <textarea
                              value={parameterForm.items}
                              onChange={(e) => setParameterForm({ ...parameterForm, items: e.target.value })}
                              rows={4}
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm font-mono"
                              placeholder={`{ "type": "string" }`}
                            />
                          </div>
                        )}

                        <div>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={parameterForm.required}
                              onChange={(e) => setParameterForm({ ...parameterForm, required: e.target.checked })}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">Required</span>
                          </label>
                        </div>
                      </div>

                      <button
                        onClick={addParameter}
                        className="mt-3 w-full px-3 py-1 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700"
                      >
                        Add Parameter
                      </button>
                    </div>
                  )}

                  {/* Parameter List */}
                  {!showParameterJson && Object.keys(functionForm.parameters.properties).length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(functionForm.parameters.properties).map(([name, param]) => (
                        <div key={name} className="flex items-start justify-between p-3 border border-gray-200 rounded-md bg-white">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm font-mono">{name}</span>
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                {param.type}
                              </span>
                              {functionForm.parameters.required.includes(name) && (
                                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                                  required
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 mt-1">{param.description}</p>
                            {param.enum && (
                              <p className="text-xs text-gray-500 mt-1">
                                Values: {param.enum.join(', ')}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removeParameter(name)}
                            className="text-red-400 hover:text-red-600 ml-2"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!showParameterJson && Object.keys(functionForm.parameters.properties).length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No parameters defined. Add parameters that the AI can use when calling this function.
                    </p>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setShowFunctionModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFunctionSave}
                  disabled={savingFunction}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingFunction ? 'Saving...' : 'Save Function'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
	  {/* AI Instructions Modal - MOVED TO END */}
		{showAIModal && (
		  <div className="fixed inset-0 z-50 overflow-y-auto">
			<div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
			  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => !generatingAI && setShowAIModal(false)} />
			  
			  <div className="relative bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
				<div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 z-10">
				  <h3 className="text-lg font-medium text-gray-900">
					AI Generated Instructions
				  </h3>
				  {aiCost > 0 && (
					<p className="mt-1 text-sm text-gray-500">
					  Cost: ${aiCost.toFixed(6)} (deducted from your credits)
					</p>
				  )}
				</div>

				<div className="px-6 py-5">
				  {generatingAI ? (
					<div className="flex items-center justify-center py-12">
					  <div className="text-center">
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
						<p className="text-sm text-gray-600">Generating instructions...</p>
						<p className="text-xs text-gray-500 mt-2">Using AI to create optimized agent instructions</p>
					  </div>
					</div>
				  ) : (
					<>
					  <div className="mb-4">
						<label className="block text-sm font-medium text-gray-700 mb-2">
						  Generated Instructions
						</label>
						<textarea
						  value={generatedInstructions}
						  onChange={(e) => setGeneratedInstructions(e.target.value)}
						  rows={20}
						  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 font-mono text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
						/>
						<p className="mt-2 text-sm text-gray-500">
						  You can edit these instructions before accepting them.
						</p>
					  </div>

					  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
						<h4 className="text-sm font-medium text-blue-900 mb-2">Review Carefully</h4>
						<ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
						  <li>Verify the instructions match your use case</li>
						  <li>Check for any inappropriate content or errors</li>
						  <li>Customize as needed before accepting</li>
						  <li>Test the agent after applying instructions</li>
						</ul>
					  </div>
					</>
				  )}
				</div>

				{!generatingAI && (
				  <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
					<button
					  onClick={rejectAIInstructions}
					  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
					  Discard
					</button>
					<button
					  onClick={acceptAIInstructions}
					  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
					>
					  Accept & Apply
					</button>
				  </div>
				)}
			  </div>
			</div>
		  </div>
		)}
    </div>
  );
};

export default AgentEditor;
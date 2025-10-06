import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, X, Plus, Trash2, Edit2 } from 'lucide-react';
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

const AgentEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [agent, setAgent] = useState({
	  name: '',
	  type: 'sales',
	  instructions: '',
	  voice: 'shimmer',
	  language: 'ur',
	  model: 'gpt-4o-mini-realtime-preview-2024-12-17',
	  provider: 'openai',  // ADD THIS
	  deepgram_model: 'nova-2',  // ADD THIS
	  deepgram_voice: 'aura-asteria-en',  // ADD THIS
	  deepgram_language: 'en',  // ADD THIS
	  temperature: 0.6,
	  max_tokens: 4096,
	  vad_threshold: 0.5,
	  silence_duration_ms: 500,
	  greeting: ''
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

  useEffect(() => {
    if (id) {
      loadAgent();
    }
  }, [id]);

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

  const loadAgent = async () => {
    setLoading(true);
    try {
      const [agentRes, functionsRes] = await Promise.all([
        getAgent(id),
        getFunctions(id)
      ]);
      
      setAgent(agentRes.data.agent);
      setFunctions(functionsRes.data.functions);
    } catch (error) {
      toast.error('Failed to load agent');
      navigate('/agents');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!agent.name || !agent.instructions) {
      toast.error('Name and instructions are required');
      return;
    }

    setSavingAgent(true);
    try {
      if (id) {
        await updateAgent(id, agent);
        toast.success('Agent updated');
      } else {
        const response = await createAgent(agent);
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
				onChange={(e) => setAgent({ ...agent, provider: e.target.value })}
				className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
			  >
				<option value="openai">OpenAI Realtime API</option>
				<option value="deepgram">Deepgram</option>
			  </select>
			  <p className="mt-1 text-xs text-gray-500">
				{agent.provider === 'deepgram' 
				  ? 'Deepgram provides more natural sounding voices'
				  : 'OpenAI provides superior conversation handling and function calling'}
			  </p>
			</div>
            {agent.provider === 'openai' ? (
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
			) : (
			  <>
				<div>
				  <label className="block text-sm font-medium text-gray-700">STT Model</label>
				  <select
					value={agent.deepgram_model || 'nova-2'}
					onChange={(e) => setAgent({ ...agent, deepgram_model: e.target.value })}
					className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
				  >
					<option value="nova-2">Nova 2</option>
					<option value="nova-2-general">Nova 2 General</option>
					<option value="nova-2-phonecall">Nova 2 Phonecall</option>
				  </select>
				</div>
				<div>
				  <label className="block text-sm font-medium text-gray-700">TTS Voice</label>
				  <select
					value={agent.deepgram_voice || 'aura-asteria-en'}
					onChange={(e) => setAgent({ ...agent, deepgram_voice: e.target.value })}
					className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
				  >
					<option value="aura-asteria-en">Asteria</option>
					<option value="aura-luna-en">Luna</option>
					<option value="aura-stella-en">Stella</option>
					<option value="aura-athena-en">Athena</option>
					<option value="aura-hera-en">Hera</option>
					<option value="aura-orion-en">Orion</option>
				  </select>
				</div>
			  </>
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
            <label className="block text-sm font-medium text-gray-700">Greeting (optional)</label>
            <textarea
              value={agent.greeting}
              onChange={(e) => setAgent({ ...agent, greeting: e.target.value })}
              rows={2}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="Hello! How can I help you today?"
            />
          </div>
        </div>
      </div>

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
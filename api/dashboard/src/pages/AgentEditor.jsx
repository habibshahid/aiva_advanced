import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, X, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getAgent, 
  createAgent, 
  updateAgent, 
  getFunctions, 
  createFunction, 
  updateFunction, 
  deleteFunction 
} from '../services/api';

const AgentEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  
  const [agent, setAgent] = useState({
    name: '',
    type: 'sales',
    instructions: '',
    voice: 'shimmer',
    language: 'ur',
    model: 'gpt-4o-mini-realtime-preview-2024-12-17',
    temperature: 0.6,
    max_tokens: 4096,
    vad_threshold: 0.5,
    silence_duration_ms: 500,
    greeting: ''
  });

  const [functions, setFunctions] = useState([]);
  const [showFunctionModal, setShowFunctionModal] = useState(false);
  const [editingFunction, setEditingFunction] = useState(null);

  useEffect(() => {
    if (id) {
      loadAgent();
    }
  }, [id]);

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

  const handleFunctionSave = async (functionData) => {
    try {
      if (editingFunction) {
        await updateFunction(editingFunction.id, functionData);
        toast.success('Function updated');
      } else {
        await createFunction(id, functionData);
        toast.success('Function added');
      }
      setShowFunctionModal(false);
      setEditingFunction(null);
      loadAgent();
    } catch (error) {
      toast.error('Failed to save function');
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

      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Agent Name
              </label>
              <input
                type="text"
                value={agent.name}
                onChange={(e) => setAgent({ ...agent, name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Sales Assistant"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Type
              </label>
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
              <label className="block text-sm font-medium text-gray-700">
                Voice
              </label>
              <select
                value={agent.voice}
                onChange={(e) => setAgent({ ...agent, voice: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
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
              <label className="block text-sm font-medium text-gray-700">
                Language
              </label>
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
            <label className="block text-sm font-medium text-gray-700">
              Instructions
            </label>
            <textarea
              value={agent.instructions}
              onChange={(e) => setAgent({ ...agent, instructions: e.target.value })}
              rows={10}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="You are a helpful sales assistant..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Greeting (optional)
            </label>
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

      {id && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Functions</h3>
            <button
              onClick={() => {
                setEditingFunction(null);
                setShowFunctionModal(true);
              }}
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
                          <span>Mode: {func.execution_mode}</span>
                          {func.api_endpoint && <span>API: {func.api_endpoint}</span>}
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingFunction(func);
                            setShowFunctionModal(true);
                          }}
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

      {/* Function Modal - simplified for brevity */}
      {showFunctionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowFunctionModal(false)} />
            <div className="relative bg-white rounded-lg max-w-2xl w-full p-6">
              <h3 className="text-lg font-medium mb-4">
                {editingFunction ? 'Edit Function' : 'Add Function'}
              </h3>
              {/* Add function form fields here */}
              <div className="mt-4 flex justify-end space-x-3">
                <button
                  onClick={() => setShowFunctionModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleFunctionSave({})}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentEditor;
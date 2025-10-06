import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, Power, PowerOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAgents, deleteAgent, updateAgent } from '../services/api';

const Agents = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadAgents();
  }, [filter]);

  const loadAgents = async () => {
    try {
      const params = filter !== 'all' ? { is_active: filter === 'active' } : {};
      const response = await getAgents(params);
      setAgents(response.data.agents);
    } catch (error) {
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (agent) => {
    try {
      await updateAgent(agent.id, { is_active: !agent.is_active });
      toast.success(`Agent ${agent.is_active ? 'deactivated' : 'activated'}`);
      loadAgents();
    } catch (error) {
      toast.error('Failed to update agent');
    }
  };

  const handleDelete = async (agent) => {
    if (!window.confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      return;
    }

    try {
      await deleteAgent(agent.id);
      toast.success('Agent deleted');
      loadAgents();
    } catch (error) {
      toast.error('Failed to delete agent');
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
          <h1 className="text-3xl font-bold text-gray-900">Agents</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your AI voice agents</p>
        </div>
        <Link
          to="/agents/new"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Agent
        </Link>
      </div>

      <div className="flex space-x-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-sm font-medium rounded-md ${
            filter === 'all'
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 text-sm font-medium rounded-md ${
            filter === 'active'
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter('inactive')}
          className={`px-4 py-2 text-sm font-medium rounded-md ${
            filter === 'inactive'
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Inactive
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden rounded-lg">
        <ul className="divide-y divide-gray-200">
          {agents.length === 0 ? (
            <li className="p-8 text-center text-gray-500">
              No agents found. Create your first agent to get started.
            </li>
          ) : (
            agents.map((agent) => (
              <li key={agent.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {agent.name}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          agent.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {agent.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-gray-500 space-x-4">
					  <span>Type: {agent.type}</span>
					  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
						agent.provider === 'deepgram' 
						  ? 'bg-purple-100 text-purple-800' 
						  : 'bg-blue-100 text-blue-800'
					  }`}>
						{agent.provider === 'deepgram' ? 'Deepgram' : 'OpenAI'}
					  </span>
					  <span>Voice: {agent.voice || agent.deepgram_voice || 'N/A'}</span>
					  <span>Model: {agent.model || agent.deepgram_model}</span>
					</div>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {agent.instructions}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleToggleActive(agent)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                      title={agent.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {agent.is_active ? (
                        <PowerOff className="w-5 h-5" />
                      ) : (
                        <Power className="w-5 h-5" />
                      )}
                    </button>
                    <Link
                      to={`/agents/${agent.id}`}
                      className="p-2 text-gray-400 hover:text-gray-600"
                      title="Edit"
                    >
                      <Edit2 className="w-5 h-5" />
                    </Link>
                    <button
                      onClick={() => handleDelete(agent)}
                      className="p-2 text-red-400 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default Agents;
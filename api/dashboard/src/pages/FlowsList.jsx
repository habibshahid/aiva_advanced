/**
 * IVR Flows List Page
 * List and manage conversation flows for Intent IVR
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Edit2, Trash2, Copy, Play, 
  GitBranch, CheckCircle, XCircle, BarChart3,
  Loader2, Search, MoreVertical, Power
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAgent } from '../services/api';
import * as flowApi from '../services/flowApi';

const FlowsList = () => {
  const { id: agentId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState(null);
  const [flows, setFlows] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);

  useEffect(() => {
    loadData();
  }, [agentId, showInactive]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [agentRes, flowsRes] = await Promise.all([
        getAgent(agentId),
        flowApi.getFlows(agentId, showInactive)
      ]);
      
      setAgent(agentRes.data.agent);
      setFlows(flowsRes.data.data || []);
    } catch (error) {
      console.error('Failed to load flows:', error);
      toast.error('Failed to load flows');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (flowId, flowName) => {
    if (!window.confirm(`Are you sure you want to delete "${flowName}"? This cannot be undone.`)) {
      return;
    }
    
    try {
      setDeletingId(flowId);
      await flowApi.deleteFlow(agentId, flowId);
      toast.success('Flow deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete flow');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (flowId) => {
    try {
      setDuplicatingId(flowId);
      const response = await flowApi.duplicateFlow(agentId, flowId);
      toast.success('Flow duplicated successfully');
      navigate(`/agents/${agentId}/flows/${response.data.data.id}`);
    } catch (error) {
      toast.error('Failed to duplicate flow');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleToggleActive = async (flow) => {
    try {
      await flowApi.updateFlow(agentId, flow.id, { is_active: !flow.is_active });
      toast.success(flow.is_active ? 'Flow deactivated' : 'Flow activated');
      loadData();
    } catch (error) {
      toast.error('Failed to update flow');
    }
  };

  const filteredFlows = flows.filter(flow => 
    flow.flow_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    flow.flow_key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            <h1 className="text-2xl font-bold text-gray-900">Conversation Flows</h1>
            <p className="text-sm text-gray-500">{agent?.name}</p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/agents/${agentId}/flows/new`)}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Flow
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search flows..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <label className="flex items-center space-x-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span>Show inactive</span>
        </label>
      </div>

      {/* Flows Grid */}
      {filteredFlows.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No flows yet</h3>
          <p className="text-gray-500 mb-4">
            Create conversation flows to collect information from callers step by step.
          </p>
          <button
            onClick={() => navigate(`/agents/${agentId}/flows/new`)}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Flow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFlows.map(flow => (
            <FlowCard
              key={flow.id}
              flow={flow}
              agentId={agentId}
              onEdit={() => navigate(`/agents/${agentId}/flows/${flow.id}`)}
              onDelete={() => handleDelete(flow.id, flow.flow_name)}
              onDuplicate={() => handleDuplicate(flow.id)}
              onToggleActive={() => handleToggleActive(flow)}
              isDeleting={deletingId === flow.id}
              isDuplicating={duplicatingId === flow.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Flow Card Component
const FlowCard = ({ 
  flow, 
  agentId, 
  onEdit, 
  onDelete, 
  onDuplicate, 
  onToggleActive,
  isDeleting,
  isDuplicating
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const completionRate = flow.total_started > 0 
    ? Math.round((flow.total_completed / flow.total_started) * 100) 
    : 0;

  return (
    <div className={`bg-white rounded-lg shadow-sm border-2 transition-all ${
      flow.is_active ? 'border-transparent hover:border-primary-200' : 'border-gray-200 opacity-60'
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-gray-900 truncate">{flow.flow_name}</h3>
              {!flow.is_active && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{flow.flow_key}</p>
          </div>
          
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <MoreVertical className="w-4 h-4 text-gray-400" />
            </button>
            
            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <button
                    onClick={() => { setShowMenu(false); onEdit(); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Flow
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); onDuplicate(); }}
                    disabled={isDuplicating}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center disabled:opacity-50"
                  >
                    {isDuplicating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
                    Duplicate
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); onToggleActive(); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                  >
                    <Power className="w-4 h-4 mr-2" />
                    {flow.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={() => { setShowMenu(false); onDelete(); }}
                    disabled={isDeleting}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        
        {flow.description && (
          <p className="text-sm text-gray-500 mt-2 line-clamp-2">{flow.description}</p>
        )}
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-gray-900">{flow.step_count || 0}</p>
          <p className="text-xs text-gray-500">Steps</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{flow.total_completed || 0}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div>
          <p className={`text-2xl font-bold ${
            completionRate >= 70 ? 'text-green-600' : 
            completionRate >= 40 ? 'text-yellow-600' : 'text-gray-400'
          }`}>
            {completionRate}%
          </p>
          <p className="text-xs text-gray-500">Success</p>
        </div>
      </div>

      {/* Trigger Phrases */}
      {flow.trigger_phrases?.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-1">
            {flow.trigger_phrases.slice(0, 3).map((phrase, i) => (
              <span 
                key={i} 
                className="px-2 py-0.5 text-xs bg-primary-50 text-primary-700 rounded"
              >
                {phrase}
              </span>
            ))}
            {flow.trigger_phrases.length > 3 && (
              <span className="px-2 py-0.5 text-xs text-gray-500">
                +{flow.trigger_phrases.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 rounded-b-lg">
        <button
          onClick={onEdit}
          className="w-full py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
        >
          Open Flow Builder
        </button>
      </div>
    </div>
  );
};

export default FlowsList;

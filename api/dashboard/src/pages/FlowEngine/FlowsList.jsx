/**
 * Flow Engine - Flows List
 * 
 * Lists all flows for an agent with ability to:
 * - View system/integration/custom flows
 * - Create, edit, delete custom flows
 * - Toggle flow active status
 * - Initialize flows for new agents
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Plus,
  Settings,
  ToggleLeft,
  ToggleRight,
  Copy,
  Trash2,
  Edit2,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Zap,
  ShoppingBag,
  MessageSquare,
  HelpCircle,
  Search,
  Phone,
  RefreshCw,
  Power,
  Activity,
  FileText,
  BarChart3
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getFlows,
  toggleFlow,
  deleteFlow,
  duplicateFlow,
  getFlowEngineStatus,
  enableFlowEngine,
  disableFlowEngine,
  initializeFlows
} from '../../services/flowEngineApi';
import { getAgent } from '../../services/api';

// Flow type icons
const flowTypeIcons = {
  system: <Settings className="w-4 h-4" />,
  integration: <ShoppingBag className="w-4 h-4" />,
  custom: <GitBranch className="w-4 h-4" />
};

// Flow type colors
const flowTypeColors = {
  system: 'bg-blue-100 text-blue-700',
  integration: 'bg-purple-100 text-purple-700',
  custom: 'bg-green-100 text-green-700'
};

// Specific flow icons
const getFlowIcon = (flowId) => {
  switch (flowId) {
    case '_general': return <MessageSquare className="w-5 h-5" />;
    case '_kb_search': return <Search className="w-5 h-5" />;
    case '_handoff': return <Phone className="w-5 h-5" />;
    case '_clarify_image': return <HelpCircle className="w-5 h-5" />;
    case 'order_status': return <ShoppingBag className="w-5 h-5" />;
    case 'product_search': return <Search className="w-5 h-5" />;
    default: return <GitBranch className="w-5 h-5" />;
  }
};

const FlowsList = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState(null);
  const [flows, setFlows] = useState([]);
  const [status, setStatus] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  
  // Load data
  useEffect(() => {
    loadData();
  }, [agentId, showInactive]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load agent info
      const agentRes = await getAgent(agentId);
      setAgent(agentRes.data.data || agentRes.data);
      
      // Load flows
      const flowsRes = await getFlows(agentId, showInactive);
      setFlows(flowsRes.data.data || []);
      
      // Load status
      const statusRes = await getFlowEngineStatus(agentId);
      setStatus(statusRes.data.data);
      
    } catch (error) {
      console.error('Error loading flows:', error);
      toast.error('Failed to load flows');
    } finally {
      setLoading(false);
    }
  };
  
  // Toggle FlowEngine
  const handleToggleEngine = async () => {
    try {
      if (status?.enabled) {
        await disableFlowEngine(agentId);
        toast.success('Flow Engine disabled');
      } else {
        await enableFlowEngine(agentId);
        toast.success('Flow Engine enabled');
      }
      loadData();
    } catch (error) {
      console.error('Error toggling engine:', error);
      toast.error('Failed to toggle Flow Engine');
    }
  };
  
  // Initialize flows
  const handleInitialize = async () => {
    try {
      await initializeFlows(agentId);
      toast.success('Flows initialized');
      loadData();
    } catch (error) {
      console.error('Error initializing flows:', error);
      toast.error('Failed to initialize flows');
    }
  };
  
  // Toggle flow active status
  const handleToggleFlow = async (flowId, currentStatus) => {
    try {
      setTogglingId(flowId);
      await toggleFlow(flowId, !currentStatus);
      toast.success(currentStatus ? 'Flow disabled' : 'Flow enabled');
      loadData();
    } catch (error) {
      console.error('Error toggling flow:', error);
      toast.error('Failed to toggle flow');
    } finally {
      setTogglingId(null);
    }
  };
  
  // Duplicate flow
  const handleDuplicate = async (flowId, flowName) => {
    try {
      await duplicateFlow(flowId, `${flowName} (Copy)`);
      toast.success('Flow duplicated');
      loadData();
    } catch (error) {
      console.error('Error duplicating flow:', error);
      toast.error('Failed to duplicate flow');
    }
  };
  
  // Delete flow
  const handleDelete = async (flowId) => {
    try {
      setDeletingId(flowId);
      await deleteFlow(flowId);
      toast.success('Flow deleted');
      setShowDeleteConfirm(null);
      loadData();
    } catch (error) {
      console.error('Error deleting flow:', error);
      toast.error(error.response?.data?.error || 'Failed to delete flow');
    } finally {
      setDeletingId(null);
    }
  };
  
  // Group flows by type
  const groupedFlows = {
    system: flows.filter(f => f.type === 'system'),
    integration: flows.filter(f => f.type === 'integration'),
    custom: flows.filter(f => f.type === 'custom')
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <GitBranch className="w-6 h-6" />
            Conversation Flows
          </h1>
          <p className="text-gray-500 mt-1">
            {agent?.name} • {flows.length} flows
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Flow Engine Toggle */}
          <button
            onClick={handleToggleEngine}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              status?.enabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Power className="w-4 h-4" />
            {status?.enabled ? 'Engine On' : 'Engine Off'}
          </button>
          
          {/* Sessions Monitor */}
          <button
            onClick={() => navigate(`/agents/${agentId}/flows/sessions`)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
          >
            <Activity className="w-4 h-4" />
            Sessions
            {status?.sessions_24h?.active_sessions > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-purple-500 text-white text-xs rounded-full">
                {status.sessions_24h.active_sessions}
              </span>
            )}
          </button>
          
          {/* Analytics Button */}
          <button
            onClick={() => navigate(`/agents/${agentId}/flows/analytics`)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </button>
          
          {/* Initialize Button */}
          <button
            onClick={handleInitialize}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Initialize
          </button>
          
          {/* Templates Button */}
          <button
            onClick={() => navigate(`/agents/${agentId}/flows/templates`)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Templates
          </button>
          
          {/* Create Flow Button */}
          <button
            onClick={() => navigate(`/agents/${agentId}/flows/new`)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Flow
          </button>
        </div>
      </div>
      
      {/* Status Banner */}
      {!status?.enabled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800">Flow Engine is disabled</h3>
            <p className="text-yellow-700 text-sm mt-1">
              Messages are being processed by the legacy ChatService. Enable Flow Engine to use these flows.
            </p>
          </div>
        </div>
      )}
      
      {/* Stats */}
      {status && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-gray-800">{status.flows?.total || 0}</div>
            <div className="text-sm text-gray-500">Total Flows</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-green-600">{status.flows?.active || 0}</div>
            <div className="text-sm text-gray-500">Active Flows</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-blue-600">{status.sessions_24h?.active_sessions || 0}</div>
            <div className="text-sm text-gray-500">Active Sessions</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-gray-600">{status.sessions_24h?.total_sessions || 0}</div>
            <div className="text-sm text-gray-500">Sessions (24h)</div>
          </div>
        </div>
      )}
      
      {/* Show Inactive Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setShowInactive(!showInactive)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
        >
          {showInactive ? (
            <ToggleRight className="w-5 h-5 text-blue-500" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
          Show inactive flows
        </button>
      </div>
      
      {/* System Flows */}
      {groupedFlows.system.length > 0 && (
        <FlowGroup
          title="System Flows"
          description="Built-in flows that handle core functionality"
          flows={groupedFlows.system}
          type="system"
          togglingId={togglingId}
          onToggle={handleToggleFlow}
          onEdit={(id) => navigate(`/agents/${agentId}/flows/${id}`)}
          onDuplicate={handleDuplicate}
          onDelete={null} // Can't delete system flows
          showDeleteConfirm={showDeleteConfirm}
          setShowDeleteConfirm={setShowDeleteConfirm}
          deletingId={deletingId}
        />
      )}
      
      {/* Integration Flows */}
      {groupedFlows.integration.length > 0 && (
        <FlowGroup
          title="Integration Flows"
          description="Flows from connected integrations (Shopify, etc.)"
          flows={groupedFlows.integration}
          type="integration"
          togglingId={togglingId}
          onToggle={handleToggleFlow}
          onEdit={(id) => navigate(`/agents/${agentId}/flows/${id}`)}
          onDuplicate={handleDuplicate}
          onDelete={null} // Can't delete integration flows
          showDeleteConfirm={showDeleteConfirm}
          setShowDeleteConfirm={setShowDeleteConfirm}
          deletingId={deletingId}
        />
      )}
      
      {/* Custom Flows */}
      <FlowGroup
        title="Custom Flows"
        description="Your custom conversation flows"
        flows={groupedFlows.custom}
        type="custom"
        togglingId={togglingId}
        onToggle={handleToggleFlow}
        onEdit={(id) => navigate(`/agents/${agentId}/flows/${id}`)}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        showDeleteConfirm={showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        deletingId={deletingId}
        emptyState={
          <div className="text-center py-8">
            <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-gray-600 font-medium">No custom flows yet</h3>
            <p className="text-gray-400 text-sm mt-1">Create flows for lead capture, appointments, support, and more</p>
            <button
              onClick={() => navigate(`/agents/${agentId}/flows/new`)}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Create Your First Flow
            </button>
          </div>
        }
      />
    </div>
  );
};

// Flow Group Component
const FlowGroup = ({
  title,
  description,
  flows,
  type,
  togglingId,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  showDeleteConfirm,
  setShowDeleteConfirm,
  deletingId,
  emptyState
}) => {
  if (flows.length === 0 && !emptyState) return null;
  
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${flowTypeColors[type]}`}>
          {flowTypeIcons[type]}
        </span>
        <h2 className="font-semibold text-gray-800">{title}</h2>
        <span className="text-gray-400 text-sm">({flows.length})</span>
      </div>
      <p className="text-gray-500 text-sm mb-4">{description}</p>
      
      {flows.length === 0 ? (
        emptyState
      ) : (
        <div className="space-y-3">
          {flows.map(flow => (
            <FlowCard
              key={flow.id}
              flow={flow}
              type={type}
              isToggling={togglingId === flow.id}
              onToggle={onToggle}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              showDeleteConfirm={showDeleteConfirm === flow.id}
              setShowDeleteConfirm={setShowDeleteConfirm}
              isDeleting={deletingId === flow.id}
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
  type,
  isToggling,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  showDeleteConfirm,
  setShowDeleteConfirm,
  isDeleting
}) => {
  const isActive = flow.is_active === 1 || flow.is_active === true;
  const stepCount = flow.config?.steps?.length || 0;
  const triggerCount = flow.config?.trigger_examples?.length || 0;
  
  return (
    <div className={`bg-white rounded-lg border p-4 hover:shadow-md transition-shadow ${!isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`p-2 rounded-lg ${flowTypeColors[type]}`}>
            {getFlowIcon(flow.id)}
          </div>
          
          {/* Info */}
          <div>
            <h3 className="font-medium text-gray-800 flex items-center gap-2">
              {flow.name}
              {isActive ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-gray-400" />
              )}
            </h3>
            <p className="text-gray-500 text-sm mt-1">{flow.description}</p>
            
            {/* Stats */}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span>{stepCount} steps</span>
              <span>{triggerCount} triggers</span>
              {flow.version > 1 && <span>v{flow.version}</span>}
            </div>
            
            {/* Trigger Examples */}
            {triggerCount > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {flow.config.trigger_examples.slice(0, 3).map((trigger, i) => (
                  <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                    "{trigger}"
                  </span>
                ))}
                {triggerCount > 3 && (
                  <span className="text-xs text-gray-400">+{triggerCount - 3} more</span>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Toggle */}
          
            <button
              onClick={() => onToggle(flow.id, isActive)}
              disabled={isToggling}
              className={`p-2 rounded-lg transition-colors ${
                isActive
                  ? 'text-green-600 hover:bg-green-50'
                  : 'text-gray-400 hover:bg-gray-100'
              }`}
              title={isActive ? 'Disable flow' : 'Enable flow'}
            >
              {isToggling ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isActive ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
            </button>
         
          
          {/* Edit */}
          <button
            onClick={() => onEdit(flow.id)}
            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit flow"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          
          {/* Duplicate */}
          <button
            onClick={() => onDuplicate(flow.id, flow.name)}
            className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition-colors"
            title="Duplicate flow"
          >
            <Copy className="w-4 h-4" />
          </button>
          
          {/* Delete */}
          {onDelete && flow.is_deletable && (
            <>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onDelete(flow.id)}
                    disabled={isDeleting}
                    className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(flow.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete flow"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          
          {/* Navigate */}
          <button
            onClick={() => onEdit(flow.id)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlowsList;
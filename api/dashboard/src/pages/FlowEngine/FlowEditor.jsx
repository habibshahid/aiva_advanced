/**
 * Flow Engine - Flow Editor
 * 
 * Create and edit conversation flows with:
 * - Basic info (name, description)
 * - Trigger examples
 * - Steps (collect, function, condition, message)
 * - Settings (KB search, context switch)
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  MessageSquare,
  Settings,
  Zap,
  GitMerge,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getFlow, createFlow, updateFlow } from '../../services/flowEngineApi';
import { getAgent, getFunctions } from '../../services/api';

// Step type configuration
const STEP_TYPES = {
  collect: {
    label: 'Collect Information',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'bg-blue-100 text-blue-700',
    description: 'Ask user for specific information'
  },
  function: {
    label: 'Execute Function',
    icon: <Zap className="w-4 h-4" />,
    color: 'bg-purple-100 text-purple-700',
    description: 'Call an API or function'
  },
  condition: {
    label: 'Condition Branch',
    icon: <GitMerge className="w-4 h-4" />,
    color: 'bg-yellow-100 text-yellow-700',
    description: 'Branch based on a value'
  },
  message: {
    label: 'Send Message',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'bg-green-100 text-green-700',
    description: 'Send a message to user'
  }
};

const FlowEditor = () => {
  const { agentId, flowId } = useParams();
  const navigate = useNavigate();
  const isNew = flowId === 'new';
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState(null);
  const [functions, setFunctions] = useState([]);
  const [expandedStep, setExpandedStep] = useState(null);
  
  // Flow state
  const [flow, setFlow] = useState({
    name: '',
    description: '',
    type: 'custom',
    is_active: true,
    config: {
      trigger_examples: [],
      steps: [],
      completion_message: '',
      allow_kb_search: true,
      allow_context_switch: true
    }
  });
  
  // Trigger input
  const [newTrigger, setNewTrigger] = useState('');
  
  // Load data
  useEffect(() => {
    loadData();
  }, [agentId, flowId]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load agent
      const agentRes = await getAgent(agentId);
      setAgent(agentRes.data.data || agentRes.data);
      
      // Load functions for this agent
      try {
        const funcRes = await getFunctions(agentId);
        // API returns { functions: [...] }
        const funcs = funcRes.data.functions || funcRes.data.data || funcRes.data || [];
        setFunctions(funcs);
        console.log('Loaded functions:', funcs);
      } catch (e) {
        console.log('No functions loaded:', e);
      }
      
      // Load flow if editing
      if (!isNew) {
        const flowRes = await getFlow(flowId);
        const flowData = flowRes.data.data;
        setFlow({
          ...flowData,
          config: flowData.config || {
            trigger_examples: [],
            steps: [],
            completion_message: '',
            allow_kb_search: true,
            allow_context_switch: true
          }
        });
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load flow');
      navigate(`/agents/${agentId}/flows`);
    } finally {
      setLoading(false);
    }
  };
  
  // Save flow
  const handleSave = async () => {
    if (!flow.name.trim()) {
      toast.error('Flow name is required');
      return;
    }
    
    if (!flow.description.trim()) {
      toast.error('Flow description is required');
      return;
    }
    
    try {
      setSaving(true);
      
      const flowData = {
        name: flow.name,
        description: flow.description,
        config: flow.config,
        is_active: flow.is_active
      };
      
      if (isNew) {
        await createFlow(agentId, flowData);
        toast.success('Flow created');
      } else {
        await updateFlow(flowId, flowData);
        toast.success('Flow saved');
      }
      
      navigate(`/agents/${agentId}/flows`);
      
    } catch (error) {
      console.error('Error saving flow:', error);
      toast.error(error.response?.data?.error || 'Failed to save flow');
    } finally {
      setSaving(false);
    }
  };
  
  // Add trigger
  const handleAddTrigger = () => {
    if (!newTrigger.trim()) return;
    
    setFlow(prev => ({
      ...prev,
      config: {
        ...prev.config,
        trigger_examples: [...prev.config.trigger_examples, newTrigger.trim()]
      }
    }));
    setNewTrigger('');
  };
  
  // Remove trigger
  const handleRemoveTrigger = (index) => {
    setFlow(prev => ({
      ...prev,
      config: {
        ...prev.config,
        trigger_examples: prev.config.trigger_examples.filter((_, i) => i !== index)
      }
    }));
  };
  
  // Add step
  const handleAddStep = (type) => {
    const newStep = {
      id: `step_${Date.now()}`,
      type,
      config: getDefaultStepConfig(type)
    };
    
    setFlow(prev => ({
      ...prev,
      config: {
        ...prev.config,
        steps: [...prev.config.steps, newStep]
      }
    }));
    
    setExpandedStep(newStep.id);
  };
  
  // Update step
  const handleUpdateStep = (stepId, updates) => {
    setFlow(prev => ({
      ...prev,
      config: {
        ...prev.config,
        steps: prev.config.steps.map(step =>
          step.id === stepId ? { ...step, ...updates } : step
        )
      }
    }));
  };
  
  // Remove step
  const handleRemoveStep = (stepId) => {
    setFlow(prev => ({
      ...prev,
      config: {
        ...prev.config,
        steps: prev.config.steps.filter(step => step.id !== stepId)
      }
    }));
  };
  
  // Move step
  const handleMoveStep = (index, direction) => {
    const steps = [...flow.config.steps];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= steps.length) return;
    
    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    
    setFlow(prev => ({
      ...prev,
      config: { ...prev.config, steps }
    }));
  };
  
  // Get default config for step type
  const getDefaultStepConfig = (type) => {
    switch (type) {
      case 'collect':
        return { param: '', prompt: '', param_type: 'string', patterns: [] };
      case 'function':
        return { function: '', params_map: {}, store_result_as: '' };
      case 'condition':
        return { check: '', branches: {} };
      case 'message':
        return { text: '' };
      default:
        return {};
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  const isSystemFlow = flow.type === 'system';
  const isIntegrationFlow = flow.type === 'integration';
  const canEditSteps = true; //!isSystemFlow;
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/agents/${agentId}/flows`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {isNew ? 'Create Flow' : 'Edit Flow'}
            </h1>
            <p className="text-gray-500">{agent?.name}</p>
          </div>
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Flow'}
        </button>
      </div>
      
      {/* System/Integration Warning */}
      {(isSystemFlow || isIntegrationFlow) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-800">
              {isSystemFlow ? 'System Flow' : 'Integration Flow'}
            </h3>
            <p className="text-blue-700 text-sm mt-1">
              {isSystemFlow
                ? 'You can customize trigger examples and settings, but not the core steps.'
                : 'This flow was created by an integration. You can customize triggers and settings.'}
            </p>
          </div>
        </div>
      )}
      
      {/* Basic Info */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Basic Information
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Flow Name *
            </label>
            <input
              type="text"
              value={flow.name}
              onChange={(e) => setFlow({ ...flow, name: e.target.value })}
              disabled={isSystemFlow}
              placeholder="e.g., Lead Capture, Appointment Booking"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              value={flow.description}
              onChange={(e) => setFlow({ ...flow, description: e.target.value })}
              disabled={isSystemFlow}
              placeholder="Describe what this flow does and when it should be triggered"
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-400 mt-1">
              This description is shown to the LLM to help it decide when to use this flow
            </p>
          </div>
        </div>
      </div>
      
      {/* Trigger Examples */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Trigger Examples
        </h2>
        <p className="text-gray-500 text-sm mb-4">
          Add example phrases that should trigger this flow. The LLM uses these to recognize user intent.
        </p>
        
        {/* Existing triggers */}
        <div className="flex flex-wrap gap-2 mb-4">
          {flow.config.trigger_examples.map((trigger, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
            >
              "{trigger}"
              <button
                onClick={() => handleRemoveTrigger(index)}
                className="hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {flow.config.trigger_examples.length === 0 && (
            <span className="text-gray-400 text-sm">No triggers added yet</span>
          )}
        </div>
        
        {/* Add trigger */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newTrigger}
            onChange={(e) => setNewTrigger(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTrigger()}
            placeholder="Type a trigger phrase and press Enter"
            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleAddTrigger}
            disabled={!newTrigger.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
      
      {/* Steps */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Flow Steps
        </h2>
        <p className="text-gray-500 text-sm mb-4">
          Define the steps this flow will execute. Steps run in order from top to bottom.
        </p>
        
        {/* Steps list */}
        <div className="space-y-3 mb-4">
          {flow.config.steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              isExpanded={expandedStep === step.id}
              onToggle={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
              onUpdate={(updates) => handleUpdateStep(step.id, updates)}
              onRemove={() => handleRemoveStep(step.id)}
              onMoveUp={() => handleMoveStep(index, 'up')}
              onMoveDown={() => handleMoveStep(index, 'down')}
              canMoveUp={index > 0}
              canMoveDown={index < flow.config.steps.length - 1}
              canEdit={canEditSteps}
              functions={functions}
              allSteps={flow.config.steps}
            />
          ))}
          
          {flow.config.steps.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No steps yet. Add steps to define the flow behavior.</p>
            </div>
          )}
        </div>
        
        {/* Add step buttons */}
        {canEditSteps && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(STEP_TYPES).map(([type, config]) => (
              <button
                key={type}
                onClick={() => handleAddStep(type)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border hover:shadow-sm transition-all ${config.color}`}
              >
                {config.icon}
                <span className="text-sm">{config.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Completion Message */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">Completion Message</h2>
        <p className="text-gray-500 text-sm mb-4">
          Optional message to send when the flow completes. Use {'{{param}}'} to include collected values.
        </p>
        
        <textarea
          value={flow.config.completion_message || ''}
          onChange={(e) => setFlow({
            ...flow,
            config: { ...flow.config, completion_message: e.target.value }
          })}
          placeholder="e.g., Thanks {{name}}! We'll contact you at {{phone}} shortly."
          rows={2}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      
      {/* Settings */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Settings</h2>
        
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={flow.config.allow_kb_search !== false}
              onChange={(e) => setFlow({
                ...flow,
                config: { ...flow.config, allow_kb_search: e.target.checked }
              })}
              className="w-4 h-4 text-blue-500 rounded"
            />
            <div>
              <span className="font-medium text-gray-700">Allow KB Search</span>
              <p className="text-sm text-gray-500">Allow searching knowledge base during this flow</p>
            </div>
          </label>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={flow.config.allow_context_switch !== false}
              onChange={(e) => setFlow({
                ...flow,
                config: { ...flow.config, allow_context_switch: e.target.checked }
              })}
              className="w-4 h-4 text-blue-500 rounded"
            />
            <div>
              <span className="font-medium text-gray-700">Allow Context Switch</span>
              <p className="text-sm text-gray-500">Allow user to switch to another flow mid-conversation</p>
            </div>
          </label>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={flow.is_active}
              onChange={(e) => setFlow({ ...flow, is_active: e.target.checked })}
              className="w-4 h-4 text-blue-500 rounded"
            />
            <div>
              <span className="font-medium text-gray-700">Active</span>
              <p className="text-sm text-gray-500">Enable this flow for use in conversations</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};

// Step Card Component
const StepCard = ({
  step,
  index,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  canEdit,
  functions,
  allSteps
}) => {
  const stepType = STEP_TYPES[step.type] || STEP_TYPES.message;
  
  return (
    <div className={`border rounded-lg overflow-hidden ${isExpanded ? 'border-blue-300' : ''}`}>
      {/* Header */}
      <div
        onClick={onToggle}
        className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
      >
        <div className="flex items-center gap-3">
          <GripVertical className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500 font-mono">#{index + 1}</span>
          <span className={`px-2 py-0.5 rounded text-xs ${stepType.color}`}>
            {stepType.label}
          </span>
          <span className="text-sm text-gray-600">{step.id}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                disabled={!canMoveUp}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                disabled={!canMoveDown}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t">
          <StepConfig
            step={step}
            onUpdate={onUpdate}
            canEdit={canEdit}
            functions={functions}
            allSteps={allSteps}
          />
        </div>
      )}
    </div>
  );
};

// Condition Step Configuration Component (separate for proper state handling)
const ConditionStepConfig = ({ config, updateConfig, canEdit, allSteps }) => {
  // Local state for branches to allow editing incomplete entries
  const [branches, setBranches] = React.useState(() => {
    const existing = config.branches || {};
    return Object.entries(existing).map(([value, stepId]) => ({ value, stepId }));
  });
  
  // Sync local state when config changes externally
  React.useEffect(() => {
    const existing = config.branches || {};
    const newBranches = Object.entries(existing).map(([value, stepId]) => ({ value, stepId }));
    // Only update if different to avoid loops
    if (JSON.stringify(newBranches) !== JSON.stringify(branches.filter(b => b.value))) {
      setBranches(newBranches.length > 0 ? newBranches : branches);
    }
  }, [config.branches]);
  
  // Save branches to config (only complete entries)
  const saveBranches = (newBranches) => {
    setBranches(newBranches);
    const branchesObj = {};
    newBranches.forEach(b => {
      if (b.value) { // Only require value, stepId can be empty initially
        branchesObj[b.value] = b.stepId || '';
      }
    });
    if (Object.keys(branchesObj).length > 0 || Object.keys(config.branches || {}).length > 0) {
      updateConfig('branches', branchesObj);
    }
  };
  
  const addBranch = () => {
    saveBranches([...branches, { value: '', stepId: '' }]);
  };
  
  const removeBranch = (index) => {
    saveBranches(branches.filter((_, i) => i !== index));
  };
  
  const updateBranch = (index, field, newValue) => {
    const newBranches = [...branches];
    newBranches[index] = { ...newBranches[index], [field]: newValue };
    saveBranches(newBranches);
  };
  
  const applyTemplate = (checkValue, templateBranches) => {
    updateConfig('check', checkValue);
    setBranches(templateBranches);
    const branchesObj = {};
    templateBranches.forEach(b => {
      branchesObj[b.value] = b.stepId;
    });
    updateConfig('branches', branchesObj);
  };
  
  // Available context variables
  const contextVariables = [
    { value: '{{channel}}', label: 'Channel Type', hint: 'whatsapp, public_chat, etc.' },
    { value: '{{customer_phone}}', label: 'Customer Phone' },
    { value: '{{customer_name}}', label: 'Customer Name' },
    { value: '{{customer_email}}', label: 'Customer Email' }
  ];
  
  // Get step IDs for dropdown
  const stepIds = allSteps?.map(s => s.id).filter(Boolean) || [];
  
  return (
    <div className="space-y-4">
      {/* Variable to Check */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Variable to Check
        </label>
        <select
          value={config.check || ''}
          onChange={(e) => updateConfig('check', e.target.value)}
          disabled={!canEdit}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Select a variable --</option>
          <optgroup label="Session Context">
            {contextVariables.map(v => (
              <option key={v.value} value={v.value}>
                {v.label} {v.hint ? `(${v.hint})` : ''}
              </option>
            ))}
          </optgroup>
          <optgroup label="Collected Parameters">
            {allSteps?.filter(s => s.type === 'collect' && s.config?.param).map(s => (
              <option key={s.config.param} value={`{{${s.config.param}}}`}>
                {s.config.param} (from step: {s.id})
              </option>
            ))}
          </optgroup>
        </select>
        
        {/* Custom input if not in list */}
        {config.check && !contextVariables.some(v => v.value === config.check) && 
         !allSteps?.some(s => s.config?.param && `{{${s.config.param}}}` === config.check) && (
          <input
            type="text"
            value={config.check}
            onChange={(e) => updateConfig('check', e.target.value)}
            disabled={!canEdit}
            placeholder="Custom: {{variable_name}}"
            className="mt-2 w-full px-3 py-2 border rounded-lg font-mono text-sm"
          />
        )}
      </div>
      
      {/* Branches */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Branch Rules
        </label>
        <p className="text-xs text-gray-500 mb-3">
          When the variable equals a value, go to the specified step
        </p>
        
        <div className="space-y-2">
          {branches.map((branch, index) => (
            <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
              <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
                {branch.value === 'default' ? 'Otherwise' : 'If value ='}
              </span>
              {branch.value !== 'default' ? (
                <input
                  type="text"
                  value={branch.value}
                  onChange={(e) => updateBranch(index, 'value', e.target.value)}
                  disabled={!canEdit}
                  placeholder="e.g., whatsapp"
                  className="w-32 px-2 py-1.5 border rounded text-sm font-mono"
                />
              ) : (
                <span className="w-32 px-2 py-1.5 text-sm text-gray-500 italic">
                  (fallback)
                </span>
              )}
              <span className="text-gray-400">→</span>
              <span className="text-sm text-gray-600">go to</span>
              <select
                value={branch.stepId}
                onChange={(e) => updateBranch(index, 'stepId', e.target.value)}
                disabled={!canEdit}
                className="flex-1 px-2 py-1.5 border rounded text-sm"
              >
                <option value="">-- Select Step --</option>
                {stepIds.map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removeBranch(index)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  title="Remove branch"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          
          {branches.length === 0 && (
            <p className="text-sm text-gray-400 italic py-4 text-center">
              No branches defined. Add branches or use a template below.
            </p>
          )}
        </div>
        
        {/* Add buttons */}
        {canEdit && (
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={addBranch}
              className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Add Branch
            </button>
            {!branches.some(b => b.value === 'default') && (
              <button
                type="button"
                onClick={() => saveBranches([...branches, { value: 'default', stepId: '' }])}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Add Fallback
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Quick Templates */}
      {canEdit && (
        <div className="pt-3 border-t">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quick Templates
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyTemplate('{{channel}}', [
                { value: 'whatsapp', stepId: '' },
                { value: 'public_chat', stepId: '' },
                { value: 'default', stepId: '' }
              ])}
              className="px-3 py-2 text-sm bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 border border-orange-200"
            >
              📱 Channel Routing
            </button>
            <button
              type="button"
              onClick={() => applyTemplate('{{customer_phone}}', [
                { value: 'default', stepId: '' }
              ])}
              className="px-3 py-2 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-200"
            >
              📞 Has Phone Check
            </button>
            <button
              type="button"
              onClick={() => applyTemplate('{{confirmation}}', [
                { value: 'yes', stepId: '' },
                { value: 'no', stepId: '' },
                { value: 'default', stepId: '' }
              ])}
              className="px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200"
            >
              ✅ Yes/No Confirmation
            </button>
          </div>
        </div>
      )}
      
      {/* LLM Instructions for Condition */}
      <div className="pt-3 border-t">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          LLM Instructions
          <span className="ml-2 text-xs font-normal text-gray-500">(Guide AI behavior for this decision)</span>
        </label>
        <textarea
          value={config.llm_instructions || ''}
          onChange={(e) => updateConfig('llm_instructions', e.target.value)}
          disabled={!canEdit}
          placeholder={`Example:\n\nEvaluating customer's confirmation response.\n\nBRANCH LOGIC:\n- "yes/haan/ok/theek hai" → proceed to create ticket\n- "no/nahi/cancel" → ask what they'd like to do instead\n- Unclear response → ask for clarification politely\n\nCOMMUNICATION:\n- Don't mention technical decision-making\n- Keep conversation natural`}
          rows={4}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
};

// Step Configuration Component
const StepConfig = ({ step, onUpdate, canEdit, functions, allSteps }) => {
  const config = step.config || {};
  
  const updateConfig = (key, value) => {
    onUpdate({ config: { ...config, [key]: value } });
  };
  
  switch (step.type) {
    case 'collect':
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parameter Name
            </label>
            <input
              type="text"
              value={config.param || ''}
              onChange={(e) => updateConfig('param', e.target.value)}
              disabled={!canEdit}
              placeholder="e.g., name, phone, order_identifier"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prompt
            </label>
            <textarea
              value={config.prompt || ''}
              onChange={(e) => updateConfig('prompt', e.target.value)}
              disabled={!canEdit}
              placeholder="Example: Please share your Order ID or phone number (AI will respond in customer's language)"
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              This is an example prompt. AI will adapt the language based on customer's message.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parameter Type
            </label>
            <select
              value={config.param_type || 'string'}
              onChange={(e) => updateConfig('param_type', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="string">Text</option>
              <option value="number">Number</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="order_id">Order ID</option>
              <option value="image[]">Images</option>
            </select>
          </div>
          
          {/* Accept Image Input Option - show for non-image types */}
          {config.param_type !== 'image[]' && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <input
                type="checkbox"
                id="accept_image_input"
                checked={config.accept_image_input || false}
                onChange={(e) => updateConfig('accept_image_input', e.target.checked)}
                disabled={!canEdit}
                className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <label htmlFor="accept_image_input" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Also accept from image (AI Vision)
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Allow user to provide this info via screenshot/image. AI will analyze the image to extract {config.param || 'the value'}.
                  <br />
                  <span className="text-blue-600">Example: Order number from receipt photo, phone from contact screenshot</span>
                </p>
              </div>
            </div>
          )}
          
          {/* Image Analysis Hints - show when accept_image_input is enabled */}
          {config.accept_image_input && config.param_type !== 'image[]' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image Analysis Hints
                <span className="ml-2 text-xs font-normal text-gray-500">(Help AI find the value in images)</span>
              </label>
              <textarea
                value={config.image_extraction_hints || ''}
                onChange={(e) => updateConfig('image_extraction_hints', e.target.value)}
                disabled={!canEdit}
                placeholder={`Example for order_identifier:\n\nLook for:\n- Order number (CZ-XXXXX, #XXXXX, 5-7 digits)\n- Phone number starting with 03 or +92\n- Email address\n\nCommon sources:\n- Order confirmation screenshots\n- Receipt images\n- Tracking page screenshots\n- WhatsApp order messages`}
                rows={4}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          
          {/* Save Unrelated Images Option */}
          {config.param_type !== 'image[]' && (
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border">
              <input
                type="checkbox"
                id="save_unrelated_images"
                checked={config.save_unrelated_images !== false}
                onChange={(e) => updateConfig('save_unrelated_images', e.target.checked)}
                disabled={!canEdit}
                className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <label htmlFor="save_unrelated_images" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Save unrelated images for later
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  If user sends images that don't contain {config.param || 'the requested value'} (e.g., damage photos), save them for a later step.
                </p>
              </div>
            </div>
          )}
          
          {/* LLM Instructions - Required */}
          <div className="pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LLM Instructions <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-gray-500">(Guide AI behavior for this step)</span>
            </label>
            <textarea
              value={config.llm_instructions || ''}
              onChange={(e) => updateConfig('llm_instructions', e.target.value)}
              disabled={!canEdit}
              placeholder={`Example for order_identifier:\n\nCollect the customer's order identifier to look up their order.\n\nACCEPTABLE FORMATS:\n- Order number: CZ-247020 or just 247020\n- Phone: Pakistani format (03xx or +92)\n- Email: any valid email\n\nBEHAVIOR:\n- If customer sends image of receipt: extract order number from it\n- If customer sends damage photos: acknowledge, save for later, but still ask for order details\n- If customer is frustrated: be extra empathetic\n\nLANGUAGE: Match customer's language (English/Urdu/Roman Urdu)`}
              rows={6}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Detailed instructions for AI on how to collect this data, handle edge cases, and respond appropriately.
            </p>
          </div>
          
          {/* Validation Rules */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Validation Rules
              <span className="ml-2 text-xs font-normal text-gray-500">(Optional - Define what's valid input)</span>
            </label>
            <textarea
              value={config.validation_rules || ''}
              onChange={(e) => updateConfig('validation_rules', e.target.value)}
              disabled={!canEdit}
              placeholder={`Example:\n\nACCEPTED FORMATS:\n- Order number: CZ-XXXXX or 5-7 digits\n- Phone: 03xxxxxxxxx or +92xxxxxxxxxx\n- Email: valid email format\n\nEXAMPLES: CZ-247020, 03001234567, customer@email.com\n\nREJECT IF:\n- Only greetings (hi, hello)\n- Only emojis\n- Unrelated questions`}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Error Messages */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Error Messages
              <span className="ml-2 text-xs font-normal text-gray-500">(Optional - Pre-defined error responses)</span>
            </label>
            <textarea
              value={config.error_messages || ''}
              onChange={(e) => updateConfig('error_messages', e.target.value)}
              disabled={!canEdit}
              placeholder={`Example:\n\nINVALID_FORMAT: "I couldn't recognize that. Order numbers look like CZ-247020. Please try again."\n\nNOT_FOUND: "I couldn't find an order with that info. Try with phone or email?"\n\nEMPTY_RESPONSE: "Please share your order number, phone, or email to continue."\n\nMAX_RETRIES: "I'm having trouble finding your order. Let me connect you with an agent."`}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Next Step */}
          <div className="pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              After Collecting → Go To
            </label>
            <select
              value={config.next_step || ''}
              onChange={(e) => updateConfig('next_step', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Next step in sequence</option>
              {allSteps?.filter(s => s.id !== step.id).map(s => (
                <option key={s.id} value={s.id}>
                  {s.id} ({STEP_TYPES[s.type]?.label || s.type})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Where to go after collecting this parameter. Leave empty for sequential flow.
            </p>
          </div>
        </div>
      );
      
    case 'function':
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Function
            </label>
            <select
              value={config.function || ''}
              onChange={(e) => updateConfig('function', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a function...</option>
              <optgroup label="Built-in Functions">
                <option value="search_knowledge">Search Knowledge Base</option>
                <option value="search_products">Search Products</option>
                <option value="check_order_status">Check Order Status</option>
                <option value="transfer_to_agent">Transfer to Agent</option>
              </optgroup>
              {functions.length > 0 && (
                <optgroup label="Custom Functions">
                  {functions.map(func => (
                    <option key={func.id} value={func.name}>{func.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Store Result As
            </label>
            <input
              type="text"
              value={config.store_result_as || ''}
              onChange={(e) => updateConfig('store_result_as', e.target.value)}
              disabled={!canEdit}
              placeholder="e.g., order_details, product_results"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Variable name to store the function result (use in later steps as {'{{variable_name}}'})
            </p>
          </div>
          
          {/* LLM Instructions - Required */}
          <div className="pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LLM Instructions <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-gray-500">(Guide AI behavior for this step)</span>
            </label>
            <textarea
              value={config.llm_instructions || ''}
              onChange={(e) => updateConfig('llm_instructions', e.target.value)}
              disabled={!canEdit}
              placeholder={`Example for check_order_status:\n\nExecuting order lookup with collected identifier.\n\nON SUCCESS:\n- Share order status in friendly way\n- Include: order date, current status, tracking link\n- If delayed, apologize and explain\n\nON FAILURE:\n- If order not found: ask customer to verify order details\n- If multiple orders: list them and ask which one\n\nTONE: Helpful and reassuring`}
              rows={6}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Instructions for AI on how to execute this function and respond with results.
            </p>
          </div>
          
          {/* Response Instructions (legacy - keep for compatibility) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Response Instructions
              <span className="ml-2 text-xs font-normal text-gray-500">(How to format the result)</span>
            </label>
            <textarea
              value={config.response_instructions || ''}
              onChange={(e) => updateConfig('response_instructions', e.target.value)}
              disabled={!canEdit}
              placeholder={`Example for order status:\n\nShare order details in a friendly way:\n- Order number and date\n- Current status\n- Tracking link if shipped\n- Expected delivery\n\nRespond in the customer's language.`}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Error Messages */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Error Messages
              <span className="ml-2 text-xs font-normal text-gray-500">(Optional - Pre-defined error responses)</span>
            </label>
            <textarea
              value={config.error_messages || ''}
              onChange={(e) => updateConfig('error_messages', e.target.value)}
              disabled={!canEdit}
              placeholder={`Example:\n\nAPI_TIMEOUT: "Please wait a moment, I'm looking up your order..."\n\nAPI_ERROR: "I'm having trouble accessing the system. Let me connect you with an agent."\n\nNOT_FOUND: "I couldn't find an order with those details. Would you like to try again?"\n\nMULTIPLE_RESULTS: "I found multiple orders. Could you confirm which one?"`}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Auto-respond toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto_respond"
              checked={config.auto_respond !== false}
              onChange={(e) => updateConfig('auto_respond', e.target.checked)}
              disabled={!canEdit}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="auto_respond" className="text-sm text-gray-700">
              Auto-respond with result
            </label>
            <span className="text-xs text-gray-500">
              (AI will generate a response using the function result)
            </span>
          </div>
          
          {/* Next Step */}
          <div className="pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              After Function → Go To
            </label>
            <select
              value={config.next_step || ''}
              onChange={(e) => updateConfig('next_step', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Next step in sequence (or end flow)</option>
              {allSteps?.filter(s => s.id !== step.id).map(s => (
                <option key={s.id} value={s.id}>
                  {s.id} ({STEP_TYPES[s.type]?.label || s.type})
                </option>
              ))}
            </select>
          </div>
        </div>
      );
      
    case 'condition':
      return (
        <ConditionStepConfig 
          config={config}
          updateConfig={updateConfig}
          canEdit={canEdit}
          allSteps={allSteps}
        />
      );
      
    case 'message':
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message Text
            </label>
            <textarea
              value={config.text || ''}
              onChange={(e) => updateConfig('text', e.target.value)}
              disabled={!canEdit}
              placeholder="Message to send. Use {{param}} for variables."
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* LLM Instructions for Message */}
          <div className="pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LLM Instructions
              <span className="ml-2 text-xs font-normal text-gray-500">(Optional - How AI should deliver this message)</span>
            </label>
            <textarea
              value={config.llm_instructions || ''}
              onChange={(e) => updateConfig('llm_instructions', e.target.value)}
              disabled={!canEdit}
              placeholder={`Example:\n\nDelivering confirmation message to customer.\n\nTONE: Warm and reassuring\nLANGUAGE: Match customer's language\n\nINCLUDE:\n- Ticket/reference number\n- Expected response time\n- How to follow up if needed`}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      );
      
    default:
      return (
        <pre className="text-xs text-gray-600 bg-gray-100 p-3 rounded">
          {JSON.stringify(config, null, 2)}
        </pre>
      );
  }
};

export default FlowEditor;
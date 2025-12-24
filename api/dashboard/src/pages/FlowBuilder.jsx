/**
 * Flow Builder Page
 * Create and edit conversation flows with visual step management
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Save, Plus, Trash2, Edit2, GripVertical,
  ChevronDown, ChevronUp, Play, CheckCircle, XCircle,
  MessageSquare, Phone, Zap, GitBranch, HelpCircle,
  Loader2, AlertCircle, Volume2, Copy, Settings
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAgent } from '../services/api';
import * as flowApi from '../services/flowApi';
import { getFunctions } from '../services/api';

// Step type configuration
const STEP_TYPES = [
  { value: 'collect_slot', label: 'Collect Information', icon: MessageSquare, color: 'blue' },
  { value: 'confirm', label: 'Confirm Value', icon: CheckCircle, color: 'green' },
  { value: 'respond', label: 'Speak Message', icon: Volume2, color: 'purple' },
  { value: 'branch', label: 'Branch/Condition', icon: GitBranch, color: 'orange' },
  { value: 'function', label: 'Call Function', icon: Zap, color: 'yellow' },
  { value: 'transfer', label: 'Transfer Call', icon: Phone, color: 'red' }
];

const SLOT_TYPES = [
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'alphanumeric', label: 'Alphanumeric (Invoice/Order)' },
  { value: 'address', label: 'Address' },
  { value: 'city', label: 'City' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'yes_no', label: 'Yes/No' },
  { value: 'choice', label: 'Multiple Choice' },
  { value: 'freeform', label: 'Free Text' }
];

const COMPLETION_ACTIONS = [
  { value: 'function_call', label: 'Call Function' },
  { value: 'transfer', label: 'Transfer Call' },
  { value: 'respond', label: 'Speak & End' },
  { value: 'end_call', label: 'End Call' }
];

const FlowBuilder = () => {
  const { id: agentId, flowId } = useParams();
  const navigate = useNavigate();
  const isNew = flowId === 'new';
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState(null);
  const [functions, setFunctions] = useState([]);
  
  // Flow state
  const [flow, setFlow] = useState({
    flow_name: '',
    flow_key: '',
    description: '',
    trigger_phrases: [''],
    intro_text: '',
    on_complete_action: 'respond',
    on_complete_function_name: '',
    on_complete_function_id: '',
    on_complete_args_mapping: {},
    on_complete_response_text: '',
    on_complete_transfer_queue: '',
    send_whatsapp_on_complete: false,
    whatsapp_template_name: '',
    cancel_phrases: ['cancel', 'never mind'],
    ask_anything_else: true,
    anything_else_text: 'Is there anything else I can help you with?',
    closing_text: 'Thank you for calling. Goodbye!',
    step_timeout_seconds: 30,
    max_retries_per_step: 3,
    is_active: true
  });
  
  const [steps, setSteps] = useState([]);
  const [activeTab, setActiveTab] = useState('steps');
  const [editingStep, setEditingStep] = useState(null);
  const [showStepModal, setShowStepModal] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState({});
  const [draggedStep, setDraggedStep] = useState(null);

  useEffect(() => {
    loadData();
  }, [agentId, flowId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [agentRes, functionsRes] = await Promise.all([
        getAgent(agentId),
        getFunctions(agentId)
      ]);
      
      setAgent(agentRes.data.agent);
      setFunctions(functionsRes.data.data || []);
      
      if (!isNew) {
        const flowRes = await flowApi.getFlow(agentId, flowId);
        const flowData = flowRes.data.data;
        
        setFlow({
          ...flow,
          ...flowData,
          trigger_phrases: flowData.trigger_phrases?.length ? flowData.trigger_phrases : [''],
          cancel_phrases: flowData.cancel_phrases?.length ? flowData.cancel_phrases : ['cancel']
        });
        setSteps(flowData.steps || []);
      }
    } catch (error) {
      console.error('Failed to load flow:', error);
      toast.error('Failed to load flow');
    } finally {
      setLoading(false);
    }
  };

  const handleFlowChange = (field, value) => {
    setFlow(prev => ({ ...prev, [field]: value }));
    
    // Auto-generate flow_key from name
    if (field === 'flow_name' && isNew) {
      const key = flowApi.generateFlowKey(value);
      setFlow(prev => ({ ...prev, flow_key: key }));
    }
  };

  const handleSave = async () => {
    // Validation
    if (!flow.flow_name.trim()) {
      toast.error('Flow name is required');
      return;
    }
    if (!flow.flow_key.trim()) {
      toast.error('Flow key is required');
      return;
    }
    
    try {
      setSaving(true);
      
      // Clean up empty trigger phrases
      const cleanFlow = {
        ...flow,
        trigger_phrases: flow.trigger_phrases.filter(p => p.trim()),
        cancel_phrases: flow.cancel_phrases.filter(p => p.trim())
      };
      
      let savedFlowId = flowId;
      
      if (isNew) {
        const response = await flowApi.createFlow(agentId, cleanFlow);
        savedFlowId = response.data.data.id;
        toast.success('Flow created successfully');
        navigate(`/agents/${agentId}/flows/${savedFlowId}`, { replace: true });
      } else {
        await flowApi.updateFlow(agentId, flowId, cleanFlow);
        toast.success('Flow saved successfully');
      }
      
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.response?.data?.error || 'Failed to save flow');
    } finally {
      setSaving(false);
    }
  };

  const handleAddStep = () => {
    setEditingStep(null);
    setShowStepModal(true);
  };

  const handleEditStep = (step) => {
    setEditingStep(step);
    setShowStepModal(true);
  };

  const handleSaveStep = async (stepData) => {
    try {
      if (editingStep) {
        await flowApi.updateStep(agentId, flowId, editingStep.id, stepData);
        toast.success('Step updated');
      } else {
        await flowApi.createStep(agentId, flowId, stepData);
        toast.success('Step added');
      }
      
      // Reload steps
      const flowRes = await flowApi.getFlow(agentId, flowId);
      setSteps(flowRes.data.data.steps || []);
      setShowStepModal(false);
      
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save step');
    }
  };

  const handleDeleteStep = async (stepId) => {
    if (!window.confirm('Delete this step?')) return;
    
    try {
      await flowApi.deleteStep(agentId, flowId, stepId);
      setSteps(steps.filter(s => s.id !== stepId));
      toast.success('Step deleted');
    } catch (error) {
      toast.error('Failed to delete step');
    }
  };

  const handleReorderSteps = async (newOrder) => {
    const stepIds = newOrder.map(s => s.id);
    try {
      await flowApi.reorderSteps(agentId, flowId, stepIds);
      setSteps(newOrder);
    } catch (error) {
      toast.error('Failed to reorder steps');
      loadData();
    }
  };

  const toggleStepExpanded = (stepId) => {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedStep(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedStep === null || draggedStep === index) return;
    
    const newSteps = [...steps];
    const [draggedItem] = newSteps.splice(draggedStep, 1);
    newSteps.splice(index, 0, draggedItem);
    
    setSteps(newSteps);
    setDraggedStep(index);
  };

  const handleDragEnd = () => {
    if (draggedStep !== null) {
      handleReorderSteps(steps);
    }
    setDraggedStep(null);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(`/agents/${agentId}/flows`)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? 'Create Flow' : 'Edit Flow'}
            </h1>
            <p className="text-sm text-gray-500">{agent?.name}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isNew ? 'Create Flow' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'steps', label: 'Steps', icon: GitBranch },
            { id: 'settings', label: 'Flow Settings', icon: Settings },
            { id: 'completion', label: 'On Complete', icon: CheckCircle }
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
      <div className="bg-white rounded-lg shadow">
        {activeTab === 'steps' && (
          <StepsTab
            flowId={flowId}
            isNew={isNew}
            steps={steps}
            expandedSteps={expandedSteps}
            onAddStep={handleAddStep}
            onEditStep={handleEditStep}
            onDeleteStep={handleDeleteStep}
            onToggleExpanded={toggleStepExpanded}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            draggedStep={draggedStep}
          />
        )}
        
        {activeTab === 'settings' && (
          <SettingsTab
            flow={flow}
            onChange={handleFlowChange}
          />
        )}
        
        {activeTab === 'completion' && (
          <CompletionTab
            flow={flow}
            functions={functions}
            steps={steps}
            onChange={handleFlowChange}
          />
        )}
      </div>

      {/* Step Modal */}
      {showStepModal && (
        <StepModal
          step={editingStep}
          steps={steps}
          onSave={handleSaveStep}
          onClose={() => setShowStepModal(false)}
        />
      )}
    </div>
  );
};

// =============================================================================
// STEPS TAB
// =============================================================================

const StepsTab = ({ 
  flowId, isNew, steps, expandedSteps, 
  onAddStep, onEditStep, onDeleteStep, onToggleExpanded,
  onDragStart, onDragOver, onDragEnd, draggedStep
}) => {
  if (isNew) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Save flow first</h3>
        <p className="text-gray-500">
          Please save the flow before adding steps.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">Flow Steps</h2>
        <button
          onClick={onAddStep}
          className="inline-flex items-center px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Step
        </button>
      </div>

      {steps.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No steps yet. Add your first step to get started.</p>
          <button
            onClick={onAddStep}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add First Step
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              isExpanded={expandedSteps[step.id]}
              onEdit={() => onEditStep(step)}
              onDelete={() => onDeleteStep(step.id)}
              onToggle={() => onToggleExpanded(step.id)}
              onDragStart={(e) => onDragStart(e, index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDragEnd={onDragEnd}
              isDragging={draggedStep === index}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Step Card Component
const StepCard = ({ 
  step, index, isExpanded, 
  onEdit, onDelete, onToggle,
  onDragStart, onDragOver, onDragEnd, isDragging 
}) => {
  const stepType = STEP_TYPES.find(t => t.value === step.step_type) || STEP_TYPES[0];
  const StepIcon = stepType.icon;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`border rounded-lg transition-all ${
        isDragging ? 'opacity-50 border-primary-400' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Step Header */}
      <div className="flex items-center p-4">
        <div className="cursor-grab mr-3 text-gray-400 hover:text-gray-600">
          <GripVertical className="w-5 h-5" />
        </div>
        
        <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full mr-3 text-sm font-medium text-gray-600">
          {index + 1}
        </div>
        
        <div className={`p-2 rounded-lg mr-3 bg-${stepType.color}-100`}>
          <StepIcon className={`w-4 h-4 text-${stepType.color}-600`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-gray-900">{step.step_name || step.step_key}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full bg-${stepType.color}-100 text-${stepType.color}-700`}>
              {stepType.label}
            </span>
            {step.requires_confirmation && (
              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                Confirms
              </span>
            )}
            {step.is_terminal && (
              <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                Terminal
              </span>
            )}
          </div>
          {step.slot_name && (
            <p className="text-sm text-gray-500 mt-0.5">
              Collects: <span className="font-mono text-primary-600">{step.slot_name}</span>
              <span className="text-gray-400 ml-2">({step.slot_type})</span>
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={onEdit}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Edit step"
          >
            <Edit2 className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-50 rounded-lg"
            title="Delete step"
          >
            <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
          </button>
          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4 ml-14">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-gray-500">Prompt</label>
              <p className="text-gray-900 mt-1">{step.prompt_text || '-'}</p>
            </div>
            {step.requires_confirmation && (
              <div>
                <label className="text-gray-500">Confirm Template</label>
                <p className="text-gray-900 mt-1">{step.confirm_template || '-'}</p>
              </div>
            )}
            {step.on_invalid_text && (
              <div>
                <label className="text-gray-500">On Invalid</label>
                <p className="text-gray-900 mt-1">{step.on_invalid_text}</p>
              </div>
            )}
            {step.next_step_key && (
              <div>
                <label className="text-gray-500">Next Step</label>
                <p className="text-gray-900 mt-1 font-mono">{step.next_step_key}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// SETTINGS TAB
// =============================================================================

const SettingsTab = ({ flow, onChange }) => {
  const addTriggerPhrase = () => {
    onChange('trigger_phrases', [...flow.trigger_phrases, '']);
  };

  const updateTriggerPhrase = (index, value) => {
    const updated = [...flow.trigger_phrases];
    updated[index] = value;
    onChange('trigger_phrases', updated);
  };

  const removeTriggerPhrase = (index) => {
    onChange('trigger_phrases', flow.trigger_phrases.filter((_, i) => i !== index));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Flow Name *
          </label>
          <input
            type="text"
            value={flow.flow_name}
            onChange={(e) => onChange('flow_name', e.target.value)}
            placeholder="e.g., AC Installation Request"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Flow Key *
          </label>
          <input
            type="text"
            value={flow.flow_key}
            onChange={(e) => onChange('flow_key', e.target.value)}
            placeholder="e.g., ac_installation"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">Unique identifier, lowercase with underscores</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={flow.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          rows={2}
          placeholder="What does this flow do?"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Introduction Message
        </label>
        <textarea
          value={flow.intro_text || ''}
          onChange={(e) => onChange('intro_text', e.target.value)}
          rows={2}
          placeholder="e.g., Sure, I'll help you with your AC installation request."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="text-xs text-gray-500 mt-1">Spoken when the flow starts</p>
      </div>

      {/* Trigger Phrases */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Trigger Phrases
        </label>
        <p className="text-xs text-gray-500 mb-2">Phrases that start this flow when caller says them</p>
        <div className="space-y-2">
          {flow.trigger_phrases.map((phrase, index) => (
            <div key={index} className="flex items-center space-x-2">
              <input
                type="text"
                value={phrase}
                onChange={(e) => updateTriggerPhrase(index, e.target.value)}
                placeholder="e.g., AC installation"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                onClick={() => removeTriggerPhrase(index)}
                disabled={flow.trigger_phrases.length === 1}
                className="p-2 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          ))}
          <button
            onClick={addTriggerPhrase}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            + Add phrase
          </button>
        </div>
      </div>

      {/* Timeouts */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Step Timeout (seconds)
          </label>
          <input
            type="number"
            value={flow.step_timeout_seconds}
            onChange={(e) => onChange('step_timeout_seconds', parseInt(e.target.value))}
            min={5}
            max={120}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Retries Per Step
          </label>
          <input
            type="number"
            value={flow.max_retries_per_step}
            onChange={(e) => onChange('max_retries_per_step', parseInt(e.target.value))}
            min={1}
            max={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <h4 className="font-medium text-gray-900">Flow Active</h4>
          <p className="text-sm text-gray-500">When disabled, this flow will not be triggered</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={flow.is_active}
            onChange={(e) => onChange('is_active', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
        </label>
      </div>
    </div>
  );
};

// =============================================================================
// COMPLETION TAB
// =============================================================================

const CompletionTab = ({ flow, functions, steps, onChange }) => {
  const slotNames = steps
    .filter(s => s.slot_name)
    .map(s => s.slot_name);

  return (
    <div className="p-6 space-y-6">
      {/* Completion Action */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          When Flow Completes
        </label>
        <div className="grid grid-cols-2 gap-4">
          {COMPLETION_ACTIONS.map(action => (
            <label
              key={action.value}
              className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                flow.on_complete_action === action.value
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="on_complete_action"
                value={action.value}
                checked={flow.on_complete_action === action.value}
                onChange={(e) => onChange('on_complete_action', e.target.value)}
                className="sr-only"
              />
              <span className="font-medium text-gray-900">{action.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Function Call Config */}
      {flow.on_complete_action === 'function_call' && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Function to Call
            </label>
            <select
              value={flow.on_complete_function_id || ''}
              onChange={(e) => {
                const func = functions.find(f => f.id === e.target.value);
                onChange('on_complete_function_id', e.target.value);
                onChange('on_complete_function_name', func?.name || '');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select a function...</option>
              {functions.map(func => (
                <option key={func.id} value={func.id}>{func.name}</option>
              ))}
            </select>
          </div>

          {slotNames.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Available Slots
              </label>
              <div className="flex flex-wrap gap-2">
                {slotNames.map(slot => (
                  <code key={slot} className="px-2 py-1 bg-white border rounded text-sm">
                    {`{{${slot}}}`}
                  </code>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Use these in your function arguments mapping</p>
            </div>
          )}
        </div>
      )}

      {/* Transfer Config */}
      {flow.on_complete_action === 'transfer' && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Transfer Queue
          </label>
          <input
            type="text"
            value={flow.on_complete_transfer_queue || ''}
            onChange={(e) => onChange('on_complete_transfer_queue', e.target.value)}
            placeholder="e.g., support, sales"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      )}

      {/* Response Text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Completion Message
        </label>
        <textarea
          value={flow.on_complete_response_text || ''}
          onChange={(e) => onChange('on_complete_response_text', e.target.value)}
          rows={3}
          placeholder="e.g., Mr. {{customer_name}}, your request ID is {{result.request_id}}"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          Use {`{{slot_name}}`} for collected values, {`{{result.field}}`} for function result
        </p>
      </div>

      {/* WhatsApp */}
      <div className="p-4 bg-gray-50 rounded-lg space-y-4">
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={flow.send_whatsapp_on_complete}
            onChange={(e) => onChange('send_whatsapp_on_complete', e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="font-medium text-gray-900">Send WhatsApp on completion</span>
        </label>

        {flow.send_whatsapp_on_complete && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              WhatsApp Template Name
            </label>
            <input
              type="text"
              value={flow.whatsapp_template_name || ''}
              onChange={(e) => onChange('whatsapp_template_name', e.target.value)}
              placeholder="e.g., installation_confirmation"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        )}
      </div>

      {/* After Completion */}
      <div className="space-y-4">
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={flow.ask_anything_else}
            onChange={(e) => onChange('ask_anything_else', e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="font-medium text-gray-900">Ask "Anything else?"</span>
        </label>

        {flow.ask_anything_else && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              "Anything Else" Message
            </label>
            <input
              type="text"
              value={flow.anything_else_text || ''}
              onChange={(e) => onChange('anything_else_text', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Closing Message
          </label>
          <input
            type="text"
            value={flow.closing_text || ''}
            onChange={(e) => onChange('closing_text', e.target.value)}
            placeholder="e.g., Thank you for calling. Goodbye!"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// STEP MODAL
// =============================================================================

const StepModal = ({ step, steps, onSave, onClose }) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    step_key: '',
    step_name: '',
    step_type: 'collect_slot',
    prompt_text: '',
    slot_name: '',
    slot_type: 'freeform',
    is_required: true,
    requires_confirmation: false,
    confirm_template: '',
    on_invalid_text: '',
    retry_limit: 3,
    next_step_key: '',
    is_terminal: false,
    skip_if_slot_filled: '',
    ...step
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    
    // Auto-generate step_key
    if (field === 'step_name' && !step) {
      const key = flowApi.generateStepKey(value);
      setForm(prev => ({ ...prev, step_key: key }));
    }
    
    // Auto-set slot_name from step_key
    if (field === 'step_key' && form.step_type === 'collect_slot' && !form.slot_name) {
      setForm(prev => ({ ...prev, slot_name: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.step_key.trim()) {
      toast.error('Step key is required');
      return;
    }
    if (!form.prompt_text.trim()) {
      toast.error('Prompt text is required');
      return;
    }
    
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const existingStepKeys = steps
    .filter(s => s.id !== step?.id)
    .map(s => s.step_key);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {step ? 'Edit Step' : 'Add Step'}
              </h3>
            </div>

            <div className="bg-white px-6 py-4 max-h-[60vh] overflow-y-auto space-y-4">
              {/* Step Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Step Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {STEP_TYPES.map(type => (
                    <label
                      key={type.value}
                      className={`flex items-center p-3 border-2 rounded-lg cursor-pointer ${
                        form.step_type === type.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="step_type"
                        value={type.value}
                        checked={form.step_type === type.value}
                        onChange={(e) => handleChange('step_type', e.target.value)}
                        className="sr-only"
                      />
                      <type.icon className={`w-4 h-4 mr-2 text-${type.color}-600`} />
                      <span className="text-sm font-medium">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Step Name
                  </label>
                  <input
                    type="text"
                    value={form.step_name}
                    onChange={(e) => handleChange('step_name', e.target.value)}
                    placeholder="e.g., Ask Customer Name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Step Key *
                  </label>
                  <input
                    type="text"
                    value={form.step_key}
                    onChange={(e) => handleChange('step_key', e.target.value)}
                    placeholder="e.g., ask_name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono"
                  />
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prompt Text *
                </label>
                <textarea
                  value={form.prompt_text}
                  onChange={(e) => handleChange('prompt_text', e.target.value)}
                  rows={2}
                  placeholder="What the agent will say..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {`{{slot_name}}`} to include collected values
                </p>
              </div>

              {/* Slot Config (for collect_slot) */}
              {form.step_type === 'collect_slot' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Slot Name *
                      </label>
                      <input
                        type="text"
                        value={form.slot_name}
                        onChange={(e) => handleChange('slot_name', e.target.value)}
                        placeholder="e.g., customer_name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Slot Type
                      </label>
                      <select
                        value={form.slot_type}
                        onChange={(e) => handleChange('slot_type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        {SLOT_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={form.is_required}
                        onChange={(e) => handleChange('is_required', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">Required</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={form.requires_confirmation}
                        onChange={(e) => handleChange('requires_confirmation', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">Requires Confirmation</span>
                    </label>
                  </div>

                  {form.requires_confirmation && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirmation Template
                      </label>
                      <input
                        type="text"
                        value={form.confirm_template}
                        onChange={(e) => handleChange('confirm_template', e.target.value)}
                        placeholder={`e.g., The invoice number is {{${form.slot_name || 'value'}}}. Is that correct?`}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      On Invalid Message
                    </label>
                    <input
                      type="text"
                      value={form.on_invalid_text}
                      onChange={(e) => handleChange('on_invalid_text', e.target.value)}
                      placeholder="Message when input is invalid..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </>
              )}

              {/* Navigation */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Next Step Key
                  </label>
                  <select
                    value={form.next_step_key || ''}
                    onChange={(e) => handleChange('next_step_key', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Auto (next in order)</option>
                    {existingStepKeys.map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Skip If Slot Filled
                  </label>
                  <input
                    type="text"
                    value={form.skip_if_slot_filled || ''}
                    onChange={(e) => handleChange('skip_if_slot_filled', e.target.value)}
                    placeholder="Slot name..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={form.is_terminal}
                  onChange={(e) => handleChange('is_terminal', e.target.checked)}
                  className="rounded border-gray-300 text-primary-600"
                />
                <span className="text-sm text-gray-700">Terminal Step (ends flow, triggers completion)</span>
              </label>
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {step ? 'Update Step' : 'Add Step'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FlowBuilder;

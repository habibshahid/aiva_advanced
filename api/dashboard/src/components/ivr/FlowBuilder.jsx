/**
 * Flow Builder Component
 * Visual flow builder with step management, audio, and multi-language support
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Save, Plus, Trash2, Edit2, Play, Pause, GripVertical,
    ChevronDown, ChevronUp, Settings, Zap, Phone, MessageSquare,
    GitBranch, Volume2, CheckCircle, AlertCircle, Loader2, X,
    Globe, Mic, Upload, Music, Copy
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import toast from 'react-hot-toast';
import * as ivrApi from '../../services/ivrApi';
import { getFunctions } from '../../services/api';
import { MultiLangAudioTextInput } from './multilang';

const defaultFlowState = {
    flow_name: '',
    flow_key: '',
    description: '',
    trigger_phrases: [],
    // Intro
    intro_text: '',
    intro_audio_id: null,
    // Completion
    on_complete_action: 'respond',
    on_complete_response_text: '',
    on_complete_audio_id: null,
    // Cancel (NEW)
    on_cancel_response_text: '',
    on_cancel_audio_id: null,
    // Timeout (NEW)
    on_timeout_text: '',
    on_timeout_audio_id: null,
    on_timeout_action: 'retry',
    // Error (NEW)
    on_error_text: '',
    on_error_audio_id: null,
    // Anything else & Closing
    ask_anything_else: true,
    anything_else_text: 'Is there anything else I can help you with?',
    anything_else_audio_id: null,
    closing_text: 'Thank you for calling. Goodbye!',
    closing_audio_id: null,
    // Settings
    step_timeout_seconds: 30,
    max_retries_per_step: 3,
    is_active: true
};

const FlowBuilder = () => {
    const { agentId, flowId } = useParams();
    const navigate = useNavigate();
    
    const [flow, setFlow] = useState(null);
    const [steps, setSteps] = useState([]);
    const [functions, setFunctions] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [audioFiles, setAudioFiles] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('steps');
    const [expandedStep, setExpandedStep] = useState(null);
    const [showStepModal, setShowStepModal] = useState(false);
    const [editingStep, setEditingStep] = useState(null);
    const [activeLang, setActiveLang] = useState('en');
    
    const isNew = !flowId || flowId === 'new';
    
    useEffect(() => {
        loadData();
    }, [agentId, flowId]);
    
    const loadData = async () => {
        try {
            setLoading(true);
            
            const [funcRes, templatesRes, audioRes, langRes] = await Promise.all([
                getFunctions(agentId),
                ivrApi.getTemplates(agentId),
                ivrApi.getAudioFiles(agentId),
                ivrApi.getAgentLanguages(agentId)
            ]);
            			
            setFunctions(funcRes.data?.functions || []);
            setTemplates(templatesRes.data || []);
            setAudioFiles(audioRes.data || []);
            setLanguages(langRes.data || []);
            
            if (langRes.data?.length > 0) {
                const defaultLang = langRes.data.find(l => l.is_default);
                setActiveLang(defaultLang?.code || langRes.data[0].code);
            }
            
            if (!isNew) {
                const flowRes = await ivrApi.getFlow(agentId, flowId);
                if (flowRes.data) {
                    setFlow(flowRes.data);
                    setSteps(flowRes.data.steps || []);
                }
            } else {
                setFlow({
                    flow_name: '',
                    flow_key: '',
                    description: '',
                    trigger_phrases: [],
                    intro_text: '',
                    on_complete_action: 'respond',
                    on_complete_response_text: '',
                    ask_anything_else: true,
                    anything_else_text: 'Is there anything else I can help you with?',
                    closing_text: 'Thank you for calling. Goodbye!',
                    step_timeout_seconds: 30,
                    max_retries_per_step: 3,
                    is_active: true
                });
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
        
        if (field === 'flow_name' && isNew) {
            setFlow(prev => ({
                ...prev,
                flow_key: ivrApi.generateFlowKey(value)
            }));
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
    
    const handleSaveStep = (stepData) => {
        if (editingStep) {
            setSteps(prev => prev.map(s => 
                s.id === editingStep.id || s.step_key === editingStep.step_key
                    ? { ...s, ...stepData }
                    : s
            ));
        } else {
            const newStep = {
                ...stepData,
                id: `temp_${Date.now()}`,
                step_order: steps.length + 1
            };
            setSteps(prev => [...prev, newStep]);
        }
        setShowStepModal(false);
    };
    
    const handleDeleteStep = (stepKey) => {
        if (!window.confirm('Delete this step?')) return;
        setSteps(prev => prev.filter(s => s.step_key !== stepKey));
    };
    
    const handleDragEnd = (result) => {
        if (!result.destination) return;
        
        const reordered = [...steps];
        const [removed] = reordered.splice(result.source.index, 1);
        reordered.splice(result.destination.index, 0, removed);
        
        setSteps(reordered.map((s, i) => ({ ...s, step_order: i + 1 })));
    };
    
    const handleSave = async () => {
        if (!flow.flow_name?.trim()) {
            toast.error('Flow name is required');
            return;
        }
        
        if (!flow.flow_key?.trim()) {
            toast.error('Flow key is required');
            return;
        }
        
        try {
            setSaving(true);
            
            let savedFlow;
            
            if (isNew) {
                const res = await ivrApi.createFlow(agentId, flow);
                savedFlow = res.data;
            } else {
                await ivrApi.updateFlow(agentId, flowId, flow);
                savedFlow = { ...flow, id: flowId };
            }
            
            // Save steps
            for (const step of steps) {
                if (step.id?.startsWith('temp_')) {
                    await ivrApi.createFlowStep(agentId, savedFlow.id, step);
                } else {
                    await ivrApi.updateFlowStep(agentId, savedFlow.id, step.id, step);
                }
            }
            
            toast.success('Flow saved successfully');
            navigate(`/agents/${agentId}/ivr/flows`);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to save flow');
        } finally {
            setSaving(false);
        }
    };
    
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }
    
    return (
        <div className="h-screen flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/agents/${agentId}/ivr/flows`)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">
                            {isNew ? 'Create Flow' : flow?.flow_name || 'Edit Flow'}
                        </h1>
                        <p className="text-sm text-gray-500">
                            {flow?.flow_key || 'Define conversation steps'}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Language Selector */}
                    <select
                        value={activeLang}
                        onChange={(e) => setActiveLang(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm"
                    >
                        {languages.map(lang => (
                            <option key={lang.code} value={lang.code}>
                                {lang.native_name || lang.name}
                            </option>
                        ))}
                    </select>
                    
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save Flow
                    </button>
                </div>
            </div>
            
            {/* Tabs */}
            <div className="border-b bg-white px-6">
                <div className="flex gap-6">
                    {['steps', 'settings', 'completion'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                                activeTab === tab
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                {activeTab === 'steps' && (
                    <StepsTab
                        steps={steps}
                        expandedStep={expandedStep}
                        setExpandedStep={setExpandedStep}
                        onAddStep={handleAddStep}
                        onEditStep={handleEditStep}
                        onDeleteStep={handleDeleteStep}
                        onDragEnd={handleDragEnd}
                        activeLang={activeLang}
                        languages={languages}
                    />
                )}
                
                {activeTab === 'settings' && (
                    <SettingsTab
                        flow={flow}
                        onChange={handleFlowChange}
                        activeLang={activeLang}
                        languages={languages}
                        audioFiles={audioFiles}
                        agentId={agentId}
						flowId={flow?.id} 
                    />
                )}
                
                {activeTab === 'completion' && (
                    <CompletionTab
                        flow={flow}
                        onChange={handleFlowChange}
                        functions={functions}
                        templates={templates}
                        audioFiles={audioFiles}
                        activeLang={activeLang}
                        languages={languages}
                        agentId={agentId}
						flowId={flow?.id}
                    />
                )}
            </div>
            
            {/* Step Modal */}
            {showStepModal && (
                <StepModal
                    step={editingStep}
                    steps={steps}
                    functions={functions}
                    templates={templates}
                    audioFiles={audioFiles}
                    languages={languages}
                    activeLang={activeLang}
                    agentId={agentId}
                    onSave={handleSaveStep}
                    onClose={() => setShowStepModal(false)}
					flowId={flow?.id}
                />
            )}
        </div>
    );
};

// Steps Tab
const StepsTab = ({ 
    steps, 
    expandedStep, 
    setExpandedStep, 
    onAddStep, 
    onEditStep, 
    onDeleteStep, 
    onDragEnd,
    activeLang,
    languages
}) => {
    const stepIcons = {
        collect_slot: MessageSquare,
        confirm: CheckCircle,
        respond: Volume2,
        branch: GitBranch,
        function: Zap,
        transfer: Phone
    };
    
    const stepColors = {
        collect_slot: 'blue',
        confirm: 'green',
        respond: 'purple',
        branch: 'orange',
        function: 'yellow',
        transfer: 'red'
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Flow Steps</h2>
                <button
                    onClick={onAddStep}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4" />
                    Add Step
                </button>
            </div>
            
            {steps.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed">
                    <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Steps Yet</h3>
                    <p className="text-gray-600 mb-4">
                        Add steps to define your conversation flow
                    </p>
                    <button
                        onClick={onAddStep}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Add First Step
                    </button>
                </div>
            ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="steps">
                        {(provided) => (
                            <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className="space-y-3"
                            >
                                {steps.map((step, index) => {
                                    const Icon = stepIcons[step.step_type] || MessageSquare;
                                    const color = stepColors[step.step_type] || 'gray';
                                    
                                    return (
                                        <Draggable
                                            key={step.step_key}
                                            draggableId={step.step_key}
                                            index={index}
                                        >
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    className={`bg-white rounded-lg border ${
                                                        snapshot.isDragging ? 'shadow-lg' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-center p-4">
                                                        <div
                                                            {...provided.dragHandleProps}
                                                            className="mr-3 cursor-grab"
                                                        >
                                                            <GripVertical className="w-4 h-4 text-gray-400" />
                                                        </div>
                                                        
                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${color}-100`}>
                                                            <Icon className={`w-5 h-5 text-${color}-600`} />
                                                        </div>
                                                        
                                                        <div className="ml-4 flex-1">
                                                            <h4 className="font-medium text-gray-900">
                                                                {step.step_name || step.step_key}
                                                            </h4>
                                                            <p className="text-sm text-gray-500">
                                                                {step.step_type} 
                                                                {step.slot_name && ` → ${step.slot_name}`}
                                                            </p>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-400">
                                                                #{index + 1}
                                                            </span>
                                                            <button
                                                                onClick={() => onEditStep(step)}
                                                                className="p-2 text-gray-500 hover:bg-gray-100 rounded"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => onDeleteStep(step.step_key)}
                                                                className="p-2 text-red-500 hover:bg-red-50 rounded"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedStep(
                                                                    expandedStep === step.step_key ? null : step.step_key
                                                                )}
                                                                className="p-2 text-gray-500 hover:bg-gray-100 rounded"
                                                            >
                                                                {expandedStep === step.step_key ? (
                                                                    <ChevronUp className="w-4 h-4" />
                                                                ) : (
                                                                    <ChevronDown className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    
                                                    {expandedStep === step.step_key && (
                                                        <div className="px-4 pb-4 pt-2 border-t bg-gray-50">
                                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                                <div>
                                                                    <span className="text-gray-500">Prompt:</span>
                                                                    <p className="text-gray-900">{step.prompt_text || '-'}</p>
                                                                </div>
                                                                {step.slot_type && (
                                                                    <div>
                                                                        <span className="text-gray-500">Slot Type:</span>
                                                                        <p className="text-gray-900">{step.slot_type}</p>
                                                                    </div>
                                                                )}
                                                                {step.next_step_key && (
                                                                    <div>
                                                                        <span className="text-gray-500">Next:</span>
                                                                        <p className="text-gray-900">{step.next_step_key}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </Draggable>
                                    );
                                })}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            )}
        </div>
    );
};

// Settings Tab
const SettingsTab = ({ flow, onChange, activeLang, languages, audioFiles, agentId, flowId }) => {

    const [triggerInput, setTriggerInput] = useState('');
    const [cancelInput, setCancelInput] = useState('');
    
    const addTrigger = () => {
        if (triggerInput.trim()) {
            onChange('trigger_phrases', [...(flow.trigger_phrases || []), triggerInput.trim()]);
            setTriggerInput('');
        }
    };
    
    const removeTrigger = (index) => {
        onChange('trigger_phrases', flow.trigger_phrases.filter((_, i) => i !== index));
    };
    
    const addCancelPhrase = () => {
        if (cancelInput.trim()) {
            onChange('cancel_phrases', [...(flow.cancel_phrases || ['cancel']), cancelInput.trim()]);
            setCancelInput('');
        }
    };
    
    const removeCancelPhrase = (index) => {
        onChange('cancel_phrases', flow.cancel_phrases.filter((_, i) => i !== index));
    };
    
    return (
        <div className="max-w-2xl space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium mb-4">Basic Information</h3>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Flow Name *
                            </label>
                            <input
                                type="text"
                                value={flow.flow_name || ''}
                                onChange={(e) => onChange('flow_name', e.target.value)}
                                placeholder="Installation Request"
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Flow Key *
                            </label>
                            <input
                                type="text"
                                value={flow.flow_key || ''}
                                onChange={(e) => onChange('flow_key', 
                                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                                )}
                                placeholder="ac_installation"
                                className="w-full px-3 py-2 border rounded-lg"
                            />
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
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                </div>
            </div>
            
            {/* Trigger Phrases */}
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium mb-4">Trigger Phrases</h3>
                <p className="text-sm text-gray-600 mb-4">
                    Phrases that will start this flow when matched
                </p>
                
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={triggerInput}
                        onChange={(e) => setTriggerInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addTrigger()}
                        placeholder="e.g., AC installation, install my AC"
                        className="flex-1 px-3 py-2 border rounded-lg"
                    />
                    <button
                        onClick={addTrigger}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Add
                    </button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    {(flow.trigger_phrases || []).map((phrase, index) => (
                        <span
                            key={index}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full"
                        >
                            {phrase}
                            <button
                                onClick={() => removeTrigger(index)}
                                className="hover:text-blue-600"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            </div>
            
            {/* Introduction Message */}
			<div className="bg-white rounded-lg border p-6">
				<h3 className="text-lg font-medium mb-4">Introduction Message</h3>
				<p className="text-sm text-gray-600 mb-4">
					Played when the flow starts (before first step)
				</p>
				
				<MultiLangAudioTextInput
					label="Intro Text"
					entityType="flow"
					entityId={flow.id}
					fieldName="intro_text"
					baseTextValue={flow.intro_text || ''}
					baseAudioId={flow.intro_audio_id}
					onBaseTextChange={(v) => onChange('intro_text', v)}
					onBaseAudioChange={(id) => onChange('intro_audio_id', id)}
					languages={languages}
					defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
					audioFiles={audioFiles}
					agentId={agentId}
					placeholder="Sure, I'll help you with your AC installation..."
					multiline={true}
				/>
			</div>
            
            {/* Cancel Handling (NEW) */}
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium mb-4">Cancel Handling</h3>
                <p className="text-sm text-gray-600 mb-4">
                    What happens when caller wants to cancel the flow
                </p>
                
                <div className="space-y-4">
                    {/* Cancel Phrases */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cancel Phrases
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={cancelInput}
                                onChange={(e) => setCancelInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addCancelPhrase()}
                                placeholder="e.g., cancel, stop, never mind"
                                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                            />
                            <button
                                onClick={addCancelPhrase}
                                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                            >
                                Add
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(flow.cancel_phrases || ['cancel']).map((phrase, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded-full text-sm"
                                >
                                    {phrase}
                                    <button
                                        onClick={() => removeCancelPhrase(index)}
                                        className="hover:text-red-600"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                    
                    {/* Cancel Response */}
					<MultiLangAudioTextInput
						label="Cancel Response"
						entityType="flow"
						entityId={flow.id}
						fieldName="on_cancel_response_text"
						baseTextValue={flow.on_cancel_response_text || ''}
						baseAudioId={flow.on_cancel_audio_id}
						onBaseTextChange={(v) => onChange('on_cancel_response_text', v)}
						onBaseAudioChange={(id) => onChange('on_cancel_audio_id', id)}
						languages={languages}
						defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
						audioFiles={audioFiles}
						agentId={agentId}
						placeholder="No problem, I've cancelled your request. Is there anything else I can help with?"
						multiline={true}
					/>
                    
                    {/* Cancel Action */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            After Cancel Action
                        </label>
                        <select
                            value={flow.on_cancel_action || 'end_call'}
                            onChange={(e) => onChange('on_cancel_action', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            <option value="end_call">End Call</option>
                            <option value="main_menu">Return to Main Menu</option>
                            <option value="transfer">Transfer to Agent</option>
                        </select>
                    </div>
                </div>
            </div>
            
            {/* Timeout Handling (NEW) */}
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium mb-4">Timeout Handling</h3>
                <p className="text-sm text-gray-600 mb-4">
                    What happens when caller doesn't respond in time
                </p>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Step Timeout (seconds)
                            </label>
                            <input
                                type="number"
                                value={flow.step_timeout_seconds || 30}
                                onChange={(e) => onChange('step_timeout_seconds', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Timeout Action
                            </label>
                            <select
                                value={flow.on_timeout_action || 'retry'}
                                onChange={(e) => onChange('on_timeout_action', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg"
                            >
                                <option value="retry">Retry (repeat prompt)</option>
                                <option value="skip">Skip to Next Step</option>
                                <option value="transfer">Transfer to Agent</option>
                                <option value="end">End Call</option>
                            </select>
                        </div>
                    </div>
                    
                    <MultiLangAudioTextInput
						label="Timeout Message"
						entityType="flow"
						entityId={flow.id}
						fieldName="on_timeout_text"
						baseTextValue={flow.on_timeout_text || ''}
						baseAudioId={flow.on_timeout_audio_id}
						onBaseTextChange={(v) => onChange('on_timeout_text', v)}
						onBaseAudioChange={(id) => onChange('on_timeout_audio_id', id)}
						languages={languages}
						defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
						audioFiles={audioFiles}
						agentId={agentId}
						placeholder="I didn't hear a response. Let me repeat that..."
						multiline={true}
					/>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Max Retries Per Step
                        </label>
                        <input
                            type="number"
                            value={flow.max_retries_per_step || 3}
                            onChange={(e) => onChange('max_retries_per_step', parseInt(e.target.value))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            After this many retries, the timeout action will be taken
                        </p>
                    </div>
                </div>
            </div>
            
            {/* Error Handling (NEW) */}
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium mb-4">Error Handling</h3>
                <p className="text-sm text-gray-600 mb-4">
                    What happens when an error occurs (e.g., function call fails)
                </p>
                
                <div className="space-y-4">
                    <MultiLangAudioTextInput
						label="Error Message"
						entityType="flow"
						entityId={flow.id}
						fieldName="on_error_text"
						baseTextValue={flow.on_error_text || ''}
						baseAudioId={flow.on_error_audio_id}
						onBaseTextChange={(v) => onChange('on_error_text', v)}
						onBaseAudioChange={(id) => onChange('on_error_audio_id', id)}
						languages={languages}
						defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
						audioFiles={audioFiles}
						agentId={agentId}
						placeholder="I'm sorry, something went wrong. Let me transfer you to an agent."
						multiline={true}
					/>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Error Transfer Queue
                        </label>
                        <input
                            type="text"
                            value={flow.on_error_transfer_queue || ''}
                            onChange={(e) => onChange('on_error_transfer_queue', e.target.value)}
                            placeholder="support_queue"
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Queue to transfer to when an error occurs
                        </p>
                    </div>
                </div>
            </div>
            
            {/* Active Status */}
            <div className="bg-white rounded-lg border p-6">
                <label className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        checked={flow.is_active !== false}
                        onChange={(e) => onChange('is_active', e.target.checked)}
                        className="rounded text-blue-600"
                    />
                    <div>
                        <span className="font-medium">Active</span>
                        <p className="text-sm text-gray-500">Enable this flow for matching</p>
                    </div>
                </label>
            </div>
        </div>
    );
};

// Completion Tab
const CompletionTab = ({ flow, onChange, functions, templates, audioFiles, activeLang, languages, agentId, flowId }) => {

    return (
        <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium mb-4">On Complete Action</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Action Type
                        </label>
                        <select
                            value={flow.on_complete_action || 'respond'}
                            onChange={(e) => onChange('on_complete_action', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            {ivrApi.COMPLETION_ACTIONS.map(a => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                        </select>
                    </div>
                    
                    {flow.on_complete_action === 'function_call' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Function
                                </label>
                                <select
                                    value={flow.on_complete_function_id || ''}
                                    onChange={(e) => {
                                        const func = functions.find(f => f.id === e.target.value);
                                        onChange('on_complete_function_id', e.target.value);
                                        onChange('on_complete_function_name', func?.name || '');
                                    }}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    <option value="">Select function...</option>
                                    {functions.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                    
                    {flow.on_complete_action === 'transfer' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Transfer Queue
                            </label>
                            <input
                                type="text"
                                value={flow.on_complete_transfer_queue || ''}
                                onChange={(e) => onChange('on_complete_transfer_queue', e.target.value)}
                                placeholder="support_queue"
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                    )}
                    
                    <MultiLangAudioTextInput
						label="Completion Message"
						entityType="flow"
						entityId={flow.id}
						fieldName="on_complete_response_text"
						baseTextValue={flow.on_complete_response_text || ''}
						baseAudioId={flow.on_complete_audio_id}
						onBaseTextChange={(v) => onChange('on_complete_response_text', v)}
						onBaseAudioChange={(id) => onChange('on_complete_audio_id', id)}
						languages={languages}
						defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
						audioFiles={audioFiles}
						agentId={agentId}
						placeholder="Your request has been submitted. Request ID is {{result.request_id}}"
						multiline={true}
					/>
                </div>
            </div>
            
            {/*<div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium mb-4">WhatsApp Notification</h3>
                
                <label className="flex items-center gap-3 mb-4">
                    <input
                        type="checkbox"
                        checked={flow.send_whatsapp_on_complete || false}
                        onChange={(e) => onChange('send_whatsapp_on_complete', e.target.checked)}
                        className="rounded text-blue-600"
                    />
                    <span>Send WhatsApp notification on completion</span>
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
                            placeholder="installation_confirmation"
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                )}
            </div>*/}
            
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium mb-4">Anything Else & Closing</h3>
                
                <div className="space-y-4">
                    <label className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={flow.ask_anything_else !== false}
                            onChange={(e) => onChange('ask_anything_else', e.target.checked)}
                            className="rounded text-blue-600"
                        />
                        <span>Ask "Anything else?" after completion</span>
                    </label>
                    
                    {flow.ask_anything_else !== false && (
                        <MultiLangAudioTextInput
							label="Anything Else Text"
							entityType="flow"
							entityId={flow.id}
							fieldName="anything_else_text"
							baseTextValue={flow.anything_else_text || ''}
							baseAudioId={flow.anything_else_audio_id}
							onBaseTextChange={(v) => onChange('anything_else_text', v)}
							onBaseAudioChange={(id) => onChange('anything_else_audio_id', id)}
							languages={languages}
							defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
							audioFiles={audioFiles}
							agentId={agentId}
							placeholder="Is there anything else I can help you with?"
						/>
                    )}
                    
                    <MultiLangAudioTextInput
						label="Closing Message"
						entityType="flow"
						entityId={flow.id}
						fieldName="closing_text"
						baseTextValue={flow.closing_text || ''}
						baseAudioId={flow.closing_audio_id}
						onBaseTextChange={(v) => onChange('closing_text', v)}
						onBaseAudioChange={(id) => onChange('closing_audio_id', id)}
						languages={languages}
						defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
						audioFiles={audioFiles}
						agentId={agentId}
						placeholder="Thank you for calling. Goodbye!"
					/>
                </div>
            </div>
        </div>
    );
};

// Audio Text Input Component
const AudioTextInput = ({ 
    label, 
    value, 
    onChange, 
    audioId, 
    onAudioChange, 
    audioFiles, 
    agentId, 
    language,
    placeholder,
    multiline = false
}) => {
    const [audioSource, setAudioSource] = useState(audioId ? 'library' : 'none');
    const [generating, setGenerating] = useState(false);
    
    const handleGenerateTTS = async () => {
        if (!value) {
            toast.error('Enter text first');
            return;
        }
        
        try {
            setGenerating(true);
            const result = await ivrApi.generateTTS(agentId, value, language);
            
            if (result.data?.id) {
                onAudioChange(result.data.id);
                setAudioSource('library');
                toast.success('Audio generated and saved');
            }
        } catch (error) {
            toast.error('Failed to generate audio');
        } finally {
            setGenerating(false);
        }
    };
    
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
                {label}
            </label>
            
            {multiline ? (
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg"
                />
            ) : (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border rounded-lg"
                />
            )}
            
            <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500">Audio:</span>
                
                <select
                    value={audioSource}
                    onChange={(e) => {
                        setAudioSource(e.target.value);
                        if (e.target.value === 'none') {
                            onAudioChange(null);
                        }
                    }}
                    className="px-2 py-1 border rounded text-sm"
                >
                    <option value="none">None (TTS)</option>
                    <option value="library">From Library</option>
                </select>
                
                {audioSource === 'library' && (
                    <select
                        value={audioId || ''}
                        onChange={(e) => onAudioChange(e.target.value || null)}
                        className="px-2 py-1 border rounded text-sm flex-1"
                    >
                        <option value="">Select audio...</option>
                        {audioFiles.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                )}
                
                <button
                    onClick={handleGenerateTTS}
                    disabled={generating || !value}
                    className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                >
                    {generating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        <Mic className="w-3 h-3" />
                    )}
                    Generate
                </button>
            </div>
        </div>
    );
};

// Step Modal (simplified for space - full version would include all fields)
const StepModal = ({ step, steps, functions, templates, audioFiles, languages, activeLang, agentId, onSave, onClose, flowId }) => {
    const [form, setForm] = useState({
		step_key: step?.step_key || '',
		step_name: step?.step_name || '',
		step_type: step?.step_type || 'collect_slot',
		prompt_text: step?.prompt_text || '',
		prompt_audio_id: step?.prompt_audio_id || null,
		slot_name: step?.slot_name || '',
		slot_type: step?.slot_type || 'freeform',
		requires_confirmation: step?.requires_confirmation || false,
		confirm_template: step?.confirm_template || '',
		confirm_audio_id: step?.confirm_audio_id || null,  // ADD THIS
		next_step_key: step?.next_step_key || '',
		is_terminal: step?.is_terminal || false,
		...step
	});
    
    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        
        if (field === 'step_name' && !step) {
            setForm(prev => ({
                ...prev,
                step_key: ivrApi.generateStepKey(value)
            }));
        }
    };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!form.step_key) {
            toast.error('Step key is required');
            return;
        }
        
        onSave(form);
    };
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-semibold">
                        {step ? 'Edit Step' : 'Add Step'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Step Name *
                            </label>
                            <input
                                type="text"
                                value={form.step_name}
                                onChange={(e) => handleChange('step_name', e.target.value)}
                                placeholder="Ask Customer Name"
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Step Key *
                            </label>
                            <input
                                type="text"
                                value={form.step_key}
                                onChange={(e) => handleChange('step_key', 
                                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                                )}
                                className="w-full px-3 py-2 border rounded-lg"
                                disabled={!!step}
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Step Type *
                        </label>
                        <select
                            value={form.step_type}
                            onChange={(e) => handleChange('step_type', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            {ivrApi.STEP_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    
                    <MultiLangAudioTextInput
						label="Prompt Text"
						entityType="step"
						entityId={step?.id}
						flowId={flowId}
						fieldName="prompt_text"
						baseTextValue={form.prompt_text}
						baseAudioId={form.prompt_audio_id}
						onBaseTextChange={(v) => handleChange('prompt_text', v)}
						onBaseAudioChange={(id) => handleChange('prompt_audio_id', id)}
						languages={languages}
						defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
						audioFiles={audioFiles}
						agentId={agentId}
						placeholder="May I know your name please?"
					/>
                    
                    {form.step_type === 'collect_slot' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Slot Name
                                    </label>
                                    <input
                                        type="text"
                                        value={form.slot_name}
                                        onChange={(e) => handleChange('slot_name', e.target.value)}
                                        placeholder="customer_name"
                                        className="w-full px-3 py-2 border rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Slot Type
                                    </label>
                                    <select
                                        value={form.slot_type}
                                        onChange={(e) => handleChange('slot_type', e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    >
                                        {ivrApi.SLOT_TYPES.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.requires_confirmation}
                                    onChange={(e) => handleChange('requires_confirmation', e.target.checked)}
                                    className="rounded text-blue-600"
                                />
                                <span className="text-sm">Requires confirmation</span>
                            </label>
                            
                            {form.requires_confirmation && (
								<>
									<MultiLangAudioTextInput
										label="Confirmation Prompt"
										entityType="step"
										entityId={step?.id}
										flowId={flowId}
										fieldName="confirm_template"
										baseTextValue={form.confirm_template || ''}
										baseAudioId={form.confirm_audio_id}
										onBaseTextChange={(v) => handleChange('confirm_template', v)}
										onBaseAudioChange={(id) => handleChange('confirm_audio_id', id)}
										languages={languages}
										defaultLanguage={languages?.find(l => l.is_default)?.language_code || 'en'}
										audioFiles={audioFiles}
										agentId={agentId}
										placeholder="You said {{slot_name}} is {{value}}. Is that correct?"
										helpText="Use {{value}}, {{slot_name}}, or the actual slot name like {{invoice_no}}"
									/>
								</>
							)}
                        </>
                    )}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Next Step (optional)
                        </label>
                        <select
                            value={form.next_step_key || ''}
                            onChange={(e) => handleChange('next_step_key', e.target.value || null)}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            <option value="">Auto (next in order)</option>
                            {steps.filter(s => s.step_key !== form.step_key).map(s => (
                                <option key={s.step_key} value={s.step_key}>{s.step_name || s.step_key}</option>
                            ))}
                        </select>
                    </div>
                    
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={form.is_terminal}
                            onChange={(e) => handleChange('is_terminal', e.target.checked)}
                            className="rounded text-blue-600"
                        />
                        <span className="text-sm">Terminal step (ends flow)</span>
                    </label>
                </form>
                
                <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        {step ? 'Update' : 'Add Step'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FlowBuilder;

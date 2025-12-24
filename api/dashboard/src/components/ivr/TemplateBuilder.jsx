/**
 * Template Builder Component
 * Visual builder for creating dynamic audio templates
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, Save, Plus, Trash2, Play, Pause, GripVertical,
    Volume2, Type, Variable, AlertCircle, Check, X, Loader2,
    Eye, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import toast from 'react-hot-toast';
import * as ivrApi from '../../services/ivrApi';

const TemplateBuilder = () => {
    const { agentId, templateId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    
    const [template, setTemplate] = useState({
        template_name: '',
        template_key: '',
        description: '',
        template_structure: { parts: [] },
        is_global: false
    });
    
    const [segments, setSegments] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [previewLang, setPreviewLang] = useState('en');
    const [previewVars, setPreviewVars] = useState({});
    const [previewText, setPreviewText] = useState('');
    const [showAddPart, setShowAddPart] = useState(false);
    
    const isNew = !templateId || templateId === 'new';
    
    useEffect(() => {
        loadData();
    }, [agentId, templateId]);
    
    const loadData = async () => {
        try {
            setLoading(true);
            
            const [segmentsRes, languagesRes] = await Promise.all([
                ivrApi.getSegments(agentId),
                ivrApi.getAgentLanguages(agentId)
            ]);
            
            setSegments(segmentsRes.data || []);
            setLanguages(languagesRes.data || []);
            
            if (languagesRes.data?.length > 0) {
                const defaultLang = languagesRes.data.find(l => l.is_default);
                setPreviewLang(defaultLang?.code || languagesRes.data[0].code);
            }
            
            if (!isNew) {
                const templateRes = await ivrApi.getTemplate(agentId, templateId);
                if (templateRes.data) {
                    setTemplate(templateRes.data);
                }
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };
    
    const handleChange = (field, value) => {
        setTemplate(prev => ({ ...prev, [field]: value }));
        
        if (field === 'template_name' && isNew) {
            setTemplate(prev => ({
                ...prev,
                template_key: ivrApi.generateSegmentKey(value)
            }));
        }
    };
    
    const handleAddPart = (type) => {
        const newPart = type === 'segment'
            ? { type: 'segment', segment_key: '' }
            : type === 'variable'
            ? { type: 'variable', name: '' }
            : { type: 'text', text: '' };
        
        setTemplate(prev => ({
            ...prev,
            template_structure: {
                ...prev.template_structure,
                parts: [...(prev.template_structure.parts || []), newPart]
            }
        }));
        
        setShowAddPart(false);
    };
    
    const handleUpdatePart = (index, updates) => {
        setTemplate(prev => ({
            ...prev,
            template_structure: {
                ...prev.template_structure,
                parts: prev.template_structure.parts.map((p, i) => 
                    i === index ? { ...p, ...updates } : p
                )
            }
        }));
    };
    
    const handleRemovePart = (index) => {
        setTemplate(prev => ({
            ...prev,
            template_structure: {
                ...prev.template_structure,
                parts: prev.template_structure.parts.filter((_, i) => i !== index)
            }
        }));
    };
    
    const handleDragEnd = (result) => {
        if (!result.destination) return;
        
        const parts = [...template.template_structure.parts];
        const [removed] = parts.splice(result.source.index, 1);
        parts.splice(result.destination.index, 0, removed);
        
        setTemplate(prev => ({
            ...prev,
            template_structure: { ...prev.template_structure, parts }
        }));
    };
    
    const handlePreview = async () => {
        try {
            const result = await ivrApi.previewTemplate(
                agentId,
                templateId,
                previewVars,
                previewLang
            );
            
            if (result.data?.rendered_text) {
                setPreviewText(result.data.rendered_text);
            }
        } catch (error) {
            // For new templates, render locally
            const parts = template.template_structure.parts || [];
            const texts = parts.map(part => {
                if (part.type === 'segment') {
                    const segment = segments.find(s => s.segment_key === part.segment_key);
                    return segment?.content?.[previewLang]?.text_content || `[${part.segment_key}]`;
                } else if (part.type === 'variable') {
                    return previewVars[part.name] || `{{${part.name}}}`;
                } else {
                    return part.text || '';
                }
            });
            setPreviewText(texts.join(' '));
        }
    };
    
    const handleSave = async () => {
        if (!template.template_name.trim()) {
            toast.error('Template name is required');
            return;
        }
        
        if (!template.template_key.trim()) {
            toast.error('Template key is required');
            return;
        }
        
        if (!template.template_structure.parts?.length) {
            toast.error('Template must have at least one part');
            return;
        }
        
        // Validate structure
        const validation = await ivrApi.validateTemplate(agentId, template.template_structure);
        if (!validation.data?.valid) {
            toast.error(validation.data?.errors?.[0] || 'Invalid template structure');
            return;
        }
        
        try {
            setSaving(true);
            
            if (isNew) {
                await ivrApi.createTemplate(agentId, template);
                toast.success('Template created');
            } else {
                await ivrApi.updateTemplate(agentId, templateId, template);
                toast.success('Template updated');
            }
            
            navigate(`/agents/${agentId}/ivr/templates`);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to save template');
        } finally {
            setSaving(false);
        }
    };
    
    // Extract variables for preview
    const variables = (template.template_structure.parts || [])
        .filter(p => p.type === 'variable')
        .map(p => p.name)
        .filter(Boolean);
    
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }
    
    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/agents/${agentId}/ivr/templates`)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {isNew ? 'Create Template' : 'Edit Template'}
                        </h1>
                        <p className="text-gray-600">
                            Build dynamic audio templates using segments and variables
                        </p>
                    </div>
                </div>
                
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
                    Save Template
                </button>
            </div>
            
            {/* Basic Info */}
            <div className="bg-white rounded-lg border p-6 mb-6">
                <h2 className="text-lg font-medium mb-4">Template Information</h2>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Template Name *
                        </label>
                        <input
                            type="text"
                            value={template.template_name}
                            onChange={(e) => handleChange('template_name', e.target.value)}
                            placeholder="Confirm Invoice Number"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Template Key *
                        </label>
                        <input
                            type="text"
                            value={template.template_key}
                            onChange={(e) => handleChange('template_key', 
                                e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                            )}
                            placeholder="confirm_invoice"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            disabled={!isNew}
                        />
                    </div>
                </div>
                
                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                    </label>
                    <input
                        type="text"
                        value={template.description || ''}
                        onChange={(e) => handleChange('description', e.target.value)}
                        placeholder="Template for confirming invoice number with customer"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>
            
            {/* Template Structure */}
            <div className="bg-white rounded-lg border p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium">Template Structure</h2>
                    
                    <div className="relative">
                        <button
                            onClick={() => setShowAddPart(!showAddPart)}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            <Plus className="w-4 h-4" />
                            Add Part
                        </button>
                        
                        {showAddPart && (
                            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-10">
                                <button
                                    onClick={() => handleAddPart('segment')}
                                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-left"
                                >
                                    <Volume2 className="w-4 h-4 text-blue-600" />
                                    Segment
                                </button>
                                <button
                                    onClick={() => handleAddPart('variable')}
                                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-left"
                                >
                                    <Variable className="w-4 h-4 text-green-600" />
                                    Variable
                                </button>
                                <button
                                    onClick={() => handleAddPart('text')}
                                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-left"
                                >
                                    <Type className="w-4 h-4 text-purple-600" />
                                    Static Text
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                
                {template.template_structure.parts?.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                        <Volume2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600 mb-4">
                            No parts added yet. Start building your template by adding segments and variables.
                        </p>
                    </div>
                ) : (
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="parts">
                            {(provided) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className="space-y-3"
                                >
                                    {template.template_structure.parts.map((part, index) => (
                                        <Draggable
                                            key={index}
                                            draggableId={`part-${index}`}
                                            index={index}
                                        >
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    className={`flex items-center gap-3 p-3 border rounded-lg ${
                                                        snapshot.isDragging ? 'shadow-lg bg-white' : 'bg-gray-50'
                                                    }`}
                                                >
                                                    <div
                                                        {...provided.dragHandleProps}
                                                        className="cursor-grab"
                                                    >
                                                        <GripVertical className="w-4 h-4 text-gray-400" />
                                                    </div>
                                                    
                                                    <PartEditor
                                                        part={part}
                                                        index={index}
                                                        segments={segments}
                                                        onChange={(updates) => handleUpdatePart(index, updates)}
                                                        onRemove={() => handleRemovePart(index)}
                                                    />
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                )}
                
                {/* Extracted Variables */}
                {variables.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-800">
                            <strong>Required Variables:</strong> {variables.join(', ')}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Preview */}
            <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium">Preview</h2>
                    
                    <div className="flex items-center gap-3">
                        <select
                            value={previewLang}
                            onChange={(e) => setPreviewLang(e.target.value)}
                            className="px-3 py-1.5 border rounded-lg text-sm"
                        >
                            {languages.map(lang => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.name}
                                </option>
                            ))}
                        </select>
                        
                        <button
                            onClick={handlePreview}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >
                            <Eye className="w-4 h-4" />
                            Preview
                        </button>
                    </div>
                </div>
                
                {/* Variable Inputs */}
                {variables.length > 0 && (
                    <div className="mb-4 grid grid-cols-3 gap-3">
                        {variables.map(varName => (
                            <div key={varName}>
                                <label className="block text-xs text-gray-600 mb-1">
                                    {varName}
                                </label>
                                <input
                                    type="text"
                                    value={previewVars[varName] || ''}
                                    onChange={(e) => setPreviewVars(prev => ({
                                        ...prev,
                                        [varName]: e.target.value
                                    }))}
                                    placeholder={`Sample ${varName}`}
                                    className="w-full px-2 py-1 text-sm border rounded"
                                />
                            </div>
                        ))}
                    </div>
                )}
                
                {/* Preview Output */}
                <div className="p-4 bg-gray-50 rounded-lg">
                    {previewText ? (
                        <p className="text-gray-800">{previewText}</p>
                    ) : (
                        <p className="text-gray-400 italic">
                            Click "Preview" to see rendered template
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

// Part Editor Component
const PartEditor = ({ part, index, segments, onChange, onRemove }) => {
    const partColors = {
        segment: 'border-blue-200 bg-blue-50',
        variable: 'border-green-200 bg-green-50',
        text: 'border-purple-200 bg-purple-50'
    };
    
    const partIcons = {
        segment: <Volume2 className="w-4 h-4 text-blue-600" />,
        variable: <Variable className="w-4 h-4 text-green-600" />,
        text: <Type className="w-4 h-4 text-purple-600" />
    };
    
    return (
        <div className={`flex-1 flex items-center gap-3 p-2 rounded border ${partColors[part.type]}`}>
            {partIcons[part.type]}
            
            {part.type === 'segment' && (
                <select
                    value={part.segment_key || ''}
                    onChange={(e) => onChange({ segment_key: e.target.value })}
                    className="flex-1 px-2 py-1 text-sm border rounded bg-white"
                >
                    <option value="">Select segment...</option>
                    {segments.map(s => (
                        <option key={s.segment_key} value={s.segment_key}>
                            {s.segment_key} ({s.segment_type})
                        </option>
                    ))}
                </select>
            )}
            
            {part.type === 'variable' && (
                <input
                    type="text"
                    value={part.name || ''}
                    onChange={(e) => onChange({ name: e.target.value.replace(/[^a-z0-9_]/gi, '_') })}
                    placeholder="variable_name"
                    className="flex-1 px-2 py-1 text-sm border rounded bg-white"
                />
            )}
            
            {part.type === 'text' && (
                <input
                    type="text"
                    value={part.text || ''}
                    onChange={(e) => onChange({ text: e.target.value })}
                    placeholder="Static text..."
                    className="flex-1 px-2 py-1 text-sm border rounded bg-white"
                />
            )}
            
            <button
                onClick={onRemove}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
};

export default TemplateBuilder;

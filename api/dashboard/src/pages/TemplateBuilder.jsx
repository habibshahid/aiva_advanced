/**
 * Template Builder Page
 * Create and edit dynamic audio templates with segments and variables
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Save, Plus, Trash2, GripVertical, Play, Pause,
    Volume2, Type, Variable, ChevronDown, ChevronUp, Loader2,
    AlertCircle, Check, Eye, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { getAgent } from '../services/api';
import * as templateApi from '../services/templateApi';
import * as segmentApi from '../services/segmentApi';
import * as languageApi from '../services/languageApi';

const PART_TYPES = [
    { value: 'segment', label: 'Segment', icon: Volume2, color: 'blue' },
    { value: 'variable', label: 'Variable', icon: Variable, color: 'green' },
    { value: 'text', label: 'Static Text', icon: Type, color: 'purple' }
];

export default function TemplateBuilder() {
    const { id: agentId, templateId } = useParams();
    const navigate = useNavigate();
    const isNew = templateId === 'new';
    
    const [agent, setAgent] = useState(null);
    const [segments, setSegments] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [previewLanguage, setPreviewLanguage] = useState('en');
    const [previewVariables, setPreviewVariables] = useState({});
    const [previewText, setPreviewText] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    
    const [form, setForm] = useState({
        template_name: '',
        template_key: '',
        description: '',
        is_global: false,
        template_structure: {
            parts: []
        }
    });
    
    useEffect(() => {
        loadData();
    }, [agentId, templateId]);
    
    const loadData = async () => {
        try {
            setLoading(true);
            
            const [agentRes, segmentsRes, langsRes] = await Promise.all([
                getAgent(agentId),
                segmentApi.listSegments(agentId),
                languageApi.getAgentLanguages(agentId)
            ]);
            
            setAgent(agentRes.data);
            setSegments(segmentsRes.data || []);
            setLanguages(langsRes.data || []);
            
            if (langsRes.data?.[0]) {
                setPreviewLanguage(langsRes.data[0].code);
            }
            
            if (!isNew) {
                const templateRes = await templateApi.getTemplate(agentId, templateId);
                setForm({
                    template_name: templateRes.data.template_name,
                    template_key: templateRes.data.template_key,
                    description: templateRes.data.description || '',
                    is_global: templateRes.data.is_global,
                    template_structure: templateRes.data.template_structure || { parts: [] }
                });
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            toast.error('Failed to load template');
        } finally {
            setLoading(false);
        }
    };
    
    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };
    
    const addPart = (type) => {
        const newPart = { type, id: Date.now().toString() };
        
        if (type === 'segment') {
            newPart.segment_key = '';
        } else if (type === 'variable') {
            newPart.name = '';
        } else if (type === 'text') {
            newPart.text = '';
        }
        
        setForm(prev => ({
            ...prev,
            template_structure: {
                ...prev.template_structure,
                parts: [...prev.template_structure.parts, newPart]
            }
        }));
    };
    
    const updatePart = (index, field, value) => {
        setForm(prev => ({
            ...prev,
            template_structure: {
                ...prev.template_structure,
                parts: prev.template_structure.parts.map((part, i) =>
                    i === index ? { ...part, [field]: value } : part
                )
            }
        }));
    };
    
    const removePart = (index) => {
        setForm(prev => ({
            ...prev,
            template_structure: {
                ...prev.template_structure,
                parts: prev.template_structure.parts.filter((_, i) => i !== index)
            }
        }));
    };
    
    const onDragEnd = (result) => {
        if (!result.destination) return;
        
        const parts = Array.from(form.template_structure.parts);
        const [reordered] = parts.splice(result.source.index, 1);
        parts.splice(result.destination.index, 0, reordered);
        
        setForm(prev => ({
            ...prev,
            template_structure: {
                ...prev.template_structure,
                parts
            }
        }));
    };
    
    const handleSave = async () => {
        if (!form.template_name || !form.template_key) {
            toast.error('Name and key are required');
            return;
        }
        
        if (form.template_structure.parts.length === 0) {
            toast.error('Template must have at least one part');
            return;
        }
        
        try {
            setSaving(true);
            
            if (isNew) {
                await templateApi.createTemplate(agentId, form);
                toast.success('Template created');
            } else {
                await templateApi.updateTemplate(agentId, templateId, form);
                toast.success('Template updated');
            }
            
            navigate(`/agents/${agentId}/templates`);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to save template');
        } finally {
            setSaving(false);
        }
    };
    
    const handlePreview = async () => {
        try {
            const response = await templateApi.previewTemplate(agentId, isNew ? null : templateId, {
                template_structure: form.template_structure,
                variables: previewVariables,
                language: previewLanguage
            });
            
            setPreviewText(response.data.rendered_text);
            setShowPreview(true);
        } catch (error) {
            toast.error('Failed to generate preview');
        }
    };
    
    // Extract variables from template
    const extractedVariables = form.template_structure.parts
        .filter(p => p.type === 'variable' && p.name)
        .map(p => p.name);
    
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }
    
    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/agents/${agentId}/templates`)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {isNew ? 'New Template' : 'Edit Template'}
                        </h1>
                        <p className="text-gray-500">{agent?.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handlePreview}
                        className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
                    >
                        <Eye className="w-4 h-4" />
                        Preview
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Template
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="col-span-2 space-y-6">
                    {/* Basic Info */}
                    <div className="bg-white rounded-lg border p-6">
                        <h2 className="text-lg font-semibold mb-4">Template Info</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Template Name *
                                </label>
                                <input
                                    type="text"
                                    value={form.template_name}
                                    onChange={(e) => handleChange('template_name', e.target.value)}
                                    placeholder="Confirm Invoice"
                                    className="w-full px-3 py-2 border rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Template Key *
                                </label>
                                <input
                                    type="text"
                                    value={form.template_key}
                                    onChange={(e) => handleChange('template_key', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                                    placeholder="confirm_invoice"
                                    className="w-full px-3 py-2 border rounded-lg font-mono"
                                />
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                            </label>
                            <input
                                type="text"
                                value={form.description}
                                onChange={(e) => handleChange('description', e.target.value)}
                                placeholder="Confirms invoice number with customer"
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                    </div>
                    
                    {/* Template Structure */}
                    <div className="bg-white rounded-lg border p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold">Template Structure</h2>
                            <div className="flex items-center gap-2">
                                {PART_TYPES.map(type => (
                                    <button
                                        key={type.value}
                                        onClick={() => addPart(type.value)}
                                        className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50`}
                                    >
                                        <type.icon className="w-4 h-4" />
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {form.template_structure.parts.length === 0 ? (
                            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                                <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                <p className="text-gray-500">No parts yet. Add segments, variables, or text.</p>
                            </div>
                        ) : (
                            <DragDropContext onDragEnd={onDragEnd}>
                                <Droppable droppableId="parts">
                                    {(provided) => (
                                        <div
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className="space-y-2"
                                        >
                                            {form.template_structure.parts.map((part, index) => (
                                                <Draggable
                                                    key={part.id}
                                                    draggableId={part.id}
                                                    index={index}
                                                >
                                                    {(provided) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border"
                                                        >
                                                            <div
                                                                {...provided.dragHandleProps}
                                                                className="cursor-grab"
                                                            >
                                                                <GripVertical className="w-4 h-4 text-gray-400" />
                                                            </div>
                                                            
                                                            <div className={`px-2 py-1 rounded text-xs font-medium ${
                                                                part.type === 'segment' ? 'bg-blue-100 text-blue-700' :
                                                                part.type === 'variable' ? 'bg-green-100 text-green-700' :
                                                                'bg-purple-100 text-purple-700'
                                                            }`}>
                                                                {part.type}
                                                            </div>
                                                            
                                                            <div className="flex-1">
                                                                {part.type === 'segment' && (
                                                                    <select
                                                                        value={part.segment_key}
                                                                        onChange={(e) => updatePart(index, 'segment_key', e.target.value)}
                                                                        className="w-full px-2 py-1 border rounded text-sm"
                                                                    >
                                                                        <option value="">Select segment...</option>
                                                                        {segments.map(seg => (
                                                                            <option key={seg.id} value={seg.segment_key}>
                                                                                {seg.segment_key} - {seg.description || seg.segment_type}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                                
                                                                {part.type === 'variable' && (
                                                                    <input
                                                                        type="text"
                                                                        value={part.name}
                                                                        onChange={(e) => updatePart(index, 'name', e.target.value)}
                                                                        placeholder="variable_name"
                                                                        className="w-full px-2 py-1 border rounded text-sm font-mono"
                                                                    />
                                                                )}
                                                                
                                                                {part.type === 'text' && (
                                                                    <input
                                                                        type="text"
                                                                        value={part.text}
                                                                        onChange={(e) => updatePart(index, 'text', e.target.value)}
                                                                        placeholder="Static text..."
                                                                        className="w-full px-2 py-1 border rounded text-sm"
                                                                    />
                                                                )}
                                                            </div>
                                                            
                                                            <button
                                                                onClick={() => removePart(index)}
                                                                className="p-1 hover:bg-red-100 rounded text-red-500"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
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
                    </div>
                </div>
                
                {/* Sidebar - Preview */}
                <div className="space-y-6">
                    {/* Variables */}
                    {extractedVariables.length > 0 && (
                        <div className="bg-white rounded-lg border p-4">
                            <h3 className="font-medium mb-3">Required Variables</h3>
                            <div className="space-y-2">
                                {extractedVariables.map(varName => (
                                    <div key={varName}>
                                        <label className="block text-xs text-gray-500 mb-1">
                                            {`{{${varName}}}`}
                                        </label>
                                        <input
                                            type="text"
                                            value={previewVariables[varName] || ''}
                                            onChange={(e) => setPreviewVariables(prev => ({
                                                ...prev,
                                                [varName]: e.target.value
                                            }))}
                                            placeholder={`Sample ${varName}`}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* Language Preview */}
                    <div className="bg-white rounded-lg border p-4">
                        <h3 className="font-medium mb-3">Preview Language</h3>
                        <select
                            value={previewLanguage}
                            onChange={(e) => setPreviewLanguage(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            {languages.map(lang => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.name}
                                </option>
                            ))}
                        </select>
                        
                        <button
                            onClick={handlePreview}
                            className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            <Play className="w-4 h-4" />
                            Generate Preview
                        </button>
                    </div>
                    
                    {/* Segments Quick Add */}
                    <div className="bg-white rounded-lg border p-4">
                        <h3 className="font-medium mb-3">Quick Add Segment</h3>
                        <div className="flex flex-wrap gap-2">
                            {segments.slice(0, 10).map(seg => (
                                <button
                                    key={seg.id}
                                    onClick={() => {
                                        addPart('segment');
                                        setTimeout(() => {
                                            const parts = form.template_structure.parts;
                                            updatePart(parts.length, 'segment_key', seg.segment_key);
                                        }, 0);
                                    }}
                                    className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded hover:bg-blue-100"
                                >
                                    {seg.segment_key}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Preview Modal */}
            {showPreview && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">Template Preview</h3>
                            <button onClick={() => setShowPreview(false)} className="p-1 hover:bg-gray-100 rounded">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                            <p className="text-gray-800">{previewText}</p>
                        </div>
                        
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowPreview(false)}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Close
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <Play className="w-4 h-4" />
                                Play Audio
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

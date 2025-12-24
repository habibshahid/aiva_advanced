/**
 * Templates List Component
 * Manage dynamic audio templates
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Plus, Search, Edit2, Trash2, Copy, Play, Pause,
    FileText, Variable, Volume2, RefreshCw, Loader2,
    ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as ivrApi from '../../services/ivrApi';

const TemplatesList = () => {
    const { agentId } = useParams();
    const navigate = useNavigate();
    
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedTemplate, setExpandedTemplate] = useState(null);
    const [previewData, setPreviewData] = useState({});
    
    useEffect(() => {
        loadTemplates();
    }, [agentId]);
    
    const loadTemplates = async () => {
        try {
            setLoading(true);
            const result = await ivrApi.getTemplates(agentId);
            setTemplates(result.data || []);
        } catch (error) {
            console.error('Failed to load templates:', error);
            toast.error('Failed to load templates');
        } finally {
            setLoading(false);
        }
    };
    
    const handleCreate = () => {
        navigate(`/agents/${agentId}/ivr/templates/new`);
    };
    
    const handleEdit = (templateId) => {
        navigate(`/agents/${agentId}/ivr/templates/${templateId}`);
    };
    
    const handleDuplicate = async (templateId) => {
        try {
            await ivrApi.duplicateTemplate(agentId, templateId);
            toast.success('Template duplicated');
            loadTemplates();
        } catch (error) {
            toast.error('Failed to duplicate template');
        }
    };
    
    const handleDelete = async (templateId) => {
        if (!window.confirm('Delete this template?')) return;
        
        try {
            await ivrApi.deleteTemplate(agentId, templateId);
            toast.success('Template deleted');
            loadTemplates();
        } catch (error) {
            toast.error('Failed to delete template');
        }
    };
    
    const handlePreview = async (templateId) => {
        try {
            const result = await ivrApi.previewTemplate(
                agentId,
                templateId,
                previewData[templateId] || {},
                'en'
            );
            
            setPreviewData(prev => ({
                ...prev,
                [templateId]: {
                    ...prev[templateId],
                    _rendered: result.data?.rendered_text
                }
            }));
        } catch (error) {
            toast.error('Failed to preview template');
        }
    };
    
    const filteredTemplates = templates.filter(t =>
        !search ||
        t.template_name.toLowerCase().includes(search.toLowerCase()) ||
        t.template_key.toLowerCase().includes(search.toLowerCase())
    );
    
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }
    
    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Audio Templates</h1>
                    <p className="text-gray-600 mt-1">
                        Create dynamic templates with segments and variables
                    </p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4" />
                    Create Template
                </button>
            </div>
            
            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search templates..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    onClick={loadTemplates}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    title="Refresh"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>
            
            {/* Templates List */}
            {filteredTemplates.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Templates Yet</h3>
                    <p className="text-gray-600 mb-4">
                        Create templates to combine segments with dynamic variables
                    </p>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Create First Template
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredTemplates.map(template => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            expanded={expandedTemplate === template.id}
                            onToggle={() => setExpandedTemplate(
                                expandedTemplate === template.id ? null : template.id
                            )}
                            onEdit={() => handleEdit(template.id)}
                            onDuplicate={() => handleDuplicate(template.id)}
                            onDelete={() => handleDelete(template.id)}
                            previewData={previewData[template.id] || {}}
                            onPreviewDataChange={(data) => setPreviewData(prev => ({
                                ...prev,
                                [template.id]: { ...prev[template.id], ...data }
                            }))}
                            onPreview={() => handlePreview(template.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// Template Card Component
const TemplateCard = ({
    template,
    expanded,
    onToggle,
    onEdit,
    onDuplicate,
    onDelete,
    previewData,
    onPreviewDataChange,
    onPreview
}) => {
    // Parse template structure
    let structure = template.template_structure;
    if (typeof structure === 'string') {
        try {
            structure = JSON.parse(structure);
        } catch (e) {
            structure = { parts: [] };
        }
    }
    
    let requiredVariables = template.required_variables;
    if (typeof requiredVariables === 'string') {
        try {
            requiredVariables = JSON.parse(requiredVariables);
        } catch (e) {
            requiredVariables = [];
        }
    }
    
    const segmentCount = (structure.parts || []).filter(p => p.type === 'segment').length;
    const variableCount = (requiredVariables || []).length;
    
    return (
        <div className="border rounded-lg bg-white overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={onToggle}
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                        <h3 className="font-medium text-gray-900">{template.template_name}</h3>
                        <p className="text-sm text-gray-500">
                            {template.template_key}
                            {template.description && ` • ${template.description}`}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                            <Volume2 className="w-3 h-3" />
                            {segmentCount} segments
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded">
                            <Variable className="w-3 h-3" />
                            {variableCount} variables
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded"
                            title="Edit"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded"
                            title="Duplicate"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    
                    {expanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                </div>
            </div>
            
            {/* Expanded Content */}
            {expanded && (
                <div className="border-t p-4 bg-gray-50">
                    {/* Structure Preview */}
                    <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Structure</h4>
                        <div className="flex flex-wrap gap-2">
                            {(structure.parts || []).map((part, index) => (
                                <span
                                    key={index}
                                    className={`px-2 py-1 rounded text-sm ${
                                        part.type === 'segment'
                                            ? 'bg-blue-100 text-blue-800'
                                            : part.type === 'variable'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}
                                >
                                    {part.type === 'segment' && `[${part.segment_key}]`}
                                    {part.type === 'variable' && `{{${part.name}}}`}
                                    {part.type === 'text' && `"${part.text}"`}
                                </span>
                            ))}
                        </div>
                    </div>
                    
                    {/* Preview with Variables */}
                    {variableCount > 0 && (
                        <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Test Variables</h4>
                            <div className="grid grid-cols-3 gap-3">
                                {(requiredVariables || []).map(varName => (
                                    <div key={varName}>
                                        <label className="block text-xs text-gray-600 mb-1">
                                            {varName}
                                        </label>
                                        <input
                                            type="text"
                                            value={previewData[varName] || ''}
                                            onChange={(e) => onPreviewDataChange({
                                                [varName]: e.target.value
                                            })}
                                            placeholder={`Sample ${varName}`}
                                            className="w-full px-2 py-1 text-sm border rounded"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onPreview}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            <Eye className="w-4 h-4" />
                            Preview
                        </button>
                        
                        {previewData._rendered && (
                            <div className="flex-1 p-2 bg-white border rounded">
                                <p className="text-sm text-gray-700">{previewData._rendered}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TemplatesList;

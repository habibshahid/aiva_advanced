/**
 * Segments List Page
 * Manage audio segments with multi-language support
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Plus, Search, Filter, Play, Pause, Edit2, Trash2,
    Volume2, Globe, Check, X, Loader2, Music, Copy, Upload,
    ChevronDown, ChevronUp, AlertCircle, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAgent } from '../services/api';
import * as segmentApi from '../services/segmentApi';
import * as languageApi from '../services/languageApi';

const SEGMENT_TYPES = [
    { value: 'prefix', label: 'Prefix', description: 'Start of a sentence' },
    { value: 'suffix', label: 'Suffix', description: 'End of a sentence' },
    { value: 'connector', label: 'Connector', description: 'Middle of a sentence' },
    { value: 'standalone', label: 'Standalone', description: 'Complete phrase' }
];

export default function SegmentsList() {
    const { id: agentId } = useParams();
    const navigate = useNavigate();
    
    const [agent, setAgent] = useState(null);
    const [segments, setSegments] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [agentLanguages, setAgentLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingSegment, setEditingSegment] = useState(null);
    const [expandedSegment, setExpandedSegment] = useState(null);
    const [playingAudio, setPlayingAudio] = useState(null);
    
    const audioRef = useRef(null);
    
    useEffect(() => {
        loadData();
    }, [agentId]);
    
    const loadData = async () => {
        try {
            setLoading(true);
            
            const [agentRes, segmentsRes, langsRes, agentLangsRes] = await Promise.all([
                getAgent(agentId),
                segmentApi.listSegments(agentId),
                languageApi.getLanguages(),
                languageApi.getAgentLanguages(agentId)
            ]);
            
            setAgent(agentRes.data);
            setSegments(segmentsRes.data || []);
            setLanguages(langsRes.data || []);
            setAgentLanguages(agentLangsRes.data || []);
        } catch (error) {
            console.error('Failed to load data:', error);
            toast.error('Failed to load segments');
        } finally {
            setLoading(false);
        }
    };
    
    const filteredSegments = segments.filter(segment => {
        if (search && !segment.segment_key.toLowerCase().includes(search.toLowerCase())) {
            return false;
        }
        if (typeFilter && segment.segment_type !== typeFilter) {
            return false;
        }
        return true;
    });
    
    const handleCreate = () => {
        setEditingSegment(null);
        setShowModal(true);
    };
    
    const handleEdit = (segment) => {
        setEditingSegment(segment);
        setShowModal(true);
    };
    
    const handleDelete = async (segmentId) => {
        if (!confirm('Are you sure you want to delete this segment?')) {
            return;
        }
        
        try {
            await segmentApi.deleteSegment(agentId, segmentId);
            toast.success('Segment deleted');
            loadData();
        } catch (error) {
            toast.error('Failed to delete segment');
        }
    };
    
    const handleSave = async (data) => {
        try {
            if (editingSegment) {
                await segmentApi.updateSegment(agentId, editingSegment.id, data);
                toast.success('Segment updated');
            } else {
                await segmentApi.createSegment(agentId, data);
                toast.success('Segment created');
            }
            setShowModal(false);
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to save segment');
        }
    };
    
    const playAudio = (audioId) => {
        if (playingAudio === audioId) {
            audioRef.current?.pause();
            setPlayingAudio(null);
        } else {
            if (audioRef.current) {
                audioRef.current.src = `/api/ivr/${agentId}/audio/${audioId}/stream`;
                audioRef.current.play();
                setPlayingAudio(audioId);
            }
        }
    };
    
    const getLanguageCoverage = (segment) => {
        const covered = Object.keys(segment.content || {}).length;
        const total = agentLanguages.length;
        return { covered, total, percent: total > 0 ? Math.round((covered / total) * 100) : 0 };
    };
    
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }
    
    return (
        <div className="p-6">
            {/* Hidden audio element */}
            <audio
                ref={audioRef}
                onEnded={() => setPlayingAudio(null)}
                className="hidden"
            />
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/agents/${agentId}`)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Audio Segments</h1>
                        <p className="text-gray-500">{agent?.name}</p>
                    </div>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4" />
                    New Segment
                </button>
            </div>
            
            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search segments..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg"
                    />
                </div>
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-4 py-2 border rounded-lg"
                >
                    <option value="">All Types</option>
                    {SEGMENT_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                </select>
            </div>
            
            {/* Segments List */}
            <div className="space-y-3">
                {filteredSegments.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <Music className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Segments Yet</h3>
                        <p className="text-gray-500 mb-4">Create reusable audio segments for your templates</p>
                        <button
                            onClick={handleCreate}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            <Plus className="w-4 h-4" />
                            Create First Segment
                        </button>
                    </div>
                ) : (
                    filteredSegments.map(segment => {
                        const coverage = getLanguageCoverage(segment);
                        const isExpanded = expandedSegment === segment.id;
                        
                        return (
                            <div
                                key={segment.id}
                                className="bg-white border rounded-lg overflow-hidden"
                            >
                                {/* Segment Header */}
                                <div
                                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                                    onClick={() => setExpandedSegment(isExpanded ? null : segment.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg ${
                                            segment.segment_type === 'prefix' ? 'bg-blue-100 text-blue-600' :
                                            segment.segment_type === 'suffix' ? 'bg-green-100 text-green-600' :
                                            segment.segment_type === 'connector' ? 'bg-yellow-100 text-yellow-600' :
                                            'bg-purple-100 text-purple-600'
                                        }`}>
                                            <Volume2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-gray-900">{segment.segment_key}</h3>
                                            <p className="text-sm text-gray-500">
                                                {segment.segment_type} • {segment.description || 'No description'}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4">
                                        {/* Language Coverage */}
                                        <div className="flex items-center gap-2">
                                            <Globe className="w-4 h-4 text-gray-400" />
                                            <span className={`text-sm ${
                                                coverage.percent === 100 ? 'text-green-600' :
                                                coverage.percent >= 50 ? 'text-yellow-600' :
                                                'text-red-600'
                                            }`}>
                                                {coverage.covered}/{coverage.total}
                                            </span>
                                        </div>
                                        
                                        {/* Actions */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleEdit(segment); }}
                                                className="p-2 hover:bg-gray-100 rounded"
                                            >
                                                <Edit2 className="w-4 h-4 text-gray-500" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(segment.id); }}
                                                className="p-2 hover:bg-gray-100 rounded"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                        
                                        {isExpanded ? (
                                            <ChevronUp className="w-5 h-5 text-gray-400" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-gray-400" />
                                        )}
                                    </div>
                                </div>
                                
                                {/* Expanded Content */}
                                {isExpanded && (
                                    <div className="border-t bg-gray-50 p-4">
                                        <h4 className="text-sm font-medium text-gray-700 mb-3">Language Variants</h4>
                                        <div className="space-y-2">
                                            {agentLanguages.map(lang => {
                                                const content = segment.content?.[lang.code];
                                                
                                                return (
                                                    <div
                                                        key={lang.code}
                                                        className="flex items-center justify-between bg-white p-3 rounded-lg border"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-lg">{lang.code === 'en' ? '🇬🇧' : lang.code.startsWith('ur') ? '🇵🇰' : lang.code === 'ar' ? '🇸🇦' : '🌐'}</span>
                                                            <div>
                                                                <span className="font-medium text-sm">{lang.name}</span>
                                                                {content ? (
                                                                    <p className="text-sm text-gray-600 mt-0.5" dir={lang.direction}>
                                                                        {content.text_content}
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-sm text-gray-400 mt-0.5">Not translated</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-2">
                                                            {content?.audio_id ? (
                                                                <button
                                                                    onClick={() => playAudio(content.audio_id)}
                                                                    className={`p-2 rounded-full ${
                                                                        playingAudio === content.audio_id
                                                                            ? 'bg-blue-100 text-blue-600'
                                                                            : 'bg-gray-100 hover:bg-gray-200'
                                                                    }`}
                                                                >
                                                                    {playingAudio === content.audio_id ? (
                                                                        <Pause className="w-4 h-4" />
                                                                    ) : (
                                                                        <Play className="w-4 h-4" />
                                                                    )}
                                                                </button>
                                                            ) : content ? (
                                                                <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                                                                    No Audio
                                                                </span>
                                                            ) : null}
                                                            
                                                            {content ? (
                                                                <Check className="w-4 h-4 text-green-500" />
                                                            ) : (
                                                                <X className="w-4 h-4 text-gray-300" />
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
            
            {/* Modal */}
            {showModal && (
                <SegmentModal
                    segment={editingSegment}
                    agentId={agentId}
                    languages={agentLanguages}
                    onSave={handleSave}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}

// ============================================================================
// SEGMENT MODAL
// ============================================================================

function SegmentModal({ segment, agentId, languages, onSave, onClose }) {
    const [form, setForm] = useState({
        segment_key: segment?.segment_key || '',
        segment_type: segment?.segment_type || 'standalone',
        description: segment?.description || '',
        is_global: segment?.is_global || false,
        content: segment?.content || {}
    });
    
    const [activeLanguage, setActiveLanguage] = useState(languages[0]?.code || 'en');
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    
    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };
    
    const handleContentChange = (langCode, field, value) => {
        setForm(prev => ({
            ...prev,
            content: {
                ...prev.content,
                [langCode]: {
                    ...prev.content[langCode],
                    [field]: value
                }
            }
        }));
    };
    
    const generateAudio = async (langCode) => {
        const text = form.content[langCode]?.text_content;
        if (!text) {
            toast.error('Please enter text first');
            return;
        }
        
        try {
            setGenerating(true);
            const response = await fetch(`/api/tts/${agentId}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    language: langCode,
                    save_to_library: true
                })
            });
            
            const data = await response.json();
            if (data.success) {
                handleContentChange(langCode, 'audio_id', data.data.audio_id);
                handleContentChange(langCode, 'audio_source', 'generated');
                toast.success('Audio generated');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            toast.error('Failed to generate audio');
        } finally {
            setGenerating(false);
        }
    };
    
    const handleSubmit = async () => {
        if (!form.segment_key) {
            toast.error('Segment key is required');
            return;
        }
        
        setSaving(true);
        try {
            await onSave(form);
        } finally {
            setSaving(false);
        }
    };
    
    const currentContent = form.content[activeLanguage] || {};
    const currentLang = languages.find(l => l.code === activeLanguage);
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b">
                    <h2 className="text-xl font-bold">
                        {segment ? 'Edit Segment' : 'New Segment'}
                    </h2>
                </div>
                
                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Segment Key *
                            </label>
                            <input
                                type="text"
                                value={form.segment_key}
                                onChange={(e) => handleChange('segment_key', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                                placeholder="thank_you"
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Type *
                            </label>
                            <select
                                value={form.segment_type}
                                onChange={(e) => handleChange('segment_type', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg"
                            >
                                {SEGMENT_TYPES.map(type => (
                                    <option key={type.value} value={type.value}>
                                        {type.label} - {type.description}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description
                        </label>
                        <input
                            type="text"
                            value={form.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            placeholder="Brief description of this segment"
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    
                    {/* Language Tabs */}
                    <div className="border-b mb-4">
                        <div className="flex gap-1 overflow-x-auto">
                            {languages.map(lang => {
                                const hasContent = form.content[lang.code]?.text_content;
                                const hasAudio = form.content[lang.code]?.audio_id;
                                
                                return (
                                    <button
                                        key={lang.code}
                                        onClick={() => setActiveLanguage(lang.code)}
                                        className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-2 ${
                                            activeLanguage === lang.code
                                                ? 'border-blue-500 text-blue-600'
                                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        {lang.name}
                                        {hasContent && (
                                            <span className={`w-2 h-2 rounded-full ${hasAudio ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Language Content */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Text Content ({currentLang?.native_name || activeLanguage})
                            </label>
                            <input
                                type="text"
                                value={currentContent.text_content || ''}
                                onChange={(e) => handleContentChange(activeLanguage, 'text_content', e.target.value)}
                                placeholder={`Enter text in ${currentLang?.name || activeLanguage}...`}
                                dir={currentLang?.direction || 'ltr'}
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Audio
                            </label>
                            <div className="flex items-center gap-3">
                                {currentContent.audio_id ? (
                                    <div className="flex items-center gap-2 flex-1 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                        <Check className="w-4 h-4 text-green-500" />
                                        <span className="text-sm text-green-700">Audio generated</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 flex-1 bg-gray-50 border rounded-lg px-3 py-2">
                                        <AlertCircle className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm text-gray-500">No audio</span>
                                    </div>
                                )}
                                
                                <button
                                    onClick={() => generateAudio(activeLanguage)}
                                    disabled={generating || !currentContent.text_content}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {generating ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4" />
                                    )}
                                    Generate
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Footer */}
                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save Segment
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Segments List Component
 * Manage audio segments with multi-language support
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Plus, Search, Edit2, Trash2, Play, Pause, Volume2,
    Globe, Check, X, AlertCircle, RefreshCw, ChevronDown,
    ChevronUp, Music, Mic, Upload, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as ivrApi from '../../services/ivrApi';

const SegmentsList = () => {
    const { agentId } = useParams();
    const navigate = useNavigate();
    
    const [segments, setSegments] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [agentLanguages, setAgentLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [expandedSegment, setExpandedSegment] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingSegment, setEditingSegment] = useState(null);
    const [playingAudio, setPlayingAudio] = useState(null);
    
    const audioRef = useRef(null);
    
    useEffect(() => {
        loadData();
    }, [agentId]);
    
    const loadData = async () => {
        try {
            setLoading(true);
            
            const [segmentsRes, languagesRes, agentLangRes] = await Promise.all([
                ivrApi.getSegments(agentId),
                ivrApi.getLanguages(),
                ivrApi.getAgentLanguages(agentId)
            ]);
            
            setSegments(segmentsRes.data || []);
            setLanguages(languagesRes.data || []);
            setAgentLanguages(agentLangRes.data || []);
        } catch (error) {
            console.error('Failed to load segments:', error);
            toast.error('Failed to load segments');
        } finally {
            setLoading(false);
        }
    };
    
    const handleCreate = () => {
        setEditingSegment(null);
        setShowModal(true);
    };
    
    const handleEdit = (segment) => {
        setEditingSegment(segment);
        setShowModal(true);
    };
    
    const handleDelete = async (segmentId) => {
        if (!window.confirm('Are you sure you want to delete this segment?')) return;
        
        try {
            await ivrApi.deleteSegment(agentId, segmentId);
            toast.success('Segment deleted');
            loadData();
        } catch (error) {
            toast.error('Failed to delete segment');
        }
    };
    
    const handleSave = async (data) => {
        try {
            if (editingSegment) {
                await ivrApi.updateSegment(agentId, editingSegment.id, data);
                toast.success('Segment updated');
            } else {
                await ivrApi.createSegment(agentId, data);
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
            const url = ivrApi.getAudioStreamUrl(agentId, audioId);
            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.play();
                setPlayingAudio(audioId);
            }
        }
    };
    
    const filteredSegments = segments.filter(s => {
        const matchesSearch = !search || 
            s.segment_key.toLowerCase().includes(search.toLowerCase()) ||
            s.description?.toLowerCase().includes(search.toLowerCase());
        const matchesType = !typeFilter || s.segment_type === typeFilter;
        return matchesSearch && matchesType;
    });
    
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
                    <h1 className="text-2xl font-bold text-gray-900">Audio Segments</h1>
                    <p className="text-gray-600 mt-1">
                        Manage reusable audio segments for templates
                    </p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4" />
                    Add Segment
                </button>
            </div>
            
            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search segments..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All Types</option>
                    {ivrApi.SEGMENT_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
                <button
                    onClick={loadData}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    title="Refresh"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>
            
            {/* Language Legend */}
            <div className="flex gap-2 mb-4 flex-wrap">
                <span className="text-sm text-gray-600">Languages:</span>
                {agentLanguages.map(lang => (
                    <span
                        key={lang.code}
                        className={`text-xs px-2 py-1 rounded ${
                            lang.is_default ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                        }`}
                    >
                        {lang.native_name || lang.name}
                        {lang.is_default && ' (Default)'}
                    </span>
                ))}
            </div>
            
            {/* Segments List */}
            {filteredSegments.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Music className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Segments Yet</h3>
                    <p className="text-gray-600 mb-4">
                        Create reusable audio segments for your templates
                    </p>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Create First Segment
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredSegments.map(segment => (
                        <SegmentCard
                            key={segment.id}
                            segment={segment}
                            languages={agentLanguages}
                            expanded={expandedSegment === segment.id}
                            onToggle={() => setExpandedSegment(
                                expandedSegment === segment.id ? null : segment.id
                            )}
                            onEdit={() => handleEdit(segment)}
                            onDelete={() => handleDelete(segment.id)}
                            onPlayAudio={playAudio}
                            playingAudio={playingAudio}
                            agentId={agentId}
                        />
                    ))}
                </div>
            )}
            
            {/* Hidden audio element */}
            <audio
                ref={audioRef}
                onEnded={() => setPlayingAudio(null)}
                onError={() => setPlayingAudio(null)}
            />
            
            {/* Modal */}
            {showModal && (
                <SegmentModal
                    segment={editingSegment}
                    languages={agentLanguages}
                    agentId={agentId}
                    onSave={handleSave}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
};

// Segment Card Component
const SegmentCard = ({ 
    segment, 
    languages, 
    expanded, 
    onToggle, 
    onEdit, 
    onDelete,
    onPlayAudio,
    playingAudio,
    agentId
}) => {
    const typeColors = {
        prefix: 'bg-green-100 text-green-800',
        connector: 'bg-blue-100 text-blue-800',
        suffix: 'bg-purple-100 text-purple-800',
        standalone: 'bg-gray-100 text-gray-800'
    };
    
    return (
        <div className="border rounded-lg bg-white overflow-hidden">
            {/* Header */}
            <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={onToggle}
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                        <Volume2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="font-medium text-gray-900">{segment.segment_key}</h3>
                        <p className="text-sm text-gray-500">{segment.description || 'No description'}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded ${typeColors[segment.segment_type]}`}>
                        {segment.segment_type}
                    </span>
                    
                    {/* Language indicators */}
                    <div className="flex gap-1">
                        {languages.map(lang => {
                            const hasContent = segment.content?.[lang.code];
                            const hasAudio = hasContent?.audio_id;
                            
                            return (
                                <div
                                    key={lang.code}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                        hasAudio ? 'bg-green-100 text-green-700' :
                                        hasContent ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-100 text-gray-400'
                                    }`}
                                    title={`${lang.name}: ${hasAudio ? 'Has audio' : hasContent ? 'Text only' : 'Missing'}`}
                                >
                                    {lang.code.substring(0, 2).toUpperCase()}
                                </div>
                            );
                        })}
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded"
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
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Language Variants</h4>
                    <div className="space-y-3">
                        {languages.map(lang => {
                            const content = segment.content?.[lang.code];
                            
                            return (
                                <div 
                                    key={lang.code}
                                    className="flex items-center gap-4 p-3 bg-white rounded-lg border"
                                >
                                    <div className="w-20">
                                        <span className="text-sm font-medium">{lang.name}</span>
                                        <span className="text-xs text-gray-500 block">{lang.native_name}</span>
                                    </div>
                                    
                                    {content ? (
                                        <>
                                            <div className="flex-1">
                                                <p className={`text-sm ${lang.direction === 'rtl' ? 'text-right' : ''}`}>
                                                    {content.text_content}
                                                </p>
                                            </div>
                                            
                                            {content.audio_id ? (
                                                <button
                                                    onClick={() => onPlayAudio(content.audio_id)}
                                                    className={`p-2 rounded-full ${
                                                        playingAudio === content.audio_id
                                                            ? 'bg-blue-100 text-blue-600'
                                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                                >
                                                    {playingAudio === content.audio_id ? (
                                                        <Pause className="w-4 h-4" />
                                                    ) : (
                                                        <Play className="w-4 h-4" />
                                                    )}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                                                    No audio
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex-1 text-sm text-gray-400 italic">
                                            No content for this language
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// Segment Modal Component
const SegmentModal = ({ segment, languages, agentId, onSave, onClose }) => {
    const [form, setForm] = useState({
        segment_key: segment?.segment_key || '',
        segment_type: segment?.segment_type || 'standalone',
        description: segment?.description || '',
        is_global: segment?.is_global || false,
        content: segment?.content || {}
    });
    
    const [activeLanguage, setActiveLanguage] = useState(languages[0]?.code || 'en');
    const [generating, setGenerating] = useState(false);
    const [previewAudio, setPreviewAudio] = useState(null);
    
    const audioRef = useRef(null);
    
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
    
    const handleGenerateTTS = async (langCode) => {
        const text = form.content[langCode]?.text_content;
        if (!text) {
            toast.error('Please enter text first');
            return;
        }
        
        try {
            setGenerating(true);
            const result = await ivrApi.generateTTS(agentId, text, langCode);
            
            if (result.data?.audio_url) {
                setPreviewAudio(result.data.audio_url);
                
                // Store the generated audio
                handleContentChange(langCode, 'generated_audio', result.data);
                handleContentChange(langCode, 'audio_source', 'generated');
                
                toast.success('Audio generated! Click play to preview.');
            }
        } catch (error) {
            toast.error('Failed to generate audio');
        } finally {
            setGenerating(false);
        }
    };
    
    const handleSaveAudio = async (langCode) => {
        const generated = form.content[langCode]?.generated_audio;
        if (!generated) {
            toast.error('Generate audio first');
            return;
        }
        
        try {
            const result = await ivrApi.saveGeneratedAudio(agentId, {
                name: `segment_${form.segment_key}_${langCode}`,
                audio_data: generated.audio_data,
                format: generated.format || 'mp3'
            });
            
            if (result.data?.id) {
                handleContentChange(langCode, 'audio_id', result.data.id);
                toast.success('Audio saved to library');
            }
        } catch (error) {
            toast.error('Failed to save audio');
        }
    };
    
    const playPreview = () => {
        if (previewAudio && audioRef.current) {
            audioRef.current.src = previewAudio;
            audioRef.current.play();
        }
    };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!form.segment_key.trim()) {
            toast.error('Segment key is required');
            return;
        }
        
        onSave(form);
    };
    
    const currentLang = languages.find(l => l.code === activeLanguage);
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-semibold">
                        {segment ? 'Edit Segment' : 'Create Segment'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                {/* Content */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Segment Key *
                            </label>
                            <input
                                type="text"
                                value={form.segment_key}
                                onChange={(e) => handleChange('segment_key', 
                                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                                )}
                                placeholder="thank_you"
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                disabled={!!segment}
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Type *
                            </label>
                            <select
                                value={form.segment_type}
                                onChange={(e) => handleChange('segment_type', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                {ivrApi.SEGMENT_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description
                        </label>
                        <input
                            type="text"
                            value={form.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            placeholder="What this segment is for..."
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    
                    {/* Language Tabs */}
                    <div className="border rounded-lg overflow-hidden">
                        <div className="flex border-b bg-gray-50 overflow-x-auto">
                            {languages.map(lang => (
                                <button
                                    key={lang.code}
                                    type="button"
                                    onClick={() => setActiveLanguage(lang.code)}
                                    className={`px-4 py-2 text-sm whitespace-nowrap ${
                                        activeLanguage === lang.code
                                            ? 'bg-white border-b-2 border-blue-500 text-blue-600'
                                            : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    {lang.native_name || lang.name}
                                    {form.content[lang.code]?.text_content && (
                                        <Check className="w-3 h-3 inline ml-1 text-green-500" />
                                    )}
                                </button>
                            ))}
                        </div>
                        
                        <div className="p-4">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Text Content ({currentLang?.name})
                                    </label>
                                    <textarea
                                        value={form.content[activeLanguage]?.text_content || ''}
                                        onChange={(e) => handleContentChange(activeLanguage, 'text_content', e.target.value)}
                                        placeholder={`Enter text in ${currentLang?.name}...`}
                                        rows={3}
                                        dir={currentLang?.direction || 'ltr'}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => handleGenerateTTS(activeLanguage)}
                                        disabled={generating || !form.content[activeLanguage]?.text_content}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {generating ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Mic className="w-4 h-4" />
                                        )}
                                        Generate Audio
                                    </button>
                                    
                                    {previewAudio && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={playPreview}
                                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                            >
                                                <Play className="w-4 h-4" />
                                                Preview
                                            </button>
                                            
                                            <button
                                                type="button"
                                                onClick={() => handleSaveAudio(activeLanguage)}
                                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                                            >
                                                <Upload className="w-4 h-4" />
                                                Save to Library
                                            </button>
                                        </>
                                    )}
                                    
                                    {form.content[activeLanguage]?.audio_id && (
                                        <span className="text-sm text-green-600 flex items-center gap-1">
                                            <Check className="w-4 h-4" />
                                            Audio saved
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={form.is_global}
                            onChange={(e) => handleChange('is_global', e.target.checked)}
                            className="rounded text-blue-600"
                        />
                        <span className="text-sm text-gray-700">
                            Make global (available to all agents)
                        </span>
                    </label>
                </form>
                
                {/* Footer */}
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
                        {segment ? 'Update' : 'Create'}
                    </button>
                </div>
                
                <audio ref={audioRef} />
            </div>
        </div>
    );
};

export default SegmentsList;

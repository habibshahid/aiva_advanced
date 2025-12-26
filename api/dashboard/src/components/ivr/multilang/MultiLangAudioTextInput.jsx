/**
 * Multi-Language Audio Text Input Component
 * 
 * Wraps AudioTextInput with language tabs for multi-language support.
 * Loads/saves content from i18n table while falling back to base fields.
 * 
 * SAFE IMPLEMENTATION:
 * - Does NOT modify existing AudioTextInput
 * - Falls back to base field values if no i18n content exists
 * - All existing functionality preserved
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Globe, Check, AlertCircle, Loader2, Volume2, Mic, Play, Pause } from 'lucide-react';
import toast from 'react-hot-toast';
import * as ivrApi from '../../../services/ivrApi';
import * as ivrApiExt from '../../../services/ivrApiExtensions';

/**
 * Language Tab Bar Component
 */
const LanguageTabs = ({ 
    languages, 
    activeLanguage, 
    onLanguageChange, 
    contentStatus,
    defaultLanguage 
}) => {
    if (!languages || languages.length <= 1) {
        return null; // Don't show tabs if only one language
    }
    
    return (
        <div className="flex items-center gap-1 mb-3 pb-2 border-b border-gray-200 overflow-x-auto">
            <Globe className="w-4 h-4 text-gray-400 flex-shrink-0 mr-1" />
            {languages.map(lang => {
                const isActive = activeLanguage === lang.language_code;
                const hasContent = contentStatus[lang.language_code];
                const isDefault = lang.language_code === defaultLanguage;
                
                return (
                    <button
                        key={lang.language_code}
                        type="button"
                        onClick={() => onLanguageChange(lang.language_code)}
                        className={`
                            flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium
                            transition-colors whitespace-nowrap
                            ${isActive 
                                ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
                            }
                        `}
                    >
                        <span>{lang.flag || '🌐'}</span>
                        <span>{lang.name || lang.language_code}</span>
                        {hasContent && (
                            <Check className="w-3 h-3 text-green-500" />
                        )}
                        {isDefault && !hasContent && (
                            <span className="text-xs text-gray-400">(default)</span>
                        )}
                        {!isDefault && !hasContent && (
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};

/**
 * Audio Controls Component (Generate TTS, Select from Library)
 */
const AudioControls = ({
    audioId,
    onAudioChange,
    audioFiles,
    agentId,
    language,
    text,
    generating,
    onGenerate,
    onPlay,
    isPlaying
}) => {
    const [audioSource, setAudioSource] = useState(audioId ? 'library' : 'none');
    
    useEffect(() => {
        setAudioSource(audioId ? 'library' : 'none');
    }, [audioId]);
    
    return (
        <div className="flex items-center gap-3 text-sm flex-wrap">
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
                <option value="none">None (TTS at runtime)</option>
                <option value="library">From Library</option>
            </select>
            
            {audioSource === 'library' && (
                <select
                    value={audioId || ''}
                    onChange={(e) => onAudioChange(e.target.value || null)}
                    className="px-2 py-1 border rounded text-sm flex-1 min-w-[150px]"
                >
                    <option value="">Select audio...</option>
                    {(audioFiles || []).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            )}
            
            {audioId && (
                <button
                    type="button"
                    onClick={onPlay}
                    className="p-1.5 rounded hover:bg-gray-100"
                    title="Play audio"
                >
                    {isPlaying ? (
                        <Pause className="w-4 h-4 text-blue-600" />
                    ) : (
                        <Play className="w-4 h-4 text-gray-600" />
                    )}
                </button>
            )}
            
            <button
                type="button"
                onClick={onGenerate}
                disabled={generating || !text}
                className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Generate TTS audio"
            >
                {generating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                    <Mic className="w-3 h-3" />
                )}
                <span>Generate</span>
            </button>
        </div>
    );
};

/**
 * Main Multi-Language Audio Text Input Component
 * 
 * @param {string} label - Field label
 * @param {string} entityType - 'flow', 'step', 'intent', 'config'
 * @param {string} entityId - ID of the entity (flow ID, step ID, etc.)
 * @param {string} flowId - Flow ID (required for step entities)
 * @param {string} fieldName - Name of the field (e.g., 'intro_text', 'prompt_text')
 * @param {string} baseTextValue - Base/default text value from the main record
 * @param {string} baseAudioId - Base/default audio ID from the main record
 * @param {function} onBaseTextChange - Callback when base text changes
 * @param {function} onBaseAudioChange - Callback when base audio changes
 * @param {array} languages - Array of agent languages [{language_code, name, flag, is_default}]
 * @param {string} defaultLanguage - Default language code
 * @param {array} audioFiles - Array of available audio files
 * @param {string} agentId - Agent ID for API calls
 * @param {string} placeholder - Input placeholder text
 * @param {boolean} multiline - Whether to use textarea
 * @param {number} rows - Number of rows for textarea
 */
const MultiLangAudioTextInput = ({
    label,
    entityType,
    entityId,
    flowId,
    fieldName,
    baseTextValue = '',
    baseAudioId = null,
    onBaseTextChange,
    onBaseAudioChange,
    languages = [],
    defaultLanguage = 'en',
    audioFiles = [],
    agentId,
    placeholder = '',
    multiline = false,
    rows = 3
}) => {
    // State
    const [activeLanguage, setActiveLanguage] = useState(defaultLanguage);
    const [i18nContent, setI18nContent] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [playingAudio, setPlayingAudio] = useState(null);
    const audioRef = useRef(new Audio());
    
    // Build language list with metadata
    const languageList = languages.map(lang => ({
        language_code: lang.language_code || lang.code,
        name: lang.name,
        flag: lang.flag || '🌐',
        is_default: lang.is_default || lang.language_code === defaultLanguage
    }));
    
    // Find actual default language
    const actualDefaultLang = languageList.find(l => l.is_default)?.language_code || defaultLanguage;
    
    // Load i18n content when entity changes
    useEffect(() => {
        if (entityId && entityType) {
            loadI18nContent();
        }
    }, [entityId, entityType, fieldName]);
    
    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            audioRef.current.pause();
            audioRef.current.src = '';
        };
    }, []);
    
    /**
     * Load i18n content from API
     */
    const loadI18nContent = async () => {
        if (!entityId || !agentId) return;
        
        try {
            setLoading(true);
            
            let response;
            
            switch (entityType) {
                case 'flow':
                    response = await ivrApi.getFlowI18nContent(agentId, entityId);
                    break;
                    
                case 'step':
                    if (!flowId) {
                        console.warn('flowId required for step i18n');
                        return;
                    }
                    response = await ivrApiExt.getStepI18nContent(agentId, flowId, entityId);
                    break;
                    
                case 'intent':
                    response = await ivrApiExt.getIntentI18nContent(agentId, entityId);
                    break;
                    
                case 'config':
                    response = await ivrApiExt.getConfigI18nContent(agentId);
                    break;
                    
                default:
                    // Fallback to generic API
                    response = await ivrApiExt.getGenericI18nContent(entityType, entityId);
            }
            
            const content = response?.data || {};
            
            // Extract content for this specific field
            const fieldContent = content[fieldName] || {};
            setI18nContent(fieldContent);
            
        } catch (error) {
            console.error('Failed to load i18n content:', error);
            // Don't show error toast - fallback to base values silently
        } finally {
            setLoading(false);
        }
    };
    
    /**
     * Save i18n content for a specific language
     */
    const saveI18nContent = useCallback(async (langCode, textContent, audioId) => {
        if (!entityId || !agentId) return;
        
        try {
            setSaving(true);
            
            const data = {
                text_content: textContent,
                audio_id: audioId
            };
            
            switch (entityType) {
                case 'flow':
                    await ivrApi.setFlowI18nContent(agentId, entityId, fieldName, langCode, data);
                    break;
                    
                case 'step':
                    if (!flowId) {
                        console.warn('flowId required for step i18n');
                        return;
                    }
                    await ivrApiExt.setStepI18nContent(agentId, flowId, entityId, fieldName, langCode, data);
                    break;
                    
                case 'intent':
                    await ivrApiExt.setIntentI18nContent(agentId, entityId, fieldName, langCode, data);
                    break;
                    
                case 'config':
                    await ivrApiExt.setConfigI18nContent(agentId, fieldName, langCode, data);
                    break;
                    
                default:
                    // Fallback to generic API
                    await ivrApiExt.setGenericI18nContent(entityType, entityId, fieldName, langCode, data);
            }
            
            // Update local state
            setI18nContent(prev => ({
                ...prev,
                [langCode]: {
                    text_content: textContent,
                    audio_id: audioId
                }
            }));
            
        } catch (error) {
            console.error('Failed to save i18n content:', error);
            toast.error('Failed to save translation');
        } finally {
            setSaving(false);
        }
    }, [entityId, entityType, fieldName, agentId, flowId]);
    
    /**
     * Get current text value for active language
     * Falls back to base value for default language
     */
    const getCurrentText = () => {
        const langContent = i18nContent[activeLanguage];
        
        if (langContent?.text_content) {
            return langContent.text_content;
        }
        
        // For default language, fall back to base value
        if (activeLanguage === actualDefaultLang) {
            return baseTextValue || '';
        }
        
        return '';
    };
    
    /**
     * Get current audio ID for active language
     * Falls back to base audio for default language
     */
    const getCurrentAudioId = () => {
        const langContent = i18nContent[activeLanguage];
        
        if (langContent?.audio_id) {
            return langContent.audio_id;
        }
        
        // For default language, fall back to base audio
        if (activeLanguage === actualDefaultLang) {
            return baseAudioId;
        }
        
        return null;
    };
    
    /**
     * Handle text change
     */
    const handleTextChange = (newText) => {
        // For default language, also update base value
        if (activeLanguage === actualDefaultLang) {
            onBaseTextChange?.(newText);
        }
        
        // Update i18n content (will auto-save)
        const currentAudioId = getCurrentAudioId();
        
        // Debounced save
        setI18nContent(prev => ({
            ...prev,
            [activeLanguage]: {
                ...prev[activeLanguage],
                text_content: newText
            }
        }));
    };
    
    /**
     * Handle audio change
     */
    const handleAudioChange = (newAudioId) => {
        // For default language, also update base value
        if (activeLanguage === actualDefaultLang) {
            onBaseAudioChange?.(newAudioId);
        }
        
        // Update i18n content
        const currentText = getCurrentText();
        saveI18nContent(activeLanguage, currentText, newAudioId);
    };
    
    /**
     * Handle text blur - save on blur
     */
    const handleTextBlur = () => {
        const currentText = getCurrentText();
        const currentAudioId = getCurrentAudioId();
        
        // Save for non-default languages
        if (activeLanguage !== actualDefaultLang || i18nContent[activeLanguage]) {
            saveI18nContent(activeLanguage, currentText, currentAudioId);
        }
    };
    
    /**
     * Generate TTS for current language
     */
    const handleGenerateTTS = async () => {
        const text = getCurrentText();
        if (!text) {
            toast.error('Enter text first');
            return;
        }
        
        try {
            setGenerating(true);
            
            const result = await ivrApi.generateTTS(agentId, {
                text: text,
                language: activeLanguage,
                name: `${fieldName}_${activeLanguage}`
            });
            
            if (result.data?.id) {
                handleAudioChange(result.data.id);
                toast.success('Audio generated and saved');
            }
        } catch (error) {
            console.error('TTS generation failed:', error);
            toast.error('Failed to generate audio');
        } finally {
            setGenerating(false);
        }
    };
    
    /**
     * Play audio preview
     */
    const handlePlayAudio = () => {
        const audioId = getCurrentAudioId();
        if (!audioId) return;
        
        if (playingAudio === audioId) {
            audioRef.current.pause();
            setPlayingAudio(null);
        } else {
            const url = ivrApi.getAudioStreamUrl(agentId, audioId);
            audioRef.current.src = url;
            audioRef.current.play();
            setPlayingAudio(audioId);
            
            audioRef.current.onended = () => setPlayingAudio(null);
        }
    };
    
    /**
     * Build content status for tabs (which languages have content)
     */
    const contentStatus = {};
    languageList.forEach(lang => {
        const langCode = lang.language_code;
        const hasI18n = i18nContent[langCode]?.text_content || i18nContent[langCode]?.audio_id;
        const hasBase = langCode === actualDefaultLang && (baseTextValue || baseAudioId);
        contentStatus[langCode] = hasI18n || hasBase;
    });
    
    // Current values
    const currentText = getCurrentText();
    const currentAudioId = getCurrentAudioId();
    
    // Get direction for RTL languages
    const currentLang = languageList.find(l => l.language_code === activeLanguage);
    const isRTL = ['ur', 'ar', 'ar-eg', 'ar-sa', 'ps', 'sd', 'bal'].includes(activeLanguage);
    
    return (
        <div className="space-y-2">
            {/* Label */}
            <label className="block text-sm font-medium text-gray-700">
                {label}
                {saving && (
                    <span className="ml-2 text-xs text-blue-500">
                        <Loader2 className="w-3 h-3 inline animate-spin" /> Saving...
                    </span>
                )}
            </label>
            
            {/* Language Tabs */}
            {languageList.length > 1 && (
                <LanguageTabs
                    languages={languageList}
                    activeLanguage={activeLanguage}
                    onLanguageChange={setActiveLanguage}
                    contentStatus={contentStatus}
                    defaultLanguage={actualDefaultLang}
                />
            )}
            
            {/* Text Input */}
            {loading ? (
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
            ) : multiline ? (
                <textarea
                    value={currentText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    onBlur={handleTextBlur}
                    placeholder={placeholder}
                    rows={rows}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={`
                        w-full px-3 py-2 border rounded-lg
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        ${isRTL ? 'text-right' : 'text-left'}
                    `}
                />
            ) : (
                <input
                    type="text"
                    value={currentText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    onBlur={handleTextBlur}
                    placeholder={placeholder}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={`
                        w-full px-3 py-2 border rounded-lg
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        ${isRTL ? 'text-right' : 'text-left'}
                    `}
                />
            )}
            
            {/* Audio Controls */}
            <AudioControls
                audioId={currentAudioId}
                onAudioChange={handleAudioChange}
                audioFiles={audioFiles}
                agentId={agentId}
                language={activeLanguage}
                text={currentText}
                generating={generating}
                onGenerate={handleGenerateTTS}
                onPlay={handlePlayAudio}
                isPlaying={playingAudio === currentAudioId}
            />
            
            {/* Language hint */}
            {activeLanguage !== actualDefaultLang && !contentStatus[activeLanguage] && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    No translation for {currentLang?.name}. Will use {actualDefaultLang} at runtime.
                </p>
            )}
        </div>
    );
};

export default MultiLangAudioTextInput;
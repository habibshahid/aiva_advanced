/**
 * Language Settings Component
 * Configure agent languages, TTS voices per language, and view translation coverage
 * 
 * IMPORTANT: This saves tts_provider and tts_voice per language to the database,
 * which the bridge reads to select the correct voice when generating TTS.
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
    Globe, Check, X, AlertCircle, RefreshCw, Volume2,
    ChevronDown, ChevronUp, Loader2, Settings, BarChart3,
    Languages, Mic, Play, Pause
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as ivrApi from '../../services/ivrApi';

// All supported languages
const ALL_LANGUAGES = [
    { code: 'en', name: 'English', native: 'English', region: 'Global', flag: '🇺🇸' },
    { code: 'ur', name: 'Urdu', native: 'اردو', region: 'Pakistan', flag: '🇵🇰', direction: 'rtl' },
    { code: 'ur-roman', name: 'Roman Urdu', native: 'Roman Urdu', region: 'Pakistan', flag: '🇵🇰' },
    { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ / پنجابی', region: 'Pakistan/India', flag: '🇵🇰' },
    { code: 'sd', name: 'Sindhi', native: 'سنڌي', region: 'Pakistan', flag: '🇵🇰', direction: 'rtl' },
    { code: 'ps', name: 'Pashto', native: 'پښتو', region: 'Pakistan/Afghanistan', flag: '🇦🇫', direction: 'rtl' },
    { code: 'bal', name: 'Balochi', native: 'بلوچی', region: 'Pakistan', flag: '🇵🇰', direction: 'rtl' },
    { code: 'ar', name: 'Arabic', native: 'العربية', region: 'Middle East', flag: '🇸🇦', direction: 'rtl' },
    { code: 'ar-eg', name: 'Arabic (Egyptian)', native: 'العربية المصرية', region: 'Egypt', flag: '🇪🇬', direction: 'rtl' },
    { code: 'ar-sa', name: 'Arabic (Saudi)', native: 'العربية السعودية', region: 'Saudi Arabia', flag: '🇸🇦', direction: 'rtl' },
    { code: 'hi', name: 'Hindi', native: 'हिंदी', region: 'India', flag: '🇮🇳' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা', region: 'India/Bangladesh', flag: '🇧🇩' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்', region: 'India', flag: '🇮🇳' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు', region: 'India', flag: '🇮🇳' },
    { code: 'es', name: 'Spanish', native: 'Español', region: 'Global', flag: '🇪🇸' },
    { code: 'fr', name: 'French', native: 'Français', region: 'Global', flag: '🇫🇷' },
    { code: 'de', name: 'German', native: 'Deutsch', region: 'Europe', flag: '🇩🇪' },
    { code: 'zh', name: 'Chinese', native: '中文', region: 'China', flag: '🇨🇳' }
];

// TTS Provider options
const TTS_PROVIDERS = [
    { id: 'uplift', name: 'Uplift', description: 'Best for Urdu/Punjabi - ~$0.0008/sec' },
    { id: 'azure', name: 'Azure', description: 'Microsoft neural voices - ~$0.016/1000 chars' },
    { id: 'openai', name: 'OpenAI', description: 'Same as Realtime API - ~$0.015/1000 chars' }
];

// TTS Voice options per language with provider
const TTS_VOICES = {
    'en': [
        { id: 'en-US-JennyNeural', name: 'Jenny (US Female)', provider: 'azure' },
        { id: 'en-US-GuyNeural', name: 'Guy (US Male)', provider: 'azure' },
        { id: 'en-GB-SoniaNeural', name: 'Sonia (UK Female)', provider: 'azure' },
        { id: 'en-GB-RyanNeural', name: 'Ryan (UK Male)', provider: 'azure' },
        { id: 'nova', name: 'Nova (Female)', provider: 'openai' },
        { id: 'alloy', name: 'Alloy (Neutral)', provider: 'openai' },
        { id: 'echo', name: 'Echo (Male)', provider: 'openai' },
        { id: 'shimmer', name: 'Shimmer (Female)', provider: 'openai' }
    ],
    'ur': [
        { id: 'v_8eelc901', name: 'Ayesha (Female - Professional)', provider: 'uplift' },
        { id: 'v_meklc281', name: 'Fatima (Female - Natural)', provider: 'uplift' },
        { id: 'v_kl3mc456', name: 'Ahmed (Male - Professional)', provider: 'uplift' },
        { id: 'ur-PK-UzmaNeural', name: 'Uzma (Female)', provider: 'azure' },
        { id: 'ur-PK-AsadNeural', name: 'Asad (Male)', provider: 'azure' }
    ],
    'ur-roman': [
        { id: 'v_8eelc901', name: 'Ayesha (Female)', provider: 'uplift' },
        { id: 'v_meklc281', name: 'Fatima (Female)', provider: 'uplift' },
        { id: 'ur-PK-UzmaNeural', name: 'Uzma (Female)', provider: 'azure' },
        { id: 'ur-PK-AsadNeural', name: 'Asad (Male)', provider: 'azure' }
    ],
    'hi': [
        { id: 'hi-IN-SwaraNeural', name: 'Swara (Female)', provider: 'azure' },
        { id: 'hi-IN-MadhurNeural', name: 'Madhur (Male)', provider: 'azure' }
    ],
    'ar': [
        { id: 'ar-SA-ZariyahNeural', name: 'Zariyah (Female)', provider: 'azure' },
        { id: 'ar-SA-HamedNeural', name: 'Hamed (Male)', provider: 'azure' }
    ],
    'ar-eg': [
        { id: 'ar-EG-SalmaNeural', name: 'Salma (Female)', provider: 'azure' },
        { id: 'ar-EG-ShakirNeural', name: 'Shakir (Male)', provider: 'azure' }
    ],
    'ar-sa': [
        { id: 'ar-SA-ZariyahNeural', name: 'Zariyah (Female)', provider: 'azure' },
        { id: 'ar-SA-HamedNeural', name: 'Hamed (Male)', provider: 'azure' }
    ],
    'es': [
        { id: 'es-ES-ElviraNeural', name: 'Elvira (Female)', provider: 'azure' },
        { id: 'es-ES-AlvaroNeural', name: 'Alvaro (Male)', provider: 'azure' },
        { id: 'es-MX-DaliaNeural', name: 'Dalia (Mexico Female)', provider: 'azure' }
    ],
    'fr': [
        { id: 'fr-FR-DeniseNeural', name: 'Denise (Female)', provider: 'azure' },
        { id: 'fr-FR-HenriNeural', name: 'Henri (Male)', provider: 'azure' }
    ],
    'de': [
        { id: 'de-DE-KatjaNeural', name: 'Katja (Female)', provider: 'azure' },
        { id: 'de-DE-ConradNeural', name: 'Conrad (Male)', provider: 'azure' }
    ],
    'zh': [
        { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (Female)', provider: 'azure' },
        { id: 'zh-CN-YunxiNeural', name: 'Yunxi (Male)', provider: 'azure' }
    ],
    'pa': [
        { id: 'pa-IN-VaaniNeural', name: 'Vaani (Female)', provider: 'azure' }
    ],
    'bn': [
        { id: 'bn-IN-TanishaaNeural', name: 'Tanishaa (Female)', provider: 'azure' },
        { id: 'bn-IN-BashkarNeural', name: 'Bashkar (Male)', provider: 'azure' }
    ],
    'ta': [
        { id: 'ta-IN-PallaviNeural', name: 'Pallavi (Female)', provider: 'azure' },
        { id: 'ta-IN-ValluvarNeural', name: 'Valluvar (Male)', provider: 'azure' }
    ],
    'te': [
        { id: 'te-IN-ShrutiNeural', name: 'Shruti (Female)', provider: 'azure' },
        { id: 'te-IN-MohanNeural', name: 'Mohan (Male)', provider: 'azure' }
    ],
    'ps': [
        { id: 'ps-AF-GulNawazNeural', name: 'Gul Nawaz (Male)', provider: 'azure' },
        { id: 'ps-AF-LatifaNeural', name: 'Latifa (Female)', provider: 'azure' }
    ]
};

// Default voices per language (first option)
const getDefaultVoice = (langCode) => {
    const voices = TTS_VOICES[langCode];
    if (voices && voices.length > 0) {
        return { voice: voices[0].id, provider: voices[0].provider };
    }
    // Fallback to English if no voice configured
    return { voice: 'en-US-JennyNeural', provider: 'azure' };
};

const LanguageSettings = () => {
    const { agentId } = useParams();
    
    // Language state - now includes voice config per language
    const [languageConfigs, setLanguageConfigs] = useState({}); // { langCode: { enabled, is_default, tts_provider, tts_voice } }
    const [coverage, setCoverage] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('languages');
    const [testText, setTestText] = useState('Hello, how can I help you today?');
    const [testLang, setTestLang] = useState('en');
    const [testing, setTesting] = useState(false);
    const [playingAudio, setPlayingAudio] = useState(null);
    
    useEffect(() => {
        loadData();
    }, [agentId]);
    
    const loadData = async () => {
        try {
			setLoading(true);
			
			const [langRes, coverageRes] = await Promise.all([
				ivrApi.getAgentLanguages(agentId),
				ivrApi.getAgentLanguageCoverage(agentId).catch(() => ({ data: [] }))
			]);
			
			const langs = langRes.data || [];
			
			// Build config map from loaded languages
			const configs = {};
			for (const lang of langs) {
				configs[lang.language_code] = {
					enabled: true,
					is_default: lang.is_default || false,
					tts_provider: lang.tts_provider || getDefaultVoice(lang.language_code).provider,
					tts_voice: lang.tts_voice_id || lang.tts_voice || getDefaultVoice(lang.language_code).voice  // <-- FIX HERE
				};
			}
			
			setLanguageConfigs(configs);
            setCoverage(coverageRes.data || []);
            
            // Set test language to default or first enabled
            const defaultLang = langs.find(l => l.is_default);
            if (defaultLang) {
                setTestLang(defaultLang.language_code);
            } else if (langs.length > 0) {
                setTestLang(langs[0].language_code);
            }
            
        } catch (error) {
            console.error('Failed to load language settings:', error);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };
    
    const handleToggleLanguage = (langCode) => {
        setLanguageConfigs(prev => {
            const current = prev[langCode];
            
            if (current?.enabled) {
                // Trying to disable - check if it's default
                if (current.is_default) {
                    toast.error('Cannot disable default language');
                    return prev;
                }
                // Remove from configs
                const { [langCode]: removed, ...rest } = prev;
                return rest;
            } else {
                // Enable with default voice
                const defaultVoice = getDefaultVoice(langCode);
                return {
                    ...prev,
                    [langCode]: {
                        enabled: true,
                        is_default: false,
                        tts_provider: defaultVoice.provider,
                        tts_voice: defaultVoice.voice
                    }
                };
            }
        });
    };
    
    const handleSetDefault = (langCode) => {
        if (!languageConfigs[langCode]?.enabled) {
            toast.error('Enable language first');
            return;
        }
        
        setLanguageConfigs(prev => {
            const updated = { ...prev };
            // Remove default from all
            for (const code in updated) {
                updated[code] = { ...updated[code], is_default: false };
            }
            // Set new default
            updated[langCode] = { ...updated[langCode], is_default: true };
            return updated;
        });
    };
    
    const handleProviderChange = (langCode, providerId) => {
        // Get first voice from this provider for this language
        const voices = TTS_VOICES[langCode]?.filter(v => v.provider === providerId) || [];
        const firstVoice = voices[0];
        
        setLanguageConfigs(prev => ({
            ...prev,
            [langCode]: {
                ...prev[langCode],
                tts_provider: providerId,
                tts_voice: firstVoice?.id || null
            }
        }));
    };
    
    const handleVoiceChange = (langCode, voiceId) => {
        const voice = TTS_VOICES[langCode]?.find(v => v.id === voiceId);
        if (!voice) return;
        
        setLanguageConfigs(prev => ({
            ...prev,
            [langCode]: {
                ...prev[langCode],
                tts_provider: voice.provider,
                tts_voice: voice.id
            }
        }));
    };
    
    const handleSave = async () => {
        const enabledLanguages = Object.keys(languageConfigs).filter(code => languageConfigs[code]?.enabled);
        
        if (enabledLanguages.length === 0) {
            toast.error('Select at least one language');
            return;
        }
        
        const hasDefault = enabledLanguages.some(code => languageConfigs[code]?.is_default);
        if (!hasDefault) {
            toast.error('Select a default language');
            return;
        }
        
        try {
            setSaving(true);
            
            // Build language data with voice configuration
            const languageData = enabledLanguages.map(code => ({
                language_code: code,
                is_default: languageConfigs[code].is_default || false,
                tts_provider: languageConfigs[code].tts_provider,
                tts_voice: languageConfigs[code].tts_voice
            }));
            
            // Save all language data including voices
            // Uses existing updateAgentLanguages - backend needs to handle objects
            await ivrApi.updateAgentLanguages(agentId, languageData);
            
            toast.success('Language settings saved');
            loadData();
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };
    
    const handleTestTTS = async () => {
        if (!testText.trim()) {
            toast.error('Enter test text');
            return;
        }
        
        const config = languageConfigs[testLang];
        if (!config) {
            toast.error('Language not configured');
            return;
        }
        
        try {
            setTesting(true);
            
            // Generate TTS with specific voice
            const result = await ivrApi.generateTTS(agentId, {
                text: testText,
                language: testLang,
                voice: config.tts_voice,
                provider: config.tts_provider
            });
            
            if (result.data?.audio_url || result.data?.stream_url) {
                const url = result.data.audio_url || ivrApi.getAudioStreamUrl(agentId, result.data.id);
                const audio = new Audio(url);
                setPlayingAudio(testLang);
                audio.onended = () => setPlayingAudio(null);
                audio.play();
            } else {
                toast.error('No audio generated');
            }
        } catch (error) {
            console.error('TTS test error:', error);
            toast.error('TTS test failed');
        } finally {
            setTesting(false);
        }
    };
    
    // Get enabled languages
    const enabledLanguages = Object.keys(languageConfigs).filter(code => languageConfigs[code]?.enabled);
    const defaultLanguage = enabledLanguages.find(code => languageConfigs[code]?.is_default);
    
    // Group languages by region
    const groupedLanguages = ALL_LANGUAGES.reduce((acc, lang) => {
        const region = lang.region.split('/')[0];
        if (!acc[region]) acc[region] = [];
        acc[region].push(lang);
        return acc;
    }, {});
    
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
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Globe className="w-6 h-6" />
                        Language Settings
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Configure supported languages, TTS voices, and view translation coverage
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    Save Changes
                </button>
            </div>
            
            {/* Tabs */}
            <div className="border-b mb-6">
                <div className="flex gap-6">
                    {[
                        { id: 'languages', label: 'Languages', icon: Languages },
                        { id: 'voices', label: 'TTS Voices', icon: Mic },
                        { id: 'coverage', label: 'Coverage', icon: BarChart3 }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium ${
                                activeTab === tab.id
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Languages Tab */}
            {activeTab === 'languages' && (
                <div className="space-y-6">
                    {Object.entries(groupedLanguages).map(([region, langs]) => (
                        <div key={region} className="bg-white rounded-lg border">
                            <div className="px-4 py-3 border-b bg-gray-50">
                                <h3 className="font-medium text-gray-900">{region}</h3>
                            </div>
                            <div className="divide-y">
                                {langs.map(lang => {
                                    const config = languageConfigs[lang.code];
                                    const isEnabled = config?.enabled;
                                    const isDefault = config?.is_default;
                                    
                                    return (
                                        <div
                                            key={lang.code}
                                            className={`flex items-center justify-between px-4 py-3 ${
                                                isEnabled ? 'bg-blue-50' : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{lang.flag}</span>
                                                <div>
                                                    <div className="font-medium text-gray-900">
                                                        {lang.name}
                                                        {isDefault && (
                                                            <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                                                                Default
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {lang.native}
                                                        {lang.direction === 'rtl' && (
                                                            <span className="ml-2 text-xs text-gray-400">(RTL)</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                {isEnabled && !isDefault && (
                                                    <button
                                                        onClick={() => handleSetDefault(lang.code)}
                                                        className="text-sm text-blue-600 hover:text-blue-700"
                                                    >
                                                        Set as Default
                                                    </button>
                                                )}
                                                
                                                <button
                                                    onClick={() => handleToggleLanguage(lang.code)}
                                                    className={`w-12 h-6 rounded-full transition-colors ${
                                                        isEnabled ? 'bg-blue-600' : 'bg-gray-300'
                                                    }`}
                                                >
                                                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                                        isEnabled ? 'translate-x-6' : 'translate-x-0.5'
                                                    }`} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {/* Voices Tab */}
            {activeTab === 'voices' && (
                <div className="space-y-6">
                    {/* Voice Configuration */}
                    <div className="bg-white rounded-lg border">
                        <div className="px-4 py-3 border-b bg-gray-50">
                            <h3 className="font-medium text-gray-900">Voice Configuration</h3>
                            <p className="text-sm text-gray-500">
                                Select TTS provider and voice for each enabled language
                            </p>
                        </div>
                        <div className="divide-y">
                            {enabledLanguages.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                    <Languages className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                    <p>No languages enabled yet.</p>
                                    <p className="text-sm">Go to the Languages tab to enable languages.</p>
                                </div>
                            ) : (
                                enabledLanguages.map(code => {
                                    const lang = ALL_LANGUAGES.find(l => l.code === code);
                                    const config = languageConfigs[code];
                                    const allVoices = TTS_VOICES[code] || [];
                                    const currentProvider = config?.tts_provider || 'azure';
                                    
                                    // Filter voices by selected provider
                                    const filteredVoices = allVoices.filter(v => v.provider === currentProvider);
                                    const currentVoice = allVoices.find(v => v.id === config?.tts_voice);
                                    
                                    // Get available providers for this language
                                    const availableProviders = [...new Set(allVoices.map(v => v.provider))];
                                    
                                    return (
                                        <div key={code} className="px-4 py-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">{lang?.flag}</span>
                                                    <div>
                                                        <div className="font-medium text-gray-900">
                                                            {lang?.name}
                                                            {config?.is_default && (
                                                                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                                                                    Default
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {currentVoice ? (
                                                                <span className="text-green-600 flex items-center gap-1">
                                                                    <Check className="w-3 h-3" />
                                                                    {currentVoice.name}
                                                                </span>
                                                            ) : (
                                                                <span className="text-amber-600 flex items-center gap-1">
                                                                    <AlertCircle className="w-3 h-3" />
                                                                    No voice selected
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Provider and Voice Selection Row */}
                                            <div className="flex items-start gap-4 ml-9">
                                                {/* Provider Selection */}
                                                <div className="flex-1">
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                                        Provider
                                                    </label>
                                                    <select
                                                        value={currentProvider}
                                                        onChange={(e) => handleProviderChange(code, e.target.value)}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    >
                                                        {TTS_PROVIDERS.filter(p => availableProviders.includes(p.id)).map(provider => (
                                                            <option key={provider.id} value={provider.id}>
                                                                {provider.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        {TTS_PROVIDERS.find(p => p.id === currentProvider)?.description}
                                                    </p>
                                                </div>
                                                
                                                {/* Voice Selection */}
                                                <div className="flex-1">
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                                        Voice
                                                    </label>
                                                    <select
                                                        value={config?.tts_voice || ''}
                                                        onChange={(e) => handleVoiceChange(code, e.target.value)}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    >
                                                        <option value="">Select voice...</option>
                                                        {filteredVoices.map(voice => (
                                                            <option key={voice.id} value={voice.id}>
                                                                {voice.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {filteredVoices.length === 0 && (
                                                        <p className="text-xs text-amber-500 mt-1">
                                                            No voices available for this provider
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                    
                    {/* TTS Test */}
                    <div className="bg-white rounded-lg border">
                        <div className="px-4 py-3 border-b bg-gray-50">
                            <h3 className="font-medium text-gray-900">Test TTS</h3>
                            <p className="text-sm text-gray-500">
                                Preview voice output for each language
                            </p>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="flex gap-3">
                                <select
                                    value={testLang}
                                    onChange={(e) => setTestLang(e.target.value)}
                                    className="px-3 py-2 border rounded-lg"
                                >
                                    {enabledLanguages.map(code => {
                                        const lang = ALL_LANGUAGES.find(l => l.code === code);
                                        return (
                                            <option key={code} value={code}>
                                                {lang?.flag} {lang?.name}
                                            </option>
                                        );
                                    })}
                                </select>
                                
                                <input
                                    type="text"
                                    value={testText}
                                    onChange={(e) => setTestText(e.target.value)}
                                    placeholder="Enter text to test..."
                                    className="flex-1 px-3 py-2 border rounded-lg"
                                    dir={ALL_LANGUAGES.find(l => l.code === testLang)?.direction || 'ltr'}
                                />
                                
                                <button
                                    onClick={handleTestTTS}
                                    disabled={testing || !languageConfigs[testLang]?.tts_voice}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                    {testing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : playingAudio === testLang ? (
                                        <Pause className="w-4 h-4" />
                                    ) : (
                                        <Play className="w-4 h-4" />
                                    )}
                                    Test
                                </button>
                            </div>
                            
                            {!languageConfigs[testLang]?.tts_voice && (
                                <p className="text-sm text-amber-600 flex items-center gap-1">
                                    <AlertCircle className="w-4 h-4" />
                                    Select a voice for {ALL_LANGUAGES.find(l => l.code === testLang)?.name} first
                                </p>
                            )}
                            
                            {/* Show current config for test language */}
                            {languageConfigs[testLang]?.tts_voice && (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Volume2 className="w-4 h-4" />
                                    Testing with: {TTS_PROVIDERS.find(p => p.id === languageConfigs[testLang]?.tts_provider)?.name} / 
                                    {TTS_VOICES[testLang]?.find(v => v.id === languageConfigs[testLang]?.tts_voice)?.name}
                                </div>
                            )}
                            
                            <div className="text-sm text-gray-500 border-t pt-3">
                                <p className="font-medium mb-2">Sample texts:</p>
                                <ul className="space-y-1">
                                    <li>🇺🇸 English: "Hello, how can I help you today?"</li>
                                    <li>🇵🇰 Urdu: "السلام علیکم! آپ کی کیا مدد کر سکتی ہوں؟"</li>
                                    <li>🇵🇰 Roman Urdu: "Assalam o alaikum! Aap ki kya madad kar sakti hoon?"</li>
                                    <li>🇮🇳 Hindi: "नमस्ते! मैं आपकी कैसे मदद कर सकती हूं?"</li>
                                    <li>🇸🇦 Arabic: "مرحباً! كيف يمكنني مساعدتك؟"</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Coverage Tab */}
            {activeTab === 'coverage' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-lg border">
                        <div className="px-4 py-3 border-b bg-gray-50">
                            <h3 className="font-medium text-gray-900">Translation Coverage</h3>
                            <p className="text-sm text-gray-500">
                                Percentage of content translated per language
                            </p>
                        </div>
                        <div className="p-4">
                            {!coverage || coverage.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                    <p>No coverage data available.</p>
                                    <p className="text-sm">Add content with translations to see coverage stats.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {(coverage.languages || coverage).map(item => {
                                        const lang = ALL_LANGUAGES.find(l => l.code === item.language_code);
                                        const percent = item.coverage_percent || 0;
                                        
                                        return (
                                            <div key={item.language_code} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span>{lang?.flag || '🌐'}</span>
                                                        <span className="font-medium">{item.language_name || lang?.name}</span>
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {item.translated_count || 0}/{item.total_count || 0} items
                                                        {item.segments_with_audio > 0 && (
                                                            <span className="ml-2 text-green-600">
                                                                ({item.segments_with_audio} with audio)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                                                            percent >= 80 ? 'bg-green-500' :
                                                            percent >= 50 ? 'bg-yellow-500' :
                                                            'bg-red-500'
                                                        }`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                                                        {percent.toFixed(0)}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Quick Actions */}
                    <div className="bg-white rounded-lg border p-4">
                        <h3 className="font-medium text-gray-900 mb-3">Quick Actions</h3>
                        <div className="flex flex-wrap gap-3">
                            <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
                                Auto-translate Missing
                            </button>
                            <button className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
                                Generate Missing Audio
                            </button>
                            <button className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
                                Export Translations
                            </button>
                            <button className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200">
                                Import Translations
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LanguageSettings;
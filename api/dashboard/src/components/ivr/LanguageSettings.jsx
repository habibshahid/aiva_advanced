/**
 * Language Settings Component
 * Configure agent languages, TTS voices, and view translation coverage
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
    { code: 'es', name: 'Spanish', native: 'Español', region: 'Global', flag: '🇪🇸' },
    { code: 'fr', name: 'French', native: 'Français', region: 'Global', flag: '🇫🇷' },
    { code: 'de', name: 'German', native: 'Deutsch', region: 'Europe', flag: '🇩🇪' },
    { code: 'zh', name: 'Chinese', native: '中文', region: 'China', flag: '🇨🇳' }
];

// TTS Voice options per language
const TTS_VOICES = {
    'en': [
        { id: 'aria', name: 'Aria (Female)', provider: 'elevenlabs' },
        { id: 'roger', name: 'Roger (Male)', provider: 'elevenlabs' },
        { id: 'sarah', name: 'Sarah (Female)', provider: 'elevenlabs' },
        { id: 'en-US-Neural2-F', name: 'US Female', provider: 'google' },
        { id: 'en-US-Neural2-D', name: 'US Male', provider: 'google' }
    ],
    'ur': [
        { id: 'ur-PK-AsadNeural', name: 'Asad (Male)', provider: 'azure' },
        { id: 'ur-PK-UzmaNeural', name: 'Uzma (Female)', provider: 'azure' }
    ],
    'ur-roman': [
        { id: 'ur-PK-AsadNeural', name: 'Asad (Male)', provider: 'azure' },
        { id: 'ur-PK-UzmaNeural', name: 'Uzma (Female)', provider: 'azure' }
    ],
    'hi': [
        { id: 'hi-IN-MadhurNeural', name: 'Madhur (Male)', provider: 'azure' },
        { id: 'hi-IN-SwaraNeural', name: 'Swara (Female)', provider: 'azure' }
    ],
    'ar': [
        { id: 'ar-SA-HamedNeural', name: 'Hamed (Male)', provider: 'azure' },
        { id: 'ar-SA-ZariyahNeural', name: 'Zariyah (Female)', provider: 'azure' }
    ],
    'es': [
        { id: 'es-ES-AlvaroNeural', name: 'Alvaro (Male)', provider: 'azure' },
        { id: 'es-ES-ElviraNeural', name: 'Elvira (Female)', provider: 'azure' }
    ],
    'fr': [
        { id: 'fr-FR-HenriNeural', name: 'Henri (Male)', provider: 'azure' },
        { id: 'fr-FR-DeniseNeural', name: 'Denise (Female)', provider: 'azure' }
    ],
    'de': [
        { id: 'de-DE-ConradNeural', name: 'Conrad (Male)', provider: 'azure' },
        { id: 'de-DE-KatjaNeural', name: 'Katja (Female)', provider: 'azure' }
    ],
    'zh': [
        { id: 'zh-CN-YunxiNeural', name: 'Yunxi (Male)', provider: 'azure' },
        { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (Female)', provider: 'azure' }
    ],
    'pa': [
        { id: 'pa-generic', name: 'Punjabi Voice', provider: 'custom' }
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
    ]
};

const LanguageSettings = () => {
    const { agentId } = useParams();
    
    const [agentLanguages, setAgentLanguages] = useState([]);
    const [defaultLanguage, setDefaultLanguage] = useState('en');
    const [ttsConfig, setTtsConfig] = useState({ voices: {} });
    const [coverage, setCoverage] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('languages');
    const [testText, setTestText] = useState('Hello, how can I help you today?');
    const [testLang, setTestLang] = useState('en');
    const [testing, setTesting] = useState(false);
    
    useEffect(() => {
        loadData();
    }, [agentId]);
    
    const loadData = async () => {
        try {
            setLoading(true);
            
            const [langRes, coverageRes] = await Promise.all([
                ivrApi.getAgentLanguages(agentId),
                ivrApi.getAgentLanguageCoverage(agentId)
            ]);
            
			console.log('@@@@@@@@@@@', coverageRes)
            const langs = langRes.data || [];
            setAgentLanguages(langs.map(l => l.language_code));
            
            const defaultLang = langs.find(l => l.is_default);
            if (defaultLang) {
                setDefaultLanguage(defaultLang.language_code);
            }
            
            setCoverage(coverageRes.data || []);
            
            // Load TTS config from agent
            // This would come from agent settings
            setTtsConfig({
                provider: 'elevenlabs',
                voices: {
                    en: { voice_id: 'aria', name: 'Aria' },
                    ur: { voice_id: 'ur-PK-UzmaNeural', name: 'Uzma' }
                }
            });
            
        } catch (error) {
            console.error('Failed to load language settings:', error);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };
    
    const handleToggleLanguage = (langCode) => {
        setAgentLanguages(prev => {
            if (prev.includes(langCode)) {
                // Don't remove if it's the default
                if (langCode === defaultLanguage) {
                    toast.error('Cannot remove default language');
                    return prev;
                }
                return prev.filter(l => l !== langCode);
            }
            return [...prev, langCode];
        });
    };
    
    const handleSetDefault = (langCode) => {
        if (!agentLanguages.includes(langCode)) {
            toast.error('Enable language first');
            return;
        }
        setDefaultLanguage(langCode);
    };
    
    const handleVoiceChange = (langCode, voiceId) => {
        const voice = TTS_VOICES[langCode]?.find(v => v.id === voiceId);
        setTtsConfig(prev => ({
            ...prev,
            voices: {
                ...prev.voices,
                [langCode]: voice ? { voice_id: voice.id, name: voice.name } : null
            }
        }));
    };
    
    const handleSave = async () => {
        if (agentLanguages.length === 0) {
            toast.error('Select at least one language');
            return;
        }
        
        if (!agentLanguages.includes(defaultLanguage)) {
            toast.error('Default language must be enabled');
            return;
        }
        
        try {
            setSaving(true);
            
            await ivrApi.updateAgentLanguages(agentId, agentLanguages, defaultLanguage);
            
            // TODO: Save TTS config to agent settings
            
            toast.success('Language settings saved');
            loadData();
        } catch (error) {
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
        
        try {
            setTesting(true);
            const result = await ivrApi.generateTTS(agentId, testText, testLang);
            
            if (result.data?.audio_url) {
                const audio = new Audio(result.data.audio_url);
                audio.play();
            }
        } catch (error) {
            toast.error('TTS test failed');
        } finally {
            setTesting(false);
        }
    };
    
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
                        //{ id: 'voices', label: 'TTS Voices', icon: Mic },
                        { id: 'coverage', label: 'Coverage', icon: BarChart3 }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
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
                    {/* Active Languages Summary */}
                    <div className="bg-blue-50 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-blue-800 mb-2">
                            Active Languages ({agentLanguages.length})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {agentLanguages.map(code => {
                                const lang = ALL_LANGUAGES.find(l => l.code === code);
								return (
                                    <span
                                        key={code}
                                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                                            code === defaultLanguage
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white text-blue-800 border border-blue-200'
                                        }`}
                                    >
                                        {lang?.flag} {lang?.name}
                                        {code === defaultLanguage && (
                                            <span className="text-xs">(Default)</span>
                                        )}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Language Selection by Region */}
                    {Object.entries(groupedLanguages).map(([region, langs]) => (
                        <div key={region} className="bg-white rounded-lg border">
                            <div className="px-4 py-3 border-b bg-gray-50">
                                <h3 className="font-medium text-gray-900">{region}</h3>
                            </div>
                            <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {langs.map(lang => {
                                    const isEnabled = agentLanguages.includes(lang.code);
                                    const isDefault = defaultLanguage === lang.code;
                                    
                                    return (
                                        <div
                                            key={lang.code}
                                            className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                                isEnabled
                                                    ? 'border-blue-500 bg-blue-50'
                                                    : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                            onClick={() => handleToggleLanguage(lang.code)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <span className="text-2xl">{lang.flag}</span>
                                                    <h4 className="font-medium text-gray-900 mt-1">
                                                        {lang.name}
                                                    </h4>
                                                    <p className="text-sm text-gray-500" dir={lang.direction}>
                                                        {lang.native}
                                                    </p>
                                                </div>
                                                
                                                {isEnabled && (
                                                    <div className="flex flex-col gap-1">
                                                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-white" />
                                                        </div>
                                                        
                                                        {!isDefault && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSetDefault(lang.code);
                                                                }}
                                                                className="text-xs text-blue-600 hover:underline"
                                                            >
                                                                Set default
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {isDefault && (
                                                <span className="absolute top-1 right-1 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                                                    Default
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {/* TTS Voices Tab */}
            {activeTab === 'voices' && (
                <div className="space-y-6">
                    {/* Voice Configuration */}
                    <div className="bg-white rounded-lg border">
                        <div className="px-4 py-3 border-b bg-gray-50">
                            <h3 className="font-medium text-gray-900">Voice Configuration</h3>
                            <p className="text-sm text-gray-500">Select TTS voice for each enabled language</p>
                        </div>
                        <div className="p-4 space-y-4">
                            {agentLanguages.map(langCode => {
                                const lang = ALL_LANGUAGES.find(l => l.code === langCode);
                                const voices = TTS_VOICES[langCode] || [];
                                const currentVoice = ttsConfig.voices[langCode];
                                
                                return (
                                    <div key={langCode} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                                        <div className="w-32">
                                            <span className="text-lg mr-2">{lang?.flag}</span>
                                            <span className="font-medium">{lang?.name}</span>
                                        </div>
                                        
                                        <select
                                            value={currentVoice?.voice_id || ''}
                                            onChange={(e) => handleVoiceChange(langCode, e.target.value)}
                                            className="flex-1 px-3 py-2 border rounded-lg"
                                        >
                                            <option value="">Select voice...</option>
                                            {voices.map(voice => (
                                                <option key={voice.id} value={voice.id}>
                                                    {voice.name} ({voice.provider})
                                                </option>
                                            ))}
                                        </select>
                                        
                                        {currentVoice && (
                                            <span className="text-sm text-green-600 flex items-center gap-1">
                                                <Check className="w-4 h-4" />
                                                {currentVoice.name}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* TTS Test */}
                    <div className="bg-white rounded-lg border">
                        <div className="px-4 py-3 border-b bg-gray-50">
                            <h3 className="font-medium text-gray-900">Test TTS</h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="flex gap-3">
                                <select
                                    value={testLang}
                                    onChange={(e) => setTestLang(e.target.value)}
                                    className="px-3 py-2 border rounded-lg"
                                >
                                    {agentLanguages.map(code => {
                                        const lang = ALL_LANGUAGES.find(l => l.code === code);
                                        return (
                                            <option key={code} value={code}>{lang?.name}</option>
                                        );
                                    })}
                                </select>
                                
                                <input
                                    type="text"
                                    value={testText}
                                    onChange={(e) => setTestText(e.target.value)}
                                    placeholder="Enter text to test..."
                                    className="flex-1 px-3 py-2 border rounded-lg"
                                />
                                
                                <button
                                    onClick={handleTestTTS}
                                    disabled={testing}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                    {testing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4" />
                                    )}
                                    Test
                                </button>
                            </div>
                            
                            <div className="text-sm text-gray-500">
                                Sample texts:
                                <ul className="mt-1 space-y-1">
                                    <li>🇺🇸 English: "Hello, how can I help you today?"</li>
                                    <li>🇵🇰 Urdu: "آپ کی کیا مدد کر سکتا ہوں؟"</li>
                                    <li>🇵🇰 Roman Urdu: "Aap ki kya madad kar sakta hoon?"</li>
                                    <li>🇮🇳 Hindi: "मैं आपकी कैसे मदद कर सकता हूं?"</li>
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
                                Percentage of segments and content translated per language
                            </p>
                        </div>
                        <div className="p-4">
                            {coverage.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No coverage data available. Create segments first.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {coverage.languages.map(item => {
                                        const lang = ALL_LANGUAGES.find(l => l.code === item.language_code);
                                        const percent = item.coverage_percent || 0;
                                        
                                        return (
                                            <div key={item.language_code} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span>{lang?.flag}</span>
                                                        <span className="font-medium">{item.language_name}</span>
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {item.translated_segments}/{item.total_segments} segments
                                                        ({item.segments_with_audio} with audio)
                                                    </div>
                                                </div>
                                                
                                                <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`absolute left-0 top-0 h-full rounded-full ${
                                                            percent >= 80 ? 'bg-green-500' :
                                                            percent >= 50 ? 'bg-yellow-500' :
                                                            'bg-red-500'
                                                        }`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                                                        {percent}%
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
                        <div className="flex gap-3">
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

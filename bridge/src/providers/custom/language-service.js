/**
 * Language Service for Bridge
 * Handles language detection, validation, and utilities
 */

// Supported languages configuration
const LANGUAGES = {
    'en': { name: 'English', native: 'English', direction: 'ltr', region: 'Global' },
    'ur': { name: 'Urdu', native: 'اردو', direction: 'rtl', region: 'Pakistan' },
    'ur-roman': { name: 'Roman Urdu', native: 'Roman Urdu', direction: 'ltr', region: 'Pakistan' },
    'pa': { name: 'Punjabi', native: 'پنجابی', direction: 'ltr', region: 'Pakistan/India' },
    'sd': { name: 'Sindhi', native: 'سنڌي', direction: 'rtl', region: 'Pakistan' },
    'ps': { name: 'Pashto', native: 'پښتو', direction: 'rtl', region: 'Pakistan/Afghanistan' },
    'bal': { name: 'Balochi', native: 'بلوچی', direction: 'rtl', region: 'Pakistan' },
    'hi': { name: 'Hindi', native: 'हिन्दी', direction: 'ltr', region: 'India' },
    'ta': { name: 'Tamil', native: 'தமிழ்', direction: 'ltr', region: 'India' },
    'te': { name: 'Telugu', native: 'తెలుగు', direction: 'ltr', region: 'India' },
    'bn': { name: 'Bengali', native: 'বাংলা', direction: 'ltr', region: 'India/Bangladesh' },
    'mr': { name: 'Marathi', native: 'मराठी', direction: 'ltr', region: 'India' },
    'gu': { name: 'Gujarati', native: 'ગુજરાતી', direction: 'ltr', region: 'India' },
    'ar': { name: 'Arabic', native: 'العربية', direction: 'rtl', region: 'Middle East' },
    'ar-eg': { name: 'Arabic (Egyptian)', native: 'العربية المصرية', direction: 'rtl', region: 'Egypt' },
    'ar-sa': { name: 'Arabic (Saudi)', native: 'العربية السعودية', direction: 'rtl', region: 'Saudi Arabia' },
    'es': { name: 'Spanish', native: 'Español', direction: 'ltr', region: 'Global' },
    'fr': { name: 'French', native: 'Français', direction: 'ltr', region: 'Global' },
    'de': { name: 'German', native: 'Deutsch', direction: 'ltr', region: 'Europe' },
    'zh': { name: 'Chinese', native: '中文', direction: 'ltr', region: 'China' }
};

// Language detection patterns
const DETECTION_PATTERNS = {
    // Urdu script
    'ur': /[\u0600-\u06FF\u0750-\u077F]/,
    // Hindi script (Devanagari)
    'hi': /[\u0900-\u097F]/,
    // Arabic script (excluding Urdu-specific)
    'ar': /[\u0621-\u064A\u0660-\u0669]/,
    // Tamil script
    'ta': /[\u0B80-\u0BFF]/,
    // Telugu script
    'te': /[\u0C00-\u0C7F]/,
    // Bengali script
    'bn': /[\u0980-\u09FF]/,
    // Gujarati script
    'gu': /[\u0A80-\u0AFF]/,
    // Chinese characters
    'zh': /[\u4E00-\u9FFF]/,
    // Punjabi (Gurmukhi)
    'pa': /[\u0A00-\u0A7F]/
};

// Roman Urdu common words
const ROMAN_URDU_WORDS = [
    'aap', 'kya', 'hai', 'mein', 'hoon', 'nahi', 'acha', 'theek',
    'shukriya', 'kaise', 'kaisa', 'kahan', 'kyun', 'kab', 'kon',
    'haan', 'ji', 'please', 'zaroor', 'bilkul', 'abhi', 'baad',
    'pehle', 'aur', 'ya', 'lekin', 'agar', 'toh', 'phir',
    'woh', 'yeh', 'kuch', 'sab', 'bohot', 'bahut', 'zyada',
    'kam', 'accha', 'bura', 'chalo', 'chalein', 'dekhein',
    'sunein', 'batao', 'bataiye', 'samajh', 'pata', 'maloom'
];

// Spanish common words
const SPANISH_WORDS = [
    'hola', 'gracias', 'buenos', 'dias', 'como', 'esta', 'bien',
    'por', 'favor', 'si', 'no', 'que', 'donde', 'cuando', 'quien'
];

// French common words
const FRENCH_WORDS = [
    'bonjour', 'merci', 'comment', 'allez', 'vous', 'bien', 'oui',
    'non', 'sil', 'plait', 'je', 'suis', 'est', 'que', 'pourquoi'
];

// German common words
const GERMAN_WORDS = [
    'guten', 'tag', 'danke', 'bitte', 'wie', 'geht', 'gut', 'ja',
    'nein', 'ich', 'bin', 'sie', 'haben', 'ist', 'was', 'warum'
];

class LanguageService {
    constructor(config = {}) {
        this.defaultLanguage = config.defaultLanguage || 'en';
        this.llmApiKey = config.llmApiKey;
        this.apiBaseUrl = config.apiBaseUrl;
        this.apiToken = config.apiToken;
    }

    /**
     * Get all supported languages
     */
    getLanguages() {
        return Object.entries(LANGUAGES).map(([code, info]) => ({
            code,
            ...info
        }));
    }

    /**
     * Get language info by code
     */
    getLanguage(code) {
        return LANGUAGES[code] ? { code, ...LANGUAGES[code] } : null;
    }

    /**
     * Check if language is supported
     */
    isSupported(code) {
        return code in LANGUAGES;
    }

    /**
     * Detect language from text
     */
    detectLanguage(text) {
        if (!text || typeof text !== 'string') {
            return this.defaultLanguage;
        }

        const normalizedText = text.toLowerCase().trim();

        // Check for script-based detection first
        for (const [lang, pattern] of Object.entries(DETECTION_PATTERNS)) {
            if (pattern.test(text)) {
                // Special case: distinguish Urdu from Arabic
                if (lang === 'ur' || lang === 'ar') {
                    // Urdu-specific characters
                    const urduSpecific = /[\u0679\u067E\u0686\u0688\u0691\u06BA\u06BE\u06C1\u06CC\u06D2]/;
                    if (urduSpecific.test(text)) {
                        return 'ur';
                    }
                }
                return lang;
            }
        }

        // Check for Roman Urdu
        const words = normalizedText.split(/\s+/);
        const romanUrduCount = words.filter(w => ROMAN_URDU_WORDS.includes(w)).length;
        if (romanUrduCount >= 2 || (romanUrduCount >= 1 && words.length <= 5)) {
            return 'ur-roman';
        }

        // Check for Spanish
        const spanishCount = words.filter(w => SPANISH_WORDS.includes(w)).length;
        if (spanishCount >= 2) {
            return 'es';
        }

        // Check for French
        const frenchCount = words.filter(w => FRENCH_WORDS.includes(w)).length;
        if (frenchCount >= 2) {
            return 'fr';
        }

        // Check for German
        const germanCount = words.filter(w => GERMAN_WORDS.includes(w)).length;
        if (germanCount >= 2) {
            return 'de';
        }

        // Default to English
        return 'en';
    }

    /**
     * Detect language using LLM (more accurate but slower)
     */
    async detectLanguageLLM(text) {
        if (!this.llmApiKey || !text) {
            return this.detectLanguage(text);
        }

        try {
            const supportedLangs = Object.entries(LANGUAGES)
                .map(([code, info]) => `${code}: ${info.name}`)
                .join(', ');

            const prompt = `Detect the language of this text and respond with ONLY the language code.
Supported languages: ${supportedLangs}

Text: "${text}"

Language code:`;

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.llmApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 10,
                    temperature: 0
                })
            });

            if (response.ok) {
                const data = await response.json();
                const detected = data.choices?.[0]?.message?.content?.trim().toLowerCase();
                
                if (detected && this.isSupported(detected)) {
                    return detected;
                }
            }
        } catch (error) {
            console.error('[LanguageService] LLM detection failed:', error.message);
        }

        // Fall back to pattern-based detection
        return this.detectLanguage(text);
    }

    /**
     * Get agent's configured languages
     */
    async getAgentLanguages(agentId) {
        if (!this.apiBaseUrl || !this.apiToken) {
            return [this.defaultLanguage];
        }

        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/languages/agent/${agentId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                return (data.data || []).map(l => l.code);
            }
        } catch (error) {
            console.error('[LanguageService] Failed to get agent languages:', error.message);
        }

        return [this.defaultLanguage];
    }

    /**
     * Get the best matching language from agent's supported languages
     */
    async getBestLanguage(agentId, detectedLanguage) {
        const agentLanguages = await this.getAgentLanguages(agentId);

        // Exact match
        if (agentLanguages.includes(detectedLanguage)) {
            return detectedLanguage;
        }

        // Fallback mappings
        const fallbacks = {
            'ur-roman': ['ur', 'en'],
            'ar-eg': ['ar', 'en'],
            'ar-sa': ['ar', 'en'],
            'hi': ['ur-roman', 'en'],
            'pa': ['ur-roman', 'hi', 'en']
        };

        const fallbackList = fallbacks[detectedLanguage] || ['en'];
        
        for (const fallback of fallbackList) {
            if (agentLanguages.includes(fallback)) {
                return fallback;
            }
        }

        // Return agent's default language or first available
        return agentLanguages[0] || this.defaultLanguage;
    }

    /**
     * Get TTS voice configuration for language
     */
    getTTSVoice(language, provider = 'elevenlabs') {
        const voices = {
            elevenlabs: {
                'en': 'aria',
                'ur': 'urdu-female-1',
                'ur-roman': 'urdu-female-1',
                'hi': 'hindi-female-1',
                'ar': 'arabic-female-1',
                'default': 'aria'
            },
            azure: {
                'en': 'en-US-JennyNeural',
                'ur': 'ur-PK-UzmaNeural',
                'hi': 'hi-IN-SwaraNeural',
                'ar': 'ar-SA-ZariyahNeural',
                'default': 'en-US-JennyNeural'
            },
            google: {
                'en': 'en-US-Wavenet-F',
                'ur': 'ur-PK-Wavenet-A',
                'hi': 'hi-IN-Wavenet-A',
                'ar': 'ar-XA-Wavenet-A',
                'default': 'en-US-Wavenet-F'
            }
        };

        const providerVoices = voices[provider] || voices.elevenlabs;
        return providerVoices[language] || providerVoices['default'];
    }

    /**
     * Get language direction (ltr/rtl)
     */
    getDirection(code) {
        return LANGUAGES[code]?.direction || 'ltr';
    }

    /**
     * Check if language is RTL
     */
    isRTL(code) {
        return this.getDirection(code) === 'rtl';
    }
}

module.exports = LanguageService;

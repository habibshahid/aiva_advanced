/**
 * Slot Extractor
 * Extracts and validates slot values from user utterances
 * Supports multiple languages and slot types
 */

class SlotExtractor {
    
    constructor(config = {}) {
        this.llmApiKey = config.llmApiKey;
        this.llmEndpoint = config.llmEndpoint || 'https://api.groq.com/openai/v1/chat/completions';
        this.llmModel = config.llmModel || 'llama-3.1-8b-instant';
        
        // Common patterns per language
        this.patterns = {
            phone: {
                'en': /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/,
                'pk': /(?:\+?92[-.\s]?)?0?3[0-9]{2}[-.\s]?[0-9]{7}/,
                'default': /[\d\s\-\+\(\)]{7,15}/
            },
            email: {
                'default': /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i
            },
            number: {
                'default': /\d+(?:\.\d+)?/
            },
            alphanumeric: {
                'default': /[A-Za-z0-9\-]+/
            }
        };
        
        // Yes/No phrases per language
        this.yesNoPhrases = {
            'en': { yes: ['yes', 'yeah', 'yep', 'correct', 'right', 'sure', 'ok', 'okay'], no: ['no', 'nope', 'wrong', 'incorrect'] },
            'ur': { yes: ['haan', 'ji', 'jee', 'bilkul', 'sahi', 'theek'], no: ['nahi', 'nahin', 'nai', 'galat'] },
            'ur-roman': { yes: ['haan', 'han', 'ji', 'jee', 'bilkul', 'sahi', 'theek', 'thik'], no: ['nahi', 'nahin', 'nai', 'galat', 'na'] },
            'hi': { yes: ['haan', 'ji', 'sahi', 'theek'], no: ['nahi', 'nahin', 'galat'] },
            'ar': { yes: ['نعم', 'ايوه', 'صح'], no: ['لا', 'لأ', 'غلط'] },
            'pa': { yes: ['ਹਾਂ', 'ਜੀ', 'ਠੀਕ'], no: ['ਨਹੀਂ', 'ਨਾ'] }
        };
        
        // City patterns for Pakistan
        this.pakistanCities = [
            'karachi', 'lahore', 'islamabad', 'rawalpindi', 'faisalabad', 'multan',
            'peshawar', 'quetta', 'sialkot', 'gujranwala', 'hyderabad', 'bahawalpur',
            'sargodha', 'sukkur', 'larkana', 'sheikhupura', 'jhang', 'rahim yar khan',
            'gujrat', 'mardan', 'kasur', 'mingora', 'dera ghazi khan', 'nawabshah',
            'sahiwal', 'mirpur khas', 'okara', 'mandi bahauddin', 'jacobabad', 'jhelum',
            'abbottabad', 'murree', 'swat', 'chitral', 'gilgit', 'skardu', 'hunza'
        ];
        
        // Indian cities
        this.indianCities = [
            'mumbai', 'delhi', 'bangalore', 'hyderabad', 'chennai', 'kolkata',
            'pune', 'ahmedabad', 'jaipur', 'lucknow', 'kanpur', 'nagpur',
            'indore', 'thane', 'bhopal', 'visakhapatnam', 'pimpri', 'patna',
            'vadodara', 'ghaziabad', 'ludhiana', 'agra', 'nashik', 'faridabad',
            'meerut', 'rajkot', 'varanasi', 'srinagar', 'aurangabad', 'dhanbad'
        ];
    }
    
    /**
     * Extract slot value from utterance
     */
    async extract(utterance, slotType, options = {}) {
        const {
            validation_regex,
            min_length,
            max_length,
            min_value,
            max_value,
            allowed_values,
            choice_options,
            language = 'en'
        } = options;
        
        let result = { success: false, value: null, raw: utterance };
        
        // Extract based on slot type
        switch (slotType) {
            case 'name':
                result = await this.extractName(utterance, language);
                break;
            
            case 'phone':
                result = this.extractPhone(utterance, language);
                break;
            
            case 'email':
                result = this.extractEmail(utterance);
                break;
            
            case 'number':
                result = this.extractNumber(utterance, { min_value, max_value });
                break;
            
            case 'alphanumeric':
                result = await this.extractAlphanumeric(utterance, language);
                break;
            
            case 'address':
                result = await this.extractAddress(utterance, language);
                break;
            
            case 'city':
                result = this.extractCity(utterance, language);
                break;
            
            case 'date':
                result = await this.extractDate(utterance, language);
                break;
            
            case 'time':
                result = await this.extractTime(utterance, language);
                break;
            
            case 'yes_no':
                result = this.extractYesNo(utterance, language);
                break;
            
            case 'choice':
                result = this.extractChoice(utterance, choice_options, language);
                break;
            
            case 'freeform':
            default:
                result = { success: true, value: utterance.trim(), raw: utterance };
        }
        
        // Apply validation
        if (result.success) {
            // Custom regex validation
            if (validation_regex) {
                const regex = new RegExp(validation_regex);
                if (!regex.test(result.value)) {
                    return { success: false, value: null, error: 'validation_failed', raw: utterance };
                }
            }
            
            // Length validation
            if (min_length && String(result.value).length < min_length) {
                return { success: false, value: null, error: 'too_short', raw: utterance };
            }
            if (max_length && String(result.value).length > max_length) {
                return { success: false, value: null, error: 'too_long', raw: utterance };
            }
            
            // Allowed values validation
            if (allowed_values && allowed_values.length > 0) {
                const normalized = String(result.value).toLowerCase();
                if (!allowed_values.some(v => v.toLowerCase() === normalized)) {
                    return { success: false, value: null, error: 'not_allowed', raw: utterance };
                }
            }
        }
        
        return result;
    }
    
    /**
     * Extract name
     */
    async extractName(utterance, language) {
        const text = utterance.trim();
        
        // Simple patterns for name prefixes
        const prefixes = {
            'en': ['my name is', 'i am', 'this is', 'call me', 'it\'s', 'its'],
            'ur': ['mera naam', 'میرا نام', 'main', 'میں'],
            'ur-roman': ['mera naam', 'main', 'naam hai'],
            'hi': ['mera naam', 'main', 'मेरा नाम'],
            'ar': ['اسمي', 'انا']
        };
        
        let cleaned = text;
        const langPrefixes = prefixes[language] || prefixes['en'];
        
        for (const prefix of langPrefixes) {
            const regex = new RegExp(`^${prefix}\\s*`, 'i');
            cleaned = cleaned.replace(regex, '');
        }
        
        cleaned = cleaned.replace(/[.,!?]$/, '').trim();
        
        // Basic validation - should have at least 2 characters
        if (cleaned.length >= 2) {
            // Capitalize first letter of each word
            const formatted = cleaned.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
            
            return { success: true, value: formatted, raw: utterance };
        }
        
        // Try LLM extraction for complex cases
        return await this.llmExtract(utterance, 'name', language);
    }
    
    /**
     * Extract phone number
     */
    extractPhone(utterance, language) {
        let text = utterance.toLowerCase();
        
        // Replace spoken digits
        const digitWords = {
            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
            'double': '', 'triple': '',
            // Urdu/Hindi digits
            'ek': '1', 'do': '2', 'teen': '3', 'char': '4', 'paanch': '5',
            'che': '6', 'saat': '7', 'aath': '8', 'nau': '9', 'sifar': '0',
            // Arabic digits
            'واحد': '1', 'اثنان': '2', 'ثلاثة': '3', 'أربعة': '4', 'خمسة': '5',
            'ستة': '6', 'سبعة': '7', 'ثمانية': '8', 'تسعة': '9', 'صفر': '0'
        };
        
        for (const [word, digit] of Object.entries(digitWords)) {
            text = text.replace(new RegExp(word, 'gi'), digit);
        }
        
        // Handle "double X" patterns
        text = text.replace(/double\s*(\d)/gi, '$1$1');
        text = text.replace(/triple\s*(\d)/gi, '$1$1$1');
        
        // Extract digits only
        const digits = text.replace(/\D/g, '');
        
        // Pakistan mobile (10-11 digits starting with 3)
        if (/^0?3\d{9}$/.test(digits)) {
            const formatted = digits.startsWith('0') ? digits : '0' + digits;
            return { success: true, value: formatted, raw: utterance };
        }
        
        // Pakistan with country code
        if (/^92\d{10}$/.test(digits)) {
            return { success: true, value: '+' + digits, raw: utterance };
        }
        
        // Generic 10+ digit number
        if (digits.length >= 10 && digits.length <= 15) {
            return { success: true, value: digits, raw: utterance };
        }
        
        return { success: false, value: null, error: 'invalid_phone', raw: utterance };
    }
    
    /**
     * Extract email
     */
    extractEmail(utterance) {
        const text = utterance.toLowerCase()
            .replace(/\s*at\s*/g, '@')
            .replace(/\s*dot\s*/g, '.')
            .replace(/\s+/g, '');
        
        const match = text.match(this.patterns.email.default);
        
        if (match) {
            return { success: true, value: match[0], raw: utterance };
        }
        
        return { success: false, value: null, error: 'invalid_email', raw: utterance };
    }
    
    /**
     * Extract number
     */
    extractNumber(utterance, options = {}) {
        let text = utterance.toLowerCase();
        
        // Number words to digits
        const numberWords = {
            'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
            'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
            'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
            'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
            'hundred': 100, 'thousand': 1000, 'million': 1000000,
            // Urdu/Hindi
            'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
            'che': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
            'gyara': 11, 'bara': 12, 'tera': 13, 'chauda': 14, 'pandra': 15,
            'bees': 20, 'tees': 30, 'chalis': 40, 'pachas': 50,
            'sau': 100, 'hazar': 1000, 'lakh': 100000, 'crore': 10000000
        };
        
        // Try direct number match first
        const directMatch = text.match(/[-+]?\d+(?:\.\d+)?/);
        if (directMatch) {
            const num = parseFloat(directMatch[0]);
            
            if (options.min_value !== undefined && num < options.min_value) {
                return { success: false, value: null, error: 'too_small', raw: utterance };
            }
            if (options.max_value !== undefined && num > options.max_value) {
                return { success: false, value: null, error: 'too_large', raw: utterance };
            }
            
            return { success: true, value: num, raw: utterance };
        }
        
        // Try word-based number
        for (const [word, num] of Object.entries(numberWords)) {
            if (text.includes(word)) {
                return { success: true, value: num, raw: utterance };
            }
        }
        
        return { success: false, value: null, error: 'invalid_number', raw: utterance };
    }
    
    /**
     * Extract alphanumeric (order/invoice number)
     */
    async extractAlphanumeric(utterance, language) {
        let text = utterance.toUpperCase();
        
        // Replace spoken letters and numbers
        text = text
            .replace(/\bspell\b|\bspelling\b/gi, '')
            .replace(/\bdash\b|\bhyphen\b|\bminus\b/gi, '-')
            .replace(/\bspace\b/gi, ' ');
        
        // NATO phonetic alphabet
        const phonetic = {
            'ALPHA': 'A', 'BRAVO': 'B', 'CHARLIE': 'C', 'DELTA': 'D', 'ECHO': 'E',
            'FOXTROT': 'F', 'GOLF': 'G', 'HOTEL': 'H', 'INDIA': 'I', 'JULIET': 'J',
            'KILO': 'K', 'LIMA': 'L', 'MIKE': 'M', 'NOVEMBER': 'N', 'OSCAR': 'O',
            'PAPA': 'P', 'QUEBEC': 'Q', 'ROMEO': 'R', 'SIERRA': 'S', 'TANGO': 'T',
            'UNIFORM': 'U', 'VICTOR': 'V', 'WHISKEY': 'W', 'XRAY': 'X', 'YANKEE': 'Y', 'ZULU': 'Z'
        };
        
        for (const [word, letter] of Object.entries(phonetic)) {
            text = text.replace(new RegExp(`\\b${word}\\b`, 'gi'), letter);
        }
        
        // Common letter words
        const letterWords = {
            'AY': 'A', 'BEE': 'B', 'CEE': 'C', 'DEE': 'D', 'EE': 'E',
            'EF': 'F', 'GEE': 'G', 'AYCH': 'H', 'EYE': 'I', 'JAY': 'J',
            'KAY': 'K', 'EL': 'L', 'EM': 'M', 'EN': 'N', 'OH': 'O',
            'PEE': 'P', 'CUE': 'Q', 'AR': 'R', 'ESS': 'S', 'TEE': 'T',
            'YOU': 'U', 'VEE': 'V', 'DOUBLE U': 'W', 'EX': 'X', 'WHY': 'Y', 'ZED': 'Z', 'ZEE': 'Z'
        };
        
        for (const [word, letter] of Object.entries(letterWords)) {
            text = text.replace(new RegExp(`\\b${word}\\b`, 'gi'), letter);
        }
        
        // Extract alphanumeric sequence
        const cleaned = text.replace(/[^A-Z0-9\-]/g, '');
        
        if (cleaned.length >= 3) {
            return { success: true, value: cleaned, raw: utterance };
        }
        
        // Try LLM for complex cases
        return await this.llmExtract(utterance, 'alphanumeric', language);
    }
    
    /**
     * Extract address
     */
    async extractAddress(utterance, language) {
        const text = utterance.trim();
        
        // Basic validation - addresses should be reasonably long
        if (text.length < 10) {
            return { success: false, value: null, error: 'address_too_short', raw: utterance };
        }
        
        // Try to extract city from address for later use
        const cityMatch = this.extractCity(text, language);
        
        return {
            success: true,
            value: text,
            raw: utterance,
            metadata: {
                extracted_city: cityMatch.success ? cityMatch.value : null
            }
        };
    }
    
    /**
     * Extract city
     */
    extractCity(utterance, language) {
        const text = utterance.toLowerCase().trim();
        
        // Check Pakistan cities
        for (const city of this.pakistanCities) {
            if (text.includes(city)) {
                return {
                    success: true,
                    value: city.charAt(0).toUpperCase() + city.slice(1),
                    raw: utterance
                };
            }
        }
        
        // Check Indian cities
        for (const city of this.indianCities) {
            if (text.includes(city)) {
                return {
                    success: true,
                    value: city.charAt(0).toUpperCase() + city.slice(1),
                    raw: utterance
                };
            }
        }
        
        // If it's a short response, might be just the city name
        if (text.split(' ').length <= 3) {
            // Capitalize and return
            const formatted = text.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            
            return { success: true, value: formatted, raw: utterance };
        }
        
        return { success: false, value: null, error: 'city_not_found', raw: utterance };
    }
    
    /**
     * Extract date
     */
    async extractDate(utterance, language) {
        const text = utterance.toLowerCase();
        
        // Common date patterns
        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,  // DD/MM/YYYY or MM/DD/YYYY
            /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})/i,
            /(\d{1,2})(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i
        ];
        
        // Relative dates
        const today = new Date();
        const relatives = {
            'today': today,
            'tomorrow': new Date(today.getTime() + 24 * 60 * 60 * 1000),
            'day after tomorrow': new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000),
            'next week': new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
            // Urdu
            'aaj': today,
            'kal': new Date(today.getTime() + 24 * 60 * 60 * 1000),
            'parson': new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)
        };
        
        for (const [word, date] of Object.entries(relatives)) {
            if (text.includes(word)) {
                return {
                    success: true,
                    value: date.toISOString().split('T')[0],
                    raw: utterance
                };
            }
        }
        
        // Try patterns
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                // Parse and format
                // This is simplified - production would need proper parsing
                return { success: true, value: match[0], raw: utterance };
            }
        }
        
        // Try LLM
        return await this.llmExtract(utterance, 'date', language);
    }
    
    /**
     * Extract time
     */
    async extractTime(utterance, language) {
        const text = utterance.toLowerCase();
        
        // Time patterns
        const patterns = [
            /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
            /(\d{1,2})\s*(am|pm|o'clock|baje)/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return { success: true, value: match[0], raw: utterance };
            }
        }
        
        // Relative times
        const relatives = {
            'morning': '09:00',
            'afternoon': '14:00',
            'evening': '18:00',
            'night': '20:00',
            // Urdu
            'subah': '09:00',
            'dopahar': '14:00',
            'shaam': '18:00',
            'raat': '20:00'
        };
        
        for (const [word, time] of Object.entries(relatives)) {
            if (text.includes(word)) {
                return { success: true, value: time, raw: utterance };
            }
        }
        
        return await this.llmExtract(utterance, 'time', language);
    }
    
    /**
     * Extract yes/no
     */
    extractYesNo(utterance, language) {
        const text = utterance.toLowerCase().trim();
        const phrases = this.yesNoPhrases[language] || this.yesNoPhrases['en'];
        
        // Check yes phrases
        for (const phrase of phrases.yes) {
            if (text.includes(phrase)) {
                return { success: true, value: true, raw: utterance };
            }
        }
        
        // Check no phrases
        for (const phrase of phrases.no) {
            if (text.includes(phrase)) {
                return { success: true, value: false, raw: utterance };
            }
        }
        
        return { success: false, value: null, error: 'unclear_response', raw: utterance };
    }
    
    /**
     * Extract choice from options
     */
    extractChoice(utterance, options, language) {
        if (!options || options.length === 0) {
            return { success: false, value: null, error: 'no_options', raw: utterance };
        }
        
        const text = utterance.toLowerCase().trim();
        
        for (const option of options) {
            const optionText = (option.text || option.value || option).toLowerCase();
            const optionKey = (option.key || option.value || option).toLowerCase();
            
            if (text.includes(optionText) || text.includes(optionKey)) {
                return {
                    success: true,
                    value: option.value || option.key || option,
                    raw: utterance
                };
            }
            
            // Check by number (1, 2, 3...)
            const index = options.indexOf(option);
            if (text === String(index + 1) || text.includes(`option ${index + 1}`)) {
                return {
                    success: true,
                    value: option.value || option.key || option,
                    raw: utterance
                };
            }
        }
        
        return { success: false, value: null, error: 'invalid_choice', raw: utterance };
    }
    
    /**
     * Use LLM for complex extraction
     */
    async llmExtract(utterance, slotType, language) {
        if (!this.llmApiKey) {
            return { success: false, value: null, error: 'llm_not_configured', raw: utterance };
        }
        
        const prompts = {
            'name': `Extract the person's name from this utterance. Return ONLY the name, nothing else. If no name found, return "NONE".\n\nUtterance: "${utterance}"`,
            'alphanumeric': `Extract the alphanumeric code (order number, invoice number, reference number) from this utterance. Return ONLY the code in uppercase, nothing else. If no code found, return "NONE".\n\nUtterance: "${utterance}"`,
            'date': `Extract the date from this utterance. Return in YYYY-MM-DD format. If relative (today, tomorrow), calculate from today. If no date found, return "NONE".\n\nUtterance: "${utterance}"`,
            'time': `Extract the time from this utterance. Return in HH:MM format (24-hour). If no time found, return "NONE".\n\nUtterance: "${utterance}"`
        };
        
        const prompt = prompts[slotType];
        if (!prompt) {
            return { success: false, value: null, error: 'unsupported_llm_type', raw: utterance };
        }
        
        try {
            const response = await fetch(this.llmEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.llmApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.llmModel,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 50,
                    temperature: 0
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                const extracted = data.choices?.[0]?.message?.content?.trim();
                
                if (extracted && extracted !== 'NONE') {
                    return { success: true, value: extracted, raw: utterance };
                }
            }
        } catch (error) {
            console.error('[SlotExtractor] LLM extraction failed:', error);
        }
        
        return { success: false, value: null, error: 'extraction_failed', raw: utterance };
    }
}

module.exports = SlotExtractor;

/**
 * TTS Number Formatter
 * 
 * Intelligently formats numbers for TTS based on context:
 * - Phone numbers → individual digits with pauses
 * - Amounts → spoken words (two thousand three hundred)
 * - Order IDs → individual digits/characters
 * - Dates → natural format
 * 
 * Supports: English, Urdu
 * 
 * Usage in bridge:
 *   const { formatForTTS } = require('./tts-number-formatter');
 *   const text = formatForTTS(value, 'phone', 'ur');
 */

// =============================================================================
// NUMBER WORDS
// =============================================================================

const NUMBER_WORDS = {
    en: {
        ones: ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 
               'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 
               'seventeen', 'eighteen', 'nineteen'],
        tens: ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'],
        hundred: 'hundred',
        thousand: 'thousand',
        lakh: 'lakh',        // South Asian numbering
        crore: 'crore',      // South Asian numbering
        million: 'million',
        billion: 'billion',
        and: 'and',
        zero: 'zero',
        point: 'point',
        rupees: 'rupees',
        paisa: 'paisa'
    },
    ur: {
        ones: ['', 'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو',
               'دس', 'گیارہ', 'بارہ', 'تیرہ', 'چودہ', 'پندرہ', 'سولہ',
               'سترہ', 'اٹھارہ', 'انیس'],
        tens: ['', '', 'بیس', 'تیس', 'چالیس', 'پچاس', 'ساٹھ', 'ستر', 'اسی', 'نوے'],
        hundred: 'سو',
        thousand: 'ہزار',
        lakh: 'لاکھ',
        crore: 'کروڑ',
        and: '',
        zero: 'صفر',
        point: 'اعشاریہ',
        rupees: 'روپے',
        paisa: 'پیسے'
    },
    // Roman Urdu (for TTS that doesn't support Urdu script)
    'ur-roman': {
        ones: ['', 'aik', 'do', 'teen', 'chaar', 'paanch', 'chhay', 'saat', 'aath', 'nau',
               'das', 'gyarah', 'baarah', 'terah', 'chaudah', 'pandrah', 'solah',
               'satrah', 'atharah', 'unees'],
        tens: ['', '', 'bees', 'tees', 'chaalees', 'pachaas', 'saath', 'sattar', 'assi', 'nawway'],
        hundred: 'sau',
        thousand: 'hazaar',
        lakh: 'laakh',
        crore: 'karor',
        and: '',
        zero: 'sifar',
        point: 'dashamlav',
        rupees: 'rupay',
        paisa: 'paisay'
    }
};

// Individual digit words for spelling out
const DIGIT_WORDS = {
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
    ur: ['صفر', 'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو'],
    'ur-roman': ['sifar', 'aik', 'do', 'teen', 'chaar', 'paanch', 'chhay', 'saat', 'aath', 'nau']
};

// =============================================================================
// TYPE DETECTION
// =============================================================================

/**
 * Auto-detect the type of number/value
 * @param {string|number} value - The value to analyze
 * @param {string} hint - Optional hint from slot_type
 * @returns {string} - Detected type: 'phone', 'amount', 'id', 'otp', 'date', 'generic'
 */
function detectNumberType(value, hint = null) {
    // If hint provided, use it
    if (hint) {
        const hintLower = hint.toLowerCase();
        if (hintLower.includes('phone') || hintLower.includes('mobile') || hintLower.includes('contact')) {
            return 'phone';
        }
        if (hintLower.includes('amount') || hintLower.includes('price') || hintLower.includes('cost') || 
            hintLower.includes('rupee') || hintLower.includes('money') || hintLower.includes('payment')) {
            return 'amount';
        }
        if (hintLower.includes('order') || hintLower.includes('tracking') || hintLower.includes('reference') ||
            hintLower.includes('id') || hintLower.includes('code')) {
            return 'id';
        }
        if (hintLower.includes('otp') || hintLower.includes('pin') || hintLower.includes('verification')) {
            return 'otp';
        }
        if (hintLower.includes('date') || hintLower.includes('dob') || hintLower.includes('birthday')) {
            return 'date';
        }
        if (hintLower.includes('quantity') || hintLower.includes('count') || hintLower.includes('number of')) {
            return 'amount';  // Quantities should be spoken as words
        }
    }
    
    const str = String(value).trim();
    
    // Phone number patterns
    // Pakistani: 03XX-XXXXXXX, +92-3XX-XXXXXXX
    // Indian: +91-XXXXX-XXXXX
    // General: 10-13 digits starting with 0 or +
    if (/^(\+?\d{1,3}[-\s]?)?\d{10,11}$/.test(str.replace(/[-\s]/g, ''))) {
        return 'phone';
    }
    if (/^0[0-9]{10}$/.test(str)) {
        return 'phone';  // Pakistani mobile: 03XXXXXXXXX
    }
    if (/^\+?92[0-9]{10}$/.test(str.replace(/[-\s]/g, ''))) {
        return 'phone';  // Pakistani with country code
    }
    
    // OTP/PIN patterns (4-6 digits)
    if (/^\d{4,6}$/.test(str) && str.length <= 6) {
        // Could be OTP or small amount, check if it looks like a round number
        const num = parseInt(str);
        if (num % 100 === 0 || num % 1000 === 0) {
            return 'amount';  // Round numbers are likely amounts
        }
        return 'otp';
    }
    
    // Order ID / Reference patterns (alphanumeric or long numbers)
    if (/^[A-Z0-9]{6,}$/i.test(str) && /[A-Z]/i.test(str)) {
        return 'id';  // Contains letters, likely an ID
    }
    if (/^\d{8,}$/.test(str)) {
        return 'id';  // Very long number, likely an ID
    }
    
    // Amount patterns
    // With currency symbols or formatting
    if (/^[₨$€£]?\s?[\d,]+(\.\d{1,2})?$/.test(str)) {
        return 'amount';
    }
    // Plain numbers that are reasonable amounts (1-9999999)
    const numValue = parseFloat(str.replace(/,/g, ''));
    if (!isNaN(numValue) && numValue > 0 && numValue < 10000000) {
        return 'amount';
    }
    
    // Date patterns
    if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/.test(str)) {
        return 'date';
    }
    
    return 'generic';
}

// =============================================================================
// NUMBER TO WORDS CONVERSION
// =============================================================================

/**
 * Convert number to words (South Asian style - lakhs and crores)
 * @param {number} num - Number to convert
 * @param {string} lang - Language code
 * @returns {string} - Number in words
 */
function numberToWords(num, lang = 'en') {
    const words = NUMBER_WORDS[lang] || NUMBER_WORDS['en'];
    
    if (num === 0) return words.zero;
    
    if (num < 0) {
        return 'minus ' + numberToWords(Math.abs(num), lang);
    }
    
    // Handle decimals
    if (num % 1 !== 0) {
        const parts = String(num).split('.');
        const intPart = numberToWords(parseInt(parts[0]), lang);
        const decPart = parts[1].split('').map(d => words.ones[parseInt(d)] || DIGIT_WORDS[lang][parseInt(d)]).join(' ');
        return `${intPart} ${words.point} ${decPart}`;
    }
    
    let result = '';
    
    // Crores (10 million)
    if (num >= 10000000) {
        result += numberToWords(Math.floor(num / 10000000), lang) + ' ' + words.crore + ' ';
        num %= 10000000;
    }
    
    // Lakhs (100 thousand)
    if (num >= 100000) {
        result += numberToWords(Math.floor(num / 100000), lang) + ' ' + words.lakh + ' ';
        num %= 100000;
    }
    
    // Thousands
    if (num >= 1000) {
        result += numberToWords(Math.floor(num / 1000), lang) + ' ' + words.thousand + ' ';
        num %= 1000;
    }
    
    // Hundreds
    if (num >= 100) {
        result += words.ones[Math.floor(num / 100)] + ' ' + words.hundred + ' ';
        num %= 100;
        if (num > 0 && words.and) {
            result += words.and + ' ';
        }
    }
    
    // Tens and ones
    if (num >= 20) {
        result += words.tens[Math.floor(num / 10)] + ' ';
        num %= 10;
    }
    
    if (num > 0) {
        result += words.ones[num];
    }
    
    return result.trim();
}

/**
 * Convert amount to words with currency
 * @param {number|string} amount - Amount value
 * @param {string} lang - Language code
 * @param {string} currency - Currency type ('pkr', 'inr', 'usd')
 * @returns {string} - Formatted amount string
 */
function amountToWords(amount, lang = 'en', currency = 'pkr') {
    const words = NUMBER_WORDS[lang] || NUMBER_WORDS['en'];
    const num = parseFloat(String(amount).replace(/[₨$€£,]/g, ''));
    
    if (isNaN(num)) return String(amount);
    
    const rupees = Math.floor(num);
    const paisa = Math.round((num - rupees) * 100);
    
    let result = numberToWords(rupees, lang);
    
    // Add currency word
    if (currency === 'pkr' || currency === 'inr') {
        result += ' ' + words.rupees;
    }
    
    // Add paisa if present
    if (paisa > 0) {
        result += ' ' + numberToWords(paisa, lang) + ' ' + words.paisa;
    }
    
    return result;
}

// =============================================================================
// DIGIT SPELLING
// =============================================================================

/**
 * Spell out digits individually with pauses
 * @param {string} value - String of digits/characters
 * @param {string} lang - Language code
 * @param {boolean} groupDigits - Group digits in pairs/triplets for easier listening
 * @returns {string} - Spelled out digits
 */
function spellDigits(value, lang = 'en', groupDigits = true) {
    const digitWords = DIGIT_WORDS[lang] || DIGIT_WORDS['en'];
    const str = String(value).replace(/[^0-9A-Za-z]/g, '');  // Keep only alphanumeric
    
    const spelled = [];
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        
        if (/[0-9]/.test(char)) {
            spelled.push(digitWords[parseInt(char)]);
        } else if (/[A-Za-z]/.test(char)) {
            // For letters, just use the letter (TTS will pronounce it)
            spelled.push(char.toUpperCase());
        }
    }
    
    // Group digits for better comprehension
    if (groupDigits && spelled.length > 4) {
        const grouped = [];
        for (let i = 0; i < spelled.length; i += 3) {
            grouped.push(spelled.slice(i, i + 3).join(' '));
        }
        // Use SSML pause or comma for grouping
        return grouped.join(', ');
    }
    
    return spelled.join(' ');
}

/**
 * Format phone number for TTS
 * @param {string} phone - Phone number
 * @param {string} lang - Language code
 * @returns {string} - Formatted for TTS
 */
function formatPhone(phone, lang = 'en') {
    // Remove all non-digits except +
    const cleaned = String(phone).replace(/[^0-9+]/g, '');
    
    // Pakistani format: 03XX XXXXXXX → "zero three two two, eight four five, six zero one four"
    if (/^0[0-9]{10}$/.test(cleaned)) {
        const part1 = cleaned.slice(0, 4);   // 03XX
        const part2 = cleaned.slice(4, 7);   // XXX
        const part3 = cleaned.slice(7, 11);  // XXXX
        
        return [
            spellDigits(part1, lang, false),
            spellDigits(part2, lang, false),
            spellDigits(part3, lang, false)
        ].join(', ');
    }
    
    // With country code: +92 3XX XXXXXXX
    if (/^\+?92[0-9]{10}$/.test(cleaned.replace(/[^0-9]/g, ''))) {
        const digits = cleaned.replace(/[^0-9]/g, '');
        const country = digits.slice(0, 2);  // 92
        const part1 = digits.slice(2, 5);    // 3XX
        const part2 = digits.slice(5, 8);    // XXX
        const part3 = digits.slice(8, 12);   // XXXX
        
        return [
            'plus ' + spellDigits(country, lang, false),
            spellDigits(part1, lang, false),
            spellDigits(part2, lang, false),
            spellDigits(part3, lang, false)
        ].join(', ');
    }
    
    // Generic: group in threes
    return spellDigits(cleaned, lang, true);
}

/**
 * Format order ID / reference number for TTS
 * @param {string} id - Order ID
 * @param {string} lang - Language code
 * @returns {string} - Formatted for TTS
 */
function formatOrderId(id, lang = 'en') {
    const str = String(id).toUpperCase();
    
    // If has letters and numbers, spell each character
    if (/[A-Z]/.test(str) && /[0-9]/.test(str)) {
        // Group by character type changes or every 3-4 chars
        const parts = str.match(/[A-Z]+|[0-9]+/g) || [str];
        return parts.map(part => {
            if (/^[0-9]+$/.test(part)) {
                return spellDigits(part, lang, true);
            }
            // Spell out letters
            return part.split('').join(' ');
        }).join(', ');
    }
    
    // All digits - group in threes
    return spellDigits(str, lang, true);
}

/**
 * Format OTP/PIN for TTS (spell each digit clearly)
 * @param {string} otp - OTP/PIN code
 * @param {string} lang - Language code
 * @returns {string} - Formatted for TTS
 */
function formatOTP(otp, lang = 'en') {
    // Spell each digit with clear pauses
    return spellDigits(String(otp), lang, false);
}

// =============================================================================
// MAIN FORMATTER
// =============================================================================

/**
 * Main formatting function - auto-detects type and formats appropriately
 * 
 * @param {string|number} value - The value to format
 * @param {string} type - Type hint: 'phone', 'amount', 'id', 'otp', 'date', 'auto'
 * @param {string} lang - Language code: 'en', 'ur', 'ur-roman'
 * @param {Object} options - Additional options
 * @param {string} options.currency - Currency for amounts ('pkr', 'inr', 'usd')
 * @param {string} options.slotType - Slot type hint for auto-detection
 * @returns {string} - TTS-optimized string
 */
function formatForTTS(value, type = 'auto', lang = 'en', options = {}) {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    
    const str = String(value).trim();
    
    // Auto-detect type if not specified
    const detectedType = type === 'auto' 
        ? detectNumberType(str, options.slotType) 
        : type;
    
    switch (detectedType) {
        case 'phone':
            return formatPhone(str, lang);
            
        case 'amount':
            return amountToWords(str, lang, options.currency || 'pkr');
            
        case 'id':
            return formatOrderId(str, lang);
            
        case 'otp':
            return formatOTP(str, lang);
            
        case 'date':
            // For now, just return as-is (TTS usually handles dates okay)
            // Could be enhanced with proper date formatting
            return str;
            
        case 'digits':
            // Force digit-by-digit spelling
            return spellDigits(str, lang, true);
            
        case 'words':
            // Force number-to-words conversion
            const num = parseFloat(str.replace(/,/g, ''));
            if (!isNaN(num)) {
                return numberToWords(num, lang);
            }
            return str;
            
        default:
            // Generic - try to be smart
            // If it's a pure number, convert to words
            const genericNum = parseFloat(str.replace(/,/g, ''));
            if (!isNaN(genericNum) && genericNum < 10000) {
                return numberToWords(genericNum, lang);
            }
            // If it looks like an ID, spell it
            if (/^[A-Z0-9]{5,}$/i.test(str)) {
                return spellDigits(str, lang, true);
            }
            return str;
    }
}

/**
 * Process a text string and format all numbers appropriately
 * Uses context clues to determine number types
 * 
 * @param {string} text - Text containing numbers
 * @param {string} lang - Language code
 * @param {Object} context - Context hints (slotName, slotType, etc.)
 * @returns {string} - Text with numbers formatted for TTS
 */
function processTextForTTS(text, lang = 'en', context = {}) {
    if (!text) return '';
    
    let processed = text;
    
    // Find phone numbers and format them
    processed = processed.replace(/\b(0[0-9]{10}|\+92[0-9\-\s]{10,13})\b/g, (match) => {
        return formatForTTS(match, 'phone', lang);
    });
    
    // Find amounts with currency symbols
    processed = processed.replace(/[₨Rs\.]*\s?[\d,]+(\.\d{2})?\s?(rupees?|روپے)?/gi, (match) => {
        // Only if it looks like a currency amount
        if (/[₨]|rupees?|روپے/i.test(match) || /^\d{1,7}$/.test(match.replace(/[,\s]/g, ''))) {
            const numMatch = match.match(/[\d,]+(\.\d{2})?/);
            if (numMatch) {
                return formatForTTS(numMatch[0], 'amount', lang, { currency: 'pkr' });
            }
        }
        return match;
    });
    
    // Format based on slot type context
    if (context.slotType) {
        const slotLower = context.slotType.toLowerCase();
        
        // If collecting phone, format any remaining numbers as phone
        if (slotLower.includes('phone') || slotLower.includes('mobile')) {
            processed = processed.replace(/\b\d{10,11}\b/g, (match) => {
                return formatForTTS(match, 'phone', lang);
            });
        }
        
        // If collecting amount, format numbers as words
        if (slotLower.includes('amount') || slotLower.includes('price')) {
            processed = processed.replace(/\b\d{1,7}\b/g, (match) => {
                return formatForTTS(match, 'amount', lang);
            });
        }
    }
    
    return processed;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    formatForTTS,
    processTextForTTS,
    detectNumberType,
    numberToWords,
    amountToWords,
    spellDigits,
    formatPhone,
    formatOrderId,
    formatOTP,
    NUMBER_WORDS,
    DIGIT_WORDS
};
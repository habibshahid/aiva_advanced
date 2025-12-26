/**
 * Intent IVR Provider
 * 
 * A voice provider that matches user speech to pre-configured intents
 * and plays pre-recorded audio responses or generates TTS.
 * 
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                      IntentIVRProvider                           │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  Asterisk RTP (mulaw) ──► Soniox STT ──► Intent Matching        │
 * │       ▲                                        │                 │
 * │       │                           ┌────────────┴────────────┐    │
 * │       │                           ▼                         ▼    │
 * │       │                    Pre-recorded Audio         KB Lookup  │
 * │       │                    (from IVR config)          or LLM     │
 * │       │                           │                         │    │
 * │       └───────── Audio Output ◄───┴─────────────────────────┘    │
 * │                                                                  │
 * │  Features:                                                       │
 * │    - LLM-based intent classification (Groq/OpenAI)              │
 * │    - Pre-recorded audio playback (mulaw 8kHz)                   │
 * │    - Response caching for dynamic content                        │
 * │    - KB lookup with cached responses                             │
 * │    - Function execution support                                  │
 * │    - Transfer to human agents                                    │
 * └──────────────────────────────────────────────────────────────────┘
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { formatForTTS, processTextForTTS, detectNumberType } = require('./tts-number-formatter');

// Try to load base provider
let BaseProvider;
try {
    BaseProvider = require('../base-provider');
} catch (e) {
    try {
        BaseProvider = require('./base-provider');
    } catch (e2) {
        BaseProvider = class extends EventEmitter {
            constructor(config) {
                super();
                this.config = config;
                this.isConnected = false;
            }
        };
    }
}

// Load STT module
let SonioxSTT;
try {
    SonioxSTT = require('./soniox-stt');
    console.log('[INTENT-IVR] Loaded SonioxSTT from ./soniox-stt');
    console.log('[INTENT-IVR] SonioxSTT.prototype.sendKeepalive exists:', typeof SonioxSTT.prototype?.sendKeepalive === 'function');
} catch (e) {
    try {
        SonioxSTT = require('./custom/soniox-stt');
        console.log('[INTENT-IVR] Loaded SonioxSTT from ./custom/soniox-stt');
    } catch (e2) {
        console.warn('[INTENT-IVR] Soniox STT not found:', e.message);
        SonioxSTT = null;
    }
}

// Load TTS and converter modules
let UpliftTTS, MP3ToPCMConverter;
try {
    UpliftTTS = require('./uplift-tts');
    MP3ToPCMConverter = require('./mp3-converter');
} catch (e) {
    try {
        UpliftTTS = require('./custom/uplift-tts');
        MP3ToPCMConverter = require('./custom/mp3-converter');
    } catch (e2) {
        console.warn('[INTENT-IVR] TTS/Converter modules not found');
    }
}

const logger = require('../../utils/logger');

class IntentIVRProvider extends BaseProvider {
    constructor(config) {
        super(config);
        
        console.info('[INTENT-IVR] Initializing provider with config:', {
            agentId: config.agentId,
            tenantId: config.tenantId,
            ttsProvider: config.ttsProvider,
            voice: config.voice
        });
        
        // Core state
        this.isConnected = false;
        this.isConfigured = false;
        this.sessionId = null;
        this.agentConfig = null;
        
        // IVR configuration (loaded from API)
        this.ivrConfig = null;
        this.intents = [];
        this.audioFiles = new Map();
        this.audioCache = new Map();
        this.agentFunctions = [];
		// Multi-language support
		this.agentLanguages = [];
		this.defaultLanguage = 'en';
		this.sessionLanguage = null;  // Detected/set per call
		this.languageVoiceMap = {};   // language_code -> { provider, voice }
        
        // STT
        this.stt = null;
        
        // TTS
        this.tts = null;
        this.ttsProvider = config.ttsProvider || 'uplift';
        this.mp3Converter = null;
        this.mp3Buffer = Buffer.alloc(0);
        
        // Metrics tracking
        this.ttsMetrics = { charactersProcessed: 0, audioSecondsGenerated: 0, callCount: 0 };
        this.sttMetrics = { audioSecondsReceived: 0, audioBytesSent: 0 };
        this.classifierCostMetrics = { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0 };
        this.costMetrics = { startTime: null };
        
        // State tracking
        this.isPlaying = false;
        this.isGeneratingResponse = false;
        this.isDisconnecting = false;
        this.preventBargeIn = false;  // Prevents user speech from interrupting flow audio
		this.isProcessingTranscript = false;  // Prevents parallel transcript processing
        this.currentAudioBuffer = null;
        this.playbackPosition = 0;
        this.playbackInterval = null;
        this.sttKeepaliveInterval = null;  // STT connection keepalive
        
        // Flow state
        this.activeFlow = null;
        this.flowSlots = {};
        this.flowStepIndex = 0;
        this.flowRetryCount = 0;
        this.flowAwaitingAnythingElse = false;
        this.slotRetryCount = {};  // Track retries per slot
        this.responseTimer = null;  // Response timeout timer
        this.awaitingConfirmation = null;  // Confirmation state for slot values
        
        // Slot accumulation for fragmented speech (elderly/distracted users)
        this.slotAccumulator = '';  // Accumulates partial responses
        this.slotAccumulatorTimer = null;  // Timer to finalize accumulated response
        this.lastPartialTimestamp = 0;  // Track when last partial was received
        
        // Slot validation cost tracking
        this.slotValidationCosts = {
            llmCalls: 0,
            llmInputTokens: 0,
            llmOutputTokens: 0,
            ttsCalls: 0,
            ttsCharacters: 0
        };
        
        // Conversation history
        this.conversationHistory = [];
        
        // API configuration
        this.apiBaseUrl = config.apiBaseUrl || process.env.MANAGEMENT_API_URL || 'http://localhost:62001/api';
        this.apiKey = config.apiKey || process.env.MANAGEMENT_API_KEY || process.env.BRIDGE_API_KEY;
        
        // Remove trailing /api if present
        if (this.apiBaseUrl.endsWith('/api')) {
            this.apiBaseUrl = this.apiBaseUrl.slice(0, -4);
        }
        
        // Config for TTS
        this.config.voice = config.voice || 'v_meklc281';
        this.config.upliftOutputFormat = config.upliftOutputFormat || 'MP3_22050_32';
        
        // Detected language (updated during conversation)
        this.detectedLanguage = null;
    }
    
    /**
     * Get the current language from IVR config or detection
     */
    getLanguage() {
        // Priority: detected language > first language hint > default 'en'
        if (this.detectedLanguage) return this.detectedLanguage;
        
        const languageHints = this.ivrConfig?.language_hints || this.config.languageHints || ['en'];
        return languageHints[0] || 'en';
    }
    
    /**
     * Get localized message based on current language
     */
    getLocalizedMessage(messageKey, params = {}) {
        const lang = this.getLanguage();
        
        // Message templates for different languages
        const messages = {
            // Wait/thinking acknowledgment
            wait_acknowledgment: {
                ur: 'ٹھیک ہے، جب آپ تیار ہوں تو بتائیں۔',
                en: 'Okay, let me know when you\'re ready.',
                ar: 'حسناً، أخبرني عندما تكون جاهزاً.',
                hi: 'ठीक है, जब आप तैयार हों तो बताइए।'
            },
            // Confirmation request
            confirm_value: {
                ur: `آپ نے ${params.slotLabel || ''} "${params.value || ''}" بتایا۔ کیا یہ درست ہے؟`,
                en: `You said ${params.slotLabel || ''} is "${params.value || ''}". Is that correct?`,
                ar: `قلت ${params.slotLabel || ''} هو "${params.value || ''}". هل هذا صحيح؟`,
                hi: `आपने ${params.slotLabel || ''} "${params.value || ''}" बताया। क्या यह सही है?`
            },
            // Slot correction acknowledgment
            correction_acknowledgment: {
                ur: `ٹھیک ہے، آئیے ${params.slotLabel || 'پچھلا سوال'} دوبارہ بتاتے ہیں۔`,
                en: `Okay, let's go back to ${params.slotLabel || 'the previous question'}.`,
                ar: `حسناً، دعنا نعود إلى ${params.slotLabel || 'السؤال السابق'}.`,
                hi: `ठीक है, चलिए ${params.slotLabel || 'पिछला सवाल'} फिर से बताते हैं।`
            },
            // Yes/No clarification
            yes_no_clarify: {
                ur: 'براہ کرم ہاں یا نہیں میں جواب دیں۔',
                en: 'Please respond with yes or no.',
                ar: 'من فضلك أجب بنعم أو لا.',
                hi: 'कृपया हाँ या नहीं में जवाब दें।'
            },
            // Invalid response
            invalid_response: {
                ur: 'معذرت، براہ کرم دوبارہ بتائیں۔',
                en: 'Sorry, please try again.',
                ar: 'عذراً، يرجى المحاولة مرة أخرى.',
                hi: 'क्षमा करें, कृपया दोबारा बताएं।'
            },
            // Function error
            function_error: {
                ur: 'معذرت، کچھ مسئلہ ہو گیا۔ براہ کرم دوبارہ کوشش کریں۔',
                en: 'Sorry, something went wrong. Please try again.',
                ar: 'عذراً، حدث خطأ ما. يرجى المحاولة مرة أخرى.',
                hi: 'क्षमा करें, कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।'
            },
            // Not understood fallback
            not_understood: {
                ur: 'معذرت، میں سمجھ نہیں سکی۔ کیا آپ دوبارہ بتا سکتے ہیں؟',
                en: 'Sorry, I didn\'t understand. Could you please repeat?',
                ar: 'عذراً، لم أفهم. هل يمكنك التكرار من فضلك؟',
                hi: 'क्षमा करें, मुझे समझ नहीं आया। क्या आप दोबारा बता सकते हैं?'
            },
            // Not found
            not_found: {
                ur: 'معذرت، مجھے اس بارے میں معلومات نہیں ملی۔',
                en: 'Sorry, I couldn\'t find information about that.',
                ar: 'عذراً، لم أتمكن من العثور على معلومات حول ذلك.',
                hi: 'क्षमा करें, मुझे इसके बारे में जानकारी नहीं मिली।'
            }
        };
        
        const messageSet = messages[messageKey];
        if (!messageSet) {
            logger.warn(`[INTENT-IVR] Unknown message key: ${messageKey}`);
            return params.fallback || '';
        }
        
        // Return message in detected language, fallback to English
        return messageSet[lang] || messageSet['en'] || params.fallback || '';
    }
    
    /**
     * Get slot label in current language
     */
    getSlotLabel(slotName) {
        const lang = this.getLanguage();
        
        const labels = {
            'customer_name': { ur: 'نام', en: 'name', ar: 'الاسم', hi: 'नाम' },
            'name': { ur: 'نام', en: 'name', ar: 'الاسم', hi: 'नाम' },
            'invoice_no': { ur: 'انوائس نمبر', en: 'invoice number', ar: 'رقم الفاتورة', hi: 'इनवॉइस नंबर' },
            'invoice_number': { ur: 'انوائس نمبر', en: 'invoice number', ar: 'رقم الفاتورة', hi: 'इनवॉइस नंबर' },
            'address': { ur: 'پتہ', en: 'address', ar: 'العنوان', hi: 'पता' },
            'installation_address': { ur: 'پتہ', en: 'address', ar: 'العنوان', hi: 'पता' },
            'city': { ur: 'شہر', en: 'city', ar: 'المدينة', hi: 'शहर' },
            'phone': { ur: 'فون نمبر', en: 'phone number', ar: 'رقم الهاتف', hi: 'फोन नंबर' },
            'phone_number': { ur: 'فون نمبر', en: 'phone number', ar: 'رقم الهاتف', hi: 'फोन नंबर' },
            'customer_phone': { ur: 'فون نمبر', en: 'phone number', ar: 'رقم الهاتف', hi: 'फोन नंबर' },
            'email': { ur: 'ای میل', en: 'email', ar: 'البريد الإلكتروني', hi: 'ईमेल' }
        };
        
        const slotLabels = labels[slotName?.toLowerCase()];
        if (slotLabels) {
            return slotLabels[lang] || slotLabels['en'] || slotName;
        }
        
        return slotName || 'value';
    }
    
    /**
     * Get language name for LLM prompts
     */
    getLanguageName() {
        const lang = this.getLanguage();
        const names = {
            ur: 'Urdu',
            en: 'English',
            ar: 'Arabic',
            hi: 'Hindi',
            pa: 'Punjabi',
            ps: 'Pashto',
            sd: 'Sindhi',
            bn: 'Bengali',
            ta: 'Tamil',
            te: 'Telugu'
        };
        return names[lang] || 'English';
    }
    
    /**
     * Connect to STT service
     */
    async connect() {
        try {
            console.info('[INTENT-IVR] Connecting...');
            
            this.costMetrics.startTime = Date.now();
            
            // Initialize STT
            if (SonioxSTT) {
                this.stt = new SonioxSTT({
                    apiKey: process.env.SONIOX_API_KEY,
                    languageHints: this.config.languageHints || ['ur', 'en'],
                    model: 'stt-rt-preview'
                });
                
                await this.stt.connect();
                this.setupSTTHandlers();
                this.startSTTKeepalive();  // Start keepalive interval
            }
            
            this.isConnected = true;
            console.info('[INTENT-IVR] Connected successfully');
            
            return true;
        } catch (error) {
            console.error('[INTENT-IVR] Connection failed:', error);
            this.isConnected = false;
            throw error;
        }
    }
    
    /**
     * Start STT keepalive interval
     * Sends keepalive message every 5 seconds to prevent Soniox timeout (20s)
     */
    startSTTKeepalive() {
        // Clear any existing interval
        if (this.sttKeepaliveInterval) {
            clearInterval(this.sttKeepaliveInterval);
        }
        
        // Check if STT has keepalive support
        const hasKeepalive = this.stt && typeof this.stt.sendKeepalive === 'function';
        const hasWs = this.stt && this.stt.ws;
        console.info(`[INTENT-IVR] STT keepalive check: sendKeepalive=${hasKeepalive}, ws=${!!hasWs}`);
        
        // Send keepalive every 5 seconds (Soniox timeout is 20s)
        this.sttKeepaliveInterval = setInterval(() => {
            if (this.stt && this.isConnected) {
                try {
                    let sent = false;
                    
                    // Try sendKeepalive method first
                    if (typeof this.stt.sendKeepalive === 'function') {
                        sent = this.stt.sendKeepalive();
                        if (sent) {
                            console.info('[INTENT-IVR] STT keepalive sent via sendKeepalive()');
                        }
                    }
                    
                    // Fallback: try direct WebSocket access
                    if (!sent && this.stt.ws && this.stt.ws.readyState === 1) {
                        this.stt.ws.send(JSON.stringify({ type: 'keepalive' }));
                        console.info('[INTENT-IVR] STT keepalive sent via ws.send()');
                        sent = true;
                    }
                    
                    if (!sent) {
                        logger.warn('[INTENT-IVR] STT keepalive: no method available to send');
                    }
                } catch (err) {
                    logger.warn('[INTENT-IVR] Failed to send STT keepalive:', err.message);
                }
            } else {
                logger.debug('[INTENT-IVR] STT keepalive skipped: stt=%s, connected=%s', !!this.stt, this.isConnected);
            }
        }, 5000);  // Every 5 seconds
        
        console.info('[INTENT-IVR] STT keepalive started (5s interval)');
    }
    
    /**
     * Stop STT keepalive interval
     */
    stopSTTKeepalive() {
        if (this.sttKeepaliveInterval) {
            clearInterval(this.sttKeepaliveInterval);
            this.sttKeepaliveInterval = null;
            console.info('[INTENT-IVR] STT keepalive stopped');
        }
    }
    
    /**
     * Setup STT event handlers
     */
    setupSTTHandlers() {
        if (!this.stt) return;
        
        this.stt.on('transcript.interim', ({ text }) => {
			if (text && text.trim().length > 0) {
				// Don't interrupt if we're playing flow audio (intro, step prompts)
				// Only allow barge-in for freeform conversation
				if (this.isPlaying && !this.preventBargeIn) {
					console.info('[INTENT-IVR] User interruption detected - stopping playback');
					this.stopPlayback();
					
					// Cancel any ongoing TTS synthesis to prevent overlap
					if (this.tts) {
						try {
							if (typeof this.tts.cancel === 'function') {
								this.tts.cancel();
							} else if (typeof this.tts.stop === 'function') {
								this.tts.stop();
							}
						} catch (e) {
							logger.debug('[INTENT-IVR] TTS cancel error:', e.message);
						}
					}
					
					// Stop MP3 converter if running
					if (this.mp3Converter) {
						try {
							this.mp3Converter.stop();
							this.mp3Converter = null;
						} catch (e) {}
					}
					
					this.emit('user_started_speaking');
				} else if (this.isPlaying && this.preventBargeIn) {
					logger.debug('[INTENT-IVR] User speech during prompt - barge-in prevented');
				}
			}
		});
        
        this.stt.on('transcript.final', async ({ text }) => {
			if (text && text.trim().length > 0) {
				// Prevent parallel transcript processing
				if (this.isProcessingTranscript) {
					logger.warn('[INTENT-IVR] Skipping transcript (already processing):', text.substring(0, 40));
					return;
				}
				
				// Clear response timer - user has responded
				this.clearResponseTimer();
				
				console.info('[INTENT-IVR] Final transcript:', text);
				this.emit('transcript.user', { transcript: text });
				
				this.isProcessingTranscript = true;
				try {
					await this.processUserInput(text);
				} finally {
					this.isProcessingTranscript = false;
				}
			}
		});
       
        this.stt.on('error', (error) => {
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes('Audio data decode timeout') || errorMsg.includes('No audio received')) {
                return;
            }
            console.error('[INTENT-IVR] STT error:', error);
            this.emit('error', error);
        });
        
        // Handle STT disconnection with auto-reconnect
        this.stt.on('disconnected', async ({ code, reason }) => {
            logger.warn(`[INTENT-IVR] STT disconnected: code=${code}, reason=${reason}`);
            
            // Don't reconnect if we're intentionally disconnecting
            if (!this.isConnected) {
                console.info('[INTENT-IVR] Provider disconnecting, not attempting STT reconnect');
                return;
            }
            
            // Attempt to reconnect
            await this.reconnectSTT();
        });
    }
    
    /**
     * Reconnect STT after disconnection
     */
    async reconnectSTT() {
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.info(`[INTENT-IVR] STT reconnect attempt ${attempt}/${maxRetries}...`);
            
            try {
                // Stop old keepalive interval
                this.stopSTTKeepalive();
                
                // Create new STT instance
                this.stt = new SonioxSTT({
                    apiKey: process.env.SONIOX_API_KEY,
                    languageHints: this.config.language_hints || ['ur', 'en'],
                    sampleRate: 8000
                });
                
                // Connect
                await this.stt.connect();
                
                // Setup handlers again
                this.setupSTTHandlers();
                
                // Start keepalive
                this.startSTTKeepalive();
                
                console.info('[INTENT-IVR] STT reconnected successfully');
                return true;
                
            } catch (error) {
                console.error(`[INTENT-IVR] STT reconnect attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
                }
            }
        }
        
        console.error('[INTENT-IVR] STT reconnection failed after all retries');
        return false;
    }
    
    /**
     * Process slot response using LLM for comprehensive classification
     * Handles: thinking, repeat, correction, confirmation, validation - all via LLM
     */
    async processSlotResponse(utterance, step, options = {}) {
        if (!utterance || utterance.trim().length === 0) {
            return { action: 'timeout', extractedValue: null };
        }
        
        const slotType = step.slot_type || this.inferSlotType(step.slot_name);
        const isConfirmationStep = options.awaitingConfirmation || false;
        
        // ============================================
        // Handle fragmented speech accumulation
        // ============================================
        if (!isConfirmationStep) {
            const fragmentResult = this.handleFragmentedSpeech(utterance, slotType);
            
            if (fragmentResult.action === 'accumulate') {
                console.info(`[INTENT-IVR] Accumulating fragment: "${utterance}" -> Total: "${this.slotAccumulator}"`);
                return { action: 'wait_more', extractedValue: null };
            }
            
            // Use accumulated response if available
            if (fragmentResult.finalUtterance) {
                utterance = fragmentResult.finalUtterance;
            }
        }
        
        // ============================================
        // Use LLM for comprehensive classification
        // ============================================
        const result = await this.classifySlotResponseWithLLM(utterance, step, slotType, {
            isConfirmationStep,
            filledSlots: Object.keys(this.flowSlots || {})
        });
        
        // Clear accumulator on terminal actions
        if (['store', 'invalid', 'repeat', 'correct_slot'].includes(result.action)) {
            this.clearSlotAccumulator();
        }
        
        return result;
    }
    
    /**
     * Comprehensive LLM-based slot response classifier
     * Single LLM call handles: waiting, repeat, correction, confirmation, validation
     */
    async classifySlotResponseWithLLM(utterance, step, slotType, options = {}) {
        try {
            const slotName = step.slot_name || 'value';
            const stepName = step.step_name || slotName;
            const promptText = step.prompt_text || '';
            const isConfirmationStep = options.isConfirmationStep || false;
            const filledSlots = options.filledSlots || [];
            
            // Get current language settings
            const language = this.getLanguage();
            const languageName = this.getLanguageName();
            const languageHints = this.ivrConfig?.language_hints || ['en'];
            
            // Build slot type specific hints
            const typeHints = this.getSlotTypeHints(slotType);
            
            // Build the system prompt for comprehensive classification
            const systemPrompt = `You are an IVR slot classifier. Analyze the user's response and classify their intent.

LANGUAGE CONTEXT:
- Primary Language: ${languageName} (${language})
- Supported Languages: ${languageHints.join(', ')}
- ALL error messages and validation_error MUST be in ${languageName}

CURRENT STEP:
- Step: ${stepName}
- Slot: ${slotName}
- Expected Type: ${slotType}
- Type Hints: ${typeHints}
- Question Asked: "${promptText}"
- Is Confirmation Step: ${isConfirmationStep}
- Previously Filled Slots: [${filledSlots.join(', ')}]

CLASSIFICATION RULES (check in this order):

1. WAITING/THINKING - User needs time to find/check information
   Common phrases in any language: wait, hold on, let me check, one moment, checking...
   → action: "wait_more"

2. REPEAT REQUEST - User wants to hear the question again
   Common phrases: repeat, again, what did you say, pardon, I didn't understand...
   → action: "repeat"

3. SLOT CORRECTION - User wants to change a PREVIOUSLY filled slot (not current one)
   Common phrases: change my, update my, wrong, go back, I want to fix...
   Look for slot mentions: address, phone, name, city, invoice, etc.
   → action: "correct_slot", target_slot: "detected slot name in English or null"

4. CONFIRMATION RESPONSE (only if Is Confirmation Step = true)
   YES patterns: yes, correct, right, okay, confirmed, affirmative responses
   → action: "confirm_yes"
   NO patterns: no, wrong, incorrect, change it, negative responses
   → action: "confirm_no"

5. VALID DATA - User provides data matching expected type
   Extract CLEAN value (remove fillers like "my number is", "it's", etc.)
   → action: "store", extracted_value: "clean value", confidence: 0.0-1.0

6. INVALID DATA - Response doesn't match expected type or is incomplete
   → action: "invalid", validation_error: "${languageName} error message explaining what's needed"

IMPORTANT:
- validation_error MUST be in ${languageName}
- For phone: extract digits, common formats include country codes
- For address: needs 2+ components (house, street, area, city)
- Be lenient - if user gives partial but usable data, accept it
- target_slot should be in English (address, phone, name, city, invoice_no)

Respond with JSON only:
{
  "action": "wait_more" | "repeat" | "correct_slot" | "confirm_yes" | "confirm_no" | "store" | "invalid",
  "extracted_value": "clean value or null",
  "target_slot": "slot name for correction or null",
  "validation_error": "${languageName} error message or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

            const userPrompt = `USER RESPONSE: "${utterance}"

Classify:`;

            // Call LLM using configured provider
            const response = await this.callSlotClassifierLLM(systemPrompt, userPrompt);
            
            if (!response) {
                // Fallback if LLM fails
                logger.warn('[INTENT-IVR] LLM classification failed, storing raw');
                return { action: 'store', extractedValue: utterance.trim(), confidence: 0.3 };
            }
            
            console.info(`[INTENT-IVR] LLM classification:`, {
                action: response.action,
                extracted: response.extracted_value,
                target: response.target_slot,
                confidence: response.confidence,
                reasoning: response.reasoning
            });
            
            return {
                action: response.action || 'store',
                extractedValue: response.extracted_value || utterance.trim(),
                targetSlot: response.target_slot,
                validationError: response.validation_error,
                confidence: response.confidence || 0.5
            };
            
        } catch (error) {
            console.error('[INTENT-IVR] Slot classification error:', error.message);
            return { action: 'store', extractedValue: utterance.trim(), confidence: 0.3 };
        }
    }
    
    /**
     * Get type-specific hints for LLM
     */
    getSlotTypeHints(slotType) {
        const hints = {
            'phone_number': 'Pakistani phone: 03xx-xxxxxxx, +923xxxxxxxxx. Extract 10-11 digits.',
            'invoice_number': 'Invoice/order codes: INV-12345, ORD-ABC123, alphanumeric.',
            'address': 'Full address: house/flat number, street/block, area, city. Need 2+ parts.',
            'city': 'Pakistani cities: Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad, etc.',
            'person_name': 'Person names, Pakistani names common.',
            'email': 'Email format: user@domain.com',
            'datetime': 'Date/time expressions',
            'text': 'Any text response'
        };
        return hints[slotType] || 'Any valid response';
    }
    
    /**
     * Call LLM for slot classification
     */
    async callSlotClassifierLLM(systemPrompt, userPrompt) {
        const groqApiKey = process.env.GROQ_API_KEY;
        const openaiApiKey = process.env.OPENAI_API_KEY;
        
        // Use configured provider from IVR settings (default to openai if not set)
        const configuredProvider = this.ivrConfig?.llm_provider || 'openai';
        const configuredModel = this.ivrConfig?.llm_model || 'gpt-4o-mini';
        
        let response;
        let provider;
        let model;
        
        try {
            // Use configured provider FIRST
            if (configuredProvider === 'openai' && openaiApiKey) {
                provider = 'openai';
                model = configuredModel || 'gpt-4o-mini';
                response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.1,
                        max_tokens: 250,
                        response_format: { type: 'json_object' }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${openaiApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 8000
                    }
                );
            } else if (configuredProvider === 'groq' && groqApiKey) {
                provider = 'groq';
                model = configuredModel || 'llama-3.3-70b-versatile';
                response = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.1,
                        max_tokens: 250,
                        response_format: { type: 'json_object' }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${groqApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 8000
                    }
                );
            } else if (openaiApiKey) {
                // Fallback to OpenAI if configured provider not available
                provider = 'openai';
                model = 'gpt-4o-mini';
                logger.warn(`[INTENT-IVR] Configured provider ${configuredProvider} not available, falling back to OpenAI`);
                response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.1,
                        max_tokens: 250,
                        response_format: { type: 'json_object' }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${openaiApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 8000
                    }
                );
            } else if (groqApiKey) {
                // Fallback to Groq
                provider = 'groq';
                model = 'llama-3.3-70b-versatile';
                logger.warn(`[INTENT-IVR] Configured provider ${configuredProvider} not available, falling back to Groq`);
                response = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.1,
                        max_tokens: 250,
                        response_format: { type: 'json_object' }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${groqApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 8000
                    }
                );
            } else {
                logger.warn('[INTENT-IVR] No LLM API key configured');
                return null;
            }
            
            // Track costs
            const usage = response.data.usage;
            if (usage) {
                this.slotValidationCosts.llmCalls++;
                this.slotValidationCosts.llmInputTokens += usage.prompt_tokens || 0;
                this.slotValidationCosts.llmOutputTokens += usage.completion_tokens || 0;
                console.info(`[INTENT-IVR] Slot LLM (${provider}/${model}): ${usage.prompt_tokens}+${usage.completion_tokens} tokens`);
            }
            
            const content = response.data.choices?.[0]?.message?.content;
            if (!content) {
                logger.warn('[INTENT-IVR] Empty LLM response');
                return null;
            }
            
            return JSON.parse(content);
            
        } catch (error) {
            console.error('[INTENT-IVR] LLM API error:', error.message);
            if (error.response?.data) {
                console.error('[INTENT-IVR] API error details:', error.response.data);
            }
            return null;
        }
    }
    
    /**
     * Handle fragmented speech - accumulate partial responses
     * Elderly or occupied users may speak in fragments with pauses
     */
    handleFragmentedSpeech(utterance, slotType) {
        const now = Date.now();
        const timeSinceLastPartial = now - this.lastPartialTimestamp;
        
        // Patterns indicating incomplete speech
        const incompletePatterns = [
            /\b(and|aur|اور)\s*$/i,           // Ends with "and"
            /\b(of|ka|کا|کی)\s*$/i,            // Ends with "of"
            /\b(in|mein|میں)\s*$/i,           // Ends with "in"
            /\b(the|ye|یہ)\s*$/i,              // Ends with "the"
            /\b(is|hai|ہے)\s*$/i,              // Ends with "is"
            /^\d+\s*$/,                         // Just numbers
            /^(flat|house|building|block|street|gali|sector)\s*\d*\s*$/i,  // Partial address
            /^(zero|one|two|three|four|five|six|seven|eight|nine)\s*$/i,   // Spelled numbers
            /,\s*$/,                            // Ends with comma
            /\.{2,}\s*$/,                       // Ends with ellipsis
        ];
        
        // Filler patterns (user is thinking mid-sentence)
        const fillerPatterns = [
            /\b(umm?|hmm?|uh|ah|err?)\b/i,
            /\b(like|matlab)\b/i
        ];
        
        const isIncomplete = incompletePatterns.some(p => p.test(utterance.trim()));
        const hasFiller = fillerPatterns.some(p => p.test(utterance));
        const isShortFragment = utterance.trim().split(/\s+/).length <= 3;
        
        // Complex slots that benefit from accumulation
        const complexSlotTypes = ['address', 'full_address', 'location', 'description'];
        const isComplexSlot = complexSlotTypes.includes(slotType);
        
        // Decide whether to accumulate
        const shouldAccumulate = (
            (isIncomplete || (hasFiller && isShortFragment)) && 
            (isComplexSlot || this.slotAccumulator.length > 0)
        );
        
        if (shouldAccumulate) {
            // Add to accumulator
            if (this.slotAccumulator.length > 0) {
                this.slotAccumulator += ' ' + utterance.trim();
            } else {
                this.slotAccumulator = utterance.trim();
            }
            this.lastPartialTimestamp = now;
            
            // Set/reset accumulator timeout (wait 4 seconds for next fragment)
            this.clearSlotAccumulatorTimer();
            this.slotAccumulatorTimer = setTimeout(() => {
                console.info(`[INTENT-IVR] Accumulator timeout, finalizing: "${this.slotAccumulator}"`);
                // Timer expired - the next processFlowStep call will use accumulated value
            }, 4000);
            
            return { action: 'accumulate', finalUtterance: null };
        }
        
        // Check if we have accumulated content to combine
        if (this.slotAccumulator.length > 0) {
            const combined = this.slotAccumulator + ' ' + utterance.trim();
            console.info(`[INTENT-IVR] Using accumulated response: "${combined}"`);
            return { action: 'finalize', finalUtterance: combined };
        }
        
        // No accumulation needed
        return { action: 'none', finalUtterance: utterance };
    }
    
    /**
     * Clear slot accumulator
     */
    clearSlotAccumulator() {
        this.slotAccumulator = '';
        this.lastPartialTimestamp = 0;
        this.clearSlotAccumulatorTimer();
    }
    
    /**
     * Clear slot accumulator timer
     */
    clearSlotAccumulatorTimer() {
        if (this.slotAccumulatorTimer) {
            clearTimeout(this.slotAccumulatorTimer);
            this.slotAccumulatorTimer = null;
        }
    }
    
    /**
     * Infer slot type from slot name
     */
    inferSlotType(slotName) {
        if (!slotName) return 'text';
        
        const name = slotName.toLowerCase();
        
        if (name.includes('phone') || name.includes('mobile') || name.includes('contact') || name.includes('number') && !name.includes('invoice')) {
            return 'phone_number';
        }
        if (name.includes('invoice') || name.includes('order') || name.includes('receipt') || name.includes('tracking')) {
            return 'invoice_number';
        }
        if (name.includes('address') || name.includes('location') || name.includes('street')) {
            return 'address';
        }
        if (name.includes('city') || name.includes('town')) {
            return 'city';
        }
        if (name.includes('name') && !name.includes('user')) {
            return 'person_name';
        }
        if (name.includes('email') || name.includes('mail')) {
            return 'email';
        }
        if (name.includes('date') || name.includes('time') || name.includes('when')) {
            return 'datetime';
        }
        
        return 'text';
    }
    
    /**
     * Initialize fallback TTS
     */
    async initializeFallbackTTS() {
        try {
            if (!UpliftTTS) {
                logger.warn('[INTENT-IVR] UpliftTTS not available');
                return;
            }
            
            // Store MP3 converter class for later use
            this.MP3ToPCMConverter = MP3ToPCMConverter;
            
            const ttsVoice = this.ivrConfig?.tts_voice || this.config.voice || 'v_meklc281';
            // Use MP3 for best quality with conversion to PCM
            const outputFormat = 'MP3_22050_32';
            
            console.info(`[INTENT-IVR] Initializing TTS: voice=${ttsVoice}, format=${outputFormat}`);
            
            this.tts = new UpliftTTS({
                apiKey: process.env.UPLIFT_API_KEY,
                voice: ttsVoice,
                outputFormat: outputFormat
            });
            
            this.ttsOutputFormat = outputFormat;
            this.needsMp3Conversion = outputFormat.startsWith('MP3');
            this.setupTTSHandlers();
            
            await this.tts.initialize();
            console.info('[INTENT-IVR] TTS initialized');
            
        } catch (error) {
            logger.warn('[INTENT-IVR] TTS initialization failed:', error.message);
        }
    }
    
    /**
     * Setup TTS event handlers - handles both MP3 and ULAW formats
     */
    setupTTSHandlers() {
        if (!this.tts) return;
        
        const outputFormat = this.ttsOutputFormat || 'MP3_22050_32';
        const needsConversion = outputFormat.startsWith('MP3');
        
        console.info(`[INTENT-IVR] TTS output format: ${outputFormat}, needs conversion: ${needsConversion}`);
        
        // Debug tracking
        this.hasReceivedAudioData = false;
        this.upliftDebug = {
            synthesisStartTime: null,
            chunksReceived: 0,
            totalBytesReceived: 0,
            pcmChunksEmitted: 0,
            totalPcmBytes: 0
        };
        
        if (needsConversion) {
            // ============================================
            // MP3 MODE - Stream MP3 chunks, convert to PCM
            // ============================================
            this.tts.on('synthesis.started', ({ requestId }) => {
                console.info('[INTENT-IVR] Synthesis started (MP3 mode):', requestId);
                this.currentTtsRequestId = requestId;
                this.upliftDebug.synthesisStartTime = Date.now();
                this.upliftDebug.chunksReceived = 0;
                this.upliftDebug.totalBytesReceived = 0;
                this.upliftDebug.pcmChunksEmitted = 0;
                this.upliftDebug.totalPcmBytes = 0;
                this.mp3Buffer = Buffer.alloc(0);
                this.hasReceivedAudioData = false;
                this.isPlaying = true;
                
                if (this.mp3Converter) {
                    this.mp3Converter.stop();
                    this.mp3Converter = null;
                }
            });
            
            this.tts.on('audio.chunk', ({ chunk, chunkIndex }) => {
                if (!chunk || chunk.length === 0) return;
                
                this.hasReceivedAudioData = true;
                this.upliftDebug.chunksReceived++;
                this.upliftDebug.totalBytesReceived += chunk.length;
                
                this.mp3Buffer = Buffer.concat([this.mp3Buffer, chunk]);
                
                // Stream conversion when we have enough data (4KB threshold)
                if (this.mp3Buffer.length >= 4096) {
                    if (!this.mp3Converter && this.MP3ToPCMConverter) {
                        this.mp3Converter = new this.MP3ToPCMConverter({
                            sampleRate: 24000,
                            channels: 1,
                            minBufferSize: 4800
                        });
                        
                        this.mp3Converter.on('pcm', (pcmData) => {
                            // Track when first audio starts playing
                            if (!this.ttsPlaybackStartTime) {
                                this.ttsPlaybackStartTime = Date.now();
                            }
                            this.upliftDebug.pcmChunksEmitted++;
                            this.upliftDebug.totalPcmBytes += pcmData.length;
                            this.emit('audio.delta', { delta: pcmData.toString('base64') });
                        });
                        
                        this.mp3Converter.on('error', (err) => {
                            console.error('[INTENT-IVR] MP3 converter error:', err.message);
                        });
                        
                        this.mp3Converter.start();
                    }
                    
                    if (this.mp3Converter) {
                        this.mp3Converter.write(this.mp3Buffer);
                        this.mp3Buffer = Buffer.alloc(0);
                    }
                }
            });
            
            this.tts.on('audio.done', ({ requestId }) => {
                console.info(`[INTENT-IVR] Synthesis complete: ${this.upliftDebug.totalBytesReceived} bytes MP3`);
                
                if (this.hasReceivedAudioData) {
                    // Process any remaining MP3 data
                    if (this.mp3Buffer.length > 0) {
                        if (!this.mp3Converter && this.MP3ToPCMConverter) {
                            this.mp3Converter = new this.MP3ToPCMConverter({
                                sampleRate: 24000,
                                channels: 1,
                                minBufferSize: 2400
                            });
                            this.mp3Converter.on('pcm', (pcmData) => {
                                this.emit('audio.delta', { delta: pcmData.toString('base64') });
                            });
                            this.mp3Converter.start();
                        }
                        if (this.mp3Converter) {
                            this.mp3Converter.write(this.mp3Buffer);
                            this.mp3Buffer = Buffer.alloc(0);
                        }
                    }
                    
                    if (this.mp3Converter) {
                        this.mp3Converter.end();
                    }
                    
                    // Wait for ffmpeg to flush, then calculate playback wait time
                    setTimeout(() => {
                        const pcmDurationSec = this.upliftDebug.totalPcmBytes / (24000 * 2);
                        console.info(`[INTENT-IVR] PCM: ${this.upliftDebug.totalPcmBytes} bytes = ${pcmDurationSec.toFixed(2)}s`);
                        
                        if (this.mp3Converter) {
                            this.mp3Converter.stop();
                            this.mp3Converter = null;
                        }
                        
                        // Calculate remaining playback time
                        // Audio has been streaming since ttsPlaybackStartTime
                        const elapsedMs = this.ttsPlaybackStartTime ? (Date.now() - this.ttsPlaybackStartTime) : 0;
                        const totalDurationMs = pcmDurationSec * 1000;
                        const remainingMs = Math.max(0, totalDurationMs - elapsedMs) + 300; // 300ms buffer
                        
                        console.info(`[INTENT-IVR] Playback timing: ${elapsedMs}ms elapsed, ${remainingMs}ms remaining`);
                        
                        // Reset playback start time for next TTS
                        this.ttsPlaybackStartTime = null;
                        
                        setTimeout(() => {
                            this.emit('audio.done');
                            this.isPlaying = false;
                        }, remainingMs);
                        
                    }, 300);
                } else {
                    if (this.mp3Converter) {
                        this.mp3Converter.stop();
                        this.mp3Converter = null;
                    }
                    this.emit('audio.done');
                    this.isPlaying = false;
                }
            });
            
            this.tts.on('synthesis.cancelled', ({ requestId }) => {
                console.info('[INTENT-IVR] Synthesis cancelled:', requestId);
                this.mp3Buffer = Buffer.alloc(0);
                if (this.mp3Converter) {
                    this.mp3Converter.stop();
                    this.mp3Converter = null;
                }
                this.isPlaying = false;
            });
            
        } else {
            // ============================================
            // ULAW/PCM MODE - Direct output (no conversion)
            // ============================================
            this.tts.on('synthesis.started', ({ requestId }) => {
                console.info(`[INTENT-IVR] TTS synthesis started (direct mode): ${requestId}`);
                this.currentTtsRequestId = requestId;
                this.isPlaying = true;
            });
            
            this.tts.on('audio.chunk', ({ chunk, chunkIndex }) => {
                if (!chunk || chunk.length === 0) return;
                // Emit ULAW/PCM directly
                this.emit('audio.delta', { delta: chunk.toString('base64') });
            });
            
            this.tts.on('audio.delta', ({ delta, requestId }) => {
                if (requestId && this.currentTtsRequestId && requestId !== this.currentTtsRequestId) {
                    return;
                }
                this.emit('audio.delta', { delta });
            });
            
            this.tts.on('audio.done', ({ requestId }) => {
                if (requestId && this.currentTtsRequestId && requestId !== this.currentTtsRequestId) {
                    return;
                }
                console.info(`[INTENT-IVR] TTS complete (direct mode)`);
                this.emit('audio.done');
                this.isPlaying = false;
            });
            
            this.tts.on('synthesis.cancelled', ({ requestId }) => {
                console.info('[INTENT-IVR] TTS cancelled:', requestId);
                this.isPlaying = false;
            });
        }
        
        this.tts.on('error', (error) => {
            console.error('[INTENT-IVR] TTS error:', error);
            this.isPlaying = false;
        });
    }
    
    /**
     * Configure session with agent settings
     */
    async configureSession(agentConfig) {
        if (!this.isConnected) {
            throw new Error('Provider not connected');
        }
        
        this.agentConfig = agentConfig;
        this.sessionId = agentConfig.sessionId || `ivr_${Date.now()}`;
        
        const agentId = agentConfig.agentId || agentConfig.id || this.config.agentId;
        const agentName = agentConfig.name || this.config.name || 'IVR Agent';
        
        console.info('[INTENT-IVR] Configuring session:', {
            sessionId: this.sessionId,
            agentId: agentId,
            agentName: agentName
        });
        
        if (!agentId) {
            throw new Error('Agent ID is required');
        }
        
        // Load IVR configuration
        await this.loadIVRConfig(agentId);
        
        // Initialize TTS with IVR config
        await this.initializeFallbackTTS();
        
        // Store function executor
        if (agentConfig.functionExecutor) {
            this.functionExecutor = agentConfig.functionExecutor;
        }
        
        this.isConfigured = true;
        
        // Emit ready event
        this.emit('agent.ready', {
            sessionId: this.sessionId,
            agentName: agentName,
            status: 'ready',
            type: 'status'
        });
        
        // Play greeting with delay to ensure audio pipeline is ready
        setTimeout(async () => {
            try {
                await this.playGreeting();
            } catch (err) {
                console.error('[INTENT-IVR] Error playing greeting:', err.message);
            }
        }, 500);
        
        return true;
    }
    
    /**
     * Load IVR configuration from API
     */
    async loadIVRConfig(agentId) {
        try {
            console.info('[INTENT-IVR] Loading IVR config for agent:', agentId);
            
            const headers = {};
            if (this.apiKey) {
                headers['x-api-key'] = this.apiKey;
            }
            
            // Load config
            const configRes = await axios.get(
                `${this.apiBaseUrl}/api/ivr/${agentId}/config`,
                { headers, timeout: 10000 }
            );
            this.ivrConfig = configRes.data.data;
            
            // Load intents
            const intentsRes = await axios.get(
                `${this.apiBaseUrl}/api/ivr/${agentId}/intents`,
                { headers, timeout: 10000 }
            );
            this.intents = intentsRes.data.data || [];
            
            // Load audio files
            const audioRes = await axios.get(
                `${this.apiBaseUrl}/api/ivr/${agentId}/audio`,
                { headers, timeout: 10000 }
            );
            
            for (const audio of audioRes.data.data || []) {
                this.audioFiles.set(audio.id, audio);
            }
            
			// Load agent languages for multi-language support
			try {
				const langRes = await axios.get(
					`${this.apiBaseUrl}/api/languages/agent/${agentId}`,
					{ headers, timeout: 10000 }
				);
				this.agentLanguages = langRes.data.data || [];
				
				// Find default language
				const defaultLang = this.agentLanguages.find(l => l.is_default);
				this.defaultLanguage = defaultLang?.language_code || 'en';
				
				// Build language -> voice mapping
				this.languageVoiceMap = {};
				for (const lang of this.agentLanguages) {
					if (lang.tts_provider && lang.tts_voice) {
						this.languageVoiceMap[lang.language_code] = {
							provider: lang.tts_provider,
							voice: lang.tts_voice
						};
					}
				}
				
				console.info('[INTENT-IVR] Loaded languages:', {
					count: this.agentLanguages.length,
					default: this.defaultLanguage,
					voiceMap: Object.keys(this.languageVoiceMap)
				});
			} catch (langErr) {
				logger.warn('[INTENT-IVR] Could not load agent languages:', langErr.message);
				this.agentLanguages = [];
			}

            // Load agent functions for flow completion
            try {
                const functionsRes = await axios.get(
                    `${this.apiBaseUrl}/api/functions/agent/${agentId}`,
                    { headers, timeout: 10000 }
                );
                this.agentFunctions = functionsRes.data.functions || [];
                console.info('[INTENT-IVR] Loaded agent functions:', this.agentFunctions.length);
            } catch (funcErr) {
                logger.warn('[INTENT-IVR] Could not load agent functions:', funcErr.message);
                this.agentFunctions = [];
            }
            
            console.info('[INTENT-IVR] Loaded:', {
                intents: this.intents.length,
                audioFiles: this.audioFiles.size,
                functions: this.agentFunctions?.length || 0,
                config: {
                    classifierType: this.ivrConfig?.classifier_type,
                    confidenceThreshold: this.ivrConfig?.confidence_threshold
                }
            });
            
            // Pre-load audio files
            await this.preloadAudioFiles();
            
        } catch (error) {
            console.error('[INTENT-IVR] Failed to load IVR config:', error.message);
            throw error;
        }
    }
    
	/**
	 * Detect language from transcript
	 * Simple heuristic based on script detection
	 * Can be enhanced with LLM-based detection
	 */
	detectLanguageFromText(text) {
		if (!text) return this.defaultLanguage;
		
		// Urdu/Arabic script detection
		const urduArabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
		if (urduArabicRegex.test(text)) {
			// Check if we have Urdu configured
			if (this.agentLanguages.some(l => l.language_code === 'ur')) {
				return 'ur';
			}
			if (this.agentLanguages.some(l => l.language_code.startsWith('ar'))) {
				return 'ar';
			}
		}
		
		// Hindi/Devanagari script
		const hindiRegex = /[\u0900-\u097F]/;
		if (hindiRegex.test(text)) {
			if (this.agentLanguages.some(l => l.language_code === 'hi')) {
				return 'hi';
			}
		}
		
		// Default to configured default or English
		return this.sessionLanguage || this.defaultLanguage;
	}

	/**
	 * Set session language (can be called from external sources)
	 * e.g., from caller profile lookup
	 */
	setSessionLanguage(languageCode) {
		if (this.agentLanguages.some(l => l.language_code === languageCode)) {
			this.sessionLanguage = languageCode;
			console.info(`[INTENT-IVR] Session language set to: ${languageCode}`);
		} else {
			logger.warn(`[INTENT-IVR] Language ${languageCode} not configured, using default`);
			this.sessionLanguage = this.defaultLanguage;
		}
	}

	/**
	 * Get current language for content resolution
	 */
	getCurrentLanguage() {
		return this.sessionLanguage || this.defaultLanguage;
	}
	
	/**
	 * Resolve i18n content for an entity
	 * Falls back to default language if translation not found
	 * 
	 * @param {string} entityType - 'intent', 'flow', 'step', 'config'
	 * @param {string} entityId - UUID of the entity
	 * @param {string} fieldName - Field to resolve (e.g., 'response_text')
	 * @param {string} language - Target language code
	 * @returns {Object} { text, audio_id } or null
	 */
	async resolveI18nContent(entityType, entityId, fieldName, language = null) {
		const targetLang = language || this.getCurrentLanguage();
		const agentId = this.agentConfig?.agentId || this.config.agentId;
		try {
			// Try target language first
			const response = await axios.get(
				`${this.apiBaseUrl}/api/internal/i18n/${entityType}/${entityId}/${fieldName}/${targetLang}`,
				{ 
					headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}, 
					timeout: 5000 
				}
			);
			
			if (response.data?.data?.text_content) {
				logger.debug(`[INTENT-IVR] i18n resolved: ${entityType}/${fieldName} in ${targetLang}`);
				return {
					text: response.data.data.text_content,
					audio_id: response.data.data.audio_id,
					language: targetLang
				};
			}
		} catch (err) {
			// Not found in target language, try fallback
			logger.debug(`[INTENT-IVR] No i18n for ${targetLang}, trying default`);
		}
		
		// Fallback to default language if different
		if (targetLang !== this.defaultLanguage) {
			try {
				const fallbackRes = await axios.get(
					`${this.apiBaseUrl}/api/internal/i18n/${entityType}/${entityId}/${fieldName}/${this.defaultLanguage}`,
					{ 
						headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}, 
						timeout: 5000 
					}
				);
				
				if (fallbackRes.data?.data?.text_content) {
					logger.debug(`[INTENT-IVR] i18n fallback: ${entityType}/${fieldName} in ${this.defaultLanguage}`);
					return {
						text: fallbackRes.data.data.text_content,
						audio_id: fallbackRes.data.data.audio_id,
						language: this.defaultLanguage
					};
				}
			} catch (err) {
				// No translation found at all
			}
		}
		
		return null;
	}

    /**
     * Pre-load audio files into memory
     */
    async preloadAudioFiles() {
        console.info('[INTENT-IVR] Pre-loading audio files...');
        
        for (const [audioId, audioInfo] of this.audioFiles) {
            try {
                if (audioInfo.file_path && fs.existsSync(audioInfo.file_path)) {
                    let buffer;
                    const format = audioInfo.file_format?.toLowerCase() || 
                        path.extname(audioInfo.file_path).toLowerCase().replace('.', '');
                    
                    if (format === 'mulaw_8000' || format === 'mulaw' || format === 'ulaw') {
                        buffer = fs.readFileSync(audioInfo.file_path);
                    } else if (format === 'mp3') {
                        // Convert MP3 to mulaw using ffmpeg
                        buffer = await this.convertMP3ToMulawFile(audioInfo.file_path);
                    }
                    
                    if (buffer) {
                        this.audioCache.set(audioId, buffer);
                        console.info(`[INTENT-IVR] Cached: ${audioInfo.name} (${buffer.length} bytes)`);
                    }
                }
            } catch (error) {
                logger.warn(`[INTENT-IVR] Failed to preload ${audioId}:`, error.message);
            }
        }
        
        console.info(`[INTENT-IVR] Pre-loaded ${this.audioCache.size} audio files`);
    }
    
    /**
     * Convert MP3 file to mulaw using ffmpeg
     */
    async convertMP3ToMulawFile(filePath) {
        const { execSync } = require('child_process');
        const basePath = filePath.replace(/\.[^.]+$/, '');
        const outputPath = basePath + '.mulaw';
        
        try {
            if (fs.existsSync(outputPath)) {
                const inputStat = fs.statSync(filePath);
                const outputStat = fs.statSync(outputPath);
                if (outputStat.mtime >= inputStat.mtime) {
                    return fs.readFileSync(outputPath);
                }
            }
            
            execSync(`ffmpeg -i "${filePath}" -ar 8000 -ac 1 -f mulaw "${outputPath}" -y 2>&1`, {
                timeout: 30000
            });
            
            if (fs.existsSync(outputPath)) {
                return fs.readFileSync(outputPath);
            }
        } catch (error) {
            console.error('[INTENT-IVR] MP3 conversion failed:', error.message);
        }
        return null;
    }
    
    /**
     * Convert MP3 buffer to mulaw
     */
    async convertMP3ToMulaw(mp3Buffer) {
        const { spawn } = require('child_process');
        
        return new Promise((resolve) => {
            const ffmpeg = spawn('ffmpeg', [
                '-hide_banner', '-loglevel', 'error',
                '-i', 'pipe:0',
                '-ar', '8000', '-ac', '1',
                '-f', 'mulaw', '-acodec', 'pcm_mulaw',
                'pipe:1'
            ], { stdio: ['pipe', 'pipe', 'pipe'] });
            
            const chunks = [];
            
            ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
            ffmpeg.on('close', (code) => {
                if (code === 0 && chunks.length > 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    resolve(null);
                }
            });
            ffmpeg.on('error', () => resolve(null));
            
            ffmpeg.stdin.write(mp3Buffer);
            ffmpeg.stdin.end();
        });
    }
    
    /**
     * Send audio to STT
     */
    async sendAudio(audioData) {
        if (!this.isConnected) {
            return false;
        }
        
        // Check if STT is connected
        if (!this.stt || !this.stt.isConnected) {
            // STT disconnected, skip sending
            return false;
        }
        
        // Track STT metrics
        if (audioData) {
            const bytes = Buffer.isBuffer(audioData) ? audioData.length : audioData.byteLength || 0;
            this.sttMetrics.audioBytesSent += bytes;
            this.sttMetrics.audioSecondsReceived = this.sttMetrics.audioBytesSent / 8000;
        }
        
        try {
            return this.stt.sendAudio(audioData);
        } catch (error) {
            // Log but don't throw - STT might be reconnecting
            logger.debug('[INTENT-IVR] Error sending audio to STT:', error.message);
            return false;
        }
    }

    /**
	 * Play greeting with i18n support
	 */
	async playGreeting() {
		const currentLang = this.getCurrentLanguage();
		const configId = this.ivrConfig?.id;
		
		// Try i18n greeting first
		if (configId) {
			const i18nContent = await this.resolveI18nContent(
				'config',
				configId,
				'greeting_text',
				currentLang
			);
			
			// Priority 1: i18n audio
			if (i18nContent?.audio_id) {
				let audioBuffer = this.audioCache.get(i18nContent.audio_id);
				if (!audioBuffer) {
					audioBuffer = await this.loadAudioFromAPI(i18nContent.audio_id);
				}
				if (audioBuffer) {
					logger.info(`[INTENT-IVR] Playing i18n greeting audio (${currentLang})`);
					await this.playAudioBuffer(audioBuffer);
					return;
				}
			}
			
			// Priority 2: i18n text
			if (i18nContent?.text) {
				logger.info(`[INTENT-IVR] Playing i18n greeting TTS (${currentLang})`);
				await this.generateAndPlayTTS(i18nContent.text, { language: currentLang });
				return;
			}
		}
		
		// Priority 3: Base greeting audio from IVR config
		if (this.ivrConfig?.greeting_audio_id) {
			const buffer = this.audioCache.get(this.ivrConfig.greeting_audio_id);
			if (buffer) {
				logger.info('[INTENT-IVR] Playing base greeting audio from cache');
				await this.playAudioBuffer(buffer);
				return;
			}
			
			const loadedBuffer = await this.loadAudioFromAPI(this.ivrConfig.greeting_audio_id);
			if (loadedBuffer) {
				this.audioCache.set(this.ivrConfig.greeting_audio_id, loadedBuffer);
				await this.playAudioBuffer(loadedBuffer);
				return;
			}
		}
		
		// Priority 4: Base greeting text
		const greetingText = this.ivrConfig?.greeting_text || this.agentConfig?.greeting || this.config.greeting;
		if (greetingText) {
			logger.info('[INTENT-IVR] Playing base greeting via TTS');
			await this.generateAndPlayTTS(greetingText, { language: currentLang });
		}
	}
    
    /**
     * Process user input - main intent matching logic
     */
    async processUserInput(transcript) {
        if (!transcript || transcript.trim().length === 0) {
            return;
        }
        
        this.isGeneratingResponse = true;
        
        try {
            console.info('[INTENT-IVR] Processing:', transcript);
			
			// Auto-detect language on first real utterance if not set
			if (!this.sessionLanguage && this.agentLanguages.length > 1) {
				const detectedLang = this.detectLanguageFromText(transcript);
				if (detectedLang !== this.defaultLanguage) {
					this.setSessionLanguage(detectedLang);
					console.info(`[INTENT-IVR] Auto-detected language: ${detectedLang}`);
				}
			}
            
            this.conversationHistory.push({
                role: 'user',
                content: transcript,
                timestamp: Date.now()
            });
            
            // Check if we're in an active flow
            if (this.activeFlow) {
                console.info(`[INTENT-IVR] Active flow: ${this.activeFlow.flow_name}, processing step ${this.flowStepIndex + 1}`);
                await this.processFlowStep(transcript);
                return;
            }
            
            // Match intent using LLM
            const result = await this.matchIntent(transcript);
            
            if (result.matched) {
                console.info('[INTENT-IVR] ✓ Matched intent:', {
                    name: result.matched.intent.name || result.matched.intent.intent_name,
                    type: result.matched.intent.intent_type,
                    confidence: result.matched.confidence?.toFixed(2)
                });
                
                await this.handleIntent(result.matched.intent, transcript, result.matched.query_english);
            } else {
                console.info('[INTENT-IVR] ✗ No intent matched');
                await this.handleFallback(transcript, result.suggested);
            }
            
        } catch (error) {
            console.error('[INTENT-IVR] Error processing input:', error);
            this.emit('error', error);
        } finally {
            this.isGeneratingResponse = false;
        }
    }
    
    /**
     * Process a flow step - collect slot value and advance
     */
    async processFlowStep(utterance) {
        const flow = this.activeFlow;
        const steps = flow?.steps || [];
        
        // Check for cancel phrases
        if (utterance && flow) {
            const cancelPhrases = flow.cancel_phrases || ['cancel', 'stop', 'never mind', 'forget it'];
            const lowerUtterance = utterance.toLowerCase().trim();
            
            const isCancel = cancelPhrases.some(phrase => 
                lowerUtterance === phrase.toLowerCase() ||
                lowerUtterance.includes(phrase.toLowerCase())
            );
            
            if (isCancel) {
                await this.handleFlowCancel();
                return;
            }
        }
        
        // Check if awaiting "anything else" response
        if (this.flowAwaitingAnythingElse) {
            this.flowAwaitingAnythingElse = false;
            
            // Check if user wants something else (multilingual patterns)
            const noPatterns = [
                // English
                'no', 'nope', 'nothing', 'that\'s all', 'that is all', 'i\'m good', 
                'goodbye', 'bye', 'thanks', 'thank you', 'no thanks', 'no thank you',
                'that\'s it', 'all good', 'i\'m done', 'done', 'finished',
                // Urdu/Hindi
                'نہیں', 'نو', 'بس', 'شکریہ', 'ٹھیک ہے', 'نہیں شکریہ', 'بس شکریہ',
                'تھینک یو', 'اللہ حافظ', 'خدا حافظ', 'الوداع',
                'nahi', 'nahin', 'bas', 'shukriya', 'theek hai', 'allah hafiz', 'khuda hafiz',
                // Arabic
                'لا', 'شكرا', 'مع السلامة',
                'la', 'shukran',
                // Common variations
                'ok bye', 'okay bye', 'ok thanks', 'okay thanks'
            ];
            const lowerUtterance = (utterance || '').toLowerCase().trim();
            
            const isNo = noPatterns.some(pattern => 
                lowerUtterance === pattern.toLowerCase() || 
                lowerUtterance.includes(pattern.toLowerCase())
            );
            
            if (isNo) {
                console.info('[INTENT-IVR] User declined anything else - playing closing');
                // Play closing and end
                await this.playClosingMessage(flow);
                this.activeFlow = null;
                this.flowSlots = {};
                this.flowStepIndex = 0;
                this.flowAwaitingAnythingElse = false;
                return;
            } else {
                console.info('[INTENT-IVR] User wants something else - resetting for new intent');
                // User wants something else - reset flow and let intent matching handle it
                this.activeFlow = null;
                this.flowSlots = {};
                this.flowStepIndex = 0;
                this.flowAwaitingAnythingElse = false;
                
                // Re-process this utterance as a new intent
                await this.processUserInput(utterance);
                return;
            }
        }
        
        if (this.flowStepIndex >= steps.length) {
            await this.completeFlow();
            return;
        }
        
        const currentStep = steps[this.flowStepIndex];
        console.info(`[INTENT-IVR] Flow step ${this.flowStepIndex + 1}/${steps.length}: ${currentStep.step_name || currentStep.slot_name}`);
        
        // ============================================
        // Handle confirmation response if awaiting (via LLM)
        // ============================================
        if (this.awaitingConfirmation && utterance) {
            // Use LLM to classify the confirmation response
            const confirmResult = await this.processSlotResponse(utterance, this.awaitingConfirmation.step, {
                awaitingConfirmation: true
            });
            
            if (confirmResult.action === 'confirm_yes') {
                console.info(`[INTENT-IVR] Slot confirmed: ${this.awaitingConfirmation.slotName}`);
                this.awaitingConfirmation = null;
                // Move to next step
                this.flowStepIndex++;
                if (this.flowStepIndex >= steps.length) {
                    await this.completeFlow();
                    return;
                }
                const nextStep = steps[this.flowStepIndex];
                await this.playStepPrompt(nextStep);
                return;
            } else if (confirmResult.action === 'confirm_no') {
                console.info(`[INTENT-IVR] User rejected slot value, replaying step`);
                const stepToReplay = this.awaitingConfirmation.step;
                delete this.flowSlots[stepToReplay.slot_name];
                this.awaitingConfirmation = null;
                await this.playStepPrompt(stepToReplay);
                return;
            } else if (confirmResult.action === 'correct_slot') {
                // User wants to correct a different slot
                this.awaitingConfirmation = null;
                await this.handleSlotCorrection(confirmResult.targetSlot, flow, steps);
                return;
            } else {
                // Unclear response, ask again
                console.info(`[INTENT-IVR] Unclear confirmation response (${confirmResult.action}), asking again`);
                const clarifyMessage = this.getLocalizedMessage('yes_no_clarify');
                await this.generateAndPlayTTS(clarifyMessage, { skipCache: true });
                return;
            }
        }
        
        // ============================================
        // Process slot response with validation
        // ============================================
        if (currentStep.slot_name && utterance) {
            // Initialize retry counter for this step if not exists
            if (!this.slotRetryCount) this.slotRetryCount = {};
            const stepKey = `step_${this.flowStepIndex}`;
            if (this.slotRetryCount[stepKey] === undefined) {
                this.slotRetryCount[stepKey] = 0;
            }
            
            // Process the response
            const slotResult = await this.processSlotResponse(utterance, currentStep);
            console.info(`[INTENT-IVR] Slot processing result:`, slotResult);
            
            // Handle different actions
            switch (slotResult.action) {
                case 'repeat':
                    // User wants to hear the question again
                    console.info('[INTENT-IVR] Replaying step prompt (user requested repeat)');
                    await this.playStepPrompt(currentStep);
                    return;
                    
                case 'wait_more':
                    // User needs more time - don't advance, wait for next input
                    console.info('[INTENT-IVR] Waiting for user to provide response...');
                    // Play acknowledgment
                    const waitMessage = this.ivrConfig?.wait_acknowledgment || this.getLocalizedMessage('wait_acknowledgment');
                    await this.generateAndPlayTTS(waitMessage, { skipCache: true });
                    // Track TTS cost
                    this.slotValidationCosts.ttsCalls++;
                    this.slotValidationCosts.ttsCharacters += waitMessage.length;
                    return;
                    
                case 'correct_slot':
                    // User wants to correct a previously filled slot
                    await this.handleSlotCorrection(slotResult.targetSlot, flow, steps);
                    return;
                    
                case 'invalid':
                    // Invalid response
                    this.slotRetryCount[stepKey]++;
                    const maxRetries = currentStep.max_retries || flow.max_retries || 2;
                    
                    console.info(`[INTENT-IVR] Invalid response for ${currentStep.slot_name}. Retry ${this.slotRetryCount[stepKey]}/${maxRetries}`);
                    
                    if (this.slotRetryCount[stepKey] < maxRetries) {
                        // Use LLM's error message if available (already in correct language), otherwise use step/flow default
                        const invalidText = slotResult.validationError || 
                            currentStep.invalid_response_text || 
                            flow.on_invalid_text || 
                            this.getLocalizedMessage('invalid_response');
                        
                        await this.generateAndPlayTTS(invalidText, { skipCache: true });
                        // Track TTS cost
                        this.slotValidationCosts.ttsCalls++;
                        this.slotValidationCosts.ttsCharacters += invalidText.length;
                        
                        await this.playStepPrompt(currentStep);
                        return;
                    } else {
                        // Max retries exceeded
                        logger.warn(`[INTENT-IVR] Max retries exceeded for slot: ${currentStep.slot_name}`);
                        const invalidAction = currentStep.on_invalid_action || flow.on_invalid_action || 'skip';
                        
                        if (invalidAction === 'transfer') {
                            this.emit('transfer', { queue: flow.on_error_transfer_queue || 'support' });
                            return;
                        } else if (invalidAction === 'skip') {
                            // Store whatever we have and move on
                            this.flowSlots[currentStep.slot_name] = utterance;
                            console.info(`[INTENT-IVR] Skipping validation, stored raw: ${currentStep.slot_name} = "${utterance}"`);
                        } else {
                            // End flow
                            await this.handleFlowError(new Error('Max invalid retries exceeded'));
                            return;
                        }
                    }
                    break;
                    
                case 'store':
                default:
                    // Valid response - store the EXTRACTED value (not raw utterance)
                    const valueToStore = slotResult.extractedValue || utterance;
                    this.flowSlots[currentStep.slot_name] = valueToStore;
                    console.info(`[INTENT-IVR] Stored slot: ${currentStep.slot_name} = "${valueToStore}" (confidence: ${slotResult.confidence || 'N/A'})`);
                    // Reset retry counter
                    this.slotRetryCount[stepKey] = 0;
                    
                    // Check if confirmation is required
                    if (currentStep.requires_confirmation) {
                        await this.askForConfirmation(currentStep, valueToStore);
                        return;  // Wait for confirmation response
                    }
                    break;
            }
        } else if (currentStep.slot_name) {
            // No utterance provided (timeout case)
            await this.handleFlowTimeout();
            return;
        }
        
        // Move to next step
        this.flowStepIndex++;
        
        // Check if flow is complete
        if (this.flowStepIndex >= steps.length) {
            await this.completeFlow();
            return;
        }
        
        // Play next step prompt (uses playStepPrompt with barge-in prevention)
        const nextStep = steps[this.flowStepIndex];
        await this.playStepPrompt(nextStep);
    }
    
    /**
     * Complete the flow - execute completion action and reset
     */
    async completeFlow() {
        console.info(`[INTENT-IVR] Flow completed. Slots:`, this.flowSlots);
        
        const flow = this.activeFlow;
        
        // Execute completion function if configured
        if (flow.on_complete_action === 'function_call' && flow.on_complete_function_name) {
            console.info(`[INTENT-IVR] Executing flow function: ${flow.on_complete_function_name}`);
            
            // Build function arguments with defaults from schema
            let functionArgs = { ...this.flowSlots };
            
            // Try to get function definition to add default values for non-collected fields
            try {
                const functionDef = this.agentFunctions?.find(f => f.name === flow.on_complete_function_name);
                if (functionDef?.parameters?.properties) {
                    const props = functionDef.parameters.properties;
                    for (const [key, schema] of Object.entries(props)) {
                        // Skip if already collected
                        if (functionArgs[key] !== undefined) continue;
                        
                        // Add default for single-value enum
                        if (schema.enum && schema.enum.length === 1) {
                            functionArgs[key] = schema.enum[0];
                            console.info(`[INTENT-IVR] Added default enum value: ${key} = ${schema.enum[0]}`);
                        }
                        // Add explicit default value if defined
                        else if (schema.default !== undefined) {
                            functionArgs[key] = schema.default;
                            console.info(`[INTENT-IVR] Added default value: ${key} = ${schema.default}`);
                        }
                    }
                }
            } catch (err) {
                logger.warn('[INTENT-IVR] Could not load function defaults:', err.message);
            }
            
            this.emit('function.call', {
                name: flow.on_complete_function_name,
                call_id: `flow_${Date.now()}`,
                arguments: JSON.stringify(functionArgs)
            });
        }
        
        // Play completion message (uses caching for static text)
        if (flow.on_complete_response_text || flow.on_complete_audio_id) {
            await this.playFlowAudio(flow, 'complete', {
                text: flow.on_complete_response_text,
                audioId: flow.on_complete_audio_id,
                audioField: 'on_complete_audio_id',
                audioName: `Flow Complete: ${flow.flow_name}`
            });
        }
        
        // Play "Anything else?" if enabled
        if (flow.ask_anything_else !== false) {
            await this.playFlowAudio(flow, 'anything_else', {
                text: flow.anything_else_text || 'Is there anything else I can help you with?',
                audioId: flow.anything_else_audio_id,
                audioField: 'anything_else_audio_id',
                audioName: `Flow Anything Else: ${flow.flow_name}`
            });
            
            // Don't reset flow yet - wait for user response
            // The next transcript will be classified as a new intent or "no"
            this.flowAwaitingAnythingElse = true;
            console.info(`[INTENT-IVR] Awaiting "anything else" response`);
            return;
        }
        
        // Play closing message
        await this.playClosingMessage(flow);
        
        // Reset flow state
        const flowName = flow.flow_name;
        this.activeFlow = null;
        this.flowSlots = {};
        this.flowStepIndex = 0;
        this.flowAwaitingAnythingElse = false;
        
        console.info(`[INTENT-IVR] Flow "${flowName}" completed and reset`);
    }
    
    /**
     * Play closing message with caching support
     */
    async playClosingMessage(flow) {
        if (!flow) flow = this.activeFlow;
        if (!flow) return;
        
        await this.playFlowAudio(flow, 'closing', {
            text: flow.closing_text || 'Thank you for calling. Goodbye!',
            audioId: flow.closing_audio_id,
            audioField: 'closing_audio_id',
            audioName: `Flow Closing: ${flow.flow_name}`
        });
    }
    
    /**
     * Handle flow cancellation with caching support
     */
    async handleFlowCancel() {
        const flow = this.activeFlow;
        if (!flow) return;
        
        console.info(`[INTENT-IVR] Flow "${flow.flow_name}" cancelled by user`);
        
        // Play cancel message
        await this.playFlowAudio(flow, 'cancel', {
            text: flow.on_cancel_response_text || 'No problem, I\'ve cancelled your request.',
            audioId: flow.on_cancel_audio_id,
            audioField: 'on_cancel_audio_id',
            audioName: `Flow Cancel: ${flow.flow_name}`
        });
        
        // Handle cancel action
        const cancelAction = flow.on_cancel_action || 'end_call';
        
        if (cancelAction === 'transfer') {
            // Transfer to agent
            this.emit('transfer', { queue: flow.on_error_transfer_queue || 'support' });
        } else if (cancelAction === 'main_menu') {
            // Reset and go back to main menu
            this.activeFlow = null;
            this.flowSlots = {};
            this.flowStepIndex = 0;
            // Play greeting again
            await this.playGreeting();
        } else {
            // End call
            await this.playClosingMessage(flow);
            this.activeFlow = null;
            this.flowSlots = {};
            this.flowStepIndex = 0;
        }
    }
    
    /**
     * Handle slot correction - user wants to go back and update a previous answer
     */
    async handleSlotCorrection(targetSlot, flow, steps) {
        console.info(`[INTENT-IVR] Handling slot correction for: ${targetSlot || 'previous step'}`);
        
        let targetStepIndex = -1;
        
        if (targetSlot) {
            // Find the step that collects this slot
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const stepSlotName = (step.slot_name || '').toLowerCase();
                if (stepSlotName.includes(targetSlot) || targetSlot.includes(stepSlotName)) {
                    targetStepIndex = i;
                    break;
                }
            }
        }
        
        // If no specific slot found, go back to previous step
        if (targetStepIndex === -1) {
            targetStepIndex = Math.max(0, this.flowStepIndex - 1);
        }
        
        const targetStep = steps[targetStepIndex];
        
        // Clear the slot value
        if (targetStep?.slot_name) {
            delete this.flowSlots[targetStep.slot_name];
            console.info(`[INTENT-IVR] Cleared slot: ${targetStep.slot_name}`);
        }
        
        // Clear accumulator
        this.clearSlotAccumulator();
        
        // Move back to that step
        this.flowStepIndex = targetStepIndex;
        
        // Get localized slot label
        const targetSlotName = targetStep?.slot_name || '';
        const slotLabel = this.getSlotLabel(targetSlotName);
        
        logger.debug(`[INTENT-IVR] Correction label: targetSlot=${targetSlotName}, label=${slotLabel}`);
        
        // Play confirmation and replay the step
        const correctionText = this.ivrConfig?.correction_acknowledgment || 
            this.getLocalizedMessage('correction_acknowledgment', { slotLabel });
        
        await this.generateAndPlayTTS(correctionText, { skipCache: true });
        
        // Track TTS cost
        this.slotValidationCosts.ttsCalls++;
        this.slotValidationCosts.ttsCharacters += correctionText.length;
        
        // Replay the step prompt
        await this.playStepPrompt(targetStep);
    }

    /**
	 * Ask user to confirm the slot value
	 */
	async askForConfirmation(step, value) {
		const lang = this.getCurrentLanguage();
		
		// Format value based on slot type
		const formattedValue = formatForTTS(value, 'auto', lang, {
			slotType: step.slot_type || step.slot_name
		});
		
		// Get slot label for natural language
		const slotLabel = this.getSlotLabel(step.slot_name);
		
		// Resolve i18n content for confirmation template
		const i18nContent = await this.resolveI18nContent(
			'step',
			step.id,
			'confirm_template',
			lang
		);
		
		// Use i18n content if available, otherwise fall back to base
		const contentLanguage = i18nContent?.language || lang;
		
		// Build confirmation prompt - priority: i18n > step template > localized default
		let confirmText = i18nContent?.text || 
			step.confirm_template || 
			this.getLocalizedMessage('confirm_value', { 
				value: formattedValue,
				slotLabel: slotLabel
			});
		
		// Substitute formatted value - handle multiple placeholder patterns
		confirmText = confirmText
			.replace(/\{\{value\}\}/g, formattedValue)
			.replace(/\{\{slot_value\}\}/g, formattedValue)
			.replace(/\{\{slot_label\}\}/g, slotLabel);
		
		// Also replace the actual slot name placeholder (e.g., {{invoice_no}}, {{customer_name}})
		if (step.slot_name) {
			confirmText = confirmText.replace(
				new RegExp(`\\{\\{${step.slot_name}\\}\\}`, 'g'), 
				formattedValue
			);
		}
		
		// Set awaiting confirmation state
		this.awaitingConfirmation = {
			step: step,
			slotName: step.slot_name,
			value: value,
			formattedValue: formattedValue
		};
		
		console.info(`[INTENT-IVR] Asking confirmation for ${step.slot_name}: "${formattedValue}" (${contentLanguage})`);
		
		await this.generateAndPlayTTS(confirmText, {
			cacheAudio: false,
			language: contentLanguage,
			formatNumbers: false  // Already formatted above
		});
	}
    
    /**
     * Handle flow timeout with caching support
     */
    async handleFlowTimeout() {
        const flow = this.activeFlow;
        if (!flow) return;
        
        const retryCount = this.flowRetryCount || 0;
        const maxRetries = flow.max_retries_per_step || 3;
        
        if (retryCount < maxRetries) {
            // Play timeout message and retry
            this.flowRetryCount = retryCount + 1;
            
            await this.playFlowAudio(flow, 'timeout', {
                text: flow.on_timeout_text || 'I didn\'t hear a response. Let me repeat that.',
                audioId: flow.on_timeout_audio_id,
                audioField: 'on_timeout_audio_id',
                audioName: `Flow Timeout: ${flow.flow_name}`
            });
            
            // Replay current step
            const currentStep = flow.steps?.[this.flowStepIndex];
            if (currentStep) {
                await this.playStepPrompt(currentStep);
            }
        } else {
            // Max retries exceeded - take timeout action
            const timeoutAction = flow.on_timeout_action || 'transfer';
            console.info(`[INTENT-IVR] Max retries exceeded, action: ${timeoutAction}`);
            
            if (timeoutAction === 'transfer') {
                this.emit('transfer', { queue: flow.on_error_transfer_queue || 'support' });
            } else if (timeoutAction === 'skip') {
                // Skip to next step
                this.flowStepIndex++;
                await this.processFlowStep();
            } else {
                // End call
                await this.playClosingMessage(flow);
                this.activeFlow = null;
            }
        }
    }
    
    /**
     * Handle flow error with caching support
     */
    async handleFlowError(error) {
        const flow = this.activeFlow;
        if (!flow) return;
        
        console.error(`[INTENT-IVR] Flow error: ${error?.message || error}`);
        
        // Play error message
        await this.playFlowAudio(flow, 'error', {
            text: flow.on_error_text || 'I\'m sorry, something went wrong. Let me transfer you to an agent.',
            audioId: flow.on_error_audio_id,
            audioField: 'on_error_audio_id',
            audioName: `Flow Error: ${flow.flow_name}`
        });
        
        // Transfer to error queue
        if (flow.on_error_transfer_queue) {
            this.emit('transfer', { queue: flow.on_error_transfer_queue });
        }
        
        // Reset flow state
        this.activeFlow = null;
        this.flowSlots = {};
        this.flowStepIndex = 0;
    }
    
    /**
	 * Generic flow audio player with caching support
	 * Handles: intro, complete, cancel, timeout, error, anything_else, closing
	 * Prevents barge-in during playback
	 */
	async playFlowAudio(flow, audioType, options) {
		const { text, audioId, audioField, audioName } = options;
		
		// Prevent user speech from interrupting flow audio
		this.preventBargeIn = true;
		
		try {
			// Resolve i18n content first
			const fieldName = audioField?.replace('_audio_id', '_text') || `${audioType}_text`;
			const currentLang = this.getCurrentLanguage();
			
			const i18nContent = await this.resolveI18nContent(
				'flow',
				flow.id,
				fieldName,
				currentLang
			);
			
			// Priority 1: i18n audio exists → play it
			if (i18nContent?.audio_id) {
				let audioBuffer = this.audioCache.get(i18nContent.audio_id);
				if (!audioBuffer) {
					audioBuffer = await this.loadAudioFromAPI(i18nContent.audio_id);
				}
				if (audioBuffer) {
					logger.info(`[INTENT-IVR] Playing i18n audio (${currentLang}): ${i18nContent.audio_id}`);
					if (i18nContent.text) {
						this.conversationHistory.push({
							role: 'assistant',
							content: i18nContent.text,
							timestamp: Date.now()
						});
					}
					await this.playAudioBuffer(audioBuffer);
					return;
				}
			}
			
			// Priority 2: i18n text exists (no audio) → generate TTS in target language
			if (i18nContent?.text) {
				const hasDynamicVars = i18nContent.text.includes('{{');
				
				if (hasDynamicVars) {
					// Substitute variables
					let finalText = i18nContent.text;
					for (const [key, value] of Object.entries(this.flowSlots || {})) {
						finalText = finalText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
					}
					if (this.lastFunctionResult) {
						finalText = finalText.replace(/\{\{result\.([^}]+)\}\}/g, (match, path) => {
							return this.getNestedValue(this.lastFunctionResult, path) || match;
						});
					}
					await this.generateAndPlayTTS(finalText, { 
						cacheAudio: false,
						language: currentLang
					});
				} else {
					// Static text - cache it
					logger.info(`[INTENT-IVR] Generating TTS for i18n text (${currentLang})`);
					await this.generateAndPlayTTS(i18nContent.text, {
						cacheAudio: true,
						flowId: flow.id,
						audioName: audioName,
						audioField: audioField,
						language: currentLang
					});
				}
				return;
			}
			
			// Priority 3: No i18n content → use base audio if available
			if (audioId) {
				let audioBuffer = this.audioCache.get(audioId);
				if (!audioBuffer) {
					audioBuffer = await this.loadAudioFromAPI(audioId);
				}
				if (audioBuffer) {
					logger.info(`[INTENT-IVR] Playing base audio (no i18n for ${currentLang}): ${audioId}`);
					if (text) {
						this.conversationHistory.push({
							role: 'assistant',
							content: text,
							timestamp: Date.now()
						});
					}
					await this.playAudioBuffer(audioBuffer);
					return;
				}
			}
			
			// Priority 4: No audio at all → generate TTS for base text
			if (text) {
				const hasDynamicVars = text.includes('{{');
				
				if (hasDynamicVars) {
					let finalText = text;
					for (const [key, value] of Object.entries(this.flowSlots || {})) {
						finalText = finalText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
					}
					if (this.lastFunctionResult) {
						finalText = finalText.replace(/\{\{result\.([^}]+)\}\}/g, (match, path) => {
							return this.getNestedValue(this.lastFunctionResult, path) || match;
						});
					}
					await this.generateAndPlayTTS(finalText, { 
						cacheAudio: false,
						language: currentLang
					});
				} else {
					await this.generateAndPlayTTS(text, {
						cacheAudio: true,
						flowId: flow.id,
						audioName: audioName,
						audioField: audioField,
						language: currentLang
					});
				}
			}
		} finally {
			// Re-enable barge-in after flow audio completes
			this.preventBargeIn = false;
		}
	}
    
    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
    
    /**
	 * Play step prompt with caching support
	 * Prevents barge-in during playback
	 * Starts response timeout timer
	 * Supports multi-language content resolution
	 */
	async playStepPrompt(step) {
		if (!step) return;
		
		const flow = this.activeFlow;
		
		// Prime audio output in case connection manager reset after speech
		await this.primeAudioOutput();
		
		// Prevent user speech from interrupting step prompt
		this.preventBargeIn = true;
		
		try {
			const currentLang = this.getCurrentLanguage();
			
			// Resolve i18n content first
			const i18nContent = await this.resolveI18nContent(
				'step',
				step.id,
				'prompt_text',
				currentLang
			);
			
			// Priority 1: i18n audio exists → play it
			if (i18nContent?.audio_id) {
				let audioBuffer = this.audioCache.get(i18nContent.audio_id);
				if (!audioBuffer) {
					audioBuffer = await this.loadAudioFromAPI(i18nContent.audio_id);
				}
				if (audioBuffer) {
					logger.info(`[INTENT-IVR] Playing i18n step audio (${currentLang}): ${i18nContent.audio_id}`);
					if (i18nContent.text) {
						this.conversationHistory.push({
							role: 'assistant',
							content: i18nContent.text,
							timestamp: Date.now()
						});
					}
					await this.playAudioBuffer(audioBuffer);
					this.startResponseTimer(step);
					return;
				}
			}
			
			// Priority 2: i18n text exists (no audio) → generate TTS
			if (i18nContent?.text) {
				logger.info(`[INTENT-IVR] Generating TTS for step (${currentLang}): ${step.step_name || step.slot_name}`);
				await this.generateAndPlayTTS(i18nContent.text, {
					cacheAudio: true,
					stepId: step.id,
					flowId: flow?.id,
					audioName: `Step: ${step.step_name || step.slot_name}`,
					audioField: 'prompt_audio_id',
					language: currentLang,
					slotType: step.slot_type,
					slotName: step.slot_name
				});
				this.startResponseTimer(step);
				return;
			}
			
			// Priority 3: No i18n → use base audio if available
			if (step.prompt_audio_id) {
				let audioBuffer = this.audioCache.get(step.prompt_audio_id);
				if (!audioBuffer) {
					audioBuffer = await this.loadAudioFromAPI(step.prompt_audio_id);
				}
				if (audioBuffer) {
					logger.info(`[INTENT-IVR] Playing base step audio (no i18n for ${currentLang}): ${step.prompt_audio_id}`);
					if (step.prompt_text) {
						this.conversationHistory.push({
							role: 'assistant',
							content: step.prompt_text,
							timestamp: Date.now()
						});
					}
					await this.playAudioBuffer(audioBuffer);
					this.startResponseTimer(step);
					return;
				}
			}
			
			// Priority 4: No audio → generate TTS for base text
			if (step.prompt_text) {
				logger.info(`[INTENT-IVR] Generating TTS for base step text (${currentLang}): ${step.step_name || step.slot_name}`);
				await this.generateAndPlayTTS(step.prompt_text, {
					cacheAudio: true,
					stepId: step.id,
					flowId: flow?.id,
					audioName: `Step: ${step.step_name || step.slot_name}`,
					audioField: 'prompt_audio_id',
					language: currentLang,
					slotType: step.slot_type,
					slotName: step.slot_name
				});
				this.startResponseTimer(step);
			}
		} finally {
			// Re-enable barge-in after step prompt completes
			this.preventBargeIn = false;
		}
	}
    
    /**
     * Start response timeout timer for flow steps
     */
    startResponseTimer(step) {
        // Clear any existing timer
        this.clearResponseTimer();
        
        // Get timeout from step, flow, or default (15 seconds)
        const timeoutMs = (step?.response_timeout || this.activeFlow?.response_timeout || 15) * 1000;
        
        console.info(`[INTENT-IVR] Started response timer: ${timeoutMs/1000}s`);
        
        this.responseTimer = setTimeout(async () => {
            // Check if still in active flow and waiting for response
            if (this.activeFlow && !this.isPlaying && !this.isGeneratingResponse) {
                logger.warn('[INTENT-IVR] Response timeout - no user input received');
                await this.handleFlowTimeout();
            }
        }, timeoutMs);
    }
    
    /**
     * Clear response timeout timer
     */
    clearResponseTimer() {
        if (this.responseTimer) {
            clearTimeout(this.responseTimer);
            this.responseTimer = null;
        }
    }
    
    /**
     * Match transcript against intents using LLM
     */
    async matchIntent(transcript) {
        const classifierType = this.ivrConfig?.classifier_type || 'llm';
        
        if (classifierType === 'keyword') {
            return this.matchIntentKeyword(transcript);
        }
        
        return await this.classifyIntentWithLLM(transcript);
    }
    
    /**
     * Classify intent using LLM (Groq/OpenAI)
     */
    async classifyIntentWithLLM(transcript) {
        try {
            const intentList = this.intents
                .filter(i => i.is_active)
                .map(i => ({
                    id: i.id,
                    name: i.name || i.intent_name,
                    description: i.description || '',
                    trigger_phrases: i.trigger_phrases || [],
                    trigger_keywords: i.trigger_keywords || []
                }));
            
            if (intentList.length === 0) {
                console.info('[INTENT-IVR] No active intents configured');
                return { matched: null, suggested: null };
            }
            
            console.info('[INTENT-IVR] Classifying with', intentList.length, 'intents');
            
            // Build recent conversation history (last 6 turns max)
            const recentHistory = this.conversationHistory.slice(-6);
            let conversationContext = '';
            
            if (recentHistory.length > 0) {
                conversationContext = `
RECENT CONVERSATION HISTORY (for context):
${recentHistory.map(turn => {
    const role = turn.role === 'assistant' ? 'Bot' : 'User';
    return `${role}: "${turn.content}"`;
}).join('\n')}

IMPORTANT: Use this context to understand the user's intent. For example:
- If the bot just asked "Is there anything else I can help you with?" and user says "no/thank you/bye", classify as end_conversation/goodbye, NOT as greeting.
- If user is responding to a specific question, consider that context.
`;
            }
            
            const systemPrompt = `You are an intent classifier for a voice IVR system. Match user speech to the BEST fitting intent.
${conversationContext}
AVAILABLE INTENTS:
${intentList.map((i, idx) => `${idx + 1}. ID: "${i.id}"
   Name: "${i.name}"
   Description: ${i.description || 'N/A'}
   Example phrases: ${(i.trigger_phrases || []).slice(0, 5).join(', ') || 'N/A'}`).join('\n\n')}

CRITICAL RULES:
1. Match based on MEANING, not exact keywords
2. USE CONVERSATION CONTEXT - a phrase like "no thank you" after "anything else?" means END/GOODBYE, not greeting
3. Greetings should ONLY match "greeting" intent at the START of a conversation, not as polite responses mid-conversation
4. Set confidence 0.8+ for clear matches, 0.5-0.8 for partial matches
5. Only return null if NO intent is even remotely related
6. ALWAYS translate the user's query to English in "query_english" field

RESPOND IN THIS EXACT JSON FORMAT:
{"matched_intent_id": "actual-id-or-null", "matched_intent_name": "actual-name-or-null", "confidence": 0.0-1.0, "suggested_intent": "snake_case_name", "suggested_intent_description": "brief description", "query_english": "user query translated to English"}`;

            const userMessage = `User said (may be in Urdu/English): "${transcript}"

Which intent matches best? Provide English translation in query_english field.`;

            const classifierModel = this.ivrConfig?.classifier_model || 'llama-3.3-70b-versatile';
            const temperature = parseFloat(this.ivrConfig?.classifier_temperature) || 0.3;
            
            const response = await this.callClassifierLLM(systemPrompt, userMessage, classifierModel, temperature);
            
            if (!response) {
                logger.warn('[INTENT-IVR] LLM classification failed, falling back to keyword');
                return this.matchIntentKeyword(transcript);
            }
            
            let classification;
            try {
                classification = JSON.parse(response);
            } catch (parseError) {
                console.error('[INTENT-IVR] Failed to parse LLM response');
                return this.matchIntentKeyword(transcript);
            }
            
            console.info('[INTENT-IVR] LLM Classification:', {
                matched_id: classification.matched_intent_id,
                matched_name: classification.matched_intent_name,
                confidence: classification.confidence,
                query_english: classification.query_english
            });
            
            const confidenceThreshold = parseFloat(this.ivrConfig?.confidence_threshold) || 0.6;
            
            let matchedIntent = null;
            if (classification.matched_intent_id && classification.matched_intent_id !== 'null') {
                matchedIntent = this.intents.find(i => i.id === classification.matched_intent_id);
            }
            if (!matchedIntent && classification.matched_intent_name && classification.matched_intent_name !== 'null') {
                matchedIntent = this.intents.find(i => 
                    i.name === classification.matched_intent_name ||
                    i.intent_name === classification.matched_intent_name ||
                    i.name?.toLowerCase() === classification.matched_intent_name?.toLowerCase() ||
                    i.intent_name?.toLowerCase() === classification.matched_intent_name?.toLowerCase()
                );
            }
            
            if (!matchedIntent && classification.suggested_intent) {
                matchedIntent = this.intents.find(i => 
                    i.name?.toLowerCase() === classification.suggested_intent?.toLowerCase() ||
                    i.intent_name?.toLowerCase() === classification.suggested_intent?.toLowerCase()
                );
                if (matchedIntent) {
                    classification.confidence = classification.confidence || 0.7;
                }
            }
            
            if (matchedIntent && classification.confidence >= confidenceThreshold) {
                return {
                    matched: {
                        intent: matchedIntent,
                        confidence: classification.confidence,
                        query_english: classification.query_english
                    },
                    suggested: null
                };
            }
            
            return {
                matched: null,
                suggested: {
                    intent: classification.suggested_intent,
                    description: classification.suggested_intent_description,
                    confidence: classification.confidence,
                    query_english: classification.query_english
                }
            };
            
        } catch (error) {
            console.error('[INTENT-IVR] LLM classification error:', error.message);
            return this.matchIntentKeyword(transcript);
        }
    }
    
	async detectLanguageWithLLM(text) {
		const prompt = `Detect the language of this text. Reply with ONLY the ISO 639-1 code (e.g., 'en', 'ur', 'hi'):
	Text: "${text}"`;
		
		// Use existing callClassifierLLM method
		const response = await this.callClassifierLLM(prompt, null, 'You are a language detector.');
		return response?.trim().toLowerCase().substring(0, 2);
	}

    /**
     * Call LLM for intent classification
     */
    async callClassifierLLM(systemPrompt, userMessage, model, temperature) {
        try {
            const groqApiKey = process.env.GROQ_API_KEY;
            const openaiApiKey = process.env.OPENAI_API_KEY;
            
            const configProvider = this.ivrConfig?.classifier_provider || 'groq';
            
            let response;
            let provider;
            let usedModel;
            
            if (configProvider === 'groq' && groqApiKey) {
                provider = 'groq';
                usedModel = model || 'llama-3.3-70b-versatile';
                
                response = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    {
                        model: usedModel,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userMessage }
                        ],
                        temperature: temperature || 0.3,
                        max_tokens: 500,
                        response_format: { type: 'json_object' }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${groqApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    }
                );
            } else if (openaiApiKey) {
                provider = 'openai';
                usedModel = 'gpt-4o-mini';
                
                response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: usedModel,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userMessage }
                        ],
                        temperature: temperature || 0.3,
                        max_tokens: 500,
                        response_format: { type: 'json_object' }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${openaiApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    }
                );
            } else {
                logger.warn('[INTENT-IVR] No LLM API key available');
                return null;
            }
            
            // Track usage
            const usage = response.data.usage;
            if (usage) {
                this.classifierCostMetrics.totalCalls++;
                this.classifierCostMetrics.totalInputTokens += usage.prompt_tokens || 0;
                this.classifierCostMetrics.totalOutputTokens += usage.completion_tokens || 0;
                
                // Calculate cost based on provider (OpenAI gpt-4o-mini or Groq)
                let callCost = 0;
                if (provider === 'openai') {
                    // gpt-4o-mini: $0.15/M input, $0.60/M output
                    callCost = (usage.prompt_tokens * 0.00000015) + (usage.completion_tokens * 0.0000006);
                } else {
                    // Groq llama-3.3-70b: $0.59/M input, $0.79/M output
                    callCost = (usage.prompt_tokens * 0.00000059) + (usage.completion_tokens * 0.00000079);
                }
                this.classifierCostMetrics.totalCost += callCost;
                
                console.info(`[INTENT-IVR] Classifier: ${provider}/${usedModel}, tokens: ${usage.prompt_tokens}+${usage.completion_tokens}`);
            }
            
            return response.data.choices?.[0]?.message?.content;
            
        } catch (error) {
            console.error('[INTENT-IVR] Classifier LLM error:', error.message);
            return null;
        }
    }
    
    /**
     * Simple keyword-based intent matching (fallback)
     */
    matchIntentKeyword(transcript) {
        const normalizedTranscript = transcript.toLowerCase().trim();
        const words = normalizedTranscript.split(/\s+/);
        
        let bestMatch = null;
        let bestScore = 0;
        const confidenceThreshold = this.ivrConfig?.confidence_threshold || 0.6;
        
        for (const intent of this.intents) {
            if (!intent.is_active) continue;
            
            let score = 0;
            
            const triggerPhrases = intent.trigger_phrases || [];
            for (const phrase of triggerPhrases) {
                const normalizedPhrase = phrase.toLowerCase().trim();
                
                if (normalizedTranscript.includes(normalizedPhrase)) {
                    score = Math.max(score, 0.95);
                    break;
                }
                
                const phraseWords = normalizedPhrase.split(/\s+/);
                const matchedWords = phraseWords.filter(w => words.includes(w));
                const overlapScore = matchedWords.length / phraseWords.length;
                
                if (overlapScore > 0.5) {
                    score = Math.max(score, overlapScore * 0.8);
                }
            }
            
            const keywords = intent.trigger_keywords || [];
            if (keywords.length > 0) {
                const matchedKeywords = keywords.filter(kw => 
                    normalizedTranscript.includes(kw.toLowerCase())
                );
                const keywordScore = matchedKeywords.length / keywords.length;
                score = Math.max(score, keywordScore * 0.7);
            }
            
            const threshold = intent.confidence_threshold || confidenceThreshold;
            
            if (score >= threshold && score > bestScore) {
                bestScore = score;
                bestMatch = { intent, confidence: score };
            }
        }
        
        if (bestMatch) {
            return { matched: bestMatch, suggested: null };
        }
        
        return { matched: null, suggested: { intent: 'unknown' } };
    }
    
    /**
     * Handle matched intent
     */
    async handleIntent(intent, transcript, queryEnglish = null) {
        switch (intent.intent_type) {
            case 'static':
                await this.handleStaticIntent(intent);
                break;
            case 'kb_lookup':
                await this.handleKBLookupIntent(intent, transcript, queryEnglish);
                break;
            case 'function_call':
                await this.handleFunctionIntent(intent, transcript);
                break;
            case 'transfer':
                await this.handleTransferIntent(intent);
                break;
            case 'flow':
                await this.handleFlowIntent(intent, transcript);
                break;
            default:
                await this.handleStaticIntent(intent);
        }
    }
    
	/**
	 * Resolve flow content with i18n support
	 */
	async resolveFlowContent(flow, field) {
		const i18nContent = await this.resolveI18nContent(
			'flow',
			flow.id,
			field,
			this.getCurrentLanguage()
		);
		
		// Field name mapping
		const audioFieldMap = {
			'intro_text': 'intro_audio_id',
			'on_complete_response_text': 'on_complete_audio_id',
			'on_cancel_response_text': 'on_cancel_audio_id',
			'anything_else_text': 'anything_else_audio_id',
			'closing_text': 'closing_audio_id',
			'on_error_text': 'on_error_audio_id',
			'on_timeout_text': 'on_timeout_audio_id'
		};
		
		const audioField = audioFieldMap[field];
		
		return {
			text: i18nContent?.text || flow[field],
			audio_id: i18nContent?.audio_id || flow[audioField],
			language: i18nContent?.language || this.getCurrentLanguage()
		};
	}

	/**
	 * Resolve step content with i18n support
	 */
	async resolveStepContent(flowId, step) {
		const i18nContent = await this.resolveI18nContent(
			'step',
			step.id,
			'prompt_text',
			this.getCurrentLanguage()
		);
		
		return {
			text: i18nContent?.text || step.prompt_text,
			audio_id: i18nContent?.audio_id || step.prompt_audio_id,
			language: i18nContent?.language || this.getCurrentLanguage()
		};
	}

    /**
     * Handle flow intent - starts a conversation flow
     */
    async handleFlowIntent(intent, transcript) {
        try {
            const flowId = intent.flow_id;
            const agentId = this.agentConfig?.agentId || this.config.agentId;
            
            let flow = null;
            
            if (flowId) {
                // Direct flow ID - load it
                console.info(`[INTENT-IVR] Loading flow by ID: ${flowId}`);
                const response = await axios.get(
                    `${this.apiBaseUrl}/api/flows/${agentId}/${flowId}`,
                    { headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}, timeout: 10000 }
                );
                flow = response.data.data;
            } else {
                // No flow_id - list flows and find matching one by intent name
                console.info(`[INTENT-IVR] No flow_id on intent, searching by name: ${intent.name || intent.intent_name}`);
                const listResponse = await axios.get(
                    `${this.apiBaseUrl}/api/flows/${agentId}`,
                    { headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}, timeout: 10000 }
                );
                const flows = listResponse.data.data || [];
                
                // Try to find flow by intent name
                const intentName = (intent.name || intent.intent_name || '').toLowerCase();
                let matchedFlow = flows.find(f => 
                    f.flow_key?.toLowerCase().includes(intentName) ||
                    f.flow_name?.toLowerCase().includes(intentName) ||
                    intentName.includes(f.flow_key?.toLowerCase()) ||
                    intentName.includes(f.flow_name?.toLowerCase())
                );
                
                if (!matchedFlow) {
                    // Use first active flow
                    matchedFlow = flows.find(f => f.is_active) || flows[0];
                }
                
                if (matchedFlow) {
                    console.info(`[INTENT-IVR] Found flow: ${matchedFlow.flow_name} (${matchedFlow.id})`);
                    // Load full flow with steps
                    const flowResponse = await axios.get(
                        `${this.apiBaseUrl}/api/flows/${agentId}/${matchedFlow.id}`,
                        { headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}, timeout: 10000 }
                    );
                    flow = flowResponse.data.data;
                }
            }
            
            if (!flow) {
                console.error('[INTENT-IVR] No flow found for intent');
                await this.handleStaticIntent(intent);
                return;
            }
            
            // Start the flow
            this.activeFlow = flow;
            this.flowSlots = {};
            this.flowStepIndex = 0;
			this.activeFlow._sessionLanguage = this.getCurrentLanguage();
            this.slotRetryCount = {};  // Reset retry counters
            this.clearSlotAccumulator();  // Clear any accumulated partial responses
            this.awaitingConfirmation = null;  // Clear confirmation state
            
            console.info(`[INTENT-IVR] Started flow: ${flow.flow_name} with ${flow.steps?.length || 0} steps`);
            
            // Play intro if available (uses caching)
            if (flow.intro_text || flow.intro_audio_id) {
                await this.playFlowAudio(flow, 'intro', {
                    text: flow.intro_text,
                    audioId: flow.intro_audio_id,
                    audioField: 'intro_audio_id',
                    audioName: `Flow Intro: ${flow.flow_name}`
                });
            }
            
            // Play first step prompt (uses playStepPrompt with barge-in prevention and audio priming)
            const steps = flow.steps || [];
            if (steps.length > 0) {
                const firstStep = steps[0];
                await this.playStepPrompt(firstStep);
            }
            
        } catch (error) {
            console.error('[INTENT-IVR] Flow error:', error.message);
            await this.handleStaticIntent(intent);
        }
    }
    
    /**
     * Handle static response intent
     */
    async handleStaticIntent(intent) {
		const currentLang = this.getCurrentLanguage();
		
		// Try to resolve i18n content first
		const i18nContent = await this.resolveI18nContent(
			'intent', 
			intent.id, 
			'response_text', 
			currentLang
		);
		
		// Priority 1: i18n audio exists → play it
		if (i18nContent?.audio_id) {
			let audioBuffer = this.audioCache.get(i18nContent.audio_id);
			if (!audioBuffer) {
				audioBuffer = await this.loadAudioFromAPI(i18nContent.audio_id);
				if (audioBuffer) {
					this.audioCache.set(i18nContent.audio_id, audioBuffer);
				}
			}
			if (audioBuffer) {
				logger.info(`[INTENT-IVR] Playing i18n intent audio (${currentLang})`);
				this.emit('transcript.agent', { transcript: i18nContent.text || '[Audio Response]' });
				if (i18nContent.text) {
					this.conversationHistory.push({
						role: 'assistant',
						content: i18nContent.text,
						timestamp: Date.now()
					});
				}
				await this.playAudioBuffer(audioBuffer);
				return;
			}
		}
		
		// Priority 2: i18n text exists (no audio) → generate TTS
		if (i18nContent?.text) {
			logger.info(`[INTENT-IVR] Generating TTS for i18n intent (${currentLang})`);
			await this.generateAndPlayTTS(i18nContent.text, { 
				cacheAudio: true, 
				audioName: `Intent: ${intent.name || intent.intent_name}`,
				intentId: intent.id,
				language: currentLang
			});
			return;
		}
		
		// Priority 3: No i18n → use base audio if available
		if (intent.response_audio_id) {
			let audioBuffer = this.audioCache.get(intent.response_audio_id);
			if (!audioBuffer) {
				audioBuffer = await this.loadAudioFromAPI(intent.response_audio_id);
				if (audioBuffer) {
					this.audioCache.set(intent.response_audio_id, audioBuffer);
				}
			}
			if (audioBuffer) {
				logger.info(`[INTENT-IVR] Playing base intent audio (no i18n for ${currentLang})`);
				this.emit('transcript.agent', { transcript: intent.response_text || '[Audio Response]' });
				if (intent.response_text) {
					this.conversationHistory.push({
						role: 'assistant',
						content: intent.response_text,
						timestamp: Date.now()
					});
				}
				await this.playAudioBuffer(audioBuffer);
				return;
			}
		}
		
		// Priority 4: No audio → generate TTS for base text
		if (intent.response_text) {
			logger.info(`[INTENT-IVR] Generating TTS for base intent text (${currentLang})`);
			await this.generateAndPlayTTS(intent.response_text, { 
				cacheAudio: true, 
				audioName: `Intent: ${intent.name || intent.intent_name}`,
				intentId: intent.id,
				language: currentLang
			});
		}
	}
    
    /**
     * Handle KB lookup intent
     */
    async handleKBLookupIntent(intent, transcript, queryEnglish = null) {
        try {
            const kbId = this.agentConfig?.kb_id || this.config.kb_id;
            
            if (!kbId) {
                logger.warn('[INTENT-IVR] No KB ID configured');
                await this.handleStaticIntent(intent);
                return;
            }
            
            // Play please wait audio
            const waitAudioId = this.ivrConfig?.please_wait_audio_id;
            if (waitAudioId) {
                const waitBuffer = this.audioCache.get(waitAudioId);
                if (waitBuffer) {
                    await this.playAudioBuffer(waitBuffer);
                }
            }
            
            // Search KB
            const searchQuery = queryEnglish || transcript;
            const response = await axios.post(
                `${this.apiBaseUrl}/api/knowledge/search`,
                { kb_id: kbId, query: searchQuery, top_k: 3, search_type: 'text' },
                { headers: this.apiKey ? { 'x-api-key': this.apiKey } : {}, timeout: 10000 }
            );
            
            const textResults = response.data.data?.text_results || [];
            
            if (textResults.length === 0) {
                await this.playFallbackResponse();
                return;
            }
            
            // Generate LLM response
            const kbContext = textResults.map((r, i) => `[${i + 1}] ${r.content || r.text || ''}`).join('\n\n');
            const llmResponse = await this.generateKBResponse(transcript, kbContext);
            
            if (llmResponse) {
                await this.generateAndPlayTTS(llmResponse);
            } else {
                await this.generateAndPlayTTS(textResults[0]?.content?.substring(0, 300) || intent.response_text);
            }
            
        } catch (error) {
            console.error('[INTENT-IVR] KB lookup error:', error.message);
            await this.handleStaticIntent(intent);
        }
    }
    
    /**
     * Generate KB response using LLM
     */
    async generateKBResponse(userQuery, kbContext) {
        try {
            const systemPrompt = `You are a helpful voice assistant. Answer based ONLY on the provided context.

Rules:
- Respond in the SAME LANGUAGE as the user's question
- Keep response concise (2-3 sentences max) - this is for voice/phone
- If context doesn't have the info, say you don't have that information
- Be natural and conversational

Context:
${kbContext}`;

            const openaiApiKey = process.env.OPENAI_API_KEY;
            if (!openaiApiKey) return null;
            
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userQuery }
                    ],
                    temperature: 0.7,
                    max_tokens: 300
                },
                {
                    headers: {
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );
            
            return response.data.choices?.[0]?.message?.content;
        } catch (error) {
            console.error('[INTENT-IVR] KB response error:', error.message);
            return null;
        }
    }
    
    /**
     * Handle function call intent
     */
    async handleFunctionIntent(intent, transcript) {
        // Emit function call for external handling
        if (intent.function_name) {
            this.emit('function.call', {
                name: intent.function_name,
                call_id: `intent_${Date.now()}`,
                arguments: JSON.stringify({ transcript, intent_id: intent.id })
            });
        }
        
        // Play response while waiting
        if (intent.response_text) {
            await this.generateAndPlayTTS(intent.response_text);
        }
    }
    
    /**
     * Handle function response from external function execution
     * Called by connection manager after function completes
     * @param {string} functionName - Name of the function that was called
     * @param {Object} result - Function execution result
     */
    async sendFunctionResponse(functionName, result) {
        try {
            console.info(`[INTENT-IVR] Function response received: ${functionName}`, result);
            
            // Check if result has a response to play
            if (result?.response_text || result?.message) {
                const responseText = result.response_text || result.message;
                await this.generateAndPlayTTS(responseText, { cacheAudio: false });
            } else if (result?.audio_id) {
                // Play pre-defined audio if provided
                const audioBuffer = await this.loadAudioFromAPI(result.audio_id);
                if (audioBuffer) {
                    await this.playAudioBuffer(audioBuffer);
                }
            } else if (result?.success === false && result?.error) {
                // Handle error response
                const errorText = result.error_message || this.getLocalizedMessage('function_error');
                await this.generateAndPlayTTS(errorText);
            }
            
            // If function completed a flow, reset flow state
            if (result?.complete_flow && this.activeFlow) {
                console.info('[INTENT-IVR] Function completed flow, resetting state');
                this.activeFlow = null;
                this.flowSlots = {};
                this.flowStepIndex = 0;
            }
            
        } catch (error) {
            console.error('[INTENT-IVR] Error handling function response:', error.message);
        }
    }
    
    /**
     * Handle transfer intent
     */
    async handleTransferIntent(intent) {
        if (intent.response_text) {
            await this.generateAndPlayTTS(intent.response_text);
        }
        
        this.emit('transfer.requested', {
            queue: intent.transfer_queue || 'support'
        });
    }
    
    /**
	 * Handle fallback (no intent matched) with i18n support
	 */
	async handleFallback(transcript, suggested) {
		const currentLang = this.getCurrentLanguage();
		const configId = this.ivrConfig?.id;
		
		// Try i18n no_match content
		if (configId) {
			const i18nContent = await this.resolveI18nContent(
				'config',
				configId,
				'no_match_text',
				currentLang
			);
			
			// Priority 1: i18n audio
			if (i18nContent?.audio_id) {
				const buffer = await this.loadAudioFromAPI(i18nContent.audio_id);
				if (buffer) {
					await this.playAudioBuffer(buffer);
					return;
				}
			}
			
			// Priority 2: i18n text
			if (i18nContent?.text) {
				await this.generateAndPlayTTS(i18nContent.text, { language: currentLang });
				return;
			}
		}
		
		// Priority 3: Base no_match audio
		if (this.ivrConfig?.no_match_audio_id) {
			const buffer = this.audioCache.get(this.ivrConfig.no_match_audio_id);
			if (buffer) {
				await this.playAudioBuffer(buffer);
				return;
			}
		}
		
		// Priority 4: Base text or localized message
		const fallbackText = this.ivrConfig?.no_match_text || this.getLocalizedMessage('not_understood');
		await this.generateAndPlayTTS(fallbackText, { language: currentLang });
	}
    
    /**
	 * Play fallback response (KB not found) with i18n support
	 */
	async playFallbackResponse() {
		const currentLang = this.getCurrentLanguage();
		const configId = this.ivrConfig?.id;
		
		// Try i18n fallback content
		if (configId) {
			const i18nContent = await this.resolveI18nContent(
				'config',
				configId,
				'fallback_text',
				currentLang
			);
			
			if (i18nContent?.audio_id) {
				const buffer = await this.loadAudioFromAPI(i18nContent.audio_id);
				if (buffer) {
					await this.playAudioBuffer(buffer);
					return;
				}
			}
			
			if (i18nContent?.text) {
				await this.generateAndPlayTTS(i18nContent.text, { language: currentLang });
				return;
			}
		}
		
		// Base fallback
		const fallbackAudioId = this.ivrConfig?.fallback_audio_id;
		if (fallbackAudioId) {
			const buffer = this.audioCache.get(fallbackAudioId);
			if (buffer) {
				await this.playAudioBuffer(buffer);
				return;
			}
		}
		
		const fallbackText = this.ivrConfig?.not_found_message || this.getLocalizedMessage('not_found');
		await this.generateAndPlayTTS(fallbackText, { language: currentLang });
	}
    
    /**
     * Load audio from API - detects format and converts to ULAW for playback
     */
    async loadAudioFromAPI(audioId) {
		 const agentId = this.agentConfig?.agentId || this.config.agentId;
		console.log(`${this.apiBaseUrl}/api/internal/ivr/${agentId}/audio/${audioId}/stream`)
        try {
           
            // Fetch the audio stream
            const response = await axios.get(
                `${this.apiBaseUrl}/api/internal/ivr/${agentId}/audio/${audioId}/stream`,
                { responseType: 'arraybuffer', timeout: 15000 }
            );
            
            if (!response.data || response.data.length === 0) {
                logger.warn(`[INTENT-IVR] Empty audio data for ${audioId}`);
                return null;
            }
            
            const audioBuffer = Buffer.from(response.data);
            console.info(`[INTENT-IVR] Loaded audio: ${audioId} (${audioBuffer.length} bytes)`);
            
            // Detect if it's MP3 format using magic bytes
            // MP3: ID3 tag (0x49 0x44 0x33) or MPEG sync (0xFF 0xFB/0xFA/etc)
            const isID3 = audioBuffer[0] === 0x49 && audioBuffer[1] === 0x44 && audioBuffer[2] === 0x33;
            const isMPEGSync = audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0;
            const isMP3 = isID3 || isMPEGSync;
            
            if (isMP3) {
                console.info(`[INTENT-IVR] Converting MP3 to ULAW for playback...`);
                const mulawBuffer = await this.convertMP3ToMulaw(audioBuffer);
                if (mulawBuffer && mulawBuffer.length > 0) {
                    console.info(`[INTENT-IVR] Converted to ULAW: ${mulawBuffer.length} bytes (${(mulawBuffer.length / 8000).toFixed(2)}s)`);
                    return mulawBuffer;
                }
                logger.warn('[INTENT-IVR] MP3 to ULAW conversion failed');
                return null;
            }
            
            // Not MP3, assume it's already ULAW
            console.info(`[INTENT-IVR] Using raw ULAW: ${audioBuffer.length} bytes (${(audioBuffer.length / 8000).toFixed(2)}s)`);
            return audioBuffer;
            
        } catch (error) {
            console.error('[INTENT-IVR] Load audio API error:', error.message);
            return null;
        }
    }
    
    /**
     * Play audio buffer (mulaw format) in chunks
     */
    async playAudioBuffer(buffer) {
        return new Promise((resolve) => {
            this.isPlaying = true;
            this.currentAudioBuffer = buffer;
            this.playbackPosition = 0;
            
            const chunkSize = 160; // 20ms at 8kHz
            const intervalMs = 20;
            
            console.info(`[INTENT-IVR] Playing pre-recorded audio: ${buffer.length} bytes (${(buffer.length / 8000).toFixed(2)}s)`);
            
            this.playbackInterval = setInterval(() => {
                if (!this.isPlaying || this.playbackPosition >= buffer.length) {
                    this.stopPlayback();
                    resolve();
                    return;
                }
                
                const chunk = buffer.slice(this.playbackPosition, this.playbackPosition + chunkSize);
                this.playbackPosition += chunkSize;
                
                this.emit('audio.delta', {
                    delta: chunk.toString('base64'),
                    format: 'mulaw_8000'
                });
                
            }, intervalMs);
            
            const duration = (buffer.length / 8000) * 1000;
            setTimeout(() => {
                if (this.isPlaying) {
                    this.stopPlayback();
                    resolve();
                }
            }, duration + 100);
        });
    }
    
    /**
     * Stop audio playback
     */
    stopPlayback() {
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
        
        if (this.isPlaying) {
            this.emit('audio.done', {});
        }
        
        this.isPlaying = false;
        this.currentAudioBuffer = null;
        this.playbackPosition = 0;
    }
    
    /**
     * Prime audio output after speech detection reset
     * Sends a small silence buffer to re-establish audio routing
     * and waits a moment for connection manager to settle
     */
    async primeAudioOutput() {
        console.info('[INTENT-IVR] Priming audio output...');
        
        // Small delay to let connection manager settle after NEW SPEECH reset
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Send a few silence frames to prime the audio output
        // 160 bytes of silence (0xFF for mulaw) = 20ms
        const silenceFrame = Buffer.alloc(160, 0xFF);
        
        for (let i = 0; i < 5; i++) {  // 100ms of silence
            this.emit('audio.delta', {
                delta: silenceFrame.toString('base64'),
                format: 'mulaw_8000'
            });
        }
        
        // Another small delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.info('[INTENT-IVR] Audio output primed');
    }
    
    /**
     * Generate and play TTS response
     * Captures original MP3 for caching (universally playable)
     */
    async generateAndPlayTTS(text, options = {}) {
        if (!text || text.trim().length === 0) return;
        
		let processedText = text;
		if (options.formatNumbers !== false) {
			const lang = options.language || this.getCurrentLanguage();
			processedText = processTextForTTS(text, lang, {
				slotType: options.slotType || null,
				slotName: options.slotName || null
			});
			
			if (processedText !== text) {
				logger.debug(`[INTENT-IVR] TTS formatted: "${text.substring(0,50)}" → "${processedText.substring(0,50)}"`);
			}
		}
		
        // Check memory cache for same-session reuse (step-based)
        if (options.stepId && this.ivrConfig?.enable_response_cache) {
            const memoryCached = this.getStepAudioFromMemory(options.stepId);
            if (memoryCached) {
                console.info('[INTENT-IVR] Playing cached step audio (memory)');
                this.emit('transcript.agent', { transcript: processedText });
                this.conversationHistory.push({
                    role: 'assistant',
                    content: processedText,
                    timestamp: Date.now()
                });
                await this.playAudioBuffer(memoryCached);
                return;
            }
        }
        
        console.info('[INTENT-IVR] Generating TTS:', processedText.substring(0, 50) + '...');
		
		// Determine TTS voice based on language
		const contentLanguage = options.language || this.getCurrentLanguage();
		const voiceConfig = this.languageVoiceMap[contentLanguage];
		
		// If we have a language-specific voice configured, use it
		let ttsProvider = this.ivrConfig?.tts_provider || this.config.tts_provider || 'uplift';
		let ttsVoice = this.ivrConfig?.tts_voice || this.config.custom_voice;
		
		if (voiceConfig) {
			ttsVoice = voiceConfig.voice;
			console.info(`[INTENT-IVR] Using ${contentLanguage} voice: ${voiceConfig.provider}/${ttsVoice}`);
			
			// Switch TTS voice if different from current
			if (this.tts && this.tts.voice !== ttsVoice) {
				this.tts.voice = ttsVoice;
				console.info(`[INTENT-IVR] Switched TTS voice to: ${ttsVoice}`);
			}
		}
        
        this.ttsMetrics.charactersProcessed += processedText.length;
        this.ttsMetrics.callCount++;
        
        this.emit('transcript.agent', { transcript: processedText });
        
        this.conversationHistory.push({
            role: 'assistant',
            content: processedText,
            timestamp: Date.now()
        });
        
        if (this.tts) {
            this.isPlaying = true;
            
            // Collect MP3 audio if caching is enabled and we have an entity to link to
            // Entity can be: step (stepId), intent (intentId), or flow (flowId + audioField)
            const hasEntityToLink = options.stepId || options.intentId || (options.flowId && options.audioField);
            const shouldCache = options.cacheAudio && 
                               hasEntityToLink &&
                               this.ivrConfig?.enable_response_cache;
            
            let mp3Chunks = [];
            let mp3Listener = null;
            
            if (shouldCache) {
                console.info(`[INTENT-IVR] Will cache MP3 audio for ${options.stepId ? 'step' : options.intentId ? 'intent' : 'flow'}`);
                
                // Capture original MP3 chunks before conversion (event is 'audio.chunk')
                mp3Listener = ({ chunk }) => {
                    if (chunk && chunk.length > 0) {
                        mp3Chunks.push(chunk);
                    }
                };
                this.tts.on('audio.chunk', mp3Listener);
            }
            
            if (options.cacheAudio && !hasEntityToLink) {
                logger.debug('[INTENT-IVR] Audio caching disabled (no stepId, intentId, or flowId+audioField provided)');
            }
            
            // Create a promise that resolves when audio is done
            const audioCompletePromise = new Promise((resolve) => {
                const onDone = () => {
                    this.removeListener('audio.done', onDone);
                    resolve();
                };
                this.once('audio.done', onDone);
                
                // Timeout after 30 seconds to prevent hanging
                setTimeout(() => {
                    this.removeListener('audio.done', onDone);
                    resolve();
                }, 30000);
            });
            
            try {
                await this.tts.synthesizeStreaming(processedText);
                
                // Wait for audio to finish playing
                await audioCompletePromise;
                
                // Remove MP3 listener
                if (mp3Listener) {
                    this.tts.removeListener('audio.chunk', mp3Listener);
                }
                
                // Save captured MP3 to library and link to step/intent
                if (shouldCache && mp3Chunks.length > 0) {
                    const mp3Buffer = Buffer.concat(mp3Chunks);
                    console.info(`[INTENT-IVR] Captured MP3: ${mp3Buffer.length} bytes`);
                    
                    this.ttsMetrics.audioSecondsGenerated += mp3Buffer.length / 4000; // Rough estimate for MP3
                    
                    // Save MP3 to file storage and update step/intent
                    await this.saveFlowStepAudio(processedText, mp3Buffer, {
                        stepId: options.stepId,
                        flowId: options.flowId,
                        intentId: options.intentId,
                        audioName: options.audioName,
                        audioField: options.audioField || 'prompt_audio_id',
                        fileFormat: 'mp3',  // Save as MP3
						language: options.language
                    });
                }
            } catch (error) {
                if (mp3Listener) {
                    this.tts.removeListener('audio.chunk', mp3Listener);
                }
                console.error('[INTENT-IVR] TTS error:', error.message);
            }
            
            this.isPlaying = false;
        } else {
            logger.warn('[INTENT-IVR] No TTS available');
        }
    }
    
    /**
     * Save generated TTS audio to file storage and link to flow step
     * Saves as MP3 format for universal playback compatibility
     * @param {string} text - The text that was synthesized
     * @param {Buffer} audioBuffer - The audio data (MP3 format)
     * @param {Object} options - Additional options (stepId, flowId, intentId, audioName, audioField, fileFormat)
     */
    async saveFlowStepAudio(text, audioBuffer, options = {}) {
        try {
            const agentId = this.config.agentId;
            if (!agentId || !audioBuffer || audioBuffer.length === 0) {
                return null;
            }
            
            const { stepId, flowId, intentId, audioName, audioField, fileFormat } = options;
            
            // Only save if we have something to link to (step, flow, or intent)
            if (!stepId && !flowId && !intentId) {
                logger.debug('[INTENT-IVR] No stepId, flowId, or intentId provided, skipping audio save');
                return null;
            }
            
            const format = fileFormat || 'mp3';
            const name = audioName || 
                `TTS: ${text.substring(0, 30).replace(/[^a-zA-Z0-9\s\u0600-\u06FF]/g, '')}...`;
            
            // Estimate duration based on format
            // MP3 at ~32kbps = ~4000 bytes/sec
            const durationMs = format === 'mp3' 
                ? Math.round((audioBuffer.length / 4000) * 1000)
                : Math.round((audioBuffer.length / 8000) * 1000);
            
            console.info('[INTENT-IVR] Saving TTS audio to library:', {
                name,
                size: audioBuffer.length,
                format: format,
                durationSec: (durationMs / 1000).toFixed(2),
                stepId: stepId || 'N/A',
                flowId: flowId || 'N/A',
                intentId: intentId || 'N/A',
                audioField: audioField || 'N/A'
            });
            
            try {
                // Use base64 JSON upload
                const response = await axios.post(
                    `${this.apiBaseUrl}/api/ivr/${agentId}/audio/cache-base64`,
                    {
                        audio_data: audioBuffer.toString('base64'),
                        name: name,
                        source_text: text,
                        file_format: format,
                        duration_ms: durationMs,
                        tts_provider: this.ivrConfig?.tts_provider || 'uplift',
                        tts_voice: this.ivrConfig?.tts_voice || 'ayesha',
                        language: this.ivrConfig?.language || 'ur',
                        step_id: stepId || null,
                        flow_id: flowId || null,
                        intent_id: intentId || null,
                        audio_field: audioField || 'prompt_audio_id',
						update_i18n: true
                    },
                    { 
                        headers: this.apiKey ? { 'x-api-key': this.apiKey } : {},
                        timeout: 15000
                    }
                );
                
                if (response.data?.success && response.data?.audio_id) {
                    console.info('[INTENT-IVR] Audio saved and linked:', {
                        audioId: response.data.audio_id,
                        stepUpdated: response.data.step_updated,
                        flowUpdated: response.data.flow_updated,
                        intentUpdated: response.data.intent_updated
                    });
                    
                    // Convert MP3 to ULAW and store in memory cache for playback
                    if (format === 'mp3') {
                        const ulawBuffer = await this.convertMP3ToMulaw(audioBuffer);
                        if (ulawBuffer) {
                            // Cache by audio ID for future lookups
                            this.audioCache.set(response.data.audio_id, ulawBuffer);
                        }
                    } else {
                        this.audioCache.set(response.data.audio_id, audioBuffer);
                    }
                    
                    return { 
                        audio_id: response.data.audio_id, 
                        size: audioBuffer.length,
                        step_updated: response.data.step_updated,
                        flow_updated: response.data.flow_updated
                    };
                }
            } catch (apiError) {
                logger.warn('[INTENT-IVR] Failed to save audio to library:', apiError.message);
            }
            
        } catch (error) {
            logger.warn('[INTENT-IVR] Failed to save TTS audio:', error.message);
        }
        
        return null;
    }
    
    /**
     * Legacy method for backward compatibility - redirects to new method
     * @deprecated Use saveFlowStepAudio instead
     */
    async saveTTSAudioToLibrary(text, audioBuffer, options = {}) {
        return this.saveFlowStepAudio(text, audioBuffer, options);
    }
    
    /**
     * Check if step audio is cached in memory (for same-session reuse)
     * File-based caching is handled via prompt_audio_id field in steps
     * @param {string} stepId - Step ID to check
     * @returns {Buffer|null} - Cached audio buffer or null
     */
    getStepAudioFromMemory(stepId) {
        if (!stepId) return null;
        return this.audioCache.get(`step_audio_${stepId}`) || null;
    }
    
    /**
     * Convert PCM 24kHz 16-bit to µ-law 8kHz using FFmpeg
     * @param {Buffer} pcmBuffer - PCM audio (16-bit signed, mono, 24kHz)
     * @returns {Buffer} - µ-law audio (8kHz)
     */
    convertPCMToUlaw(pcmBuffer) {
        try {
            const { execSync } = require('child_process');
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            
            // Create temp files
            const tempDir = os.tmpdir();
            const inputFile = path.join(tempDir, `pcm_${Date.now()}_${Math.random().toString(36).substr(2, 8)}.raw`);
            const outputFile = path.join(tempDir, `ulaw_${Date.now()}_${Math.random().toString(36).substr(2, 8)}.raw`);
            
            // Write PCM to temp file
            fs.writeFileSync(inputFile, pcmBuffer);
            
            // Convert using FFmpeg: PCM 24kHz 16-bit → µ-law 8kHz
            const cmd = `ffmpeg -f s16le -ar 24000 -ac 1 -i "${inputFile}" -ar 8000 -ac 1 -f mulaw "${outputFile}" -y 2>&1`;
            
            try {
                execSync(cmd, { timeout: 10000 });
            } catch (ffmpegError) {
                console.error('[INTENT-IVR] FFmpeg PCM-to-ULAW error:', ffmpegError.message);
                // Cleanup
                try { fs.unlinkSync(inputFile); } catch (e) {}
                return null;
            }
            
            // Read converted audio
            const ulawBuffer = fs.readFileSync(outputFile);
            
            // Cleanup temp files
            try { fs.unlinkSync(inputFile); } catch (e) {}
            try { fs.unlinkSync(outputFile); } catch (e) {}
            
            return ulawBuffer;
            
        } catch (error) {
            console.error('[INTENT-IVR] PCM-to-ULAW conversion error:', error.message);
            return null;
        }
    }
    
    /**
     * Disconnect and cleanup
     */
    async disconnect() {
        console.info('[INTENT-IVR] Disconnecting...');
        
        this.isDisconnecting = true;
        this.stopPlayback();
        
        // Stop STT keepalive interval
        this.stopSTTKeepalive();
        
        // Clear response timer
        this.clearResponseTimer();
        
        // Clear slot accumulator
        this.clearSlotAccumulator();
        
        // Log comprehensive cost summary
        const slotLLM = this.slotValidationCosts;
        const classifierLLM = this.classifierCostMetrics;
        const tts = this.ttsMetrics;
        
        console.info(`[INTENT-IVR] === CALL COST SUMMARY ===`);
        console.info(`[INTENT-IVR] Classifier LLM: ${classifierLLM.totalInputTokens || 0}+${classifierLLM.totalOutputTokens || 0} tokens (${classifierLLM.totalCalls || 0} calls)`);
        console.info(`[INTENT-IVR] Slot Validation LLM: ${slotLLM.llmInputTokens || 0}+${slotLLM.llmOutputTokens || 0} tokens (${slotLLM.llmCalls || 0} calls)`);
        console.info(`[INTENT-IVR] TTS Generated: ${tts.charactersProcessed || 0} chars, ${(tts.audioSecondsGenerated || 0).toFixed(2)}s (${tts.callCount || 0} calls)`);
        console.info(`[INTENT-IVR] Slot TTS: ${slotLLM.ttsCharacters || 0} chars (${slotLLM.ttsCalls || 0} calls)`);
        console.info(`[INTENT-IVR] Total LLM tokens: ${(classifierLLM.totalInputTokens || 0) + (slotLLM.llmInputTokens || 0)}+${(classifierLLM.totalOutputTokens || 0) + (slotLLM.llmOutputTokens || 0)}`);
        console.info(`[INTENT-IVR] Total TTS chars: ${(tts.charactersProcessed || 0) + (slotLLM.ttsCharacters || 0)}`);
        console.info(`[INTENT-IVR] ========================`);
        
        if (this.stt) {
            try {
                if (typeof this.stt.stop === 'function') {
                    await this.stt.stop();
                }
            } catch (e) {}
            this.stt = null;
        }
        
        if (this.tts) {
            try {
                if (typeof this.tts.disconnect === 'function') {
                    await this.tts.disconnect();
                }
            } catch (e) {}
            this.tts = null;
        }
        
        if (this.mp3Converter) {
            this.mp3Converter.stop();
            this.mp3Converter = null;
        }
        
        this.audioCache.clear();
        this.audioFiles.clear();
        this.conversationHistory = [];
        
        this.isConnected = false;
        this.isConfigured = false;
        
        console.info('[INTENT-IVR] Disconnected');
    }
    
    /**
     * Get provider name
     */
    getProviderName() {
        return 'intent-ivr';
    }
    
    /**
     * Get cost metrics
     */
    getCostMetrics() {
        const duration = this.costMetrics?.startTime 
            ? (Date.now() - this.costMetrics.startTime) / 60000 
            : 0;
        
        const sttCost = this.sttMetrics.audioSecondsReceived * 0.0000278; // Soniox
        const classifierLLMCost = this.classifierCostMetrics.totalCost || 0;
        
        // TTS cost includes both pre-recorded (from ttsMetrics) and real-time slot validation TTS
        const preRecordedTTSCost = this.ttsMetrics.audioSecondsGenerated * 0.000833; // Uplift
        const slotTTSCost = (this.slotValidationCosts.ttsCharacters || 0) * 0.000015; // Per character estimate
        const ttsCost = preRecordedTTSCost + slotTTSCost;
        
        // Slot validation LLM costs (Groq llama-3.3-70b-versatile)
        // Input: $0.59/M tokens, Output: $0.79/M tokens
        const slotValidationLLMCost = (
            (this.slotValidationCosts.llmInputTokens * 0.00000059) +
            (this.slotValidationCosts.llmOutputTokens * 0.00000079)
        );
        
        // Total LLM cost includes both classifier and slot validation
        const totalLLMCost = classifierLLMCost + slotValidationLLMCost;
        
        // Classifier tokens (from classifierCostMetrics)
        const classifierInputTokens = this.classifierCostMetrics.totalInputTokens || 0;
        const classifierOutputTokens = this.classifierCostMetrics.totalOutputTokens || 0;
        
        // Slot validation tokens
        const slotInputTokens = this.slotValidationCosts.llmInputTokens || 0;
        const slotOutputTokens = this.slotValidationCosts.llmOutputTokens || 0;
        
        // Total tokens (classifier + slot validation)
        const totalInputTokens = classifierInputTokens + slotInputTokens;
        const totalOutputTokens = classifierOutputTokens + slotOutputTokens;
        
        // Total TTS 
        const totalTTSSeconds = this.ttsMetrics.audioSecondsGenerated + 
            ((this.slotValidationCosts.ttsCharacters || 0) / 15); // ~15 chars per second estimate
        const totalTTSCharacters = (this.ttsMetrics.charactersProcessed || 0) + 
            (this.slotValidationCosts.ttsCharacters || 0);
        
        // Debug log
        console.info(`[INTENT-IVR] Cost metrics debug:`, {
            classifier: { input: classifierInputTokens, output: classifierOutputTokens, cost: classifierLLMCost },
            slotValidation: { input: slotInputTokens, output: slotOutputTokens, cost: slotValidationLLMCost },
            tts: { preRecorded: this.ttsMetrics.audioSecondsGenerated, slotChars: this.slotValidationCosts.ttsCharacters }
        });
        
        return {
            provider: 'intent-ivr',
            session_minutes: duration,
            base_cost: sttCost + totalLLMCost + ttsCost,
            
            // LLM metrics - multiple field name formats for compatibility
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            llm_input_tokens: totalInputTokens,
            llm_output_tokens: totalOutputTokens,
            total_tokens: totalInputTokens + totalOutputTokens,
            
            // STT metrics
            input_audio_seconds: this.sttMetrics.audioSecondsReceived,
            stt_seconds: this.sttMetrics.audioSecondsReceived,
            
            // TTS metrics - multiple field name formats for compatibility
            output_audio_seconds: totalTTSSeconds,
            tts_seconds: totalTTSSeconds,
            tts_characters: totalTTSCharacters,
            characters: totalTTSCharacters,
            
            // Call counts
            classifier_calls: this.classifierCostMetrics.totalCalls || 0,
            slot_validation_calls: this.slotValidationCosts.llmCalls || 0,
            slot_validation_tts_calls: this.slotValidationCosts.ttsCalls || 0,
            
            // Detailed breakdown
            breakdown: { 
                stt: sttCost, 
                llm: totalLLMCost, 
                tts: ttsCost,
                classifier_llm: classifierLLMCost,
                slot_validation_llm: slotValidationLLMCost,
                slot_validation_tts: slotTTSCost
            },
            
            // Token details
            tokens: {
                classifier_input: classifierInputTokens,
                classifier_output: classifierOutputTokens,
                slot_validation_input: slotInputTokens,
                slot_validation_output: slotOutputTokens,
                total_input: totalInputTokens,
                total_output: totalOutputTokens
            }
        };
    }
}

module.exports = IntentIVRProvider;
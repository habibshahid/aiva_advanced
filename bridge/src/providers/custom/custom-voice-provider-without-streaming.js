/**
 * Custom Voice Provider
 * Orchestrates Soniox STT + Groq/OpenAI LLM + Azure TTS or Uplift TTS
 * 
 * This provider extends BaseProvider and integrates with your existing
 * bridge architecture, replacing OpenAI Realtime or Deepgram Agent.
 * 
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────┐
 * │                   CustomVoiceProvider                        │
 * ├──────────────────────────────────────────────────────────────┤
 * │  Asterisk RTP (mulaw) ──► Soniox STT ──► LLM ──► TTS        │
 * │       ▲                                      │               │
 * │       └──────────── Audio Output ◄───────────┘               │
 * │                                                              │
 * │  TTS Options:                                                │
 * │    - Azure TTS (PCM16 24kHz)                                 │
 * │    - Uplift AI (MP3 22kHz - Pakistani languages)            │
 * └──────────────────────────────────────────────────────────────┘
 */

// Try to load base provider - use mock if not in bridge context
let BaseProvider;
try {
    BaseProvider = require('../base-provider');
} catch (e) {
    // Fallback for standalone testing
    try {
        BaseProvider = require('./base-provider');
    } catch (e2) {
        // Create a minimal base provider
        const EventEmitter = require('events');
        BaseProvider = class extends EventEmitter {
            constructor(config) {
                super();
                this.config = config;
                this.isConnected = false;
            }
        };
    }
}

// Load modules - support both standalone testing and bridge integration
let SonioxSTT, LLMHandler, AzureTTS, UpliftTTS, OpenAITTS, ConversationManager, MP3ToPCMConverter;
try {
    // Standalone structure: ./custom/module.js
    SonioxSTT = require('./custom/soniox-stt');
    LLMHandler = require('./custom/llm-handler');
    AzureTTS = require('./custom/azure-tts');
    UpliftTTS = require('./custom/uplift-tts');
    OpenAITTS = require('./custom/openai-tts');
    ConversationManager = require('./custom/conversation-manager');
    MP3ToPCMConverter = require('./custom/mp3-converter');
} catch (e) {
    // Bridge structure: ./module.js (all in same custom/ folder)
    SonioxSTT = require('./soniox-stt');
    LLMHandler = require('./llm-handler');
    AzureTTS = require('./azure-tts');
    UpliftTTS = require('./uplift-tts');
    OpenAITTS = require('./openai-tts');
    ConversationManager = require('./conversation-manager');
    MP3ToPCMConverter = require('./mp3-converter');
}

class CustomVoiceProvider extends BaseProvider {
    constructor(config) {
        super(config);
        
        // Debug: log incoming config (show relevant TTS config based on provider)
        const ttsProvider = config.ttsProvider || process.env.TTS_PROVIDER || 'uplift';
        console.log('[CUSTOM-PROVIDER] Config received:', {
            ttsProvider: ttsProvider,
            voice: config.voice,
            ...(ttsProvider === 'uplift' ? { upliftOutputFormat: config.upliftOutputFormat } : {}),
            ...(ttsProvider === 'openai' ? { openaiTtsModel: config.openaiTtsModel } : {}),
            ...(ttsProvider === 'azure' ? { azureRegion: config.azureRegion } : {})
        });
        
        this.config = {
            // STT Config
            sonioxApiKey: config.sonioxApiKey || process.env.SONIOX_API_KEY,
            sttModel: config.sttModel || 'stt-rt-preview',
            languageHints: config.languageHints || ['ur', 'en'],
            
            // LLM Config
            groqApiKey: config.groqApiKey || process.env.GROQ_API_KEY,
            openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
            llmModel: config.llmModel || 'llama-3.3-70b-versatile',
            temperature: config.temperature || 0.7,
            maxTokens: config.maxTokens || 1024,
            
            // TTS Provider Selection: 'azure', 'uplift', or 'openai'
            ttsProvider: config.ttsProvider || process.env.TTS_PROVIDER || 'uplift',
            
            // Azure TTS Config
            azureKey: config.azureKey || process.env.AZURE_SPEECH_KEY,
            azureRegion: config.azureRegion || process.env.AZURE_SPEECH_REGION || 'eastus',
            
            // Uplift TTS Config
            upliftApiKey: config.upliftApiKey || process.env.UPLIFT_API_KEY,
            upliftOutputFormat: config.upliftOutputFormat || process.env.UPLIFT_OUTPUT_FORMAT || 'ULAW_8000_8',
            // If Uplift sends 16kHz audio labeled as 8kHz, enable this to resample
            upliftResample16to8: config.upliftResample16to8 || process.env.UPLIFT_RESAMPLE_16TO8 === 'true',
            
            // OpenAI TTS Config
            openaiTtsModel: config.openaiTtsModel || process.env.OPENAI_TTS_MODEL || 'tts-1',
            
            // Voice - prioritize config.voice from agent config
            voice: config.voice,  // Will be set below if not provided
            
            // Conversation Config
            silenceTimeoutMs: config.silenceTimeoutMs || 30000,
            allowBargeIn: config.allowBargeIn !== false,
            
            ...config
        };
        
        // Set default voice based on TTS provider if not explicitly provided
        const resolvedTtsProvider = this.config.ttsProvider;
        if (!this.config.voice) {
            if (resolvedTtsProvider === 'azure') {
                this.config.voice = 'ur-PK-UzmaNeural';
            } else if (resolvedTtsProvider === 'openai') {
                this.config.voice = 'nova';
            } else {
                this.config.voice = 'ur-PK-female';
            }
            console.log(`[CUSTOM-PROVIDER] No voice provided, using default: ${this.config.voice}`);
        } else {
            console.log(`[CUSTOM-PROVIDER] Using voice from config: ${this.config.voice}`);
        }
        
        // Components
        this.stt = null;
        this.llm = null;
        this.tts = null;
        this.conversationManager = null;
        this.mp3Converter = null;  // For Uplift TTS MP3 -> PCM conversion
        
        // Session state
        this.sessionId = config.sessionId || null;
        this.agentConfig = null;
        this.isConfigured = false;
        
        // Audio buffering for TTS output
        this.audioBuffer = [];
        this.isGeneratingResponse = false;
        
        // Function executor reference
        this.functionExecutor = null;
        
        // Cost tracking
        this.costMetrics = {
            startTime: null,
            sttMinutes: 0,
            llmInputTokens: 0,
            llmOutputTokens: 0,
            ttsCharacters: 0
        };
    }
    
    /**
     * Connect to all services
     */
    async connect() {
        try {
            console.log('[CUSTOM-PROVIDER] Connecting components...');
            
            // Initialize STT
            this.stt = new SonioxSTT({
                apiKey: this.config.sonioxApiKey,
                model: this.config.sttModel,
                languageHints: this.config.languageHints,
                enableEndpointDetection: true
            });
            
            // Initialize LLM
            // Detect if model is Groq or OpenAI based on name
            const llmModel = this.config.llmModel;
            const isGroqModel = llmModel && (
                llmModel.includes('llama') || 
                llmModel.includes('mixtral') || 
                llmModel.includes('gemma') ||
                llmModel.includes('whisper')
            );
            
            console.log(`[CUSTOM-PROVIDER] LLM model: ${llmModel} (provider: ${isGroqModel ? 'Groq' : 'OpenAI'})`);
            
            this.llm = new LLMHandler({
                groqApiKey: this.config.groqApiKey,
                openaiApiKey: this.config.openaiApiKey,
                // Set model for the appropriate provider
                groqModel: isGroqModel ? llmModel : 'llama-3.3-70b-versatile',
                openaiModel: isGroqModel ? 'gpt-4o-mini' : llmModel,
                // Tell handler which to use first
                preferredProvider: isGroqModel ? 'groq' : 'openai',
                temperature: this.config.temperature,
                maxTokens: this.config.maxTokens
            });
            
            // Initialize TTS (Azure, Uplift, or OpenAI)
            if (this.config.ttsProvider === 'uplift') {
                const outputFormat = this.config.upliftOutputFormat || 'ULAW_8000_8';
                const needsConversion = outputFormat.startsWith('MP3');
                
                console.log(`[CUSTOM-PROVIDER] Using Uplift AI TTS`);
                console.log(`[CUSTOM-PROVIDER] Output format: ${outputFormat} (conversion: ${needsConversion ? 'MP3→PCM' : 'none'})`);
                
                this.tts = new UpliftTTS({
                    apiKey: this.config.upliftApiKey,
                    voice: this.config.voice,
                    outputFormat: outputFormat
                });
                
                // Initialize MP3 buffer only if needed
                if (needsConversion) {
                    this.mp3Buffer = Buffer.alloc(0);
                    this.mp3Converter = null;
                }
                
            } else if (this.config.ttsProvider === 'openai') {
                console.log('[CUSTOM-PROVIDER] Using OpenAI TTS (PCM16 output)');
                this.tts = new OpenAITTS({
                    apiKey: this.config.openaiApiKey,
                    model: this.config.openaiTtsModel,
                    voice: this.config.voice
                });
                
            } else {
                // Default to Azure
                console.log('[CUSTOM-PROVIDER] Using Azure TTS (PCM16 output)');
                this.tts = new AzureTTS({
                    subscriptionKey: this.config.azureKey,
                    region: this.config.azureRegion,
                    voice: this.config.voice
                });
            }
            
            // Initialize Conversation Manager
            this.conversationManager = new ConversationManager({
                silenceTimeoutMs: this.config.silenceTimeoutMs,
                allowBargeIn: this.config.allowBargeIn
            });
            
            // Connect STT
            await this.stt.connect();
            
            // Initialize TTS
            await this.tts.initialize();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            this.isConnected = true;
            this.costMetrics.startTime = Date.now();
            
            console.log('[CUSTOM-PROVIDER] All components connected');
            
            return true;
            
        } catch (error) {
            console.error('[CUSTOM-PROVIDER] Connection failed:', error);
            this.isConnected = false;
            throw error;
        }
    }
    
    /**
     * Set up event handlers for all components
     */
    setupEventHandlers() {
        // ========== STT Events ==========
        
        this.stt.on('ready', () => {
            console.log('[CUSTOM-PROVIDER] STT ready');
        });
        
        this.stt.on('transcript.interim', ({ text }) => {
            // Debug: log all interim transcripts
            if (text && text.length > 0) {
                console.log(`[CUSTOM-PROVIDER] Interim transcript: "${text}" (len: ${text.length})`);
            }
            
            // Detect user speech start (for interruption handling)
            // Only trigger once when speech first detected
            if (text && text.length > 0) {
                const isAgentSpeaking = this.conversationManager.isAgentSpeaking();
                const currentState = this.conversationManager.turnState;
                
                if (isAgentSpeaking) {
                    // User is speaking while agent is talking - this is an interruption
                    console.log('[CUSTOM-PROVIDER] Speech detected during agent turn - interruption');
                    console.log(`[CUSTOM-PROVIDER] State: ${currentState}, text: "${text}"`);
                    this.conversationManager.onUserSpeechStarted();
                } else if (currentState === 'idle') {
                    // User started speaking from idle state
                    console.log('[CUSTOM-PROVIDER] Speech detected from idle state');
                    this.conversationManager.onUserSpeechStarted();
                }
            }
            
            this.conversationManager.onInterimTranscript(text);
        });
        
        this.stt.on('transcript.final', ({ text }) => {
            console.log('[CUSTOM-PROVIDER] Final transcript:', text);
            
            // Emit for external listeners (transcript logging)
            this.emit('transcript.user', { transcript: text });
            
            // Notify conversation manager
            this.conversationManager.onUserSpeechEnded(text);
        });
        
        this.stt.on('speech.ended', ({ transcript }) => {
            // This triggers LLM response via conversation manager
        });
        
        this.stt.on('error', (error) => {
            console.error('[CUSTOM-PROVIDER] STT error:', error);
            this.emit('error', error);
        });
        
        // ========== LLM Events ==========
        
        this.llm.on('token', ({ content }) => {
            // Accumulate streaming tokens
            if (this.isGeneratingResponse) {
                this.currentResponse = (this.currentResponse || '') + content;
            }
        });
        
        this.llm.on('stream.end', async ({ content, functionCall }) => {
            if (functionCall) {
                await this.handleFunctionCall({
                    call_id: functionCall.id || `fn_${Date.now()}`,
                    name: functionCall.name,
                    arguments: functionCall.arguments
                });
            }
        });
        
        // ========== TTS Events ==========
        
        if (this.config.ttsProvider === 'uplift') {
            // Uplift TTS can output ULAW, PCM, or MP3
            // ULAW_8000_8 is perfect for telephony - no conversion needed!
            const outputFormat = this.config.upliftOutputFormat || 'ULAW_8000_8';
            const needsConversion = outputFormat.startsWith('MP3');
            
            console.log(`[CUSTOM-PROVIDER] Uplift output format: ${outputFormat}, needs conversion: ${needsConversion}`);
            
            if (needsConversion) {
                // MP3 output - needs conversion to PCM
                this.hasReceivedAudioData = false;
                this.upliftDebug = {
                    synthesisStartTime: null,
                    chunksReceived: 0,
                    totalBytesReceived: 0,
                    pcmChunksEmitted: 0,
                    totalPcmBytes: 0
                };
                
                this.tts.on('synthesis.started', ({ requestId }) => {
                    console.log('[UPLIFT] Synthesis started (MP3 mode):', requestId);
                    this.upliftDebug.synthesisStartTime = Date.now();
                    this.upliftDebug.chunksReceived = 0;
                    this.upliftDebug.totalBytesReceived = 0;
                    this.mp3Buffer = Buffer.alloc(0);
                    this.hasReceivedAudioData = false;
                    
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
                    
                    if (this.mp3Buffer.length >= 4096) {
                        if (!this.mp3Converter) {
                            this.mp3Converter = new MP3ToPCMConverter({
                                sampleRate: 24000,
                                channels: 1,
                                minBufferSize: 4800
                            });
                            
                            this.mp3Converter.on('pcm', (pcmData) => {
                                this.upliftDebug.pcmChunksEmitted++;
                                this.upliftDebug.totalPcmBytes += pcmData.length;
                                this.emit('audio.delta', { delta: pcmData.toString('base64') });
                            });
                            
                            this.mp3Converter.on('error', (err) => {
                                console.error('[UPLIFT] MP3 converter error:', err.message);
                            });
                            
                            this.mp3Converter.start();
                        }
                        
                        this.mp3Converter.write(this.mp3Buffer);
                        this.mp3Buffer = Buffer.alloc(0);
                    }
                });
                
                this.tts.on('audio.done', ({ requestId }) => {
                    console.log(`[UPLIFT] Synthesis complete: ${this.upliftDebug.totalBytesReceived} bytes MP3`);
                    
                    if (this.hasReceivedAudioData) {
                        if (this.mp3Buffer.length > 0) {
                            if (!this.mp3Converter) {
                                this.mp3Converter = new MP3ToPCMConverter({
                                    sampleRate: 24000,
                                    channels: 1,
                                    minBufferSize: 2400
                                });
                                this.mp3Converter.on('pcm', (pcmData) => {
                                    this.emit('audio.delta', { delta: pcmData.toString('base64') });
                                });
                                this.mp3Converter.start();
                            }
                            this.mp3Converter.write(this.mp3Buffer);
                            this.mp3Buffer = Buffer.alloc(0);
                        }
                        
                        if (this.mp3Converter) {
                            this.mp3Converter.end();
                        }
                        
                        setTimeout(() => {
                            this.emit('audio.done');
                            this.conversationManager.onAgentSpeechEnded();
                        }, 200);
                    } else {
                        if (this.mp3Converter) {
                            this.mp3Converter.stop();
                            this.mp3Converter = null;
                        }
                        this.emit('audio.done');
                        this.conversationManager.onAgentSpeechEnded();
                    }
                });
                
                this.tts.on('synthesis.cancelled', ({ requestId }) => {
                    console.log('[UPLIFT] Synthesis cancelled:', requestId);
                    this.mp3Buffer = Buffer.alloc(0);
                    if (this.mp3Converter) {
                        this.mp3Converter.stop();
                        this.mp3Converter = null;
                    }
                });
                
            } else {
                // ULAW or PCM output - forward directly (no conversion needed!)
                // This is much more efficient for telephony
                // NOTE: If audio plays too fast, Uplift may be sending 16kHz ULAW instead of 8kHz
                // Set upliftResample16to8: true to enable resampling
                let currentUpliftRequestId = null;
                const needsResample = this.config.upliftResample16to8 === true;
                let totalBytesProcessed = 0;
                
                // Determine format properties for fade-in
                const isUlaw = outputFormat.startsWith('ULAW');
                const isPcm16 = outputFormat.includes('_16'); // PCM_22050_16, PCM_8000_16, etc.
                
                // Calculate fade-in duration based on format
                // 200ms fade-in to eliminate noise burst
                let fadeInBytes;
                if (isUlaw) {
                    // ULAW: 8-bit, typically 8000 Hz = 8000 bytes/sec
                    fadeInBytes = 1600; // 200ms at 8kHz
                } else if (isPcm16) {
                    // PCM 16-bit: 2 bytes per sample
                    // PCM_22050_16 = 22050 * 2 = 44100 bytes/sec
                    // PCM_8000_16 = 8000 * 2 = 16000 bytes/sec
                    const sampleRate = parseInt(outputFormat.split('_')[1]) || 22050;
                    fadeInBytes = Math.floor(sampleRate * 2 * 0.2); // 200ms
                } else {
                    fadeInBytes = 1600; // Default
                }
                
                console.log(`[UPLIFT] Format: ${outputFormat}, fade-in: ${fadeInBytes} bytes`);
                
                if (needsResample) {
                    console.log(`[UPLIFT] Resampling enabled: 16kHz → 8kHz`);
                }
                
                this.tts.on('synthesis.started', ({ requestId }) => {
                    currentUpliftRequestId = requestId;
                    totalBytesProcessed = 0; // Reset counter for new synthesis
                    console.log(`[UPLIFT] Synthesis started (${outputFormat}${needsResample ? ' + resample' : ' - direct'}):`, requestId);
                });
                
                this.tts.on('audio.delta', ({ delta, requestId }) => {
                    // Only emit if this is the current request
                    if (requestId && currentUpliftRequestId && requestId !== currentUpliftRequestId) {
                        return;
                    }
                    
                    let audioBuffer = Buffer.from(delta, 'base64');
                    
                    // Apply fade-in to first N bytes to eliminate noise burst at start
                    // This smooths the audio without clipping any speech
                    if (totalBytesProcessed < fadeInBytes) {
                        if (isUlaw) {
                            // ULAW: 8-bit, 0xFF is silence
                            for (let i = 0; i < audioBuffer.length && (totalBytesProcessed + i) < fadeInBytes; i++) {
                                const position = totalBytesProcessed + i;
                                const fadeMultiplier = position / fadeInBytes; // 0.0 to 1.0
                                
                                const sample = audioBuffer[i];
                                const silence = 0xFF;
                                audioBuffer[i] = Math.round(silence + (sample - silence) * fadeMultiplier);
                            }
                        } else if (isPcm16) {
                            // PCM 16-bit signed little-endian: 0x0000 is silence
                            for (let i = 0; i < audioBuffer.length - 1 && (totalBytesProcessed + i) < fadeInBytes; i += 2) {
                                const position = totalBytesProcessed + i;
                                const fadeMultiplier = position / fadeInBytes; // 0.0 to 1.0
                                
                                // Read 16-bit signed sample
                                const sample = audioBuffer.readInt16LE(i);
                                // Apply fade
                                const fadedSample = Math.round(sample * fadeMultiplier);
                                // Write back
                                audioBuffer.writeInt16LE(fadedSample, i);
                            }
                        }
                    }
                    
                    totalBytesProcessed += audioBuffer.length;
                    
                    if (needsResample) {
                        // Resample 16kHz ULAW to 8kHz by dropping every other sample
                        const outputBuffer = Buffer.alloc(Math.floor(audioBuffer.length / 2));
                        
                        for (let i = 0; i < outputBuffer.length; i++) {
                            outputBuffer[i] = audioBuffer[i * 2];
                        }
                        
                        this.emit('audio.delta', { delta: outputBuffer.toString('base64') });
                    } else {
                        // Forward directly - no conversion needed!
                        this.emit('audio.delta', { delta: audioBuffer.toString('base64') });
                    }
                });
                
                this.tts.on('audio.done', ({ requestId, totalBytes, duration }) => {
                    if (requestId && currentUpliftRequestId && requestId !== currentUpliftRequestId) {
                        return;
                    }
                    console.log(`[UPLIFT] Complete: ${totalBytes} bytes (~${duration?.toFixed(2) || '?'}s)`);
                    this.emit('audio.done');
                    this.conversationManager.onAgentSpeechEnded();
                });
                
                this.tts.on('synthesis.cancelled', ({ requestId }) => {
                    console.log('[UPLIFT] Cancelled:', requestId);
                    if (requestId === currentUpliftRequestId) {
                        currentUpliftRequestId = null;
                    }
                });
            }
            
        } else {
            // Azure and OpenAI TTS output PCM - forward directly
            // Track if we should emit audio (for cancellation handling)
            let currentTtsRequestId = null;
            
            this.tts.on('synthesis.started', ({ requestId }) => {
                currentTtsRequestId = requestId;
                console.log(`[CUSTOM-PROVIDER] TTS synthesis started: ${requestId}`);
            });
            
            this.tts.on('audio.delta', ({ delta, requestId }) => {
                // Only emit if this is the current request (not cancelled)
                if (requestId && currentTtsRequestId && requestId !== currentTtsRequestId) {
                    console.log(`[CUSTOM-PROVIDER] Ignoring audio from cancelled request: ${requestId}`);
                    return;
                }
                this.emit('audio.delta', { delta: delta });
            });
            
            this.tts.on('audio.done', ({ requestId }) => {
                // Only signal done if this is the current request
                if (requestId && currentTtsRequestId && requestId !== currentTtsRequestId) {
                    console.log(`[CUSTOM-PROVIDER] Ignoring audio.done from cancelled request: ${requestId}`);
                    return;
                }
                this.emit('audio.done');
                this.conversationManager.onAgentSpeechEnded();
            });
            
            // Handle cancellation for Azure/OpenAI
            this.tts.on('synthesis.cancelled', ({ requestId }) => {
                console.log(`[CUSTOM-PROVIDER] TTS synthesis cancelled: ${requestId}`);
                // Clear the current request so we ignore any late-arriving audio
                if (requestId === currentTtsRequestId) {
                    currentTtsRequestId = null;
                }
            });
        }
        
        // ========== Conversation Manager Events ==========
        
        this.conversationManager.on('greeting.requested', async ({ text }) => {
            await this.generateAndSpeakResponse(text, true);
        });
        
        this.conversationManager.on('response.requested', async ({ transcript }) => {
            await this.processUserInput(transcript);
        });
        
        this.conversationManager.on('agent.interrupted', () => {
            console.log('[CUSTOM-PROVIDER] Handling interruption');
            
            // Stop current TTS
            this.tts.cancel();
            
            // Clear buffers based on TTS provider
            if (this.config.ttsProvider === 'uplift') {
                this.mp3Buffer = Buffer.alloc(0);
                if (this.mp3Converter) {
                    this.mp3Converter.stop();
                    this.mp3Converter = null;
                }
            } else if (this.config.ttsProvider === 'openai') {
                // OpenAI TTS has internal audio buffer that needs clearing
                // The cancel() method already clears it, but we log for debugging
                console.log('[CUSTOM-PROVIDER] OpenAI TTS buffer cleared via cancel()');
            }
            
            // Emit interruption event
            this.emit('speech.started');
            
            // Force finalize current STT
            this.stt.finalize();
        });
        
        this.conversationManager.on('silence.timeout', () => {
            console.log('[CUSTOM-PROVIDER] Silence timeout');
            this.emit('silence.timeout');
        });
        
        this.conversationManager.on('conversation.ended', ({ reason, metrics }) => {
            console.log('[CUSTOM-PROVIDER] Conversation ended:', reason);
            this.emit('conversation.ended', { reason, metrics });
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
        this.sessionId = agentConfig.sessionId || `custom_${Date.now()}`;
        
        console.log('[CUSTOM-PROVIDER] Configuring session:', {
            sessionId: this.sessionId,
            agentName: agentConfig.name
        });
        
        // Configure LLM with system prompt and functions
        this.llm.configure({
            systemPrompt: agentConfig.instructions || '',
            functions: agentConfig.functions || []
        });
        
        // Set TTS voice based on agent config
        if (agentConfig.voice) {
            this.tts.setVoice(agentConfig.voice);
        }
        
        // Store function executor if provided
        if (agentConfig.functionExecutor) {
            this.functionExecutor = agentConfig.functionExecutor;
        }
        
        this.isConfigured = true;
        
        // Start conversation with greeting
        this.conversationManager.start(agentConfig.greeting);
        
        // Emit ready event
        this.emit('agent.ready', {
            sessionId: this.sessionId,
            agentName: agentConfig.name || 'Voice Agent',
            status: 'ready',
            type: 'status'
        });
        
        return true;
    }
    
    /**
     * Send audio to STT
     * @param {Buffer} audioData - mulaw audio from Asterisk (8kHz)
     */
    async sendAudio(audioData) {
        if (!this.isConnected || !this.stt) {
            return false;
        }
        
        // NOTE: Interruption detection moved to STT event handlers
        // We detect speech via Soniox transcript.interim, not raw audio packets
        // (Raw audio includes silence which was causing false interruptions)
        
        // Send directly to Soniox (it accepts mulaw!)
        return this.stt.sendAudio(audioData);
    }
    
    /**
     * Process user input and generate response
     */
    async processUserInput(transcript) {
        if (!transcript || transcript.trim().length === 0) {
            return;
        }
        
        this.isGeneratingResponse = true;
        this.currentResponse = '';
        
        try {
            console.log('[CUSTOM-PROVIDER] Processing:', transcript);
            
            // Generate LLM response
            const response = await this.llm.generateResponse(transcript);
            
            // Check for function call
            if (response.functionCall) {
                await this.handleFunctionCall({
                    call_id: response.functionCall.id || `fn_${Date.now()}`,
                    name: response.functionCall.name,
                    arguments: response.functionCall.arguments
                });
                return;
            }
            
            // Speak the response
            if (response.content) {
                await this.generateAndSpeakResponse(response.content);
            }
            
        } catch (error) {
            console.error('[CUSTOM-PROVIDER] Error processing input:', error);
            this.emit('error', error);
        } finally {
            this.isGeneratingResponse = false;
        }
    }
    
    /**
     * Generate TTS and emit audio
     */
    async generateAndSpeakResponse(text, isGreeting = false) {
        if (!text || text.trim().length === 0) {
            return;
        }
        
        console.log('[CUSTOM-PROVIDER] Speaking:', text.substring(0, 50) + '...');
        
        // Notify conversation manager
        this.conversationManager.onAgentSpeechStarted(text);
        
        // Emit transcript
        this.emit('transcript.agent', { transcript: text });
        
        try {
            // Generate and stream TTS audio
            await this.tts.synthesizeStreaming(text);
            
        } catch (error) {
            console.error('[CUSTOM-PROVIDER] TTS error:', error);
            this.conversationManager.onAgentSpeechEnded();
        }
    }
    
    /**
     * Handle function call from LLM
     */
    async handleFunctionCall(event) {
        const functionName = event.name;
        const callId = event.call_id;
        
        let args = {};
        try {
            args = typeof event.arguments === 'string' 
                ? JSON.parse(event.arguments) 
                : event.arguments;
        } catch (e) {
            args = {};
        }
        
        console.log('[CUSTOM-PROVIDER] Function call:', functionName, args);
        
        // Emit for external handling
        this.emit('function.call', {
            call_id: callId,
            name: functionName,
            arguments: JSON.stringify(args)
        });
    }
    
    /**
     * Send function response back to LLM
     */
    async sendFunctionResponse(callId, result) {
        console.log('[CUSTOM-PROVIDER] Function response:', callId);
        
        // Add result to LLM context
        this.llm.addFunctionResult(result.name || 'function', result);
        
        // Generate follow-up response
        const response = await this.llm.generateResponse(
            `Function ${result.name || 'function'} returned: ${JSON.stringify(result)}`
        );
        
        if (response.content) {
            await this.generateAndSpeakResponse(response.content);
        }
        
        return true;
    }
    
    /**
     * Disconnect all services
     */
    async disconnect() {
        console.log('[CUSTOM-PROVIDER] Disconnecting...');
        
        // Stop STT
        if (this.stt) {
            await this.stt.stop();
        }
        
        // Cancel any pending TTS
        if (this.tts) {
            this.tts.cancel();
        }
        
        // Stop MP3 converter
        if (this.mp3Converter) {
            this.mp3Converter.stop();
            this.mp3Converter = null;
        }
        
        // End conversation
        if (this.conversationManager) {
            this.conversationManager.end('disconnect');
        }
        
        this.isConnected = false;
        this.isConfigured = false;
        
        console.log('[CUSTOM-PROVIDER] Disconnected');
    }
    
    /**
     * Get provider name
     */
    getProviderName() {
        return 'custom';
    }
    
    /**
     * Get cost metrics
     */
    getCostMetrics() {
        const duration = this.costMetrics.startTime 
            ? (Date.now() - this.costMetrics.startTime) / 60000 
            : 0;
        
        // Get metrics from components
        const sttMetrics = this.stt?.getMetrics() || {};
        const llmMetrics = this.llm?.getMetrics() || {};
        const ttsMetrics = this.tts?.getMetrics() || {};
        
        // Calculate costs
        // Soniox: ~$0.10/hour = $0.00167/minute
        const sttCost = (sttMetrics.audioSeconds || 0) / 60 * 0.00167;
        
        // Groq: Mostly free tier, minimal cost
        const llmCost = ((llmMetrics.inputTokens || 0) * 0.0000005) + 
                        ((llmMetrics.outputTokens || 0) * 0.0000015);
        
        // TTS cost depends on provider
        let ttsCost;
        if (this.config.ttsProvider === 'uplift') {
            // Uplift AI: ~$15/1M characters (estimated)
            ttsCost = (ttsMetrics.charactersProcessed || 0) * 0.000015;
        } else {
            // Azure TTS: ~$16/1M characters
            ttsCost = (ttsMetrics.charactersProcessed || 0) * 0.000016;
        }
        
        const baseCost = sttCost + llmCost + ttsCost;
        
        return {
            provider: 'custom',
            session_minutes: duration,
            base_cost: baseCost,
            breakdown: {
                stt: sttCost,
                llm: llmCost,
                tts: ttsCost
            },
            // For compatibility with existing cost tracking
            input_audio_seconds: sttMetrics.audioSeconds || 0,
            output_audio_seconds: ttsMetrics.audioSecondsGenerated || 0,
            input_tokens: llmMetrics.inputTokens || 0,
            output_tokens: llmMetrics.outputTokens || 0,
            cached_tokens: 0
        };
    }
}

module.exports = CustomVoiceProvider;

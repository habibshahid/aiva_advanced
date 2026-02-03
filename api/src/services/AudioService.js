/**
 * Audio Service
 * Handles Speech-to-Text (STT) and Text-to-Speech (TTS) for chat
 * 
 * STT Providers: OpenAI, Groq, Deepgram, Soniox
 * TTS Providers: OpenAI, Azure, Uplift
 */
const { File } = require('node:buffer');
globalThis.File = File;

require('dotenv').config();
const OpenAI = require('openai');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const AUDIO_STORAGE_PATH = process.env.AUDIO_STORAGE_PATH || '/etc/aiva-oai/storage/audio';

// Pricing per minute
const STT_PRICING = {
    'openai': { 'whisper-1': 0.006 },
    'groq': { 'whisper-large-v3': 0.0001, 'whisper-large-v3-turbo': 0.00005 },
    'deepgram': { 'nova-2': 0.0043, 'nova-3': 0.0059 },
    'soniox': { 'stt-rt-preview': 0.0035 }
};

// Pricing per 1M characters
const TTS_PRICING = {
    'openai': { 'tts-1': 15.00, 'tts-1-hd': 30.00 },
    'azure': { 'neural': 16.00 },
    'uplift': { 'default': 50.00 }
};

class AudioService {
    constructor() {
        this.clients = {};
        this.profitMargin = parseFloat(process.env.PROFIT_MARGIN_PERCENT || 20) / 100;
        this._initializeClients();
        this._ensureStorageDirectory();
        
        console.log('🎤 AudioService initialized with providers:', Object.keys(this.clients).join(', '));
    }
    
    _initializeClients() {
        if (process.env.OPENAI_API_KEY) {
            this.clients.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
        
        if (process.env.GROQ_API_KEY) {
            this.clients.groq = new OpenAI({
                apiKey: process.env.GROQ_API_KEY,
                baseURL: 'https://api.groq.com/openai/v1'
            });
        }
        
        if (process.env.DEEPGRAM_API_KEY) {
            this.clients.deepgram = { apiKey: process.env.DEEPGRAM_API_KEY };
        }
        
        if (process.env.SONIOX_API_KEY) {
            this.clients.soniox = { apiKey: process.env.SONIOX_API_KEY };
        }
        
        if (process.env.AZURE_SPEECH_KEY) {
            this.clients.azure = {
                subscriptionKey: process.env.AZURE_SPEECH_KEY,
                region: process.env.AZURE_SPEECH_REGION || 'eastus'
            };
        }
		
		if (process.env.UPLIFT_API_KEY) {
			this.clients.uplift = {
				apiKey: process.env.UPLIFT_API_KEY
			};
		}
    }
    
    _ensureStorageDirectory() {
        [AUDIO_STORAGE_PATH, 
         path.join(AUDIO_STORAGE_PATH, 'input'),
         path.join(AUDIO_STORAGE_PATH, 'output')
        ].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    /**
	 * Get audio config from agent for CHAT (separate from voice call config)
	 */
	getConfigFromAgent(agent, requestOverrides = {}) {
		return {
			stt: {
				provider: requestOverrides.stt_provider || agent.chat_stt_provider || 'openai',
				model: requestOverrides.stt_model || agent.chat_stt_model || 'whisper-1',
				language: requestOverrides.language || agent.language || null,
				languageHints: agent.language_hints || ['en']
			},
			tts: {
				provider: requestOverrides.tts_provider || agent.chat_tts_provider || 'openai',
				voice: requestOverrides.voice || agent.chat_tts_voice || 'nova',
				model: 'tts-1',
				speed: parseFloat(requestOverrides.tts_speed) || 1.0
			},
			autoGenerateAudio: agent.chat_audio_response !== false && agent.chat_audio_response !== 0
		};
	}
    
    /**
     * Transcribe audio to text
     */
    async transcribe({ audio, filename, config = {} }) {
        const provider = config.stt?.provider || 'openai';
        const model = config.stt?.model || 'whisper-1';
        const language = config.stt?.language || null;
        const languageHints = config.stt?.languageHints || ['en'];
        
        console.log(`🎤 Transcribing: ${filename} (${provider}/${model})`);
        
        // Check provider availability
        if (!this.clients[provider]) {
            console.warn(`⚠️ ${provider} not configured, falling back to openai`);
            return this.transcribe({ 
                audio, 
                filename, 
                config: { stt: { provider: 'openai', model: 'whisper-1', language } } 
            });
        }
        
        const startTime = Date.now();
        
        try {
            let result;
            
            switch (provider) {
                case 'openai':
                case 'groq':
                    result = await this._transcribeWhisper(audio, filename, provider, model, language);
                    break;
                case 'deepgram':
                    result = await this._transcribeDeepgram(audio, filename, model, language);
                    break;
                case 'soniox':
                    result = await this._transcribeSoniox(audio, filename, model, languageHints);
                    break;
                default:
                    throw new Error(`Unsupported STT provider: ${provider}`);
            }
            
            const pricing = STT_PRICING[provider]?.[model] || 0.006;
            const durationMinutes = result.duration / 60;
            const baseCost = durationMinutes * pricing;
            const finalCost = baseCost * (1 + this.profitMargin);
            
            console.log(`✅ Transcribed: "${result.text.substring(0, 50)}..." (${result.duration.toFixed(1)}s, $${finalCost.toFixed(6)})`);
            
            return {
                success: true,
                text: result.text,
                language: result.language || language || 'unknown',
                duration: result.duration,
                provider,
                model,
                processing_time_ms: Date.now() - startTime,
                cost: { base_cost: baseCost, final_cost: finalCost }
            };
            
        } catch (error) {
            console.error(`❌ Transcription failed (${provider}):`, error.message);
            
            // Fallback to OpenAI
            if (provider !== 'openai' && this.clients.openai) {
                console.log('🔄 Falling back to OpenAI...');
                return this.transcribe({ 
                    audio, 
                    filename, 
                    config: { stt: { provider: 'openai', model: 'whisper-1', language } } 
                });
            }
            throw error;
        }
    }
    
    /**
     * Transcribe using OpenAI/Groq Whisper
     */
    async _transcribeWhisper(audio, filename, provider, model, language) {
        const client = this.clients[provider];
        let tempPath = null;
        
        try {
            let audioFile;
            if (Buffer.isBuffer(audio)) {
                tempPath = path.join(AUDIO_STORAGE_PATH, 'input', `temp_${uuidv4()}_${filename}`);
                fs.writeFileSync(tempPath, audio);
                audioFile = fs.createReadStream(tempPath);
            } else {
                audioFile = fs.createReadStream(audio);
            }
            
            const requestParams = {
                file: audioFile,
                model: provider === 'groq' ? 'whisper-large-v3' : model,
                response_format: 'verbose_json'
            };
            
            if (language) requestParams.language = language;
            
            const response = await client.audio.transcriptions.create(requestParams);
            
            return {
                text: response.text,
                language: response.language,
                duration: response.duration || 0
            };
        } finally {
            if (tempPath) {
                setTimeout(() => { try { fs.unlinkSync(tempPath); } catch (e) {} }, 5000);
            }
        }
    }
    
    /**
     * Transcribe using Deepgram
     */
    async _transcribeDeepgram(audio, filename, model, language) {
        const axios = require('axios');
        const audioBuffer = Buffer.isBuffer(audio) ? audio : fs.readFileSync(audio);
        
        const response = await axios.post(
            `https://api.deepgram.com/v1/listen?model=${model || 'nova-2'}&punctuate=true${language ? `&language=${language}` : ''}`,
            audioBuffer,
            {
                headers: {
                    'Authorization': `Token ${this.clients.deepgram.apiKey}`,
                    'Content-Type': 'audio/*'
                }
            }
        );
        
        const result = response.data.results;
        return {
            text: result.channels[0]?.alternatives[0]?.transcript || '',
            language: result.channels[0]?.detected_language || language,
            duration: result.metadata?.duration || 0
        };
    }
    
    /**
	 * Transcribe using Soniox Async REST API
	 * Converts audio to WAV for compatibility
	 */
	async _transcribeSoniox(audio, filename, model, languageHints) {
		const axios = require('axios');
		const FormData = require('form-data');
		const { execSync } = require('child_process');
		
		let audioBuffer = Buffer.isBuffer(audio) ? audio : fs.readFileSync(audio);
		const apiKey = this.clients.soniox.apiKey;
		
		console.log(`[SONIOX] Transcribing ${audioBuffer.length} bytes...`);
		
		// ============================================
		// Step 0: Convert to WAV if needed (webm not well supported)
		// ============================================
		const ext = path.extname(filename || '').toLowerCase();
		let finalFilename = filename || 'audio.wav';
		
		if (ext === '.webm' || ext === '.ogg' || !ext) {
			try {
				console.log(`[SONIOX] Converting ${ext || 'unknown'} to WAV...`);
				
				const inputPath = path.join(AUDIO_STORAGE_PATH, 'input', `soniox_in_${Date.now()}${ext || '.webm'}`);
				const outputPath = path.join(AUDIO_STORAGE_PATH, 'input', `soniox_out_${Date.now()}.wav`);
				
				// Write input file
				fs.writeFileSync(inputPath, audioBuffer);
				
				// Convert using ffmpeg
				execSync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`, {
					stdio: 'pipe',
					timeout: 30000
				});
				
				// Read converted file
				audioBuffer = fs.readFileSync(outputPath);
				finalFilename = 'audio.wav';
				
				console.log(`[SONIOX] Converted: ${audioBuffer.length} bytes`);
				
				// Cleanup
				try { fs.unlinkSync(inputPath); } catch (e) {}
				try { fs.unlinkSync(outputPath); } catch (e) {}
				
			} catch (convertError) {
				console.error('[SONIOX] Conversion failed:', convertError.message);
				// Continue with original file, might still work
			}
		}
		
		try {
			// ============================================
			// Step 1: Upload file to /v1/files
			// ============================================
			const formData = new FormData();
			formData.append('file', audioBuffer, {
				filename: finalFilename,
				contentType: this._getMimeType(finalFilename)
			});
			
			const uploadResponse = await axios.post(
				'https://api.soniox.com/v1/files',
				formData,
				{
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						...formData.getHeaders()
					},
					timeout: 60000
				}
			);
			
			const fileId = uploadResponse.data.id;
			console.log(`[SONIOX] File uploaded: ${fileId}`);
			
			// ============================================
			// Step 2: Create transcription with file_id
			// ============================================
			const transcriptionResponse = await axios.post(
				'https://api.soniox.com/v1/transcriptions',
				{
					model: 'stt-async-preview',
					file_id: fileId,
					language_hints: languageHints || ['en', 'ur']
				},
				{
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					},
					timeout: 30000
				}
			);
			
			const transcriptionId = transcriptionResponse.data.id;
			console.log(`[SONIOX] Transcription created: ${transcriptionId}`);
			
			// ============================================
			// Step 3: Poll for completion
			// ============================================
			let status = 'queued';
			let attempts = 0;
			const maxAttempts = 60;
			let audioDurationMs = 0;
			
			while ((status === 'queued' || status === 'processing') && attempts < maxAttempts) {
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				const statusResponse = await axios.get(
					`https://api.soniox.com/v1/transcriptions/${transcriptionId}`,
					{
						headers: { 'Authorization': `Bearer ${apiKey}` }
					}
				);
				
				status = statusResponse.data.status;
				audioDurationMs = statusResponse.data.audio_duration_ms || 0;
				attempts++;
				
				console.log(`[SONIOX] Status: ${status} (attempt ${attempts})`);
				
				if (status === 'error') {
					// Cleanup file before throwing
					try {
						await axios.delete(`https://api.soniox.com/v1/files/${fileId}`, {
							headers: { 'Authorization': `Bearer ${apiKey}` }
						});
					} catch (e) {}
					
					throw new Error(statusResponse.data.error_message || 'Transcription failed');
				}
			}
			
			if (status !== 'completed') {
				throw new Error('Transcription timeout');
			}
			
			// ============================================
			// Step 4: Get transcript
			// ============================================
			const transcriptResponse = await axios.get(
				`https://api.soniox.com/v1/transcriptions/${transcriptionId}/transcript`,
				{
					headers: { 'Authorization': `Bearer ${apiKey}` }
				}
			);
			
			// Extract text from response
			const transcriptData = transcriptResponse.data;
			let text = '';
			
			if (typeof transcriptData === 'string') {
				text = transcriptData;
			} else if (transcriptData.text) {
				text = transcriptData.text;
			} else if (transcriptData.transcript) {
				text = transcriptData.transcript;
			} else if (Array.isArray(transcriptData.words)) {
				text = transcriptData.words.map(w => w.text || w.word).join('');
			} else if (Array.isArray(transcriptData)) {
				text = transcriptData.map(seg => seg.text || '').join(' ');
			}
			
			const duration = audioDurationMs / 1000;
			
			console.log(`[SONIOX] Complete: "${text.substring(0, 50)}..." (${duration.toFixed(1)}s)`);
			
			// ============================================
			// Step 5: Cleanup
			// ============================================
			try {
				await axios.delete(`https://api.soniox.com/v1/files/${fileId}`, {
					headers: { 'Authorization': `Bearer ${apiKey}` }
				});
			} catch (e) {}
			
			return {
				text: text.trim(),
				language: languageHints?.[0] || 'en',
				duration: duration
			};
			
		} catch (error) {
			console.error('[SONIOX] Error:', error.response?.data || error.message);
			throw new Error(`Soniox transcription failed: ${error.response?.data?.message || error.message}`);
		}
	}
	/**
	 * Get MIME type from filename
	 */
	_getMimeType(filename) {
		if (!filename) return 'audio/webm';
		
		const ext = path.extname(filename).toLowerCase();
		const mimeTypes = {
			'.mp3': 'audio/mpeg',
			'.mp4': 'audio/mp4',
			'.mpeg': 'audio/mpeg',
			'.mpga': 'audio/mpeg',
			'.m4a': 'audio/m4a',
			'.wav': 'audio/wav',
			'.webm': 'audio/webm',
			'.ogg': 'audio/ogg',
			'.flac': 'audio/flac'
		};
		return mimeTypes[ext] || 'audio/webm';
	}
    
    /**
     * Synthesize text to speech
     */
    async synthesize({ text, config = {}, sessionId = null }) {
        const provider = config.tts?.provider || 'openai';
        const voice = config.tts?.voice || 'nova';
        const model = config.tts?.model || 'tts-1';
        const speed = config.tts?.speed || 1.0;
        
        console.log(`🔊 Synthesizing: "${text.substring(0, 50)}..." (${provider}/${voice})`);
        
        // Check provider - handle 'uplift' as 'openai' fallback for now
        const effectiveProvider = (provider === 'uplift' && !this.clients.uplift) ? 'openai' : provider;
        
        if (!this.clients[effectiveProvider]) {
            console.warn(`⚠️ TTS ${provider} not configured, falling back to openai`);
            return this.synthesize({ 
                text, 
                config: { tts: { provider: 'openai', voice: 'nova', model: 'tts-1', speed } }, 
                sessionId 
            });
        }
        
        const startTime = Date.now();
        const cleanedText = this._cleanTextForTTS(text);
        
        if (!cleanedText?.trim()) {
            throw new Error('No text to synthesize after cleaning');
        }
        
        try {
            let audioBuffer;
            
            switch (effectiveProvider) {
				case 'openai':
					audioBuffer = await this._synthesizeOpenAI(cleanedText, model, voice, speed);
					break;
				case 'azure':
					audioBuffer = await this._synthesizeAzure(cleanedText, voice, speed);
					break;
				case 'uplift':
					audioBuffer = await this._synthesizeUplift(cleanedText, voice, speed);
					break;
				default:
					throw new Error(`Unsupported TTS provider: ${provider}`);
			}
            
            // Save file
            const audioId = uuidv4();
            const filename = sessionId ? `${sessionId}_${audioId}.mp3` : `${audioId}.mp3`;
            const audioPath = path.join(AUDIO_STORAGE_PATH, 'output', filename);
            fs.writeFileSync(audioPath, audioBuffer);
            
            const audioUrl = `${process.env.MANAGEMENT_API_URL || 'http://localhost:62001/api'}/audio/output/${filename}`;
            // Cost
            const pricing = TTS_PRICING[effectiveProvider]?.[model] || 15.00;
            const baseCost = (cleanedText.length / 1_000_000) * pricing;
            const finalCost = baseCost * (1 + this.profitMargin);
            
            console.log(`✅ TTS complete: ${filename} ($${finalCost.toFixed(6)})`);
            
            return {
                success: true,
                audio_url: audioUrl,
                audio_id: audioId,
                filename,
                format: 'mp3',
                provider: effectiveProvider,
                voice,
                character_count: cleanedText.length,
                estimated_duration: (cleanedText.length / 150) / speed,
                file_size_bytes: audioBuffer.length,
                processing_time_ms: Date.now() - startTime,
                cost: { base_cost: baseCost, final_cost: finalCost }
            };
            
        } catch (error) {
            console.error(`❌ TTS failed (${provider}):`, error.message);
            
            if (effectiveProvider !== 'openai' && this.clients.openai) {
                console.log('🔄 Falling back to OpenAI TTS...');
                return this.synthesize({ 
                    text, 
                    config: { tts: { provider: 'openai', voice: 'nova', model: 'tts-1', speed } }, 
                    sessionId 
                });
            }
            throw error;
        }
    }
    
    /**
     * OpenAI TTS
     */
    async _synthesizeOpenAI(text, model, voice, speed) {
        const truncated = text.length > 4096 ? text.substring(0, 4096) : text;
        
        const response = await this.clients.openai.audio.speech.create({
            model: model || 'tts-1',
            voice: voice || 'nova',
            input: truncated,
            speed: speed || 1.0,
            response_format: 'mp3'
        });
        
        return Buffer.from(await response.arrayBuffer());
    }
    
    /**
     * Azure TTS
     */
    async _synthesizeAzure(text, voice, speed) {
        const https = require('https');
        
        // Get token
        const token = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: `${this.clients.azure.region}.api.cognitive.microsoft.com`,
                path: '/sts/v1.0/issueToken',
                method: 'POST',
                headers: { 
                    'Ocp-Apim-Subscription-Key': this.clients.azure.subscriptionKey, 
                    'Content-Length': 0 
                }
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            req.end();
        });
        
        const azureVoice = this._mapVoiceToAzure(voice);
        const rate = Math.round((speed - 1) * 100);
        
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
            <voice name='${azureVoice}'><prosody rate='${rate >= 0 ? '+' : ''}${rate}%'>${this._escapeXml(text)}</prosody></voice>
        </speak>`;
        
        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: `${this.clients.azure.region}.tts.speech.microsoft.com`,
                path: '/cognitiveservices/v1',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
                }
            }, res => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            });
            req.on('error', reject);
            req.write(ssml);
            req.end();
        });
    }
    
    _mapVoiceToAzure(voice) {
        const map = {
            'nova': 'en-US-JennyNeural',
            'alloy': 'en-US-GuyNeural',
            'shimmer': 'en-US-AmberNeural',
            'echo': 'en-US-AriaNeural',
            'onyx': 'en-US-DavisNeural',
            'fable': 'en-GB-SoniaNeural',
            'ur-female': 'ur-PK-UzmaNeural',
            'ur-male': 'ur-PK-AsadNeural'
        };
        return map[voice] || voice;
    }
    
    _cleanTextForTTS(text) {
        if (!text) return '';
        return text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/#{1,6}\s*/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    
    _escapeXml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    getAudioFile(audioId, type = 'output') {
        const dir = path.join(AUDIO_STORAGE_PATH, type);
        
        let filePath = path.join(dir, audioId);
        if (fs.existsSync(filePath)) {
            return { path: filePath, filename: audioId, size: fs.statSync(filePath).size };
        }
        
        const files = fs.readdirSync(dir);
        const match = files.find(f => f.includes(audioId));
        if (match) {
            filePath = path.join(dir, match);
            return { path: filePath, filename: match, size: fs.statSync(filePath).size };
        }
        
        return null;
    }
    
	/**
	 * Uplift TTS via REST API (Async)
	 * Uses /text-to-speech-async for chat (returns URL, then fetches audio)
	 */
	async _synthesizeUplift(text, voice, speed = 1.0) {
		const axios = require('axios');
		
		// Map voice name to Uplift voice ID
		const voiceId = this._mapVoiceToUplift(voice);
		
		console.log(`[UPLIFT-TTS] Synthesizing: "${text.substring(0, 50)}..." voice=${voiceId}`);
		
		try {
			// Step 1: Request async synthesis
			const response = await axios.post(
				'https://api.upliftai.org/v1/synthesis/text-to-speech-async',
				{
					voiceId: voiceId,
					text: text,
					outputFormat: 'MP3_22050_128'  // Good quality for chat
				},
				{
					headers: {
						'Authorization': `Bearer ${this.clients.uplift.apiKey}`,
						'Content-Type': 'application/json'
					},
					timeout: 30000
				}
			);
			
			const { mediaId, token } = response.data;
			
			if (!mediaId || !token) {
				throw new Error('Invalid response from Uplift API');
			}
			
			console.log(`[UPLIFT-TTS] Media ID: ${mediaId}, fetching audio...`);
			
			// Step 2: Wait a moment for audio generation
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			// Step 3: Fetch the generated audio
			const audioUrl = `https://api.upliftai.org/v1/synthesis/stream-audio/${mediaId}?token=${token}`;
			
			const audioResponse = await axios.get(audioUrl, {
				responseType: 'arraybuffer',
				timeout: 60000,
				// Retry logic for when audio isn't ready yet
				validateStatus: (status) => status === 200 || status === 202
			});
			
			// If 202, audio not ready yet - retry
			if (audioResponse.status === 202) {
				console.log('[UPLIFT-TTS] Audio not ready, waiting...');
				await new Promise(resolve => setTimeout(resolve, 2000));
				
				const retryResponse = await axios.get(audioUrl, {
					responseType: 'arraybuffer',
					timeout: 60000
				});
				
				console.log(`[UPLIFT-TTS] Complete: ${retryResponse.data.length} bytes`);
				return Buffer.from(retryResponse.data);
			}
			
			console.log(`[UPLIFT-TTS] Complete: ${audioResponse.data.length} bytes`);
			return Buffer.from(audioResponse.data);
			
		} catch (error) {
			console.error('[UPLIFT-TTS] Error:', error.response?.data || error.message);
			throw new Error(`Uplift TTS failed: ${error.message}`);
		}
	}

	/**
	 * Map voice name to Uplift voice ID
	 */
	_mapVoiceToUplift(voice) {
		const mapping = {
			// Friendly names
			'ayesha': 'v_meklc281',
			'fatima': 'v_8eelc901',
			'asad': 'v_30s70t3a',
			'dada jee': 'v_yypgzenx',
			'dadajee': 'v_yypgzenx',
			'zara': 'v_kwmp7zxt',
			'samina': 'v_sd0kl3m9',
			'waqar': 'v_sd6mn4p2',
			'imran': 'v_sd9qr7x5',
			'karim': 'v_bl0ab8c4',
			'nazia': 'v_bl1de2f7',
			// Legacy mappings
			'ur-female': 'v_meklc281',
			'ur-male': 'v_30s70t3a',
			'urdu-female': 'v_meklc281',
			'urdu-male': 'v_30s70t3a'
		};
		
		if (!voice) return 'v_meklc281'; // Default: Ayesha
		
		const lower = voice.toLowerCase();
		
		// Already a voice ID
		if (lower.startsWith('v_')) return voice;
		
		return mapping[lower] || 'v_meklc281';
	}

    getAvailableProviders() {
        return {
            stt: {
                openai: { available: !!this.clients.openai, models: ['whisper-1'] },
                groq: { available: !!this.clients.groq, models: ['whisper-large-v3', 'whisper-large-v3-turbo'] },
                deepgram: { available: !!this.clients.deepgram, models: ['nova-2', 'nova-3'] },
                soniox: { available: !!this.clients.soniox, models: ['stt-rt-preview'] }
            },
            tts: {
                openai: { available: !!this.clients.openai, voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
                azure: { available: !!this.clients.azure, voices: ['en-US-JennyNeural', 'ur-PK-UzmaNeural'] },
                uplift: { available: !!this.clients.uplift, voices: ['ayesha', 'fatima', 'asad', 'zara', 'samina', 'waqar', 'imran', 'nazia'] }
            }
        };
    }
}

module.exports = new AudioService();
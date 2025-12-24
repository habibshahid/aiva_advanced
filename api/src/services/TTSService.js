/**
 * TTS Service
 * Text-to-Speech generation and caching
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../config/database');

class TTSService {
    
    constructor(config = {}) {
        this.provider = config.provider || process.env.TTS_PROVIDER || 'elevenlabs';
        this.apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY;
        
        // Default voices per language
        this.defaultVoices = {
            'en': { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', provider: 'elevenlabs' },
            'ur': { voice_id: 'ur-PK-UzmaNeural', name: 'Uzma', provider: 'azure' },
            'ur-roman': { voice_id: 'ur-PK-UzmaNeural', name: 'Uzma', provider: 'azure' },
            'pa': { voice_id: 'pa-IN-Standard-A', name: 'Punjabi Female', provider: 'google' },
            'sd': { voice_id: 'sd-IN-Standard-A', name: 'Sindhi Female', provider: 'google' },
            'ps': { voice_id: 'ps-AF-Standard-A', name: 'Pashto Female', provider: 'google' },
            'bal': { voice_id: 'ur-PK-UzmaNeural', name: 'Balochi (Urdu)', provider: 'azure' },
            'hi': { voice_id: 'hi-IN-SwaraNeural', name: 'Swara', provider: 'azure' },
            'ta': { voice_id: 'ta-IN-PallaviNeural', name: 'Pallavi', provider: 'azure' },
            'te': { voice_id: 'te-IN-ShrutiNeural', name: 'Shruti', provider: 'azure' },
            'bn': { voice_id: 'bn-IN-TanishaaNeural', name: 'Tanishaa', provider: 'azure' },
            'mr': { voice_id: 'mr-IN-AarohiNeural', name: 'Aarohi', provider: 'azure' },
            'gu': { voice_id: 'gu-IN-DhwaniNeural', name: 'Dhwani', provider: 'azure' },
            'ar': { voice_id: 'ar-SA-ZariyahNeural', name: 'Zariyah', provider: 'azure' },
            'ar-eg': { voice_id: 'ar-EG-SalmaNeural', name: 'Salma', provider: 'azure' },
            'ar-sa': { voice_id: 'ar-SA-ZariyahNeural', name: 'Zariyah', provider: 'azure' },
            'es': { voice_id: 'es-ES-ElviraNeural', name: 'Elvira', provider: 'azure' },
            'fr': { voice_id: 'fr-FR-DeniseNeural', name: 'Denise', provider: 'azure' },
            'de': { voice_id: 'de-DE-KatjaNeural', name: 'Katja', provider: 'azure' },
            'zh': { voice_id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', provider: 'azure' }
        };
    }
    
    /**
     * Generate TTS audio
     */
    async synthesize(text, voice = null, language = 'en', options = {}) {
        if (!text || text.trim().length === 0) {
            throw new Error('Text is required for TTS');
        }
        
        // Get voice config
        const voiceConfig = voice || this.defaultVoices[language] || this.defaultVoices['en'];
        
        // Select provider
        switch (voiceConfig.provider || this.provider) {
            case 'elevenlabs':
                return await this.synthesizeElevenLabs(text, voiceConfig, options);
            case 'azure':
                return await this.synthesizeAzure(text, voiceConfig, language, options);
            case 'google':
                return await this.synthesizeGoogle(text, voiceConfig, language, options);
            default:
                return await this.synthesizeElevenLabs(text, voiceConfig, options);
        }
    }
    
    /**
     * ElevenLabs TTS
     */
    async synthesizeElevenLabs(text, voice, options = {}) {
        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': this.apiKey
                },
                body: JSON.stringify({
                    text: text,
                    model_id: options.model || 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: options.stability || 0.5,
                        similarity_boost: options.similarity || 0.75,
                        style: options.style || 0,
                        use_speaker_boost: true
                    }
                })
            }
        );
        
        if (!response.ok) {
            throw new Error(`ElevenLabs TTS failed: ${response.statusText}`);
        }
        
        const buffer = await response.arrayBuffer();
        
        return {
            buffer: Buffer.from(buffer),
            format: 'mp3',
            provider: 'elevenlabs',
            voice_id: voice.voice_id
        };
    }
    
    /**
     * Azure TTS
     */
    async synthesizeAzure(text, voice, language, options = {}) {
        const azureKey = process.env.AZURE_SPEECH_KEY;
        const azureRegion = process.env.AZURE_SPEECH_REGION || 'eastus';
        
        // Get token
        const tokenResponse = await fetch(
            `https://${azureRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
            {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': azureKey
                }
            }
        );
        
        const token = await tokenResponse.text();
        
        // Build SSML
        const ssml = `
            <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${language}'>
                <voice name='${voice.voice_id}'>
                    <prosody rate='${options.rate || '0%'}' pitch='${options.pitch || '0%'}'>
                        ${this.escapeXml(text)}
                    </prosody>
                </voice>
            </speak>
        `;
        
        const response = await fetch(
            `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
                },
                body: ssml
            }
        );
        
        if (!response.ok) {
            throw new Error(`Azure TTS failed: ${response.statusText}`);
        }
        
        const buffer = await response.arrayBuffer();
        
        return {
            buffer: Buffer.from(buffer),
            format: 'mp3',
            provider: 'azure',
            voice_id: voice.voice_id
        };
    }
    
    /**
     * Google TTS
     */
    async synthesizeGoogle(text, voice, language, options = {}) {
        const googleKey = process.env.GOOGLE_TTS_API_KEY;
        
        const response = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input: { text: text },
                    voice: {
                        languageCode: language,
                        name: voice.voice_id
                    },
                    audioConfig: {
                        audioEncoding: 'MP3',
                        speakingRate: options.rate || 1.0,
                        pitch: options.pitch || 0
                    }
                })
            }
        );
        
        if (!response.ok) {
            throw new Error(`Google TTS failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        const buffer = Buffer.from(data.audioContent, 'base64');
        
        return {
            buffer: buffer,
            format: 'mp3',
            provider: 'google',
            voice_id: voice.voice_id
        };
    }
    
    /**
     * Generate and save to audio library
     */
    async generateAndSave(agentId, tenantId, text, language, options = {}) {
        // Generate audio
        const voice = options.voice || this.defaultVoices[language];
        const result = await this.synthesize(text, voice, language, options);
        
        // Save to audio library
        const audioId = uuidv4();
        const fileName = `tts_${audioId}.${result.format}`;
        
        // TODO: Save to file storage (S3, local, etc.)
        // For now, assume audioStorage service handles this
        
        // Save metadata to audio library table
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_audio 
            (id, agent_id, tenant_id, file_name, file_type, duration_ms, file_size, 
             audio_source, source_text, language, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, 1)
        `, [
            audioId,
            agentId,
            tenantId,
            fileName,
            result.format,
            options.duration_ms || null,
            result.buffer.length,
            text,
            language
        ]);
        
        return {
            audio_id: audioId,
            file_name: fileName,
            buffer: result.buffer,
            format: result.format
        };
    }
    
    /**
     * Check TTS cache
     */
    async getCached(agentId, text, language, voiceId = null) {
        const hash = this.hashText(text, language, voiceId);
        
        const [rows] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_ivr_tts_cache
            WHERE agent_id = ? AND text_hash = ?
        `, [agentId, hash]);
        
        if (rows.length > 0) {
            // Update hit count
            await db.query(`
                UPDATE yovo_tbl_aiva_ivr_tts_cache 
                SET hit_count = hit_count + 1, last_used_at = NOW()
                WHERE id = ?
            `, [rows[0].id]);
            
            return rows[0];
        }
        
        return null;
    }
    
    /**
     * Add to TTS cache
     */
    async addToCache(agentId, tenantId, text, language, voiceId, audioId, durationMs) {
        const hash = this.hashText(text, language, voiceId);
        const id = uuidv4();
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_tts_cache 
            (id, agent_id, tenant_id, text_hash, text_content, language_code, voice_id, audio_id, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                audio_id = VALUES(audio_id),
                hit_count = hit_count + 1,
                last_used_at = NOW()
        `, [id, agentId, tenantId, hash, text, language, voiceId, audioId, durationMs]);
    }
    
    /**
     * Generate or get from cache
     */
    async getOrGenerate(agentId, tenantId, text, language, options = {}) {
        const voiceId = options.voice?.voice_id || this.defaultVoices[language]?.voice_id;
        
        // Check cache
        const cached = await this.getCached(agentId, text, language, voiceId);
        if (cached) {
            return {
                audio_id: cached.audio_id,
                from_cache: true
            };
        }
        
        // Generate new
        const result = await this.generateAndSave(agentId, tenantId, text, language, options);
        
        // Add to cache
        await this.addToCache(agentId, tenantId, text, language, voiceId, result.audio_id, result.duration_ms);
        
        return {
            audio_id: result.audio_id,
            from_cache: false,
            buffer: result.buffer
        };
    }
    
    /**
     * Get available voices for a language
     */
    async getVoices(language = null) {
        if (language) {
            return this.defaultVoices[language] ? [this.defaultVoices[language]] : [];
        }
        
        return Object.entries(this.defaultVoices).map(([lang, voice]) => ({
            language: lang,
            ...voice
        }));
    }
    
    /**
     * Hash text for cache key
     */
    hashText(text, language, voiceId = 'default') {
        const content = `${text}|${language}|${voiceId}`;
        return crypto.createHash('sha256').update(content).digest('hex');
    }
    
    /**
     * Escape XML for SSML
     */
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    /**
     * Clean up old cache entries
     */
    async cleanupCache(agentId, maxAgeDays = 30, minHits = 1) {
        await db.query(`
            DELETE FROM yovo_tbl_aiva_ivr_tts_cache
            WHERE agent_id = ? 
              AND last_used_at < DATE_SUB(NOW(), INTERVAL ? DAY)
              AND hit_count <= ?
        `, [agentId, maxAgeDays, minHits]);
    }
}

module.exports = TTSService;

/**
 * Template Renderer
 * Runtime rendering of templates to audio
 * Handles segment audio + TTS generation for variables
 */

const crypto = require('crypto');

class TemplateRenderer {
    
    constructor(config) {
        this.apiBaseUrl = config.apiBaseUrl;
        this.apiToken = config.apiToken;
        this.ttsHandler = config.ttsHandler;
        this.audioStorage = config.audioStorage;
        this.cache = new Map();
    }
    
    /**
     * Render a template to audio parts
     * Returns array of audio URLs/buffers to play sequentially
     */
    async render(agentId, template, variables = {}, language = 'en') {
        const audioParts = [];
        
        for (const part of template.template_structure.parts) {
            if (part.type === 'segment') {
                // Get pre-recorded segment audio
                const audio = await this.getSegmentAudio(agentId, part.segment_key, language);
                if (audio) {
                    audioParts.push({
                        type: 'audio',
                        source: 'segment',
                        segment_key: part.segment_key,
                        audio_id: audio.audio_id,
                        audio_url: audio.audio_url,
                        text: audio.text
                    });
                } else {
                    // Fallback: generate TTS for segment text
                    console.warn(`[TemplateRenderer] No audio for segment "${part.segment_key}", using TTS`);
                    const segmentText = await this.getSegmentText(agentId, part.segment_key, language);
                    if (segmentText) {
                        const ttsAudio = await this.generateTTS(agentId, segmentText, language);
                        audioParts.push({
                            type: 'tts',
                            source: 'segment_fallback',
                            text: segmentText,
                            audio_url: ttsAudio.url,
                            audio_buffer: ttsAudio.buffer
                        });
                    }
                }
                
            } else if (part.type === 'variable') {
                // Generate TTS for variable value
                const value = variables[part.name];
                
                if (value !== undefined && value !== null && value !== '') {
                    const text = String(value);
                    
                    // Check cache first
                    const cached = await this.getCachedTTS(agentId, text, language);
                    if (cached) {
                        audioParts.push({
                            type: 'cached_tts',
                            source: 'variable',
                            variable: part.name,
                            text: text,
                            audio_id: cached.audio_id,
                            audio_url: cached.audio_url
                        });
                    } else {
                        // Generate and cache
                        const ttsAudio = await this.generateAndCacheTTS(agentId, text, language);
                        audioParts.push({
                            type: 'tts',
                            source: 'variable',
                            variable: part.name,
                            text: text,
                            audio_url: ttsAudio.url,
                            audio_id: ttsAudio.audio_id,
                            audio_buffer: ttsAudio.buffer
                        });
                    }
                }
                
            } else if (part.type === 'text') {
                // Static text - generate TTS
                if (part.text && part.text.trim()) {
                    const ttsAudio = await this.generateTTS(agentId, part.text, language);
                    audioParts.push({
                        type: 'tts',
                        source: 'static_text',
                        text: part.text,
                        audio_url: ttsAudio.url,
                        audio_buffer: ttsAudio.buffer
                    });
                }
            }
        }
        
        return audioParts;
    }
    
    /**
     * Render template to plain text (for preview)
     */
    async renderText(agentId, template, variables = {}, language = 'en') {
        const parts = [];
        
        for (const part of template.template_structure.parts) {
            if (part.type === 'segment') {
                const text = await this.getSegmentText(agentId, part.segment_key, language);
                parts.push(text || `[${part.segment_key}]`);
                
            } else if (part.type === 'variable') {
                const value = variables[part.name];
                parts.push(value !== undefined ? String(value) : `{{${part.name}}}`);
                
            } else if (part.type === 'text') {
                parts.push(part.text || '');
            }
        }
        
        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }
    
    /**
     * Get segment audio from API
     */
    async getSegmentAudio(agentId, segmentKey, language) {
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/internal/segments/${agentId}/key/${segmentKey}?language=${language}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
            
            if (!response.ok) {
                return null;
            }
            
            const data = await response.json();
            const segment = data.data;
            
            // Get content for language (or fallback)
            const content = segment.content[language] || 
                           segment.content['en'] || 
                           Object.values(segment.content)[0];
            
            if (!content || !content.audio_id) {
                return null;
            }
            
            return {
                audio_id: content.audio_id,
                audio_url: `${this.apiBaseUrl}/api/ivr/${agentId}/audio/${content.audio_id}/stream`,
                text: content.text_content
            };
            
        } catch (error) {
            console.error(`[TemplateRenderer] Error fetching segment "${segmentKey}":`, error);
            return null;
        }
    }
    
    /**
     * Get segment text only
     */
    async getSegmentText(agentId, segmentKey, language) {
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/internal/segments/${agentId}/key/${segmentKey}?language=${language}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
            
            if (!response.ok) {
                return null;
            }
            
            const data = await response.json();
            const segment = data.data;
            
            const content = segment.content[language] || 
                           segment.content['en'] || 
                           Object.values(segment.content)[0];
            
            return content?.text_content || null;
            
        } catch (error) {
            console.error(`[TemplateRenderer] Error fetching segment text "${segmentKey}":`, error);
            return null;
        }
    }
    
    /**
     * Generate TTS audio
     */
    async generateTTS(agentId, text, language) {
        if (!this.ttsHandler) {
            throw new Error('TTS handler not configured');
        }
        
        const voice = await this.getTTSVoice(agentId, language);
        const result = await this.ttsHandler.synthesize(text, voice, language);
        
        return {
            url: result.url,
            buffer: result.buffer,
            duration_ms: result.duration_ms
        };
    }
    
    /**
     * Generate and cache TTS
     */
    async generateAndCacheTTS(agentId, text, language) {
        const ttsResult = await this.generateTTS(agentId, text, language);
        
        // Save to audio library and cache
        try {
            const hash = this.hashText(text, language);
            
            // Store in audio library
            const audioId = await this.audioStorage.saveAudio({
                agentId,
                audioBuffer: ttsResult.buffer,
                name: `tts_cache_${hash.substring(0, 8)}`,
                source: 'tts_cache',
                duration_ms: ttsResult.duration_ms
            });
            
            // Add to TTS cache
            await this.addToTTSCache(agentId, text, language, audioId, ttsResult.duration_ms);
            
            ttsResult.audio_id = audioId;
            ttsResult.url = `${this.apiBaseUrl}/api/ivr/${agentId}/audio/${audioId}/stream`;
            
        } catch (error) {
            console.error('[TemplateRenderer] Failed to cache TTS:', error);
        }
        
        return ttsResult;
    }
    
    /**
     * Check TTS cache
     */
    async getCachedTTS(agentId, text, language) {
        const hash = this.hashText(text, language);
        
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/internal/tts-cache/${agentId}/${hash}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
            
            if (!response.ok) {
                return null;
            }
            
            const data = await response.json();
            if (data.data && data.data.audio_id) {
                // Update hit count
                this.updateCacheHit(agentId, hash);
                
                return {
                    audio_id: data.data.audio_id,
                    audio_url: `${this.apiBaseUrl}/api/ivr/${agentId}/audio/${data.data.audio_id}/stream`
                };
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Add to TTS cache via API
     */
    async addToTTSCache(agentId, text, language, audioId, durationMs) {
        const hash = this.hashText(text, language);
        
        try {
            await fetch(
                `${this.apiBaseUrl}/api/internal/tts-cache/${agentId}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text_hash: hash,
                        text_content: text,
                        language_code: language,
                        audio_id: audioId,
                        duration_ms: durationMs
                    })
                }
            );
        } catch (error) {
            console.error('[TemplateRenderer] Failed to add to TTS cache:', error);
        }
    }
    
    /**
     * Update cache hit count
     */
    async updateCacheHit(agentId, hash) {
        try {
            await fetch(
                `${this.apiBaseUrl}/api/internal/tts-cache/${agentId}/${hash}/hit`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
        } catch (error) {
            // Ignore errors for hit updates
        }
    }
    
    /**
     * Get TTS voice for language
     */
    async getTTSVoice(agentId, language) {
        const cacheKey = `voice_${agentId}_${language}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/internal/agents/${agentId}/tts-config`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                const ttsConfig = data.data;
                
                if (ttsConfig && ttsConfig.voices && ttsConfig.voices[language]) {
                    const voice = ttsConfig.voices[language];
                    this.cache.set(cacheKey, voice);
                    return voice;
                }
            }
        } catch (error) {
            console.error('[TemplateRenderer] Failed to get TTS voice:', error);
        }
        
        // Default voice
        return { voice_id: 'default', name: 'Default' };
    }
    
    /**
     * Hash text for cache key
     */
    hashText(text, language) {
        const voiceId = 'default'; // TODO: Include actual voice ID
        const content = `${text}|${language}|${voiceId}`;
        return crypto.createHash('sha256').update(content).digest('hex');
    }
    
    /**
     * Clear local cache
     */
    clearCache() {
        this.cache.clear();
    }
}

module.exports = TemplateRenderer;

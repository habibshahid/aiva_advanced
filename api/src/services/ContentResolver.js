/**
 * Content Resolver Service
 * Resolves content in the correct language with fallbacks
 */

const db = require('../config/database');
const SegmentService = require('./SegmentService');
const TemplateService = require('./TemplateService');

class ContentResolver {
    
    constructor(agentId) {
        this.agentId = agentId;
        this.defaultLanguage = 'en';
        this.cache = new Map();
        this.agentConfig = null;
    }
    
    /**
     * Initialize resolver with agent config
     */
    async init() {
        const [agents] = await db.query(
            `SELECT supported_languages, default_language, tts_config 
             FROM yovo_tbl_aiva_agents WHERE id = ?`,
            [this.agentId]
        );
        
        if (agents.length > 0) {
            const agent = agents[0];
            this.defaultLanguage = agent.default_language || 'en';
            
            if (typeof agent.supported_languages === 'string') {
                this.supportedLanguages = JSON.parse(agent.supported_languages);
            } else {
                this.supportedLanguages = agent.supported_languages || ['en'];
            }
            
            if (typeof agent.tts_config === 'string') {
                this.ttsConfig = JSON.parse(agent.tts_config);
            } else {
                this.ttsConfig = agent.tts_config || {};
            }
            
            this.agentConfig = agent;
        }
        
        return this;
    }
    
    /**
     * Get content for an entity field in the specified language
     * Falls back to default language if not found
     */
    async getContent(entityType, entityId, fieldName, language) {
        const cacheKey = `${entityType}:${entityId}:${fieldName}:${language}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        // Try requested language
        let content = await this.fetchContent(entityType, entityId, fieldName, language);
        
        // Fall back to default language
        if (!content && language !== this.defaultLanguage) {
            content = await this.fetchContent(entityType, entityId, fieldName, this.defaultLanguage);
        }
        
        // Fall back to 'en' if still not found
        if (!content && this.defaultLanguage !== 'en') {
            content = await this.fetchContent(entityType, entityId, fieldName, 'en');
        }
        
        this.cache.set(cacheKey, content);
        return content;
    }
    
    /**
     * Fetch content from i18n table
     */
    async fetchContent(entityType, entityId, fieldName, language) {
        const [rows] = await db.query(`
            SELECT text_content, audio_id, template_id
            FROM yovo_tbl_aiva_ivr_i18n_content
            WHERE entity_type = ? AND entity_id = ? 
              AND field_name = ? AND language_code = ?
        `, [entityType, entityId, fieldName, language]);
        
        return rows[0] || null;
    }
    
    /**
     * Get step content with language resolution
     */
    async getStepContent(step, language) {
        const content = {
            prompt: null,
            confirm: null,
            on_invalid: null,
            on_empty: null
        };
        
        // Get prompt
        const promptI18n = await this.getContent('step', step.id, 'prompt_text', language);
        if (promptI18n) {
            content.prompt = {
                text: promptI18n.text_content,
                audio_id: promptI18n.audio_id,
                template_id: promptI18n.template_id
            };
        } else if (step.prompt_text) {
            // Fall back to base field
            content.prompt = {
                text: step.prompt_text,
                audio_id: step.prompt_audio_id,
                template_id: step.prompt_template_id
            };
        }
        
        // Get confirm template
        if (step.requires_confirmation) {
            const confirmI18n = await this.getContent('step', step.id, 'confirm_template', language);
            if (confirmI18n) {
                content.confirm = {
                    text: confirmI18n.text_content,
                    audio_id: confirmI18n.audio_id,
                    template_id: confirmI18n.template_id
                };
            } else if (step.confirm_template) {
                content.confirm = {
                    text: step.confirm_template,
                    audio_id: step.confirm_audio_id,
                    template_id: step.confirm_template_id
                };
            }
        }
        
        // Get on_invalid message
        const invalidI18n = await this.getContent('step', step.id, 'on_invalid_text', language);
        if (invalidI18n) {
            content.on_invalid = {
                text: invalidI18n.text_content,
                audio_id: invalidI18n.audio_id,
                template_id: invalidI18n.template_id
            };
        } else if (step.on_invalid_text) {
            content.on_invalid = {
                text: step.on_invalid_text,
                audio_id: step.on_invalid_audio_id,
                template_id: step.on_invalid_template_id
            };
        }
        
        // Get on_empty message
        const emptyI18n = await this.getContent('step', step.id, 'on_empty_text', language);
        if (emptyI18n) {
            content.on_empty = {
                text: emptyI18n.text_content,
                audio_id: emptyI18n.audio_id
            };
        } else if (step.on_empty_text) {
            content.on_empty = {
                text: step.on_empty_text,
                audio_id: step.on_empty_audio_id
            };
        }
        
        return content;
    }
    
    /**
     * Get flow content with language resolution
     */
    async getFlowContent(flow, language) {
        const content = {
            intro: null,
            on_complete: null,
            on_cancel: null,
            anything_else: null,
            closing: null,
            on_error: null
        };
        
        // Intro
        const introI18n = await this.getContent('flow', flow.id, 'intro_text', language);
        if (introI18n) {
            content.intro = {
                text: introI18n.text_content,
                audio_id: introI18n.audio_id
            };
        } else if (flow.intro_text) {
            content.intro = {
                text: flow.intro_text,
                audio_id: flow.intro_audio_id
            };
        }
        
        // On complete
        const completeI18n = await this.getContent('flow', flow.id, 'on_complete_response_text', language);
        if (completeI18n) {
            content.on_complete = {
                text: completeI18n.text_content,
                audio_id: completeI18n.audio_id,
                template_id: completeI18n.template_id || flow.on_complete_template_id
            };
        } else if (flow.on_complete_response_text) {
            content.on_complete = {
                text: flow.on_complete_response_text,
                audio_id: flow.on_complete_audio_id,
                template_id: flow.on_complete_template_id
            };
        }
        
        // On cancel
        const cancelI18n = await this.getContent('flow', flow.id, 'on_cancel_text', language);
        if (cancelI18n) {
            content.on_cancel = {
                text: cancelI18n.text_content,
                audio_id: cancelI18n.audio_id
            };
        } else if (flow.on_cancel_text) {
            content.on_cancel = {
                text: flow.on_cancel_text,
                audio_id: flow.on_cancel_audio_id
            };
        }
        
        // Anything else
        const anythingI18n = await this.getContent('flow', flow.id, 'anything_else_text', language);
        if (anythingI18n) {
            content.anything_else = {
                text: anythingI18n.text_content,
                audio_id: anythingI18n.audio_id
            };
        } else if (flow.anything_else_text) {
            content.anything_else = {
                text: flow.anything_else_text,
                audio_id: flow.anything_else_audio_id
            };
        }
        
        // Closing
        const closingI18n = await this.getContent('flow', flow.id, 'closing_text', language);
        if (closingI18n) {
            content.closing = {
                text: closingI18n.text_content,
                audio_id: closingI18n.audio_id
            };
        } else if (flow.closing_text) {
            content.closing = {
                text: flow.closing_text,
                audio_id: flow.closing_audio_id
            };
        }
        
        return content;
    }
    
    /**
     * Resolve a segment by key
     */
    async resolveSegment(segmentKey, language) {
        const segment = await SegmentService.getSegmentByKey(this.agentId, segmentKey, language);
        
        if (!segment) {
            return null;
        }
        
        // Try requested language
        let content = segment.content[language];
        
        // Fall back to default
        if (!content) {
            content = segment.content[this.defaultLanguage];
        }
        
        // Fall back to English
        if (!content) {
            content = segment.content['en'];
        }
        
        return content;
    }
    
    /**
     * Get TTS voice for a language
     */
    getTTSVoice(language) {
        if (this.ttsConfig && this.ttsConfig.voices && this.ttsConfig.voices[language]) {
            return this.ttsConfig.voices[language];
        }
        
        // Fall back to default language voice
        if (this.ttsConfig && this.ttsConfig.voices && this.ttsConfig.voices[this.defaultLanguage]) {
            return this.ttsConfig.voices[this.defaultLanguage];
        }
        
        // Default voice
        return { voice_id: 'default', name: 'Default' };
    }
    
    /**
     * Check if language is supported
     */
    isLanguageSupported(language) {
        return this.supportedLanguages && this.supportedLanguages.includes(language);
    }
    
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

module.exports = ContentResolver;

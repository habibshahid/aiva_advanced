/**
 * Language Service
 * Manages languages for multi-language IVR support
 */

const db = require('../config/database');

class LanguageService {
    
    /**
     * Get all available languages
     */
    static async getLanguages(activeOnly = true) {
        let query = `SELECT * FROM yovo_tbl_aiva_languages`;
        
        if (activeOnly) {
            query += ` WHERE is_active = 1`;
        }
        
        query += ` ORDER BY sort_order, name`;
        
        const [languages] = await db.query(query);
        return languages;
    }
    
    /**
     * Get a language by code
     */
    static async getLanguage(code) {
        const [languages] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_languages WHERE code = ?`,
            [code]
        );
        
        return languages[0] || null;
    }
    
    /**
     * Check if a language is supported
     */
    static async isSupported(code) {
        const [result] = await db.query(
            `SELECT 1 FROM yovo_tbl_aiva_languages WHERE code = ? AND is_active = 1`,
            [code]
        );
        
        return result.length > 0;
    }
    
    /**
     * Detect language from text (simple heuristic-based)
     */
    static detectLanguage(text) {
        if (!text || typeof text !== 'string') {
            return 'en';
        }
        
        // Script-based detection
        
        // Urdu/Arabic script
        if (/[\u0600-\u06FF]/.test(text)) {
            // Urdu-specific characters
            if (/[\u0679\u067E\u0686\u0688\u0691\u06BA\u06BE\u06C1\u06C3\u06D2]/.test(text)) {
                return 'ur';
            }
            return 'ar';
        }
        
        // Hindi/Devanagari
        if (/[\u0900-\u097F]/.test(text)) {
            return 'hi';
        }
        
        // Gurmukhi (Punjabi)
        if (/[\u0A00-\u0A7F]/.test(text)) {
            return 'pa';
        }
        
        // Bengali
        if (/[\u0980-\u09FF]/.test(text)) {
            return 'bn';
        }
        
        // Tamil
        if (/[\u0B80-\u0BFF]/.test(text)) {
            return 'ta';
        }
        
        // Telugu
        if (/[\u0C00-\u0C7F]/.test(text)) {
            return 'te';
        }
        
        // Gujarati
        if (/[\u0A80-\u0AFF]/.test(text)) {
            return 'gu';
        }
        
        // Chinese
        if (/[\u4E00-\u9FFF]/.test(text)) {
            return 'zh';
        }
        
        // Roman Urdu detection (common words)
        const romanUrduWords = [
            'kya', 'hai', 'hain', 'nahi', 'aur', 'mein', 'main', 'aap',
            'mujhe', 'chahiye', 'haan', 'ji', 'theek', 'shukriya',
            'abhi', 'baad', 'pehle', 'phir', 'lekin', 'agar'
        ];
        
        const words = text.toLowerCase().split(/\s+/);
        const romanUrduCount = words.filter(w => romanUrduWords.includes(w)).length;
        
        if (romanUrduCount >= 2 || (words.length > 0 && romanUrduCount / words.length > 0.3)) {
            return 'ur-roman';
        }
        
        // Default to English
        return 'en';
    }
    
    /**
     * Get languages by region
     */
    static async getLanguagesByRegion(region) {
        const [languages] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_languages 
             WHERE region LIKE ? AND is_active = 1
             ORDER BY sort_order`,
            [`%${region}%`]
        );
        
        return languages;
    }
    
    /**
     * Get RTL languages
     */
    static async getRTLLanguages() {
        const [languages] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_languages 
             WHERE direction = 'rtl' AND is_active = 1
             ORDER BY sort_order`
        );
        
        return languages;
    }
    
    /**
     * Get agent's configured languages
     */
    static async getAgentLanguages(agentId) {
        // Get from agent_languages table
        const [agentLangs] = await db.query(`
            SELECT al.*, l.name, l.native_name, l.direction, l.region, al.language_code as code
            FROM yovo_tbl_aiva_agent_languages al
            JOIN yovo_tbl_aiva_languages l ON l.code = al.language_code
            WHERE al.agent_id = ?
            ORDER BY al.is_default DESC, l.sort_order
        `, [agentId]);
        
        // If no languages configured, return default English
        if (agentLangs.length === 0) {
            const [defaultLang] = await db.query(
                `SELECT * FROM yovo_tbl_aiva_languages WHERE code = 'en'`
            );
            
            if (defaultLang.length > 0) {
                return [{
                    ...defaultLang[0],
                    is_default: true,
                    tts_voice_id: null,
                    tts_provider: null
                }];
            }
            return [];
        }
        
        return agentLangs;
    }
    
    /**
     * Get agent's default language
     */
    static async getAgentDefaultLanguage(agentId) {
        const [result] = await db.query(`
            SELECT al.language_code, l.*
            FROM yovo_tbl_aiva_agent_languages al
            JOIN yovo_tbl_aiva_languages l ON l.code = al.language_code
            WHERE al.agent_id = ? AND al.is_default = 1
        `, [agentId]);
        
        if (result.length > 0) {
            return result[0];
        }
        
        // Fallback to English
        const [defaultLang] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_languages WHERE code = 'en'`
        );
        
        return defaultLang[0] || { code: 'en', name: 'English' };
    }
    
    /**
     * Update agent's languages
     */
    static async updateAgentLanguages(agentId, languageCodes, defaultLanguage = null) {
        // Get tenant_id for the agent
        const [agents] = await db.query(
            `SELECT tenant_id FROM yovo_tbl_aiva_agents WHERE id = ?`,
            [agentId]
        );
        
        if (agents.length === 0) {
            throw new Error('Agent not found');
        }
        
        // Delete existing languages
        await db.query(
            `DELETE FROM yovo_tbl_aiva_agent_languages WHERE agent_id = ?`,
            [agentId]
        );
        
        // Insert new languages
        if (languageCodes && languageCodes.length > 0) {
            const defaultLang = defaultLanguage || languageCodes[0];
            
            for (const code of languageCodes) {
                await db.query(`
                    INSERT INTO yovo_tbl_aiva_agent_languages 
                    (agent_id, language_code, is_default)
                    VALUES (?, ?, ?)
                `, [agentId, code, code === defaultLang ? 1 : 0]);
            }
        }
        
        return this.getAgentLanguages(agentId);
    }
    
    /**
     * Add a language to an agent
     */
    static async addAgentLanguage(agentId, languageCode, isDefault = false) {
        // Check if language exists
        const language = await this.getLanguage(languageCode);
        if (!language) {
            throw new Error(`Language not found: ${languageCode}`);
        }
        
        // Check if already added
        const [existing] = await db.query(
            `SELECT 1 FROM yovo_tbl_aiva_agent_languages WHERE agent_id = ? AND language_code = ?`,
            [agentId, languageCode]
        );
        
        if (existing.length > 0) {
            // Update if setting as default
            if (isDefault) {
                await this.setAgentDefaultLanguage(agentId, languageCode);
            }
            return this.getAgentLanguages(agentId);
        }
        
        // If setting as default, clear other defaults first
        if (isDefault) {
            await db.query(
                `UPDATE yovo_tbl_aiva_agent_languages SET is_default = 0 WHERE agent_id = ?`,
                [agentId]
            );
        }
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_agent_languages 
            (agent_id, language_code, is_default)
            VALUES (?, ?, ?)
        `, [agentId, languageCode, isDefault ? 1 : 0]);
        
        return this.getAgentLanguages(agentId);
    }
    
    /**
     * Remove a language from an agent
     */
    static async removeAgentLanguage(agentId, languageCode) {
        // Check if it's the default
        const [existing] = await db.query(
            `SELECT is_default FROM yovo_tbl_aiva_agent_languages WHERE agent_id = ? AND language_code = ?`,
            [agentId, languageCode]
        );
        
        if (existing.length === 0) {
            return this.getAgentLanguages(agentId);
        }
        
        await db.query(
            `DELETE FROM yovo_tbl_aiva_agent_languages WHERE agent_id = ? AND language_code = ?`,
            [agentId, languageCode]
        );
        
        // If was default, set first remaining as default
        if (existing[0].is_default) {
            const [remaining] = await db.query(
                `SELECT language_code FROM yovo_tbl_aiva_agent_languages WHERE agent_id = ? LIMIT 1`,
                [agentId]
            );
            
            if (remaining.length > 0) {
                await db.query(
                    `UPDATE yovo_tbl_aiva_agent_languages SET is_default = 1 WHERE agent_id = ? AND language_code = ?`,
                    [agentId, remaining[0].language_code]
                );
            }
        }
        
        return this.getAgentLanguages(agentId);
    }
    
    /**
     * Set agent's default language
     */
    static async setAgentDefaultLanguage(agentId, languageCode) {
        // Clear existing default
        await db.query(
            `UPDATE yovo_tbl_aiva_agent_languages SET is_default = 0 WHERE agent_id = ?`,
            [agentId]
        );
        
        // Set new default
        await db.query(
            `UPDATE yovo_tbl_aiva_agent_languages SET is_default = 1 WHERE agent_id = ? AND language_code = ?`,
            [agentId, languageCode]
        );
        
        return this.getAgentLanguages(agentId);
    }
    
    /**
     * Update TTS voice for an agent language
     */
    static async updateAgentLanguageVoice(agentId, languageCode, voiceId, provider = 'elevenlabs') {
        await db.query(`
            UPDATE yovo_tbl_aiva_agent_languages 
            SET tts_voice_id = ?, tts_provider = ?
            WHERE agent_id = ? AND language_code = ?
        `, [voiceId, provider, agentId, languageCode]);
        
        return this.getAgentLanguages(agentId);
    }
    
    /**
	 * Get language coverage statistics for an agent
	 */
	static async getAgentLanguageCoverage(agentId) {
		try {
			// Get agent's configured languages
			const agentLanguages = await this.getAgentLanguages(agentId);
			
			// Get segment counts per language from the actual segments table
			const [segmentStats] = await db.query(`
				SELECT 
					language,
					COUNT(*) as segment_count,
					COUNT(CASE WHEN audio_id IS NOT NULL THEN 1 END) as with_audio
				FROM yovo_tbl_aiva_ivr_segments
				WHERE agent_id = ?
				GROUP BY language
			`, [agentId]);
			
			// Get total unique segment keys for this agent
			const [totalSegments] = await db.query(`
				SELECT COUNT(DISTINCT segment_key) as total
				FROM yovo_tbl_aiva_ivr_segments
				WHERE agent_id = ?
			`, [agentId]);
			
			const total = totalSegments[0]?.total || 0;
			
			// Build coverage per language
			const coverage = {};
			for (const lang of agentLanguages) {
				const stats = segmentStats.find(s => s.language === lang.language_code) || {
					segment_count: 0,
					with_audio: 0
				};
				
				coverage[lang.language_code] = {
					language_code: lang.language_code,
					code: lang.language_code,
					language_name: lang.language_name || lang.native_name,
					total_segments: total,
					translated_segments: stats.segment_count,
					with_audio: stats.with_audio,
					coverage_percent: total > 0 ? Math.round((stats.segment_count / total) * 100) : 0,
					audio_percent: stats.segment_count > 0 ? Math.round((stats.with_audio / stats.segment_count) * 100) : 0
				};
			}
			
			return {
				agent_id: agentId,
				total_segments: total,
				languages: agentLanguages,
				coverage
			};
		} catch (error) {
			console.error('Get coverage error:', error);
			// Return empty coverage instead of throwing
			return {
				agent_id: agentId,
				total_segments: 0,
				languages: [],
				coverage: {}
			};
		}
	}
}

module.exports = LanguageService;
/**
 * Segment Service
 * Manages audio segments with multi-language support
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class SegmentService {
    
    /**
     * List all segments for an agent
     */
    static async listSegments(agentId, options = {}) {
        const {
            includeContent = true,
            language = null,
            type = null,
            search = null,
            includeGlobal = true
        } = options;
        
        let query = `
            SELECT 
                s.*,
                COUNT(DISTINCT sc.language_code) AS language_count,
                COUNT(DISTINCT CASE WHEN sc.audio_id IS NOT NULL THEN sc.language_code END) AS audio_count
            FROM yovo_tbl_aiva_ivr_segments s
            LEFT JOIN yovo_tbl_aiva_ivr_segment_content sc ON s.id = sc.segment_id
            WHERE s.is_active = 1
        `;
        
        const params = [];
        
        if (includeGlobal) {
            // Get agent's tenant_id first
            const [agents] = await db.query(
                'SELECT tenant_id FROM yovo_tbl_aiva_agents WHERE id = ?',
                [agentId]
            );
            const tenantId = agents[0]?.tenant_id;
            
            query += ` AND (s.agent_id = ? OR (s.is_global = 1 AND s.tenant_id = ?))`;
            params.push(agentId, tenantId);
        } else {
            query += ` AND s.agent_id = ?`;
            params.push(agentId);
        }
        
        if (type) {
            query += ` AND s.segment_type = ?`;
            params.push(type);
        }
        
        if (search) {
            query += ` AND (s.segment_key LIKE ? OR s.description LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }
        
        query += ` GROUP BY s.id ORDER BY s.segment_key`;
        
        const [segments] = await db.query(query, params);
        
        // Fetch content for each segment if requested
        if (includeContent && segments.length > 0) {
            const segmentIds = segments.map(s => s.id);
            
            let contentQuery = `
                SELECT sc.*, l.name AS language_name, l.native_name, l.direction
                FROM yovo_tbl_aiva_ivr_segment_content sc
                JOIN yovo_tbl_aiva_languages l ON sc.language_code = l.code
                WHERE sc.segment_id IN (?)
            `;
            const contentParams = [segmentIds];
            
            if (language) {
                contentQuery += ` AND sc.language_code = ?`;
                contentParams.push(language);
            }
            
            const [contents] = await db.query(contentQuery, contentParams);
            
            // Map content to segments
            const contentMap = {};
            for (const content of contents) {
                if (!contentMap[content.segment_id]) {
                    contentMap[content.segment_id] = {};
                }
                contentMap[content.segment_id][content.language_code] = content;
            }
            
            for (const segment of segments) {
                segment.content = contentMap[segment.id] || {};
            }
        }
        
        return segments;
    }
    
    /**
     * Get a single segment by ID
     */
    static async getSegment(segmentId) {
        const [segments] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_segments WHERE id = ?`,
            [segmentId]
        );
        
        if (segments.length === 0) {
            return null;
        }
        
        const segment = segments[0];
        
        // Get all content
        const [contents] = await db.query(`
            SELECT sc.*, l.name AS language_name, l.native_name, l.direction
            FROM yovo_tbl_aiva_ivr_segment_content sc
            JOIN yovo_tbl_aiva_languages l ON sc.language_code = l.code
            WHERE sc.segment_id = ?
        `, [segmentId]);
        
        segment.content = {};
        for (const content of contents) {
            segment.content[content.language_code] = content;
        }
        
        return segment;
    }
    
    /**
     * Get segment by key
     */
    static async getSegmentByKey(agentId, segmentKey, language = null) {
        // Get agent's tenant_id
        const [agents] = await db.query(
            'SELECT tenant_id FROM yovo_tbl_aiva_agents WHERE id = ?',
            [agentId]
        );
        const tenantId = agents[0]?.tenant_id;
        
        const [segments] = await db.query(`
            SELECT s.*
            FROM yovo_tbl_aiva_ivr_segments s
            WHERE s.segment_key = ? 
              AND s.is_active = 1
              AND (s.agent_id = ? OR (s.is_global = 1 AND s.tenant_id = ?))
            ORDER BY s.agent_id = ? DESC
            LIMIT 1
        `, [segmentKey, agentId, tenantId, agentId]);
        
        if (segments.length === 0) {
            return null;
        }
        
        const segment = segments[0];
        
        // Get content for requested language (or all)
        let contentQuery = `
            SELECT sc.*, l.name AS language_name
            FROM yovo_tbl_aiva_ivr_segment_content sc
            JOIN yovo_tbl_aiva_languages l ON sc.language_code = l.code
            WHERE sc.segment_id = ?
        `;
        const params = [segment.id];
        
        if (language) {
            contentQuery += ` AND sc.language_code = ?`;
            params.push(language);
        }
        
        const [contents] = await db.query(contentQuery, params);
        
        segment.content = {};
        for (const content of contents) {
            segment.content[content.language_code] = content;
        }
        
        return segment;
    }
    
    /**
     * Create a new segment
     */
    static async createSegment(agentId, tenantId, data) {
        const id = uuidv4();
        
        // Check for duplicate key
        const [existing] = await db.query(
            `SELECT id FROM yovo_tbl_aiva_ivr_segments 
             WHERE agent_id = ? AND segment_key = ? AND is_active = 1`,
            [agentId, data.segment_key]
        );
        
        if (existing.length > 0) {
            throw new Error(`Segment with key "${data.segment_key}" already exists`);
        }
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_segments 
            (id, agent_id, tenant_id, segment_key, segment_type, description, is_global)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            agentId,
            tenantId,
            data.segment_key,
            data.segment_type || 'standalone',
            data.description || null,
            data.is_global ? 1 : 0
        ]);
        
        // Add content for each language if provided
        if (data.content) {
            for (const [langCode, content] of Object.entries(data.content)) {
                await this.setSegmentContent(id, langCode, content);
            }
        }
        
        return this.getSegment(id);
    }
    
    /**
     * Update a segment
     */
    static async updateSegment(segmentId, data) {
        const updates = [];
        const params = [];
        
        if (data.segment_key !== undefined) {
            updates.push('segment_key = ?');
            params.push(data.segment_key);
        }
        if (data.segment_type !== undefined) {
            updates.push('segment_type = ?');
            params.push(data.segment_type);
        }
        if (data.description !== undefined) {
            updates.push('description = ?');
            params.push(data.description);
        }
        if (data.is_global !== undefined) {
            updates.push('is_global = ?');
            params.push(data.is_global ? 1 : 0);
        }
        
        if (updates.length > 0) {
            params.push(segmentId);
            await db.query(
                `UPDATE yovo_tbl_aiva_ivr_segments SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
        }
        
        // Update content if provided
        if (data.content) {
            for (const [langCode, content] of Object.entries(data.content)) {
                await this.setSegmentContent(segmentId, langCode, content);
            }
        }
        
        return this.getSegment(segmentId);
    }
    
    /**
     * Set content for a specific language
     */
    static async setSegmentContent(segmentId, languageCode, content) {
        const id = uuidv4();
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_segment_content 
            (id, segment_id, language_code, text_content, audio_id, audio_source, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                text_content = VALUES(text_content),
                audio_id = VALUES(audio_id),
                audio_source = VALUES(audio_source),
                duration_ms = VALUES(duration_ms)
        `, [
            id,
            segmentId,
            languageCode,
            content.text_content,
            content.audio_id || null,
            content.audio_source || 'generated',
            content.duration_ms || null
        ]);
    }
    
    /**
     * Delete segment content for a language
     */
    static async deleteSegmentContent(segmentId, languageCode) {
        await db.query(
            `DELETE FROM yovo_tbl_aiva_ivr_segment_content 
             WHERE segment_id = ? AND language_code = ?`,
            [segmentId, languageCode]
        );
    }
    
    /**
     * Delete a segment (soft delete)
     */
    static async deleteSegment(segmentId) {
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_segments SET is_active = 0 WHERE id = ?`,
            [segmentId]
        );
    }
    
    /**
     * Get language coverage for an agent's segments
     */
    static async getLanguageCoverage(agentId) {
        const [coverage] = await db.query(`
            SELECT 
                language_code,
                language_name,
                COUNT(*) AS total_segments,
                SUM(has_content) AS translated_segments,
                SUM(has_audio) AS segments_with_audio,
                ROUND(SUM(has_content) * 100.0 / COUNT(*), 1) AS coverage_percent
            FROM vw_segment_language_coverage
            WHERE agent_id = ?
            GROUP BY language_code, language_name
            ORDER BY coverage_percent DESC
        `, [agentId]);
        
        return coverage;
    }
    
    /**
     * Get missing translations for a language
     */
    static async getMissingTranslations(agentId, languageCode) {
        const [missing] = await db.query(`
            SELECT segment_id, segment_key, segment_type
            FROM vw_segment_language_coverage
            WHERE agent_id = ? AND language_code = ? AND has_content = 0
            ORDER BY segment_key
        `, [agentId, languageCode]);
        
        return missing;
    }
    
    /**
     * Bulk create segments
     */
    static async bulkCreateSegments(agentId, tenantId, segments) {
        const results = [];
        
        for (const segmentData of segments) {
            try {
                const segment = await this.createSegment(agentId, tenantId, segmentData);
                results.push({ success: true, segment });
            } catch (error) {
                results.push({ 
                    success: false, 
                    segment_key: segmentData.segment_key,
                    error: error.message 
                });
            }
        }
        
        return results;
    }
    
    /**
     * Increment usage count
     */
    static async incrementUsage(segmentId) {
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_segments SET usage_count = usage_count + 1 WHERE id = ?`,
            [segmentId]
        );
    }
}

module.exports = SegmentService;

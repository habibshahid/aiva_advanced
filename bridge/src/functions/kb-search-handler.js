/**
 * Knowledge Base Search Function
 * Allows voice agents to search knowledge bases during calls
 * 
 * File: bridge/src/functions/kb-search-handler.js
 */

const axios = require('axios');
const logger = require('../utils/logger');

class KBSearchHandler {
    constructor() {
        this.managementApiUrl = process.env.MANAGEMENT_API_URL || 'http://localhost:4000/api';
        this.managementApiKey = process.env.MANAGEMENT_API_KEY;
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 minute cache
    }

    /**
     * Search knowledge base
     * Called by OpenAI Realtime API during voice calls
     * 
     * @param {Object} args - Function arguments from OpenAI
     * @param {string} args.query - Search query
     * @param {number} args.top_k - Number of results (default: 3)
     * @param {Object} context - Call context
     * @param {string} context.agentId - Agent ID
     * @param {string} context.tenantId - Tenant ID
     * @param {string} context.sessionId - Call session ID
     * @returns {Promise<Object>} Search results formatted for voice
     */
    async searchKnowledge(args, context) {
        const startTime = Date.now();
        
        try {
            const { query, top_k = 3 } = args;
            
            if (!query) {
                return {
                    success: false,
                    message: "I need a search query to look up information."
                };
            }

            logger.info(`[KB-SEARCH] Query: "${query}" | Agent: ${context.agentId}`);

            // Get agent to find kb_id
            const agent = await this.getAgent(context.agentId);
            
            if (!agent) {
                return {
                    success: false,
                    message: "I couldn't access the knowledge base. Agent not found."
                };
            }

            if (!agent.kb_id) {
                return {
                    success: false,
                    message: "This agent doesn't have a knowledge base configured."
                };
            }

            // Check cache first
            const cacheKey = `${agent.kb_id}:${query}:${top_k}`;
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                logger.debug('[KB-SEARCH] Using cached results');
                return cached.data;
            }

            // Search knowledge base
            const searchResults = await this.performSearch({
                kb_id: agent.kb_id,
                query: query,
                top_k: top_k
            });

            // Format results for voice conversation
            const formattedResults = this.formatForVoice(searchResults, query);

            // Cache results
            this.cache.set(cacheKey, {
                data: formattedResults,
                timestamp: Date.now()
            });

            const processingTime = Date.now() - startTime;
            logger.info(`[KB-SEARCH] Completed in ${processingTime}ms | Found: ${searchResults.returned} results`);

            return formattedResults;

        } catch (error) {
            logger.error('[KB-SEARCH] Error:', error.message);
            return {
                success: false,
                message: "I encountered an error while searching the knowledge base. Please try rephrasing your question.",
                error: error.message
            };
        }
    }

    /**
     * Get agent details
     * @private
     */
    async getAgent(agentId) {
        try {
            const response = await axios.get(
                `${this.managementApiUrl}/agents/${agentId}`,
                {
                    headers: {
                        'X-API-Key': this.managementApiKey
                    },
                    timeout: 5000
                }
            );

            return response.data.data;
        } catch (error) {
            logger.error('[KB-SEARCH] Failed to get agent:', error.message);
            return null;
        }
    }

    /**
     * Perform knowledge base search
     * @private
     */
    async performSearch({ kb_id, query, top_k }) {
        try {
            const response = await axios.post(
                `${this.managementApiUrl}/knowledge/search`,
                {
                    kb_id: kb_id,
                    query: query,
                    top_k: top_k,
                    search_type: 'text'
                },
                {
                    headers: {
                        'X-API-Key': this.managementApiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            return response.data.data;
        } catch (error) {
            logger.error('[KB-SEARCH] Search API error:', error.message);
            throw error;
        }
    }

    /**
     * Format search results for voice conversation
     * Makes results natural and easy to speak
     * @private
     */
    formatForVoice(searchResults, originalQuery) {
        if (!searchResults.text_results || searchResults.text_results.length === 0) {
            return {
                success: false,
                message: `I couldn't find any information about "${originalQuery}" in the knowledge base.`,
                query: originalQuery,
                results_found: 0
            };
        }

        const results = searchResults.text_results;
        const topResult = results[0];

        // Build a natural response
        let voiceResponse = '';
        let detailedInfo = [];

        // Add top result content (truncate for voice)
        const topContent = this.truncateForVoice(topResult.content, 300);
        voiceResponse = `Based on the knowledge base: ${topContent}`;

        // Add structured info for context
        results.forEach((result, index) => {
            detailedInfo.push({
                rank: index + 1,
                content: result.content,
                source: result.source?.document_name || 'Unknown',
                relevance: Math.round(result.score * 100),
                page: result.source?.page
            });
        });

        return {
            success: true,
            message: voiceResponse,
            query: originalQuery,
            results_found: results.length,
            top_relevance: Math.round(topResult.score * 100),
            sources: detailedInfo.map(r => r.source).filter((v, i, a) => a.indexOf(v) === i), // Unique sources
            detailed_results: detailedInfo,
            instructions_for_agent: `Use this information to answer the user's question about "${originalQuery}". Speak naturally and don't mention that you're reading from a knowledge base.`
        };
    }

    /**
     * Truncate text for voice (remove excessive detail)
     * @private
     */
    truncateForVoice(text, maxLength = 300) {
        if (!text) return '';
        
        // Clean up text
        text = text
            .replace(/\s+/g, ' ')  // Multiple spaces to single
            .replace(/\n+/g, '. ') // Newlines to periods
            .trim();

        if (text.length <= maxLength) {
            return text;
        }

        // Truncate at sentence boundary
        const truncated = text.substring(0, maxLength);
        const lastPeriod = truncated.lastIndexOf('.');
        const lastQuestion = truncated.lastIndexOf('?');
        const lastExclamation = truncated.lastIndexOf('!');
        
        const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclamation);
        
        if (lastSentence > maxLength * 0.7) {
            return text.substring(0, lastSentence + 1);
        }

        return truncated + '...';
    }

    /**
     * Clear cache (call periodically)
     */
    clearCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.cache.delete(key);
            }
        }
    }
}

module.exports = KBSearchHandler;
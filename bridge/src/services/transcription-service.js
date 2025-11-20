/**
 * Transcription Service - Saves transcriptions to MongoDB
 */

const mongoClient = require('../config/mongodb-config');
const logger = require('../utils/logger');
const axios = require('axios');

class TranscriptionService {
    constructor() {
        this.collection = null;
		this.apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
        this.sequenceCounters = new Map(); // Track message sequence per session
    }
    
    async initialize() {
        try {
            await mongoClient.connect();
            this.collection = mongoClient.getCollection('interactiontranscriptions');
            logger.info('Transcription service initialized');
        } catch (error) {
            logger.error('Failed to initialize transcription service:', error);
            throw error;
        }
    }
    
    /**
	 * Save a transcription entry
	 * @param {string} interactionId - Unique interaction/session ID
	 * @param {string} speaker - 'agent' or 'customer'
	 * @param {string} phoneNumber - Customer phone number (for customer speaker_id)
	 * @param {string} originalText - The transcribed text
	 * @param {number} port - The RTP port number
	 */
	async saveTranscription(interactionId, speaker, phoneNumber, originalText, port) {
		try {
			const timestamp = Date.now();
			
			// Build speaker_id based on speaker type
			let speakerId;
			if (speaker === 'agent') {
				speakerId = 'agent_aivaCall';
			} else {
				speakerId = `customer_${phoneNumber}`;
			}
			
			// Create transcription entry matching your format
			const transcriptionEntry = {
				[timestamp]: {
					speaker_id: speakerId,
					original_text: originalText,
					translated_text: '', // Empty as requested
					sentiment: {
						score: 0,
						sentiment: ''
					},
					profanity: {
						score: 0,
						words: []
					},
					intent: [],
					language: '',
					usage: {},
					port: port
				}
			};
			
			// Use upsert with proper operators
			const result = await this.collection.updateOne(
				{ 
					interactionId: interactionId,
					transcriptionVersion: 'recorded'
				},
				{
					$setOnInsert: {
						interactionId: interactionId,
						transcriptionVersion: 'recorded'
					},
					$push: {
						transcription: transcriptionEntry
					}
				},
				{ upsert: true }
			);
			
			logger.debug(`Transcription saved in Mongo: ${interactionId} | ${speakerId} | "${originalText}"`);
			
			
			// Get or initialize sequence number for this session
			if (!this.sequenceCounters.has(interactionId)) {
				this.sequenceCounters.set(interactionId, 0);
			}
			const sequenceNumber = this.sequenceCounters.get(interactionId) + 1;
			this.sequenceCounters.set(interactionId, sequenceNumber);
			
			// Call API to save transcription
			await axios.post(`${this.apiBaseUrl}/api/transcriptions/call`, {
				session_id: interactionId,
				speaker: speaker,
				speaker_id: speakerId,
				sequence_number: sequenceNumber,
				original_message: originalText,
				timestamp: timestamp,
				analyze_now: true // Enable real-time analysis
			});
			
			logger.debug(`Transcription saved in MySQL: ${interactionId} | ${speakerId} | #${sequenceNumber} | "${originalText}"`);
			
			return result;
			
		} catch (error) {
			logger.error('Error saving transcription:', error);
			throw error;
		}
	}
    
    /**
     * Get transcription by interaction ID
     */
    async getTranscription(interactionId) {
        try {
            const doc = await this.collection.findOne({
                interactionId: interactionId,
                transcriptionVersion: 'recorded'
            });
            
            return doc;
            
        } catch (error) {
            logger.error('Error getting transcription:', error);
            return null;
        }
    }
    
    /**
     * Get all transcriptions for a date range
     */
    async getTranscriptionsByDateRange(startDate, endDate) {
        try {
            const docs = await this.collection.find({
                transcriptionVersion: 'recorded',
                'transcription.timestamp': {
                    $gte: startDate.getTime(),
                    $lte: endDate.getTime()
                }
            }).toArray();
            
            return docs;
            
        } catch (error) {
            logger.error('Error getting transcriptions by date:', error);
            return [];
        }
    }
	
	/**
	 * Trigger session analytics generation when call ends
	 * @param {string} sessionId - Session ID
	 * @param {string} callLogId - Call log ID
	 */
	async generateSessionAnalytics(sessionId, callLogId) {
		try {
			logger.info(`Generating session analytics for call: ${callLogId}`);
			
			await axios.post(`${this.apiBaseUrl}/api/analytics/call/${callLogId}/generate`);
			
			// Clean up sequence counter
			this.sequenceCounters.delete(sessionId);
			
			logger.info(`Session analytics generated for call: ${callLogId}`);
			
		} catch (error) {
			logger.error('Error generating session analytics:', error.message);
		}
	}
}

module.exports = new TranscriptionService();
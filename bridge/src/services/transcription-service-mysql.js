/**
 * Transcription Service for Bridge - Updated to save to MySQL
 * Saves transcriptions to yovo_tbl_aiva_call_transcriptions table
 */

const axios = require('axios');
const logger = require('../utils/logger');

class TranscriptionService {
    constructor() {
        this.apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
        this.sequenceCounters = new Map(); // Track message sequence per session
    }
    
    /**
	 * Save a transcription entry to MySQL via API
	 * @param {string} sessionId - Unique interaction/session ID
	 * @param {string} speaker - 'agent' or 'customer'
	 * @param {string} phoneNumber - Customer phone number (for customer speaker_id)
	 * @param {string} originalText - The transcribed text
	 * @param {number} port - The RTP port number
	 */
	async saveTranscription(sessionId, speaker, phoneNumber, originalText, port) {
		try {
			// Build speaker_id based on speaker type
			let speakerId;
			if (speaker === 'agent') {
				speakerId = 'agent_aivaCall';
			} else {
				speakerId = `customer_${phoneNumber}`;
			}
			
			// Get or initialize sequence number for this session
			if (!this.sequenceCounters.has(sessionId)) {
				this.sequenceCounters.set(sessionId, 0);
			}
			const sequenceNumber = this.sequenceCounters.get(sessionId) + 1;
			this.sequenceCounters.set(sessionId, sequenceNumber);
			
			// Current timestamp in milliseconds
			const timestamp = Date.now();
			
			// Call API to save transcription
			await axios.post(`${this.apiBaseUrl}/api/transcriptions/call`, {
				session_id: sessionId,
				speaker: speaker,
				speaker_id: speakerId,
				sequence_number: sequenceNumber,
				original_message: originalText,
				timestamp: timestamp,
				analyze_now: true // Enable real-time analysis
			});
			
			logger.debug(`Transcription saved: ${sessionId} | ${speakerId} | #${sequenceNumber} | "${originalText}"`);
			
		} catch (error) {
			logger.error('Error saving transcription to MySQL:', error.message);
			// Don't throw - we don't want transcription errors to break the call
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

/**
 * Audio Routes
 * API endpoints for audio file serving and audio message handling
 */

require('dotenv').config();
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const AudioService = require('../services/AudioService');
const ChatService = require('../services/ChatService');
const CreditService = require('../services/CreditService');
const ResponseBuilder = require('../utils/response-builder');

// Configure multer for audio uploads
const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB max (Whisper API limit)
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
            'audio/wav', 'audio/wave', 'audio/x-wav',
            'audio/webm', 'audio/ogg', 'audio/flac',
            'video/mp4', 'video/webm' // For video with audio
        ];
        
        const allowedExtensions = [
            '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', 
            '.wav', '.webm', '.ogg', '.flac'
        ];
        
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid audio format. Allowed: ${allowedExtensions.join(', ')}`), false);
        }
    }
});

// Authentication middleware
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (apiKey) {
        return verifyApiKey(req, res, next);
    } else {
        return verifyToken(req, res, next);
    }
};

// ============================================
// AUDIO FILE SERVING
// ============================================

/**
 * @route GET /api/audio/output/:filename
 * @desc Serve TTS generated audio files
 * @access Public (files are short-lived)
 */
router.get('/output/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        
        // Sanitize filename to prevent path traversal
        const sanitizedFilename = path.basename(filename);
        const audioFile = AudioService.getAudioFile(sanitizedFilename, 'output');
        
        if (!audioFile) {
            return res.status(404).json({
                success: false,
                error: 'Audio file not found'
            });
        }
        
        // Determine content type
        const ext = path.extname(sanitizedFilename).toLowerCase();
        const contentTypes = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.opus': 'audio/opus',
            '.aac': 'audio/aac',
            '.flac': 'audio/flac',
            '.pcm': 'audio/pcm'
        };
        
        const contentType = contentTypes[ext] || 'audio/mpeg';
        
        // Set headers
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', audioFile.size);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        // Stream file
        const readStream = fs.createReadStream(audioFile.path);
        readStream.pipe(res);
        
    } catch (error) {
        console.error('Audio serve error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve audio file'
        });
    }
});

// ============================================
// SPEECH-TO-TEXT (Transcription)
// ============================================

/**
 * @route POST /api/audio/transcribe
 * @desc Transcribe audio file to text
 * @access Private
 */
router.post('/transcribe', authenticate, audioUpload.single('audio'), async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        if (!req.file) {
            return res.status(400).json(
                ResponseBuilder.badRequest('No audio file provided')
            );
        }
        
        const { language, provider } = req.body;
        
        // Check credits
        const tenantId = req.user.tenant_id || req.user.id;
        const balance = await CreditService.getBalance(tenantId);
        
        if (balance < 0.01) {
            return res.status(402).json(
                ResponseBuilder.insufficientCredits(balance)
            );
        }
        
        // Transcribe
        const result = await AudioService.transcribe({
            audio: req.file.buffer,
            filename: req.file.originalname,
            language: language || null,
            provider: provider || 'openai'
        });
        
        // Deduct credits
        if (result.cost.final_cost > 0) {
            await CreditService.deductCredits(
                tenantId,
                result.cost.final_cost,
                'audio_transcription',
                {
                    filename: req.file.originalname,
                    duration: result.duration,
                    provider: result.provider
                }
            );
        }
        
        res.json(rb.success({
            text: result.text,
            language: result.language,
            duration: result.duration,
            duration_minutes: result.duration_minutes,
            provider: result.provider,
            model: result.model,
            segments: result.segments,
            cost: result.cost.final_cost,
            cost_breakdown: result.cost
        }));
        
    } catch (error) {
        console.error('Transcription error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

// ============================================
// TEXT-TO-SPEECH (Synthesis)
// ============================================

/**
 * @route POST /api/audio/synthesize
 * @desc Convert text to speech
 * @access Private
 */
router.post('/synthesize', authenticate, async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        const { text, voice, model, speed, format } = req.body;
        
        if (!text || text.trim().length === 0) {
            return res.status(400).json(
                ResponseBuilder.badRequest('Text is required')
            );
        }
        
        // Check credits
        const tenantId = req.user.tenant_id || req.user.id;
        const balance = await CreditService.getBalance(tenantId);
        
        if (balance < 0.01) {
            return res.status(402).json(
                ResponseBuilder.insufficientCredits(balance)
            );
        }
        
        // Synthesize
        const result = await AudioService.synthesize({
            text: text,
            voice: voice || 'nova',
            model: model || 'tts-1',
            speed: parseFloat(speed) || 1.0,
            format: format || 'mp3'
        });
        
        // Deduct credits
        if (result.cost.final_cost > 0) {
            await CreditService.deductCredits(
                tenantId,
                result.cost.final_cost,
                'audio_synthesis',
                {
                    character_count: result.character_count,
                    voice: result.voice,
                    model: result.model
                }
            );
        }
        
        res.json(rb.success({
            audio_url: result.audio_url,
            audio_id: result.audio_id,
            format: result.format,
            voice: result.voice,
            model: result.model,
            character_count: result.character_count,
            estimated_duration: result.estimated_duration,
            file_size_bytes: result.file_size_bytes,
            cost: result.cost.final_cost,
            cost_breakdown: result.cost
        }));
        
    } catch (error) {
        console.error('Synthesis error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

// ============================================
// AUDIO CHAT MESSAGE
// ============================================

/**
 * @route POST /api/audio/chat/message
 * @desc Send audio message and get audio + text response
 * @access Private
 * 
 * This is the main endpoint for audio chat:
 * 1. Receives audio file
 * 2. Transcribes to text (STT)
 * 3. Processes via ChatService
 * 4. Generates audio response (TTS)
 * 5. Returns both text and audio
 */
router.post('/chat/message', authenticate, audioUpload.single('audio'), async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        if (!req.file) {
            return res.status(400).json(
                ResponseBuilder.badRequest('No audio file provided')
            );
        }
        
        const { 
            session_id, 
            agent_id, 
            language,
            voice,
            tts_model,
            tts_speed,
            stt_provider,
            generate_audio_response
        } = req.body;
        
        // Validate
        if (!agent_id) {
            return res.status(400).json(
                ResponseBuilder.badRequest('agent_id is required')
            );
        }
        
        // Check credits
        const tenantId = req.user.tenant_id || req.user.id;
        const balance = await CreditService.getBalance(tenantId);
        
        if (balance < 0.05) { // Audio requires more credits
            return res.status(402).json(
                ResponseBuilder.insufficientCredits(balance)
            );
        }
        
        const shouldGenerateAudio = generate_audio_response !== 'false' && generate_audio_response !== false;
        
        console.log('🎤 Processing audio chat message...');
        
        // Step 1: Transcribe audio
        const transcription = await AudioService.transcribe({
            audio: req.file.buffer,
            filename: req.file.originalname,
            language: language || null,
            provider: stt_provider || 'openai'
        });
        
        if (!transcription.success || !transcription.text) {
            return res.status(400).json(
                ResponseBuilder.badRequest('Failed to transcribe audio or audio was empty')
            );
        }
        
        console.log(`📝 Transcribed: "${transcription.text.substring(0, 100)}..."`);
        
        // Step 2: Process via ChatService
        const chatResult = await ChatService.sendMessage({
            sessionId: session_id,
            agentId: agent_id,
            message: transcription.text,
            image: null,
            userId: req.user.id,
            channelInfo: session_id ? null : {
                channel: 'voice',
                channelUserId: req.user.id,
                channelUserName: req.user.name || req.user.email
            }
        });
        
        // Step 3: Generate TTS response (if requested)
        let audioResponse = null;
        let ttsCost = 0;
        
        if (shouldGenerateAudio && chatResult.response?.text) {
            audioResponse = await AudioService.synthesize({
                text: chatResult.response.text,
                voice: voice || 'nova',
                model: tts_model || 'tts-1',
                speed: parseFloat(tts_speed) || 1.0,
                format: 'mp3',
                sessionId: chatResult.session_id
            });
            
            ttsCost = audioResponse.cost.final_cost;
        }
        
        // Calculate total cost
        const totalAudioCost = transcription.cost.final_cost + ttsCost;
        const totalCost = chatResult.cost + totalAudioCost;
        
        // Deduct credits for audio operations
        if (totalAudioCost > 0) {
            await CreditService.deductCredits(
                tenantId,
                totalAudioCost,
                'audio_chat',
                {
                    stt_cost: transcription.cost.final_cost,
                    tts_cost: ttsCost,
                    session_id: chatResult.session_id
                }
            );
        }
        
        // Get updated balance
        const newBalance = await CreditService.getBalance(tenantId);
        
        res.json(rb.success({
            session_id: chatResult.session_id,
            message_id: chatResult.message_id,
            agent_transfer: chatResult.agent_transfer,
            interaction_closed: chatResult.interaction_closed,
            
            // Transcription (input)
            transcription: {
                text: transcription.text,
                language: transcription.language,
                duration: transcription.duration,
                provider: transcription.provider
            },
            
            // Text response
            response: chatResult.response,
            
            // Audio response (output)
            audio_response: audioResponse ? {
                url: audioResponse.audio_url,
                audio_id: audioResponse.audio_id,
                format: audioResponse.format,
                voice: audioResponse.voice,
                estimated_duration: audioResponse.estimated_duration
            } : null,
            
            // Sources, products, etc. from chat
            sources: chatResult.sources,
            images: chatResult.images,
            products: chatResult.products,
            function_calls: chatResult.function_calls,
            
            // LLM decision
            llm_decision: chatResult.llm_decision,
            
            // Costs
            cost: {
                total: totalCost,
                chat: chatResult.cost,
                stt: transcription.cost.final_cost,
                tts: ttsCost
            },
            
            // Credits
            credits: {
                cost: totalCost,
                remaining_balance: newBalance
            }
        }));
        
    } catch (error) {
        console.error('Audio chat message error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

// ============================================
// UTILITY ENDPOINTS
// ============================================

/**
 * @route GET /api/audio/voices
 * @desc Get available TTS voices
 * @access Public
 */
router.get('/voices', (req, res) => {
    res.json({
        success: true,
        data: AudioService.getSupportedVoices()
    });
});

/**
 * @route GET /api/audio/formats
 * @desc Get supported audio formats
 * @access Public
 */
router.get('/formats', (req, res) => {
    res.json({
        success: true,
        data: AudioService.getSupportedFormats()
    });
});

/**
 * @route POST /api/audio/cleanup
 * @desc Clean up old audio files (admin only)
 * @access Private (Admin)
 */
router.post('/cleanup', authenticate, async (req, res) => {
    try {
        const { max_age_hours } = req.body;
        const deleted = AudioService.cleanupOldFiles(max_age_hours || 24);
        
        res.json({
            success: true,
            data: {
                files_deleted: deleted
            }
        });
        
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
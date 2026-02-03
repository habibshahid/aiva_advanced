/**
 * Provider Validation Middleware
 * Validates provider-specific fields when creating/updating agents
 */
const validateProvider = (req, res, next) => {
    const { provider, model, voice, deepgram_model, deepgram_voice } = req.body;
    
    // Default to openai if not specified
    const selectedProvider = provider || 'openai';
    
    const errors = [];
    
    switch (selectedProvider.toLowerCase()) {
        case 'openai':
            if (!model) {
                errors.push('OpenAI model is required');
            }
            if (!voice) {
                errors.push('OpenAI voice is required');
            }
            break;
            
        case 'deepgram':
            if (!deepgram_model) {
                errors.push('Deepgram model is required when using Deepgram provider');
            }
            // Deepgram voice is optional (has defaults)
            break;
            
        case 'custom':
            if (!req.body.llm_model) {
                errors.push('LLM model is required when using Custom provider');
            }
            if (!req.body.tts_provider) {
                errors.push('TTS Provider is required when using Custom provider');
            }
            break;
        
        case 'intent-ivr':
            // Intent IVR has minimal requirements
            break;
        
        case 'pipecat':
            // Validate pipecat-specific fields
            const { pipecat_stt, pipecat_llm, pipecat_tts } = req.body;
            
            const validSTT = ['deepgram', 'soniox', 'whisper', 'azure', 'assembly'];
            const validLLM = ['openai', 'anthropic', 'groq', 'together'];
            const validTTS = ['cartesia', 'elevenlabs', 'deepgram', 'openai', 'playht'];
            
            // STT validation (optional - has defaults)
            if (pipecat_stt && !validSTT.includes(pipecat_stt)) {
                errors.push(`Invalid pipecat_stt: ${pipecat_stt}. Must be one of: ${validSTT.join(', ')}`);
            }
            
            // LLM validation (optional - has defaults)
            if (pipecat_llm && !validLLM.includes(pipecat_llm)) {
                errors.push(`Invalid pipecat_llm: ${pipecat_llm}. Must be one of: ${validLLM.join(', ')}`);
            }
            
            // TTS validation (optional - has defaults)
            if (pipecat_tts && !validTTS.includes(pipecat_tts)) {
                errors.push(`Invalid pipecat_tts: ${pipecat_tts}. Must be one of: ${validTTS.join(', ')}`);
            }
            
            // Speed validation
            if (req.body.pipecat_tts_speed !== undefined) {
                const speed = parseFloat(req.body.pipecat_tts_speed);
                if (isNaN(speed) || speed < 0.5 || speed > 2.0) {
                    errors.push('pipecat_tts_speed must be between 0.5 and 2.0');
                }
            }
            break;
            
        default:
            errors.push(`Invalid provider: ${selectedProvider}. Must be 'openai', 'deepgram', 'custom', 'intent-ivr', or 'pipecat'`);
    }
    
    if (errors.length > 0) {
        return res.status(400).json({
            error: 'Provider validation failed',
            details: errors
        });
    }
    
    next();
};

module.exports = { validateProvider };
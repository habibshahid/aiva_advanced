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
            // Deepgram voice is optional (has defaults)
            break;
		case 'intent-ivr':
           
            break;
            
        default:
            errors.push(`Invalid provider: ${selectedProvider}. Must be 'openai' or 'deepgram'`);
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
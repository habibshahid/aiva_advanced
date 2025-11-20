/**
 * Transcription Analysis Service
 * Analyzes transcriptions for sentiment, profanity, intent, and language
 * Uses OpenAI for sophisticated analysis
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');

class TranscriptionAnalysisService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Analysis model configuration
    this.analysisModel = 'gpt-4o-mini'; // Fast and cost-effective
    this.batchSize = 10; // Analyze messages in batches
  }

  /**
   * Analyze a single transcription message
   * @param {string} text - Message text to analyze
   * @param {string} speaker - 'agent' or 'customer'/'user'
   * @param {Object} context - Additional context (previous messages, etc)
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeMessage(text, speaker, context = {}) {
    try {
      const analysisPrompt = this._buildAnalysisPrompt(text, speaker, context);
      
      const startTime = Date.now();
      
      const response = await this.openai.chat.completions.create({
        model: this.analysisModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert conversation analyst. Analyze the given message and return ONLY a valid JSON object with the analysis results. No markdown, no code blocks, just pure JSON.`
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const analysisTime = Date.now() - startTime;
      
      // Parse the response
      const analysis = JSON.parse(response.choices[0].message.content);
      
      // Calculate cost
      const cost = this._calculateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens
      );

      return {
        ...analysis,
        analysis_metadata: {
          model: this.analysisModel,
          processing_time_ms: analysisTime,
          cost: cost,
          tokens_used: response.usage.total_tokens
        }
      };
      
    } catch (error) {
      logger.error('Error analyzing message:', error);
      throw error;
    }
  }

  /**
   * Analyze multiple messages in batch
   * @param {Array} messages - Array of {text, speaker, context}
   * @returns {Promise<Array>} Array of analysis results
   */
  async analyzeBatch(messages) {
    const results = [];
    
    // Process in chunks to avoid rate limits
    for (let i = 0; i < messages.length; i += this.batchSize) {
      const batch = messages.slice(i, i + this.batchSize);
      
      const batchPromises = batch.map(msg => 
        this.analyzeMessage(msg.text, msg.speaker, msg.context)
          .catch(error => {
            logger.error(`Error analyzing message ${i}:`, error);
            return null; // Return null for failed analyses
          })
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Analyze entire conversation for session-level analytics
   * @param {Array} transcriptions - All messages in conversation
   * @param {Object} sessionInfo - Session metadata
   * @returns {Promise<Object>} Session-level analytics
   */
  async analyzeSession(transcriptions, sessionInfo = {}) {
    try {
      // Prepare conversation text
      const conversationText = transcriptions
        .map(t => `${t.speaker}: ${t.original_message || t.content}`)
        .join('\n');

      const sessionPrompt = `Analyze the following complete conversation and provide comprehensive session-level analytics.

CONVERSATION:
${conversationText}

Provide a detailed JSON analysis including:
1. Overall sentiment (positive/negative/neutral/mixed) with score (-1.0 to 1.0)
2. Sentiment breakdown (percentages for positive, negative, neutral)
3. Customer/User sentiment vs Agent/Assistant sentiment (separate scores)
4. Sentiment progression over time (array showing how sentiment changed)
5. Total profanity incidents and severity (none/low/medium/high)
6. Profanity breakdown by speaker
7. Primary intents throughout conversation (array)
8. Intent categories with counts
9. Resolution intent (what was the final outcome/intent)
10. Main topics discussed (top 5)
11. Most frequent keywords
12. Emotion timeline (how emotions changed)
13. Quality indicators:
    - escalation_detected (boolean)
    - customer_satisfaction_indicator (likely_satisfied/neutral/likely_unsatisfied)
    - issue_resolved (boolean or null if unclear)
    - transfer_requested (boolean)
14. Languages detected (if multiple languages used)

Return ONLY a valid JSON object matching this structure:
{
  "overall_sentiment": "positive|negative|neutral|mixed",
  "overall_sentiment_score": 0.75,
  "sentiment_progression": [{"message_num": 1, "sentiment": "neutral", "score": 0.0}, ...],
  "positive_percentage": 60.0,
  "negative_percentage": 10.0,
  "neutral_percentage": 30.0,
  "customer_sentiment": "positive",
  "customer_sentiment_score": 0.8,
  "agent_sentiment": "neutral",
  "agent_sentiment_score": 0.1,
  "profanity_incidents": 0,
  "profanity_severity": "none",
  "profanity_by_customer": 0,
  "profanity_by_agent": 0,
  "primary_intents": ["inquiry", "support_request", "confirmation"],
  "intent_categories": {"inquiry": 5, "support": 3, "confirmation": 2},
  "resolution_intent": "issue_resolved",
  "main_topics": ["billing", "account access", "payment methods"],
  "keywords_frequency": {"password": 5, "reset": 4, "account": 8},
  "emotion_timeline": [{"message_num": 1, "emotion": "confused"}, ...],
  "peak_emotions": ["frustrated", "relieved"],
  "escalation_detected": false,
  "customer_satisfaction_indicator": "likely_satisfied",
  "issue_resolved": true,
  "transfer_requested": false,
  "languages_detected": ["en"],
  "primary_language": "en"
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Use better model for session analysis
        messages: [
          {
            role: 'system',
            content: 'You are an expert conversation analyst specializing in customer service quality analysis. Return only valid JSON.'
          },
          {
            role: 'user',
            content: sessionPrompt
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const analytics = JSON.parse(response.choices[0].message.content);
      
      // Calculate cost
      const cost = this._calculateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens
      );

      return {
        ...analytics,
        analysis_metadata: {
          model: 'gpt-4o-mini',
          total_analysis_cost: cost,
          tokens_used: response.usage.total_tokens,
          analyzed_at: new Date()
        }
      };
      
    } catch (error) {
      logger.error('Error analyzing session:', error);
      throw error;
    }
  }

  /**
   * Translate non-English text to English
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code (optional)
   * @returns {Promise<Object>} {translated_text, detected_language, confidence}
   */
  async translateToEnglish(text, sourceLanguage = null) {
    try {
      const prompt = sourceLanguage
        ? `Translate the following ${sourceLanguage} text to English:\n\n${text}`
        : `Detect the language and translate the following text to English:\n\n${text}`;

      const response = await this.openai.chat.completions.create({
        model: this.analysisModel,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Return only the translation and language info as JSON: {"translated_text": "...", "detected_language": "en", "confidence": 0.95}'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      const cost = this._calculateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens
      );

      return {
        ...result,
        translation_cost: cost
      };
      
    } catch (error) {
      logger.error('Error translating text:', error);
      return {
        translated_text: text, // Return original if translation fails
        detected_language: 'unknown',
        confidence: 0,
        translation_cost: 0
      };
    }
  }

  /**
   * Build analysis prompt for individual message
   * @private
   */
  _buildAnalysisPrompt(text, speaker, context) {
    return `Analyze this ${speaker} message from a conversation and return analysis as JSON.

MESSAGE: "${text}"

${context.previousMessage ? `PREVIOUS MESSAGE: "${context.previousMessage}"` : ''}

Return a JSON object with:
{
  "sentiment": "positive|negative|neutral|mixed",
  "sentiment_score": -0.5 to 1.0 (float),
  "sentiment_confidence": 0.0 to 1.0,
  "profanity_detected": false,
  "profanity_score": 0.0 to 1.0,
  "profane_words": ["word1", "word2"] or [],
  "intents": ["intent1", "intent2"],
  "primary_intent": "main_intent",
  "intent_confidence": 0.0 to 1.0,
  "topics": ["topic1", "topic2"],
  "keywords": ["keyword1", "keyword2"],
  "emotion_tags": ["emotion1", "emotion2"],
  "language_detected": "en"
}

IMPORTANT:
- sentiment_score: -1.0 (very negative) to 1.0 (very positive), 0.0 is neutral
- profanity_score: 0.0 (none) to 1.0 (severe)
- Detect language code (en, es, ur, fr, etc)
- For profanity, detect offensive language, slurs, or aggressive language
- Intents: purchase_inquiry, support_request, complaint, question, greeting, closing, etc
- Topics: product names, issues, features discussed
- Keywords: Important words that capture message essence`;
  }

  /**
   * Calculate OpenAI API cost
   * @private
   */
  _calculateCost(inputTokens, outputTokens) {
    // GPT-4o-mini pricing (as of 2024)
    const inputCostPer1M = 0.150; // $0.150 per 1M input tokens
    const outputCostPer1M = 0.600; // $0.600 per 1M output tokens
    
    const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;
    
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Detect if text needs translation
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async needsTranslation(text) {
    // Quick check: if text contains only ASCII and common English words, probably English
    const englishPattern = /^[a-zA-Z0-9\s\.,;:!?\-'"()]+$/;
    if (englishPattern.test(text)) {
      return false;
    }
    
    // For non-ASCII or mixed content, let OpenAI detect
    try {
      const detection = await this.translateToEnglish(text);
      return detection.detected_language !== 'en';
    } catch (error) {
      logger.error('Error detecting language:', error);
      return false;
    }
  }
}

module.exports = new TranscriptionAnalysisService();

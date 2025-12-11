/**
 * Cost Calculator Utility
 * Unified cost calculation for all operations with profit margin
 */
require('dotenv').config();

class CostCalculator {
  constructor() {
    // Profit margin from environment
    this.profitMarginPercent = parseFloat(process.env.PROFIT_MARGIN_PERCENT || 20);
    this.profitMargin = this.profitMarginPercent / 100;

    // OpenAI Chat Pricing (per 1M tokens)
    this.pricing = {
	  openai: {
		// ===== CHAT MODELS =====
		'gpt-4o-mini': {
		  input: parseFloat(process.env.OPENAI_GPT4O_MINI_INPUT_COST || 0.150),
		  output: parseFloat(process.env.OPENAI_GPT4O_MINI_OUTPUT_COST || 0.600),
		  cached_input: parseFloat(process.env.OPENAI_GPT4O_MINI_CACHED_INPUT_COST || 0.075)
		},
		'gpt-4o': {
		  input: parseFloat(process.env.OPENAI_GPT4O_INPUT_COST || 2.50),
		  output: parseFloat(process.env.OPENAI_GPT4O_OUTPUT_COST || 10.00),
		  cached_input: parseFloat(process.env.OPENAI_GPT4O_CACHED_INPUT_COST || 1.25)
		},
		'gpt-4-turbo': {
		  input: parseFloat(process.env.OPENAI_GPT4_TURBO_INPUT_COST || 10.00),
		  output: parseFloat(process.env.OPENAI_GPT4_TURBO_OUTPUT_COST || 30.00)
		},
		'gpt-4-turbo-preview': {
		  input: parseFloat(process.env.OPENAI_GPT4_TURBO_INPUT_COST || 10.00),
		  output: parseFloat(process.env.OPENAI_GPT4_TURBO_OUTPUT_COST || 30.00)
		},
		'gpt-4': {
		  input: parseFloat(process.env.OPENAI_GPT4_INPUT_COST || 30.00),
		  output: parseFloat(process.env.OPENAI_GPT4_OUTPUT_COST || 60.00)
		},
		'gpt-3.5-turbo': {
		  input: parseFloat(process.env.OPENAI_GPT35_TURBO_INPUT_COST || 0.50),
		  output: parseFloat(process.env.OPENAI_GPT35_TURBO_OUTPUT_COST || 1.50)
		},
		'o1': {
		  input: parseFloat(process.env.OPENAI_O1_INPUT_COST || 15.00),
		  output: parseFloat(process.env.OPENAI_O1_OUTPUT_COST || 60.00)
		},
		'o1-mini': {
		  input: parseFloat(process.env.OPENAI_O1_MINI_INPUT_COST || 3.00),
		  output: parseFloat(process.env.OPENAI_O1_MINI_OUTPUT_COST || 12.00)
		},
		
		// ===== REALTIME/VOICE MODELS =====
		'gpt-4o-mini-realtime': {
		  audio_input: parseFloat(process.env.OPENAI_REALTIME_AUDIO_INPUT_COST || 100.00),
		  audio_output: parseFloat(process.env.OPENAI_REALTIME_AUDIO_OUTPUT_COST || 200.00),
		  text_input: parseFloat(process.env.OPENAI_REALTIME_TEXT_INPUT_COST || 5.00),
		  text_output: parseFloat(process.env.OPENAI_REALTIME_TEXT_OUTPUT_COST || 20.00)
		},
		'gpt-4o-mini-realtime-preview': {
		  audio_input: parseFloat(process.env.OPENAI_REALTIME_AUDIO_INPUT_COST || 100.00),
		  audio_output: parseFloat(process.env.OPENAI_REALTIME_AUDIO_OUTPUT_COST || 200.00),
		  text_input: parseFloat(process.env.OPENAI_REALTIME_TEXT_INPUT_COST || 5.00),
		  text_output: parseFloat(process.env.OPENAI_REALTIME_TEXT_OUTPUT_COST || 20.00)
		},
		'gpt-4o-mini-realtime-preview-2024-12-17': {
		  audio_input: parseFloat(process.env.OPENAI_REALTIME_AUDIO_INPUT_COST || 100.00),
		  audio_output: parseFloat(process.env.OPENAI_REALTIME_AUDIO_OUTPUT_COST || 200.00),
		  text_input: parseFloat(process.env.OPENAI_REALTIME_TEXT_INPUT_COST || 5.00),
		  text_output: parseFloat(process.env.OPENAI_REALTIME_TEXT_OUTPUT_COST || 20.00)
		},
		
		// ===== EMBEDDINGS =====
		'text-embedding-3-small': {
		  input: parseFloat(process.env.OPENAI_EMBEDDING_SMALL_COST || 0.020)
		},
		'text-embedding-3-large': {
		  input: parseFloat(process.env.OPENAI_EMBEDDING_LARGE_COST || 0.130)
		}
	  },
	  deepgram: {
		'nova-2': parseFloat(process.env.DEEPGRAM_NOVA_2_COST || 0.0043),
		'nova-3': parseFloat(process.env.DEEPGRAM_NOVA_3_COST || 0.0059),
		'whisper': parseFloat(process.env.DEEPGRAM_WHISPER_COST || 0.0048),
		'aura-tts': parseFloat(process.env.DEEPGRAM_TTS_AURA_COST || 0.015)
	  },
	  operations: {
		document_processing: parseFloat(process.env.DOCUMENT_PROCESSING_BASE_COST || 0.01),
		image_processing_clip: parseFloat(process.env.IMAGE_PROCESSING_CLIP_COST || 0.002),
		storage_per_gb: parseFloat(process.env.STORAGE_COST_PER_GB || 0.023)
	  }
	};
  }

  /**
   * Calculate OpenAI Chat cost
   * @param {Object} usage - Token usage from OpenAI
   * @param {string} model - Model name
   * @returns {Object} Cost breakdown
   */
  calculateChatCost(usage, model = 'gpt-4o-mini') {
    const modelPricing = this.pricing.openai[model] || this.pricing.openai['gpt-4o-mini'];

    const inputCost = (usage.prompt_tokens / 1000000) * modelPricing.input;
    const outputCost = (usage.completion_tokens / 1000000) * modelPricing.output;
    
    // Handle cached tokens if present
    let cachedCost = 0;
    if (usage.cached_tokens && modelPricing.cached_input) {
      cachedCost = (usage.cached_tokens / 1000000) * modelPricing.cached_input;
    }

    const baseCost = inputCost + outputCost + cachedCost;
    const profitAmount = baseCost * this.profitMargin;
    const finalCost = baseCost + profitAmount;

    return {
      base_cost: baseCost,
      profit_amount: profitAmount,
      final_cost: finalCost,
      operations: [
        {
          operation: 'llm_generation',
          quantity: 1,
          unit_cost: baseCost,
          total_cost: baseCost,
          details: {
            model: model,
            input_tokens: usage.prompt_tokens,
            output_tokens: usage.completion_tokens,
            cached_tokens: usage.cached_tokens || 0,
            input_cost: inputCost,
            output_cost: outputCost,
            cached_cost: cachedCost
          }
        }
      ]
    };
  }

  /**
   * Calculate OpenAI Realtime (voice) cost
   * @param {Object} usage - Usage metrics from realtime API
   * @returns {Object} Cost breakdown
   */
  calculateRealtimeCost(usage) {
    const pricing = this.pricing.openai['gpt-4o-mini-realtime'];

    // Audio costs (tokens)
    const audioInputCost = (usage.audio_input_tokens / 1000000) * pricing.audio_input;
    const audioOutputCost = (usage.audio_output_tokens / 1000000) * pricing.audio_output;

    // Text costs (tokens)
    const textInputCost = (usage.text_input_tokens / 1000000) * pricing.text_input;
    const textOutputCost = (usage.text_output_tokens / 1000000) * pricing.text_output;

    const baseCost = audioInputCost + audioOutputCost + textInputCost + textOutputCost;
    const profitAmount = baseCost * this.profitMargin;
    const finalCost = baseCost + profitAmount;

    return {
      base_cost: baseCost,
      profit_amount: profitAmount,
      final_cost: finalCost,
      operations: [
        {
          operation: 'voice_realtime',
          quantity: 1,
          unit_cost: baseCost,
          total_cost: baseCost,
          details: {
            model: 'gpt-4o-mini-realtime',
            audio_input_tokens: usage.audio_input_tokens,
            audio_output_tokens: usage.audio_output_tokens,
            text_input_tokens: usage.text_input_tokens,
            text_output_tokens: usage.text_output_tokens,
            audio_input_cost: audioInputCost,
            audio_output_cost: audioOutputCost,
            text_input_cost: textInputCost,
            text_output_cost: textOutputCost
          }
        }
      ]
    };
  }

  /**
   * Calculate Deepgram cost
   * @param {number} minutes - Audio duration in minutes
   * @param {string} model - Deepgram model name
   * @returns {Object} Cost breakdown
   */
  calculateDeepgramCost(minutes, model = 'nova-2') {
    const costPerMinute = this.pricing.deepgram[model] || this.pricing.deepgram['nova-2'];
    const baseCost = minutes * costPerMinute;
    const profitAmount = baseCost * this.profitMargin;
    const finalCost = baseCost + profitAmount;

    return {
      base_cost: baseCost,
      profit_amount: profitAmount,
      final_cost: finalCost,
      operations: [
        {
          operation: 'voice_deepgram',
          quantity: minutes,
          unit_cost: costPerMinute,
          total_cost: baseCost,
          details: {
            model: model,
            minutes: minutes,
            cost_per_minute: costPerMinute
          }
        }
      ]
    };
  }

  /**
   * Calculate embedding generation cost
   * @param {number} tokens - Number of tokens
   * @param {string} model - Embedding model name
   * @returns {Object} Cost breakdown
   */
  calculateEmbeddingCost(tokens, model = 'text-embedding-3-small') {
    const modelPricing = this.pricing.openai[model] || this.pricing.openai['text-embedding-3-small'];
    const baseCost = (tokens / 1000000) * modelPricing.input;
    const profitAmount = baseCost * this.profitMargin;
    const finalCost = baseCost + profitAmount;

    return {
      base_cost: baseCost,
      profit_amount: profitAmount,
      final_cost: finalCost,
      operations: [
        {
          operation: 'embedding_generation',
          quantity: tokens,
          unit_cost: modelPricing.input / 1000000,
          total_cost: baseCost,
          details: {
            model: model,
            tokens: tokens
          }
        }
      ]
    };
  }

  /**
   * Calculate document processing cost
   * @param {number} pages - Number of pages processed
   * @returns {Object} Cost breakdown
   */
  calculateDocumentProcessingCost(pages) {
    const costPerPage = this.pricing.operations.document_processing / 100; // Assuming 100 pages = base cost
    const baseCost = pages * costPerPage;
    const profitAmount = baseCost * this.profitMargin;
    const finalCost = baseCost + profitAmount;

    return {
      base_cost: baseCost,
      profit_amount: profitAmount,
      final_cost: finalCost,
      operations: [
        {
          operation: 'document_processing',
          quantity: pages,
          unit_cost: costPerPage,
          total_cost: baseCost,
          details: {
            pages_processed: pages
          }
        }
      ]
    };
  }

  /**
   * Calculate image processing cost (CLIP)
   * @param {number} imageCount - Number of images
   * @returns {Object} Cost breakdown
   */
  calculateImageProcessingCost(imageCount) {
    const costPerImage = this.pricing.operations.image_processing_clip;
    const baseCost = imageCount * costPerImage;
    const profitAmount = baseCost * this.profitMargin;
    const finalCost = baseCost + profitAmount;

    return {
      base_cost: baseCost,
      profit_amount: profitAmount,
      final_cost: finalCost,
      operations: [
        {
          operation: 'image_processing',
          quantity: imageCount,
          unit_cost: costPerImage,
          total_cost: baseCost,
          details: {
            images_processed: imageCount,
            model: 'CLIP'
          }
        }
      ]
    };
  }

  /**
   * Calculate storage cost
   * @param {number} sizeInBytes - File size in bytes
   * @returns {Object} Cost breakdown
   */
  calculateStorageCost(sizeInBytes) {
    const sizeInGB = sizeInBytes / (1024 * 1024 * 1024);
    const baseCost = sizeInGB * this.pricing.operations.storage_per_gb;
    const profitAmount = baseCost * this.profitMargin;
    const finalCost = baseCost + profitAmount;

    return {
      base_cost: baseCost,
      profit_amount: profitAmount,
      final_cost: finalCost,
      operations: [
        {
          operation: 'storage',
          quantity: sizeInGB,
          unit_cost: this.pricing.operations.storage_per_gb,
          total_cost: baseCost,
          details: {
            size_bytes: sizeInBytes,
            size_gb: sizeInGB
          }
        }
      ]
    };
  }

  /**
   * Combine multiple cost breakdowns
   * @param {Array<Object>} costBreakdowns - Array of cost breakdown objects
   * @returns {Object} Combined cost breakdown
   */
  combineCosts(costBreakdowns) {
    let totalBaseCost = 0;
    let allOperations = [];

    for (const breakdown of costBreakdowns) {
      totalBaseCost += breakdown.base_cost;
      allOperations = allOperations.concat(breakdown.operations);
    }

    const profitAmount = totalBaseCost * this.profitMargin;
    const finalCost = totalBaseCost + profitAmount;

    return {
      base_cost: totalBaseCost,
      profit_amount: profitAmount,
      final_cost: finalCost,
      operations: allOperations
    };
  }

  /**
	 * Calculate complete knowledge operation cost
	 * @param {Object} metrics - Metrics from Python service
	 * @returns {Object} Cost breakdown
	 */
	calculateKnowledgeOperationCost(metrics) {
	  const costs = [];

	  // Document processing (base cost per page)
	  if (metrics.pages_processed) {
		costs.push(this.calculateDocumentProcessingCost(metrics.pages_processed));
	  }

	  // Embeddings
	  if (metrics.embedding_tokens) {
		costs.push(this.calculateEmbeddingCost(
		  metrics.embedding_tokens,
		  metrics.embedding_model || 'text-embedding-3-small'
		));
	  }

	  // Image processing
	  if (metrics.images_processed) {
		costs.push(this.calculateImageProcessingCost(metrics.images_processed));
	  }

	  // Storage
	  if (metrics.file_size_bytes) {
		costs.push(this.calculateStorageCost(metrics.file_size_bytes));
	  }

	  // ============================================
	  // NEW: Table Processing Cost (Vision API)
	  // ============================================
	  if (metrics.table_processing_cost && metrics.table_processing_cost > 0) {
		const tableBaseCost = parseFloat(metrics.table_processing_cost);
		const tableProfitAmount = tableBaseCost * this.profitMargin;
		const tableFinalCost = tableBaseCost + tableProfitAmount;
		
		costs.push({
		  base_cost: tableBaseCost,
		  profit_amount: tableProfitAmount,
		  final_cost: tableFinalCost,
		  operations: [
			{
			  operation: 'table_extraction',
			  quantity: metrics.detected_tables || 1,
			  unit_cost: metrics.detected_tables > 0 ? tableBaseCost / metrics.detected_tables : tableBaseCost,
			  total_cost: tableFinalCost,
			  details: {
				tables_processed: metrics.detected_tables || 0,
				table_chunks_added: metrics.table_chunks_added || 0,
				model: 'gpt-4o-vision'
			  }
			}
		  ]
		});
	  }
	  // ============================================

	  // Combine all costs
	  if (costs.length === 0) {
		return {
		  base_cost: 0,
		  profit_amount: 0,
		  final_cost: 0,
		  total: 0,
		  operations: []
		};
	  }

	  const combined = this.combineCosts(costs);
	  combined.total = combined.final_cost; // Ensure 'total' field exists
	  return combined;
	}

  /**
   * Calculate chat with knowledge cost
   * @param {Object} chatUsage - OpenAI chat usage
   * @param {Object} knowledgeMetrics - Knowledge retrieval metrics
   * @param {string} model - Chat model name
   * @returns {Object} Cost breakdown
   */
  calculateChatWithKnowledgeCost(chatUsage, knowledgeMetrics, model = 'gpt-4o-mini') {
    const costs = [];

    // Chat/LLM cost
    costs.push(this.calculateChatCost(chatUsage, model));

    // Knowledge retrieval cost (if query was performed)
    if (knowledgeMetrics) {
      if (knowledgeMetrics.query_embedding_tokens) {
        costs.push(this.calculateEmbeddingCost(
          knowledgeMetrics.query_embedding_tokens,
          knowledgeMetrics.embedding_model || 'text-embedding-3-small'
        ));
      }

      // Add base retrieval cost
      const retrievalCost = {
        base_cost: 0.0005, // Base cost for vector search
        profit_amount: 0,
        final_cost: 0,
        operations: [
          {
            operation: 'knowledge_retrieval',
            quantity: 1,
            unit_cost: 0.0005,
            total_cost: 0.0005,
            details: {
              chunks_retrieved: knowledgeMetrics.chunks_retrieved || 0,
              images_retrieved: knowledgeMetrics.images_retrieved || 0,
              processing_time_ms: knowledgeMetrics.processing_time_ms || 0
            }
          }
        ]
      };
      costs.push(retrievalCost);
    }

    return this.combineCosts(costs);
  }

  /**
   * Format cost for display
   * @param {number} cost - Cost value
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted cost
   */
  formatCost(cost, decimals = 6) {
    return `$${cost.toFixed(decimals)}`;
  }

  /**
   * Get pricing information (for display/documentation)
   * @returns {Object} Current pricing
   */
  getPricing() {
    return {
      profit_margin_percent: this.profitMarginPercent,
      models: this.pricing
    };
  }
}

module.exports = new CostCalculator();
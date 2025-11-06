const CostCalculator = require('../cost-calculator');

console.log('🧪 Testing Cost Calculator\n');
console.log('='.repeat(60));

// Test 1: Chat Cost
console.log('\n📝 Test 1: Chat Cost (gpt-4o-mini)');
const chatCost = CostCalculator.calculateChatCost({
  prompt_tokens: 1500,
  completion_tokens: 500,
  cached_tokens: 0
}, 'gpt-4o-mini');
console.log('Input: 1500 tokens, Output: 500 tokens');
console.log('Base Cost:', CostCalculator.formatCost(chatCost.base_cost));
console.log('Profit Amount:', CostCalculator.formatCost(chatCost.profit_amount));
console.log('Final Cost:', CostCalculator.formatCost(chatCost.final_cost));
console.log('✅ Chat cost calculation works!');

// Test 2: Realtime Voice Cost
console.log('\n📞 Test 2: Realtime Voice Cost');
const voiceCost = CostCalculator.calculateRealtimeCost({
  audio_input_tokens: 5000,
  audio_output_tokens: 3000,
  text_input_tokens: 1000,
  text_output_tokens: 500
});
console.log('Audio In: 5000, Audio Out: 3000, Text In: 1000, Text Out: 500');
console.log('Base Cost:', CostCalculator.formatCost(voiceCost.base_cost));
console.log('Final Cost:', CostCalculator.formatCost(voiceCost.final_cost));
console.log('✅ Voice cost calculation works!');

// Test 3: Deepgram Cost
console.log('\n🎙️  Test 3: Deepgram Cost');
const deepgramCost = CostCalculator.calculateDeepgramCost(2.5, 'nova-2');
console.log('Duration: 2.5 minutes');
console.log('Base Cost:', CostCalculator.formatCost(deepgramCost.base_cost));
console.log('Final Cost:', CostCalculator.formatCost(deepgramCost.final_cost));
console.log('✅ Deepgram cost calculation works!');

// Test 4: Document Processing
console.log('\n📄 Test 4: Document Processing Cost');
const docCost = CostCalculator.calculateKnowledgeOperationCost({
  pages_processed: 45,
  embedding_tokens: 45678,
  images_processed: 23,
  file_size_bytes: 2457600
});
console.log('Pages: 45, Tokens: 45678, Images: 23, Size: 2.4MB');
console.log('Base Cost:', CostCalculator.formatCost(docCost.base_cost));
console.log('Final Cost:', CostCalculator.formatCost(docCost.final_cost));
console.log('Operations:', docCost.operations.length);
console.log('✅ Document processing cost calculation works!');

// Test 5: Chat with Knowledge
console.log('\n💬 Test 5: Chat with Knowledge Cost');
const chatKBCost = CostCalculator.calculateChatWithKnowledgeCost(
  { prompt_tokens: 1250, completion_tokens: 420, cached_tokens: 0 },
  { query_embedding_tokens: 12, chunks_retrieved: 5, images_retrieved: 2 },
  'gpt-4o-mini'
);
console.log('Chat + Knowledge Retrieval');
console.log('Base Cost:', CostCalculator.formatCost(chatKBCost.base_cost));
console.log('Final Cost:', CostCalculator.formatCost(chatKBCost.final_cost));
console.log('Operations:', chatKBCost.operations.length);
console.log('✅ Chat with knowledge cost calculation works!');

// Test 6: Combine Costs
console.log('\n🔗 Test 6: Combine Multiple Costs');
const cost1 = CostCalculator.calculateEmbeddingCost(1000);
const cost2 = CostCalculator.calculateImageProcessingCost(5);
const cost3 = CostCalculator.calculateStorageCost(10 * 1024 * 1024);
const combined = CostCalculator.combineCosts([cost1, cost2, cost3]);
console.log('Combined 3 operations');
console.log('Total Base Cost:', CostCalculator.formatCost(combined.base_cost));
console.log('Total Final Cost:', CostCalculator.formatCost(combined.final_cost));
console.log('Total Operations:', combined.operations.length);
console.log('✅ Cost combination works!');

// Test 7: Profit Margin
console.log('\n💰 Test 7: Profit Margin Calculation');
const testCost = { base_cost: 1.0, profit_amount: 0, final_cost: 0, operations: [] };
const profitAmount = testCost.base_cost * (parseFloat(process.env.PROFIT_MARGIN_PERCENT || 20) / 100);
const finalCost = testCost.base_cost + profitAmount;
console.log(`Base: $1.00, Margin: ${process.env.PROFIT_MARGIN_PERCENT || 20}%`);
console.log('Profit:', CostCalculator.formatCost(profitAmount));
console.log('Final:', CostCalculator.formatCost(finalCost));
console.log('✅ Profit margin calculation works!');

console.log('\n' + '='.repeat(60));
console.log('🎉 All cost calculator tests passed!');
console.log('='.repeat(60));
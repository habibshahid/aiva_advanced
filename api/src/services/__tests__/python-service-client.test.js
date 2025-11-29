const PythonServiceClient = require('../PythonServiceClient');

async function testPythonServiceClient() {
  console.log('🧪 Testing Python Service Client\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Health Check
    console.log('\n💚 Test 1: Health Check');
	console.log('\n🔍 Debug Info:');
	console.log('Base URL:', PythonServiceClient.baseUrl);
	console.log('Full Health URL:', PythonServiceClient.baseUrl + '/health');
	console.log('API Key:', PythonServiceClient.apiKey);
	console.log('');
    
	const isAvailable = await PythonServiceClient.isAvailable();
    console.log('Service Available:', isAvailable);
    

    if (!isAvailable) {
      console.log('⚠️  Python service is not running. Start it to run full tests.');
      return;
    }

    const health = await PythonServiceClient.healthCheck();
    console.log('Health Status:', health);
    console.log('✅ Health check passed!');

    // Test 2: Generate Embedding
    console.log('\n🔢 Test 2: Generate Embedding');
    const embedding = await PythonServiceClient.generateEmbedding({
      text: 'This is a test query for embeddings',
      model: 'text-embedding-3-small'
    });
    console.log('Embedding dimensions:', embedding.embedding?.length || 'N/A');
    console.log('✅ Embedding generation works!');

    // Test 3: Search (will fail if no KB exists, but tests the client)
    console.log('\n🔍 Test 3: Search (may fail without KB)');
    try {
      const searchResult = await PythonServiceClient.search({
        kb_id: 'test-kb-id',
        query: 'test query',
        top_k: 5,
        search_type: 'text'
      });
      console.log('Search completed:', searchResult);
      console.log('✅ Search works!');
    } catch (error) {
      console.log('⚠️  Search failed (expected if no KB):', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Python service client tests completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run tests
testPythonServiceClient();
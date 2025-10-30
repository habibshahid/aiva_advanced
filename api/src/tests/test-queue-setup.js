// test-queue-setup.js
const shopifyQueue = require('../queues/shopifyQueue');

async function testQueue() {
  console.log('Testing queue setup...\n');
  
  try {
    // Test 1: Check queue is ready
    console.log('✓ Test 1: Checking queue connection...');
    const isReady = await shopifyQueue.isReady();
    console.log(`  Queue ready: ${isReady}`);
    
    // Test 2: Add a test job
    console.log('\n✓ Test 2: Adding test job...');
    const job = await shopifyQueue.add('test', {
      test: true,
      timestamp: Date.now()
    });
    console.log(`  Job created: ${job.id}`);
    
    // Test 3: Check job status
    console.log('\n✓ Test 3: Checking job status...');
    const state = await job.getState();
    console.log(`  Job state: ${state}`);
    
    // Clean up test job
    await job.remove();
    console.log('\n✓ Test job cleaned up');
    
    // Close queue
    await shopifyQueue.close();
    
    console.log('\n✅ Queue setup successful!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Queue setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testQueue();
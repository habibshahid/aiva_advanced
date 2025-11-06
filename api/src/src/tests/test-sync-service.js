// test-sync-service.js
const SyncJobService = require('../services/SyncJobService');
const { v4: uuidv4 } = require('uuid');

async function testSyncService() {
  console.log('Testing SyncJobService...\n');
  
  try {
    const testStoreId = '670e94d1-62ea-46c9-a457-2e38c1ae365a';
    const testKbId = '670e94d1-62ea-46c9-a457-2e38c1ae365a';
    const testTenantId = '8903395d-a021-11f0-bf05-005056b138bb';
    
    // Test 1: Create job
    console.log('✓ Test 1: Creating sync job...');
    const job = await SyncJobService.createJob({
      store_id: testStoreId,
      kb_id: testKbId,
      tenant_id: testTenantId,
      job_type: 'full_sync'
    });
    console.log(`  Job created: ${job.id}`);
    console.log(`  Status: ${job.status}`);
    
    // Test 2: Update status
    console.log('\n✓ Test 2: Updating job status...');
    await SyncJobService.updateStatus(job.id, 'processing');
    const updatedJob = await SyncJobService.getJob(job.id);
    console.log(`  New status: ${updatedJob.status}`);
    console.log(`  Started at: ${updatedJob.started_at}`);
    
    // Test 3: Update progress
    console.log('\n✓ Test 3: Updating progress...');
    await SyncJobService.updateProgress(job.id, {
      total_products: 100,
      processed_products: 50,
      total_images: 400,
      processed_images: 200
    });
    const progressJob = await SyncJobService.getJob(job.id);
    console.log(`  Progress: ${progressJob.processed_products}/${progressJob.total_products} products`);
    console.log(`  Images: ${progressJob.processed_images}/${progressJob.total_images}`);
    
    // Test 4: Complete job
    console.log('\n✓ Test 4: Completing job...');
    await SyncJobService.complete(job.id);
    const completedJob = await SyncJobService.getJob(job.id);
    console.log(`  Final status: ${completedJob.status}`);
    console.log(`  Completed at: ${completedJob.completed_at}`);
    
    // Clean up - delete test job
    const db = require('./src/config/database');
    await db.query('DELETE FROM yovo_tbl_aiva_sync_jobs WHERE id = ?', [job.id]);
    console.log('\n✓ Test job cleaned up');
    
    console.log('\n✅ SyncJobService test successful!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ SyncJobService test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testSyncService();
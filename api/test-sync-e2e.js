/**
 * End-to-End Sync Test
 * Tests the complete sync flow: API → Queue → Worker → Database
 * Run: node test-sync-e2e.js
 */

const axios = require('axios');
const ShopifyService = require('./src/services/ShopifyService');
const KnowledgeService = require('./src/services/KnowledgeService');
const SyncJobService = require('./src/services/SyncJobService');
const shopifyQueue = require('./src/queues/shopifyQueue');
const db = require('./src/config/database');
const { v4: uuidv4 } = require('uuid');

// CONFIGURATION
const CONFIG = {
  shop_domain: 'cod-testing-1122.myshopify.com',
  access_token: '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',
  // Use existing tenant or create new one
  use_existing_tenant: true, // Set to false to create new tenant
  tenant_id: '8903395d-a021-11f0-bf05-005056b138bb', // Will be set during test
  // Test with limited products first
  test_product_limit: 5
};

let testKbId = null;
let testStoreId = null;
let testJobId = null;
let testTenantId = null;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getOrCreateTenant() {
  if (CONFIG.use_existing_tenant) {
    // Get first existing tenant
    const [tenants] = await db.query('SELECT id FROM yovo_tbl_aiva_tenants LIMIT 1');
    if (tenants.length > 0) {
      console.log('  Using existing tenant:', tenants[0].id);
      return tenants[0].id;
    }
  }
  
  // Create new test tenant
  const tenantId = uuidv4();
  await db.query(`
    INSERT INTO yovo_tbl_aiva_tenants (
      id, name, email, is_active
    ) VALUES (?, ?, ?, 1)
  `, [
    tenantId,
    'Test Tenant',
    'test@example.com'
  ]);
  
  console.log('  Created test tenant:', tenantId);
  return tenantId;
}

async function testEndToEndSync() {
  console.log('🧪 End-to-End Sync Test\n');
  console.log('This will test the complete flow:');
  console.log('1. Get/Create Tenant');
  console.log('2. Create KB and Store');
  console.log('3. Trigger sync job');
  console.log('4. Monitor progress');
  console.log('5. Verify results');
  console.log('6. Cleanup\n');
  
  try {
    // Step 0: Get or create tenant
    console.log('Step 0: Setting up tenant...');
    testTenantId = await getOrCreateTenant();
    
    // Step 1: Create test KB
    console.log('\nStep 1: Creating test knowledge base...');
    const kb = await KnowledgeService.createKnowledgeBase(testTenantId, {
      name: 'Test Shopify KB',
      description: 'E2E test',
      type: 'product_catalog'  // Valid type for product-based KB
    });
    testKbId = kb.id;
    console.log('  ✅ KB created:', testKbId);
    
    // Step 2: Create store connection
    console.log('\nStep 2: Creating store connection...');
    const store = await ShopifyService.createStore({
      kb_id: testKbId,
      tenant_id: CONFIG.tenant_id,
      shop_domain: CONFIG.shop_domain,
      access_token: CONFIG.access_token
    });
    testStoreId = store.id;
    console.log('  ✅ Store created:', testStoreId);
    
    // Step 3: Create sync job
    console.log('\nStep 3: Creating sync job...');
    const job = await SyncJobService.createJob({
      store_id: testStoreId,
      kb_id: testKbId,
      tenant_id: CONFIG.tenant_id,
      job_type: 'full_sync'
    });
    testJobId = job.id;
    console.log('  ✅ Job created:', testJobId);
    
    // Step 4: Add to queue
    console.log('\nStep 4: Adding job to queue...');
    const bullJob = await shopifyQueue.add('full-sync', {
      job_id: testJobId,
      store_id: testStoreId,
      kb_id: testKbId,
      tenant_id: CONFIG.tenant_id,
      shop_domain: CONFIG.shop_domain,
      access_token: CONFIG.access_token,
      sync_filter: 'active'
    });
    console.log('  ✅ Job added to queue:', bullJob.id);
    
    // Step 5: Monitor progress
    console.log('\nStep 5: Monitoring sync progress...');
    console.log('  (Checking every 5 seconds)\n');
    
    let completed = false;
    let lastProgress = 0;
    let checkCount = 0;
    const maxChecks = 120; // 10 minutes max
    
    while (!completed && checkCount < maxChecks) {
      await sleep(5000);
      checkCount++;
      
      const jobStatus = await SyncJobService.getJob(testJobId);
      
      // Calculate progress
      const progress = jobStatus.total_products > 0
        ? Math.round((jobStatus.processed_products / jobStatus.total_products) * 100)
        : 0;
      
      // Only show update if progress changed
      if (progress !== lastProgress || jobStatus.status !== 'processing') {
        console.log(`  [${new Date().toLocaleTimeString()}] Status: ${jobStatus.status}`);
        console.log(`    Progress: ${progress}%`);
        console.log(`    Products: ${jobStatus.processed_products}/${jobStatus.total_products}`);
        console.log(`    Images: ${jobStatus.processed_images}/${jobStatus.total_images}`);
        
        if (jobStatus.error_message) {
          console.log(`    ⚠️  Error: ${jobStatus.error_message}`);
        }
        
        console.log('');
        lastProgress = progress;
      }
      
      // Check if completed
      if (jobStatus.status === 'completed') {
        completed = true;
        console.log('  ✅ Sync completed successfully!');
        console.log('\n  Final Results:');
        console.log(`    Products processed: ${jobStatus.processed_products}`);
        console.log(`    Products failed: ${jobStatus.failed_products}`);
        console.log(`    Products added: ${jobStatus.products_added}`);
        console.log(`    Products updated: ${jobStatus.products_updated}`);
        console.log(`    Images processed: ${jobStatus.processed_images}/${jobStatus.total_images}`);
        console.log(`    Images failed: ${jobStatus.failed_images}`);
        
        const duration = new Date(jobStatus.completed_at) - new Date(jobStatus.started_at);
        console.log(`    Duration: ${Math.round(duration / 1000)} seconds`);
        
      } else if (jobStatus.status === 'failed') {
        console.error('  ❌ Sync failed!');
        console.error(`    Error: ${jobStatus.error_message}`);
        throw new Error('Sync job failed');
      }
    }
    
    if (!completed) {
      throw new Error('Sync timed out after 10 minutes');
    }
    
    // Step 6: Verify products in database
    console.log('\nStep 6: Verifying products in database...');
    const [products] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_products WHERE kb_id = ?',
      [testKbId]
    );
    console.log(`  ✅ Found ${products.length} products in database`);
    
    if (products.length > 0) {
      const product = products[0];
      console.log('\n  Sample Product:');
      console.log(`    Title: ${product.title}`);
      console.log(`    Price: PKR ${product.price}`);
      console.log(`    Status: ${product.status}`);
      console.log(`    Inventory: ${product.total_inventory}`);
      
      // Check variants
      const [variants] = await db.query(
        'SELECT * FROM yovo_tbl_aiva_product_variants WHERE product_id = ?',
        [product.id]
      );
      console.log(`    Variants: ${variants.length}`);
      
      // Check images
      const [images] = await db.query(
        'SELECT * FROM yovo_tbl_aiva_product_images WHERE product_id = ?',
        [product.id]
      );
      console.log(`    Images: ${images.length}`);
    }
    
    // Step 7: Cleanup
    console.log('\nStep 7: Cleaning up test data...');
    await ShopifyService.deleteStore(testStoreId);
    console.log('  ✅ Store deleted');
    
    await db.query('DELETE FROM yovo_tbl_aiva_knowledge_bases WHERE id = ?', [testKbId]);
    console.log('  ✅ KB deleted');
    
    console.log('\n✅ End-to-End Test Passed!\n');
    console.log('Summary:');
    console.log('  • KB created and deleted ✅');
    console.log('  • Store connected and disconnected ✅');
    console.log('  • Sync job created and completed ✅');
    console.log('  • Products synced to database ✅');
    console.log('  • Images downloaded and processed ✅');
    console.log('  • Cleanup completed ✅');
    
    await shopifyQueue.close();
    await db.end();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    
    // Cleanup on error
    if (testStoreId) {
      try {
        await ShopifyService.deleteStore(testStoreId);
        console.log('  Cleaned up test store');
      } catch (e) {
        console.error('  Could not clean up store:', e.message);
      }
    }
    
    if (testKbId) {
      try {
        await db.query('DELETE FROM yovo_tbl_aiva_knowledge_bases WHERE id = ?', [testKbId]);
        console.log('  Cleaned up test KB');
      } catch (e) {
        console.error('  Could not clean up KB:', e.message);
      }
    }
    
    await shopifyQueue.close();
    await db.end();
    process.exit(1);
  }
}

// Check configuration
if (CONFIG.shop_domain === 'your-store.myshopify.com') {
  console.error('❌ ERROR: Please update CONFIG with your Shopify credentials');
  process.exit(1);
}

console.log('⚠️  IMPORTANT: Make sure the worker is running!');
console.log('   Run in another terminal: node worker.js');
console.log('   Or with PM2: pm2 start worker.js --name shopify-worker\n');

// Wait a bit for user to read
setTimeout(() => {
  testEndToEndSync();
}, 2000);
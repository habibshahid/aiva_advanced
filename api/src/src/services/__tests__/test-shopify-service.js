/**
 * Test Shopify Service
 * Run: node test-shopify-service.js
 */

const ShopifyService = require('../ShopifyService');
const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// CONFIGURATION - Update these with your test Shopify store credentials
const TEST_CONFIG = {
  shop_domain: 'cod-testing-1122.myshopify.com', // UPDATE THIS
  access_token: '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',        // UPDATE THIS
  kb_id: uuidv4(), // Test KB ID
  tenant_id: uuidv4() // Test tenant ID
};

async function testShopifyService() {
  console.log('Testing Shopify Service...\n');
  console.log('⚠️  Make sure you\'ve updated TEST_CONFIG with your Shopify credentials!\n');
  
  let storeId = null;
  
  try {
    // Test 1: Test Connection
    console.log('✓ Test 1: Testing Shopify connection...');
    const shopInfo = await ShopifyService.testConnection(
      TEST_CONFIG.shop_domain,
      TEST_CONFIG.access_token
    );
    console.log(`  Connected to: ${shopInfo.name}`);
    console.log(`  Domain: ${shopInfo.domain}`);
    console.log(`  Currency: ${shopInfo.currency}`);
    
    // Test 2: Create Store Connection
    console.log('\n✓ Test 2: Creating store connection...');
    const store = await ShopifyService.createStore({
      kb_id: TEST_CONFIG.kb_id,
      tenant_id: TEST_CONFIG.tenant_id,
      shop_domain: TEST_CONFIG.shop_domain,
      access_token: TEST_CONFIG.access_token,
      sync_settings: {
        auto_sync_enabled: true,
        sync_frequency_minutes: 1440
      }
    });
    storeId = store.id;
    console.log(`  Store created: ${storeId}`);
    console.log(`  KB ID: ${store.kb_id}`);
    console.log(`  Status: ${store.status}`);
    
    // Test 3: Get Store
    console.log('\n✓ Test 3: Retrieving store...');
    const retrievedStore = await ShopifyService.getStore(storeId);
    console.log(`  Store ID: ${retrievedStore.id}`);
    console.log(`  Shop Domain: ${retrievedStore.shop_domain}`);
    console.log(`  Auto Sync: ${retrievedStore.auto_sync_enabled}`);
    
    // Test 4: Get Store by KB ID
    console.log('\n✓ Test 4: Getting store by KB ID...');
    const storeByKb = await ShopifyService.getStoreByKbId(TEST_CONFIG.kb_id);
    console.log(`  Found store: ${storeByKb.id}`);
    
    // Test 5: Fetch Products Count
    console.log('\n✓ Test 5: Fetching products count...');
    const count = await ShopifyService.fetchProductsCount(
      TEST_CONFIG.shop_domain,
      TEST_CONFIG.access_token,
      { status: 'active' }
    );
    console.log(`  Total active products: ${count}`);
    
    // Test 6: Fetch Products (First Page)
    console.log('\n✓ Test 6: Fetching first page of products...');
    const response = await ShopifyService.fetchProducts(
      TEST_CONFIG.shop_domain,
      TEST_CONFIG.access_token,
      { limit: 5, status: 'active' }
    );
    console.log(`  Fetched: ${response.products.length} products`);
    console.log(`  Has more: ${response.pageInfo.hasNextPage}`);
    
    if (response.products.length > 0) {
      const product = response.products[0];
      console.log(`  Sample product: ${product.title}`);
      console.log(`    ID: ${product.id}`);
      console.log(`    Price: ${product.variants[0]?.price}`);
      console.log(`    Images: ${product.images.length}`);
    }
    
    // Test 7: Update Store Settings
    console.log('\n✓ Test 7: Updating store settings...');
    await ShopifyService.updateStore(storeId, {
      sync_frequency_minutes: 720, // 12 hours
      sync_reviews: false
    });
    const updatedStore = await ShopifyService.getStore(storeId);
    console.log(`  Sync frequency: ${updatedStore.sync_frequency_minutes} minutes`);
    console.log(`  Sync reviews: ${updatedStore.sync_reviews}`);
    
    // Test 8: List Stores
    console.log('\n✓ Test 8: Listing stores for tenant...');
    const stores = await ShopifyService.listStores(TEST_CONFIG.tenant_id);
    console.log(`  Found ${stores.length} store(s)`);
    
    // Test 9: Rate Limiting
    console.log('\n✓ Test 9: Testing rate limiting...');
    const start = Date.now();
    await ShopifyService.fetchProductsCount(
      TEST_CONFIG.shop_domain,
      TEST_CONFIG.access_token
    );
    await ShopifyService.fetchProductsCount(
      TEST_CONFIG.shop_domain,
      TEST_CONFIG.access_token
    );
    const elapsed = Date.now() - start;
    console.log(`  Two requests took: ${elapsed}ms`);
    console.log(`  Rate limit delay working: ${elapsed >= 500 ? 'YES' : 'NO'}`);
    
    // Clean up
    console.log('\n✓ Cleaning up test data...');
    await ShopifyService.deleteStore(storeId);
    console.log('  Test store deleted');
    
    console.log('\n✅ All Shopify Service tests passed!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Shopify Service test failed:', error.message);
    console.error(error);
    
    // Clean up on error
    if (storeId) {
      try {
        await ShopifyService.deleteStore(storeId);
        console.log('  Cleaned up test store');
      } catch (cleanupError) {
        console.error('  Could not clean up test store:', cleanupError.message);
      }
    }
    
    process.exit(1);
  }
}

// Check if configuration is updated
if (TEST_CONFIG.shop_domain === 'your-test-store.myshopify.com') {
  console.error('❌ ERROR: Please update TEST_CONFIG with your Shopify credentials');
  console.error('\nHow to get credentials:');
  console.error('1. Create a test Shopify store at: https://partners.shopify.com/');
  console.error('2. Create a custom app in your store admin');
  console.error('3. Get the Admin API access token');
  console.error('4. Update TEST_CONFIG in this file');
  process.exit(1);
}

testShopifyService();
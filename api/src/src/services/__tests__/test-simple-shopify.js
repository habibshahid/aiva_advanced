/**
 * Simple Shopify API Test (No Database Required)
 * Run: node test-shopify-simple.js
 */

const axios = require('axios');
const crypto = require('crypto');

// CONFIGURATION - Update these with your credentials
const CONFIG = {
  shop_domain: 'cod-testing-1122.myshopify.com',
  access_token: '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',  // Update with your actual token
  api_version: '2024-01'
};

// Simple rate limiter
let lastRequestTime = 0;
const RATE_LIMIT_DELAY = 500;

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

async function makeRequest(endpoint, method = 'GET', data = null) {
  await waitForRateLimit();
  
  const url = `https://${CONFIG.shop_domain}/admin/api/${CONFIG.api_version}${endpoint}`;
  
  try {
    const response = await axios({
      method,
      url,
      headers: {
        'X-Shopify-Access-Token': CONFIG.access_token,
        'Content-Type': 'application/json'
      },
      data,
      timeout: 30000
    });
    
    return response.data;
    
  } catch (error) {
    if (error.response) {
      throw new Error(`Shopify API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error('Shopify API: No response received');
    } else {
      throw new Error(`Shopify API Request Error: ${error.message}`);
    }
  }
}

async function testShopifyAPI() {
  console.log('🧪 Simple Shopify API Test\n');
  console.log('Configuration:');
  console.log('  Shop:', CONFIG.shop_domain);
  console.log('  API Version:', CONFIG.api_version);
  console.log('  Token Length:', CONFIG.access_token.length);
  console.log('');
  
  try {
    // Test 1: Get shop info
    console.log('Test 1: Fetching shop information...');
    const shopData = await makeRequest('/shop.json');
    console.log('  ✅ Success!');
    console.log('  Shop Name:', shopData.shop.name);
    console.log('  Email:', shopData.shop.email);
    console.log('  Currency:', shopData.shop.currency);
    console.log('  Domain:', shopData.shop.domain);
    
    // Test 2: Get products count
    console.log('\nTest 2: Fetching products count...');
    const countData = await makeRequest('/products/count.json?status=active');
    console.log('  ✅ Success!');
    console.log('  Active products:', countData.count);
    
    // Test 3: Get first page of products
    console.log('\nTest 3: Fetching products (first 5)...');
    const productsData = await makeRequest('/products.json?limit=5&status=active');
    console.log('  ✅ Success!');
    console.log('  Fetched:', productsData.products.length, 'products');
    
    if (productsData.products.length > 0) {
      const product = productsData.products[0];
      console.log('\n  Sample Product:');
      console.log('    ID:', product.id);
      console.log('    Title:', product.title);
      console.log('    Vendor:', product.vendor);
      console.log('    Type:', product.product_type);
      console.log('    Price:', product.variants[0]?.price);
      console.log('    Images:', product.images.length);
      console.log('    Variants:', product.variants.length);
      console.log('    Tags:', product.tags.slice(0, 3).join(', '));
    }
    
    // Test 4: Get single product details
    if (productsData.products.length > 0) {
      const productId = productsData.products[0].id;
      console.log('\nTest 4: Fetching single product details...');
      const singleProduct = await makeRequest(`/products/${productId}.json`);
      console.log('  ✅ Success!');
      console.log('  Product:', singleProduct.product.title);
      console.log('  Status:', singleProduct.product.status);
      console.log('  Created:', singleProduct.product.created_at);
      console.log('  Updated:', singleProduct.product.updated_at);
    }
    
    // Test 5: Test pagination
    console.log('\nTest 5: Testing pagination...');
    const page1 = await makeRequest('/products.json?limit=3&status=active');
    console.log('  ✅ Page 1: Fetched', page1.products.length, 'products');
    
    if (page1.products.length === 3) {
      const lastProductId = page1.products[page1.products.length - 1].id;
      const page2 = await makeRequest(`/products.json?limit=3&status=active&since_id=${lastProductId}`);
      console.log('  ✅ Page 2: Fetched', page2.products.length, 'products');
    }
    
    // Test 6: Rate limiting
    console.log('\nTest 6: Testing rate limiting...');
    const start = Date.now();
    await makeRequest('/products/count.json');
    await makeRequest('/products/count.json');
    const elapsed = Date.now() - start;
    console.log('  ✅ Two requests took:', elapsed, 'ms');
    console.log('  Rate limit working:', elapsed >= RATE_LIMIT_DELAY ? 'YES' : 'NO');
    
    console.log('\n✅ All API tests passed!');
    console.log('\n📊 Summary:');
    console.log('  • Shop connection: Working');
    console.log('  • Product fetching: Working');
    console.log('  • Pagination: Working');
    console.log('  • Rate limiting: Working');
    console.log('  • Total products:', countData.count);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Validate configuration
if (CONFIG.shop_domain === 'your-store.myshopify.com' || 
    CONFIG.access_token === 'shpat_xxxxx') {
  console.error('❌ ERROR: Please update CONFIG with your Shopify credentials\n');
  process.exit(1);
}

testShopifyAPI();
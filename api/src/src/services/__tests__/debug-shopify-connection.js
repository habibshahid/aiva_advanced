/**
 * Shopify Connection Debugger
 * Run: node debug-shopify-connection.js
 */

const axios = require('axios');

// CONFIGURATION - Update these
const CONFIG = {
  shop_domain: 'cod-testing-1122.myshopify.com', // UPDATE THIS
  access_token: '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',              // UPDATE THIS
};

async function debugShopifyConnection() {
  console.log('🔍 Shopify Connection Debugger\n');
  console.log('Configuration:');
  console.log('  Shop Domain:', CONFIG.shop_domain);
  console.log('  Token Length:', CONFIG.access_token.length);
  console.log('  Token Prefix:', CONFIG.access_token.substring(0, 6) + '...\n');
  
  // Test 1: Basic connectivity
  console.log('Test 1: Testing basic connectivity...');
  try {
    const url = `https://${CONFIG.shop_domain}/admin/api/2024-01/shop.json`;
    console.log('  URL:', url);
    
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': CONFIG.access_token,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('  ✅ Connection successful!');
    console.log('  Shop Name:', response.data.shop.name);
    console.log('  Shop Email:', response.data.shop.email);
    console.log('  Currency:', response.data.shop.currency);
    console.log('  Domain:', response.data.shop.domain);
    
  } catch (error) {
    console.log('  ❌ Connection failed');
    
    if (error.response) {
      console.log('\n  Response Details:');
      console.log('    Status:', error.response.status);
      console.log('    Status Text:', error.response.statusText);
      console.log('    Headers:', JSON.stringify(error.response.headers, null, 2));
      console.log('    Data:', JSON.stringify(error.response.data, null, 2));
      
      // Specific error analysis
      if (error.response.status === 401) {
        console.log('\n  🔴 AUTHENTICATION ERROR');
        console.log('    - Your access token is invalid or expired');
        console.log('    - Check: Shopify Admin → Apps → Your App → API credentials');
        console.log('    - Regenerate the access token if needed');
      } else if (error.response.status === 403) {
        console.log('\n  🔴 PERMISSION ERROR');
        console.log('    - Your app doesn\'t have required permissions');
        console.log('    - Required scopes: read_products, read_inventory');
        console.log('    - Check: Shopify Admin → Apps → Your App → API scopes');
      } else if (error.response.status === 404) {
        console.log('\n  🔴 STORE NOT FOUND');
        console.log('    - Check your shop domain is correct');
        console.log('    - Format should be: your-store.myshopify.com');
        console.log('    - Make sure the store exists and is active');
      } else if (error.response.status === 400) {
        console.log('\n  🔴 BAD REQUEST');
        console.log('    - The API version might be incorrect');
        console.log('    - The shop domain format might be wrong');
        console.log('    - Try using a different API version');
      }
      
    } else if (error.request) {
      console.log('\n  🔴 NO RESPONSE FROM SERVER');
      console.log('    - Check your internet connection');
      console.log('    - Check if Shopify is accessible');
      console.log('    - Firewall might be blocking the request');
      
    } else {
      console.log('\n  🔴 REQUEST SETUP ERROR');
      console.log('    Error:', error.message);
    }
    
    return;
  }
  
  // Test 2: Try different API versions
  console.log('\nTest 2: Testing different API versions...');
  const versions = ['2024-01', '2023-10', '2023-07'];
  
  for (const version of versions) {
    try {
      const url = `https://${CONFIG.shop_domain}/admin/api/${version}/shop.json`;
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': CONFIG.access_token
        },
        timeout: 5000
      });
      console.log(`  ✅ API version ${version} works!`);
    } catch (error) {
      console.log(`  ❌ API version ${version} failed (${error.response?.status || 'timeout'})`);
    }
  }
  
  // Test 3: Check token format
  console.log('\nTest 3: Checking token format...');
  if (CONFIG.access_token.startsWith('shpat_')) {
    console.log('  ✅ Token has correct prefix (shpat_)');
  } else if (CONFIG.access_token.startsWith('shpca_')) {
    console.log('  ⚠️  Token is a channel access token (shpca_)');
    console.log('      This might work but Admin API access token is recommended');
  } else if (CONFIG.access_token.startsWith('shpua_')) {
    console.log('  ⚠️  Token is a user access token (shpua_)');
    console.log('      This might work but Admin API access token is recommended');
  } else {
    console.log('  ❌ Token format unrecognized');
    console.log('      Expected format: shpat_xxxxxxxxxxxxxxxxxxxxxxxx');
    console.log('      Your token starts with:', CONFIG.access_token.substring(0, 6));
  }
  
  // Test 4: Check domain format
  console.log('\nTest 4: Checking domain format...');
  if (CONFIG.shop_domain.includes('.myshopify.com')) {
    console.log('  ✅ Domain has correct format');
  } else {
    console.log('  ❌ Domain format incorrect');
    console.log('      Expected: your-store.myshopify.com');
    console.log('      Your domain:', CONFIG.shop_domain);
  }
  
  // Test 5: Try products endpoint
  console.log('\nTest 5: Testing products endpoint...');
  try {
    const url = `https://${CONFIG.shop_domain}/admin/api/2024-01/products/count.json`;
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': CONFIG.access_token
      },
      timeout: 5000
    });
    console.log('  ✅ Products endpoint works!');
    console.log('  Product count:', response.data.count);
  } catch (error) {
    console.log('  ❌ Products endpoint failed');
    if (error.response?.status === 403) {
      console.log('      Missing permission: read_products');
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY & RECOMMENDATIONS:');
  console.log('='.repeat(50));
  
  console.log('\n📋 Checklist:');
  console.log('  1. Shop domain includes .myshopify.com?');
  console.log('  2. Access token starts with shpat_?');
  console.log('  3. Token is from Admin API (not Storefront)?');
  console.log('  4. App has read_products scope?');
  console.log('  5. App is installed on the store?');
  
  console.log('\n🔧 How to get correct credentials:');
  console.log('  1. Go to Shopify Admin');
  console.log('  2. Settings → Apps and sales channels');
  console.log('  3. Develop apps → Create an app');
  console.log('  4. Configure Admin API scopes:');
  console.log('     ✓ read_products');
  console.log('     ✓ read_inventory');
  console.log('  5. Install app → Reveal token once');
  console.log('  6. Copy the Admin API access token (starts with shpat_)');
  
  console.log('\n');
}

// Validation
if (CONFIG.shop_domain === 'your-store.myshopify.com' || CONFIG.access_token === 'shpat_xxxxx') {
  console.error('❌ ERROR: Please update CONFIG with your actual Shopify credentials\n');
  console.log('Edit this file and update:');
  console.log('  shop_domain: "your-actual-store.myshopify.com"');
  console.log('  access_token: "shpat_your_actual_token"\n');
  process.exit(1);
}

debugShopifyConnection().catch(error => {
  console.error('\n💥 Unexpected error:', error.message);
  process.exit(1);
});
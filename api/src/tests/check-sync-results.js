#!/usr/bin/env node
/**
 * Check Shopify Sync Results
 * Quick script to verify sync worked
 */

require('dotenv').config();
const db = require('../config/database');

async function checkSyncResults() {
  console.log('\n🔍 Checking Shopify Sync Results\n');
  console.log('='.repeat(60));
  
  try {
    // Check products
    const [products] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(total_inventory) as total_inventory
      FROM yovo_tbl_aiva_products
    `);
    
    console.log('\n📦 Products:');
    console.log(`   Total: ${products[0].total}`);
    console.log(`   Active: ${products[0].active}`);
    console.log(`   Total Inventory: ${products[0].total_inventory}`);
    
    // Check variants
    const [variants] = await db.query('SELECT COUNT(*) as total FROM yovo_tbl_aiva_product_variants');
    console.log(`\n🎨 Variants: ${variants[0].total}`);
    
    // Check images
    const [images] = await db.query('SELECT COUNT(*) as total FROM yovo_tbl_aiva_images WHERE source = "shopify"');
    console.log(`\n🖼️  Images: ${images[0].total}`);
    
    // Check product-image links
    const [links] = await db.query('SELECT COUNT(*) as total FROM yovo_tbl_aiva_product_images');
    console.log(`   Image Links: ${links[0].total}`);
    
    // Check sync jobs
    const [jobs] = await db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(processed_products) as products,
        SUM(processed_images) as images
      FROM yovo_tbl_aiva_sync_jobs
      GROUP BY status
    `);
    
    console.log('\n📊 Sync Jobs:');
    jobs.forEach(job => {
      console.log(`   ${job.status}: ${job.count} jobs (${job.products || 0} products, ${job.images || 0} images)`);
    });
    
    // Latest sync
    const [latest] = await db.query(`
      SELECT 
        id,
        status,
        total_products,
        processed_products,
        failed_products,
        processed_images,
        total_images,
        created_at,
        completed_at,
        TIMESTAMPDIFF(SECOND, started_at, completed_at) as duration_seconds
      FROM yovo_tbl_aiva_sync_jobs
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (latest.length > 0) {
      const job = latest[0];
      console.log('\n🕐 Latest Sync:');
      console.log(`   Status: ${job.status}`);
      console.log(`   Products: ${job.processed_products}/${job.total_products} (${job.failed_products} failed)`);
      console.log(`   Images: ${job.processed_images}/${job.total_images}`);
      console.log(`   Duration: ${job.duration_seconds || 0} seconds`);
      console.log(`   Started: ${job.created_at}`);
      if (job.completed_at) {
        console.log(`   Completed: ${job.completed_at}`);
      }
    }
    
    // Sample products
    const [sampleProducts] = await db.query(`
      SELECT 
        title,
        price,
        status,
        total_inventory,
        vendor
      FROM yovo_tbl_aiva_products
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (sampleProducts.length > 0) {
      console.log('\n📝 Sample Products:');
      sampleProducts.forEach((p, i) => {
        console.log(`   ${i+1}. ${p.title}`);
        console.log(`      Price: PKR ${p.price} | Stock: ${p.total_inventory} | Status: ${p.status}`);
        if (p.vendor) console.log(`      Vendor: ${p.vendor}`);
      });
    }
    
    // Stores
    const [stores] = await db.query(`
      SELECT 
        shop_domain,
        status,
        total_products_synced,
        last_sync_at,
        last_sync_status
      FROM yovo_tbl_aiva_shopify_stores
    `);
    
    if (stores.length > 0) {
      console.log('\n🏪 Connected Stores:');
      stores.forEach(store => {
        console.log(`   ${store.shop_domain}`);
        console.log(`      Status: ${store.status}`);
        console.log(`      Products Synced: ${store.total_products_synced || 0}`);
        console.log(`      Last Sync: ${store.last_sync_at || 'Never'} (${store.last_sync_status || 'N/A'})`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Check complete!\n');
    
  } catch (error) {
    console.error('\n❌ Error checking results:', error.message);
  } finally {
    await db.end();
  }
}

checkSyncResults();
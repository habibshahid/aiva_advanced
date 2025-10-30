// test-db-setup.js
const db = require('../config/database');

async function testDatabase() {
  console.log('Testing database setup...\n');
  
  try {
    // Test 1: Check tables exist
    console.log('✓ Test 1: Checking tables...');
    const [tables] = await db.query(`
      SHOW TABLES LIKE 'yovo_tbl_aiva_%'
    `);
    console.log(`  Found ${tables.length} tables`);
    tables.forEach(t => console.log(`    - ${Object.values(t)[0]}`));
    
    // Test 2: Check products table structure
    console.log('\n✓ Test 2: Checking products table...');
    const [columns] = await db.query(`
      DESCRIBE yovo_tbl_aiva_products
    `);
    console.log(`  Products table has ${columns.length} columns`);
    
    // Test 3: Check sync_jobs table structure
    console.log('\n✓ Test 3: Checking sync_jobs table...');
    const [jobColumns] = await db.query(`
      DESCRIBE yovo_tbl_aiva_sync_jobs
    `);
    console.log(`  Sync jobs table has ${jobColumns.length} columns`);
    
    console.log('\n✅ Database setup successful!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

testDatabase();
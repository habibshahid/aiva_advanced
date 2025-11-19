/**
 * Test Database Connection
 * 
 * This script tests the database connection without running any migrations.
 * Use this to verify your credentials and connectivity before running the migration.
 * 
 * Usage: node test-connection.js
 */

const mysql = require('mysql2/promise');

// Load environment variables if .env file exists
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, will use process.env directly
}

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'yovo_db_cc',
  connectTimeout: 10000
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testConnection() {
  let connection;
  
  try {
    console.log('\n' + '='.repeat(60));
    log('Testing Database Connection', 'bright');
    console.log('='.repeat(60) + '\n');
    
    // Display configuration
    log('Configuration:', 'cyan');
    log(`  Host:     ${DB_CONFIG.host}:${DB_CONFIG.port}`, 'cyan');
    log(`  User:     ${DB_CONFIG.user}`, 'cyan');
    log(`  Database: ${DB_CONFIG.database}`, 'cyan');
    log(`  Password: ${DB_CONFIG.password ? '***' : '(empty)'}`, 'cyan');
    console.log();
    
    // Test connection to server (without database)
    log('Step 1: Testing server connection...', 'cyan');
    connection = await mysql.createConnection({
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
      connectTimeout: DB_CONFIG.connectTimeout
    });
    log('✓ Server connection successful!', 'green');
    
    // Check MySQL version
    const [versionResult] = await connection.query('SELECT VERSION() as version');
    log(`✓ MySQL Version: ${versionResult[0].version}`, 'green');
    
    // Check if database exists
    log('\nStep 2: Checking database...', 'cyan');
    const [databases] = await connection.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [DB_CONFIG.database]
    );
    
    if (databases.length === 0) {
      log(`⚠ Database '${DB_CONFIG.database}' does not exist!`, 'yellow');
      log('\nTo create the database, run:', 'yellow');
      log(`  mysql -u ${DB_CONFIG.user} -p -e "CREATE DATABASE ${DB_CONFIG.database};"`, 'cyan');
      log('\nOr in MySQL:', 'yellow');
      log(`  CREATE DATABASE ${DB_CONFIG.database};`, 'cyan');
      
      await connection.end();
      return false;
    }
    
    log(`✓ Database '${DB_CONFIG.database}' exists`, 'green');
    
    // Connect to the specific database
    await connection.end();
    log('\nStep 3: Connecting to database...', 'cyan');
    connection = await mysql.createConnection(DB_CONFIG);
    log('✓ Database connection successful!', 'green');
    
    // Check for existing AIVA tables
    log('\nStep 4: Checking for existing AIVA tables...', 'cyan');
    const [tables] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ? 
      AND table_name LIKE 'yovo_tbl_aiva_%'
      ORDER BY table_name
    `, [DB_CONFIG.database]);
    
    if (tables.length === 0) {
      log('⚠ No AIVA tables found', 'yellow');
      log('  This appears to be a fresh database', 'yellow');
      log('  Migration will create all tables', 'yellow');
    } else {
      log(`✓ Found ${tables.length} existing AIVA tables:`, 'green');
      tables.slice(0, 5).forEach(table => {
        log(`  - ${table.table_name}`, 'cyan');
      });
      if (tables.length > 5) {
        log(`  ... and ${tables.length - 5} more`, 'cyan');
      }
      log('\n  Migration will add any missing columns', 'yellow');
    }
    
    // Check user privileges
    log('\nStep 5: Checking user privileges...', 'cyan');
    try {
      const [grants] = await connection.query('SHOW GRANTS');
      const hasCreatePrivilege = grants.some(grant => 
        grant[Object.keys(grant)[0]].toUpperCase().includes('CREATE') ||
        grant[Object.keys(grant)[0]].toUpperCase().includes('ALL PRIVILEGES')
      );
      
      if (hasCreatePrivilege) {
        log('✓ User has CREATE privileges', 'green');
      } else {
        log('⚠ User may not have CREATE privileges', 'yellow');
        log('  Migration might fail without proper privileges', 'yellow');
      }
    } catch (error) {
      log('⚠ Could not check privileges', 'yellow');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    log('Connection Test Summary', 'bright');
    console.log('='.repeat(60));
    log('\n✓ All connection tests passed!', 'green');
    log('\nYou are ready to run the migration:', 'cyan');
    log('  npm run migrate', 'bright');
    log('\nOr:', 'cyan');
    log('  node run-migration.js', 'bright');
    console.log();
    
    await connection.end();
    return true;
    
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    log('Connection Test Failed', 'red');
    console.log('='.repeat(60) + '\n');
    
    log('Error:', 'red');
    log(`  ${error.message}`, 'red');
    
    // Provide specific help based on error
    if (error.code === 'ECONNREFUSED') {
      log('\nPossible solutions:', 'yellow');
      log('  1. Make sure MySQL server is running', 'cyan');
      log('  2. Check if the host and port are correct', 'cyan');
      log('  3. Check firewall settings', 'cyan');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      log('\nPossible solutions:', 'yellow');
      log('  1. Check your username and password', 'cyan');
      log('  2. Verify the user has access from this host', 'cyan');
      log('  3. Try: GRANT ALL PRIVILEGES ON *.* TO \'user\'@\'host\';', 'cyan');
    } else if (error.code === 'ENOTFOUND') {
      log('\nPossible solutions:', 'yellow');
      log('  1. Check the hostname is correct', 'cyan');
      log('  2. Check your network connection', 'cyan');
    }
    
    log('\nConfiguration used:', 'yellow');
    log(`  Host:     ${DB_CONFIG.host}:${DB_CONFIG.port}`, 'cyan');
    log(`  User:     ${DB_CONFIG.user}`, 'cyan');
    log(`  Database: ${DB_CONFIG.database}`, 'cyan');
    
    console.log();
    
    if (connection) {
      await connection.end();
    }
    
    return false;
  }
}

// Run the test
testConnection()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\nUnexpected error:', error);
    process.exit(1);
  });
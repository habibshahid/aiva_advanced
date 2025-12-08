#!/usr/bin/env node

/**
 * AIVA Initial Setup Seed Script
 * 
 * This standalone script creates a default tenant and super_admin user
 * ONLY if no tenants exist in the database (first-time setup).
 * 
 * Usage:
 *   node seed-initial-setup.js
 * 
 * Or with custom email (password is always randomly generated):
 *   ADMIN_EMAIL=custom@email.com node seed-initial-setup.js
 * 
 * Default Credentials:
 *   Email:    admin@aiva.local
 *   Password: (randomly generated - displayed in console output)
 * 
 * IMPORTANT: Save the password displayed in console output!
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Configuration from environment or defaults
const config = {
  host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306'),
  user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'yovo_db_cc'
};

// Default admin credentials (can be overridden via env vars)
const adminEmail = process.env.ADMIN_EMAIL || 'admin@aiva.local';
const adminName = process.env.ADMIN_NAME || 'System Administrator';
const tenantName = process.env.TENANT_NAME || 'Default Organization';
const companyName = process.env.COMPANY_NAME || 'AIVA Platform';
const startingCredits = parseFloat(process.env.STARTING_CREDITS || '100');

/**
 * Generate a secure API key
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `aiva_${randomBytes}`;
}

/**
 * Generate a secure random password
 * @param {number} length - Password length (default: 16)
 * @returns {string} Secure random password
 */
function generateSecurePassword(length = 16) {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$%&*';
  
  const allChars = uppercase + lowercase + numbers + special;
  
  // Ensure at least one of each type
  let password = '';
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

/**
 * Print a styled box with message
 */
function printBox(title, lines) {
  const width = 60;
  const border = '─'.repeat(width - 2);
  
  console.log(`┌${border}┐`);
  console.log(`│${title.padStart((width + title.length) / 2).padEnd(width - 2)}│`);
  console.log(`├${border}┤`);
  
  for (const line of lines) {
    console.log(`│  ${line.padEnd(width - 4)}│`);
  }
  
  console.log(`└${border}┘`);
}

async function seedInitialSetup() {
  let connection;
  
  try {
    console.log('='.repeat(60));
    console.log('AIVA Initial Setup Seed');
    console.log('='.repeat(60));
    console.log(`\nDatabase: ${config.host}:${config.port}/${config.database}`);
    
    // Connect to database
    console.log('\n1. Connecting to database...');
    connection = await mysql.createConnection(config);
    console.log('✓ Connected to database');
    
    // Check if any tenant exists
    console.log('\n2. Checking for existing tenants...');
    const [tenants] = await connection.query(
      'SELECT COUNT(*) as count FROM yovo_tbl_aiva_tenants'
    );
    
    const tenantCount = tenants[0].count;
    
    if (tenantCount > 0) {
      console.log(`\n⚠ Found ${tenantCount} existing tenant(s).`);
      console.log('⚠ Skipping seed - system is already initialized.');
      console.log('\nTo re-seed, manually delete existing tenants first.');
      console.log('='.repeat(60) + '\n');
      await connection.end();
      process.exit(0);
    }
    
    console.log('✓ No tenants found - proceeding with first-time setup...');
    
    // Start transaction
    await connection.beginTransaction();
    
    try {
      // Create Default Tenant
      console.log('\n3. Creating default tenant...');
      
      const tenantId = uuidv4();
      const apiKey = generateApiKey();
      
      await connection.query(`
        INSERT INTO yovo_tbl_aiva_tenants (
          id, name, company_name, api_key, credit_balance, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
      `, [tenantId, tenantName, companyName, apiKey, startingCredits]);
      
      console.log('✓ Created tenant:');
      console.log(`    ID: ${tenantId}`);
      console.log(`    Name: ${tenantName}`);
      console.log(`    Company: ${companyName}`);
      console.log(`    Credits: $${startingCredits.toFixed(4)}`);
      
      // Create Super Admin User
      console.log('\n4. Creating super admin user...');
      
      const userId = uuidv4();
      const adminPassword = generateSecurePassword(16);
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      
      await connection.query(`
        INSERT INTO yovo_tbl_aiva_users (
          id, tenant_id, email, password_hash, name, role, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'super_admin', 1, NOW(), NOW())
      `, [userId, tenantId, adminEmail, passwordHash, adminName]);
      
      console.log('✓ Created super admin user:');
      console.log(`    ID: ${userId}`);
      console.log(`    Name: ${adminName}`);
      console.log(`    Email: ${adminEmail}`);
      console.log(`    Role: super_admin`);
      
      // Create Default Notification Settings
      console.log('\n5. Creating default notification settings...');
      
      const notificationSettings = [
        { type: 'low_balance', enabled: 1, threshold: 10.00 },
        { type: 'daily_summary', enabled: 0, threshold: null },
        { type: 'system_alert', enabled: 0, threshold: null }
      ];
      
      for (const setting of notificationSettings) {
        await connection.query(`
          INSERT INTO yovo_tbl_aiva_tenant_notification_settings (
            id, tenant_id, notification_type, is_enabled,
            threshold_value, recipient_emails, notification_frequency,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'immediate', NOW(), NOW())
        `, [
          uuidv4(),
          tenantId,
          setting.type,
          setting.enabled,
          setting.threshold,
          JSON.stringify([adminEmail])
        ]);
      }
      
      console.log('✓ Created notification settings');
      
      // Commit transaction
      await connection.commit();
      
      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('✓ AIVA Initial Setup Complete!');
      console.log('='.repeat(60));
      
      printBox('LOGIN CREDENTIALS', [
        `Email:    ${adminEmail}`,
        `Password: ${adminPassword}`,
        '',
        '⚠️  SAVE THIS PASSWORD NOW! IT WILL NOT BE SHOWN AGAIN!'
      ]);
      
      console.log('');
      
      printBox('API ACCESS', [
        `API Key: ${apiKey}`
      ]);
      
      console.log('\n');
      
    } catch (err) {
      // Rollback on error
      await connection.rollback();
      throw err;
    }
    
    await connection.end();
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Seed failed:', err.message);
    
    if (err.code === 'ECONNREFUSED') {
      console.error('\nCannot connect to database. Please check:');
      console.error('  1. MySQL is running');
      console.error('  2. Connection settings are correct');
      console.error(`     Host: ${config.host}`);
      console.error(`     Port: ${config.port}`);
      console.error(`     User: ${config.user}`);
      console.error(`     Database: ${config.database}`);
    }
    
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.error('\nTable does not exist. Please run migrations first:');
      console.error('  npx sequelize-cli db:migrate');
    }
    
    if (connection) {
      await connection.end();
    }
    
    process.exit(1);
  }
}

// Run the seed
seedInitialSetup();
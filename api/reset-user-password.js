#!/usr/bin/env node

/**
 * AIVA User Password Reset Script
 * 
 * This standalone script resets the password for an existing user.
 * 
 * Usage:
 *   Interactive mode:
 *     node reset-user-password.js
 * 
 *   With email argument:
 *     node reset-user-password.js admin@example.com
 * 
 *   With environment variables:
 *     USER_EMAIL=admin@example.com node reset-user-password.js
 * 
 *   With custom password (not recommended - use generated):
 *     USER_EMAIL=admin@example.com USER_PASSWORD=MyCustomPass123! node reset-user-password.js
 * 
 * IMPORTANT: Save the password displayed in console output!
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const readline = require('readline');

// Configuration from environment or defaults
const config = {
  host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306'),
  user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'yovo_db_cc'
};

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

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * List all users in the system
 */
async function listUsers(connection) {
  const [users] = await connection.query(`
    SELECT 
      u.id,
      u.email,
      u.name,
      u.role,
      u.is_active,
      t.name as tenant_name,
      u.updated_at
    FROM yovo_tbl_aiva_users u
    LEFT JOIN yovo_tbl_aiva_tenants t ON u.tenant_id = t.id
    ORDER BY u.email
  `);
  
  return users;
}

/**
 * Find user by email
 */
async function findUserByEmail(connection, email) {
  const [users] = await connection.query(`
    SELECT 
      u.id,
      u.email,
      u.name,
      u.role,
      u.is_active,
      u.tenant_id,
      t.name as tenant_name
    FROM yovo_tbl_aiva_users u
    LEFT JOIN yovo_tbl_aiva_tenants t ON u.tenant_id = t.id
    WHERE u.email = ?
  `, [email]);
  
  return users[0] || null;
}

/**
 * Update user password
 */
async function updatePassword(connection, userId, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  await connection.query(`
    UPDATE yovo_tbl_aiva_users 
    SET password_hash = ?, updated_at = NOW()
    WHERE id = ?
  `, [passwordHash, userId]);
}

async function resetUserPassword() {
  let connection;
  
  try {
    console.log('='.repeat(60));
    console.log('AIVA User Password Reset');
    console.log('='.repeat(60));
    console.log(`\nDatabase: ${config.host}:${config.port}/${config.database}`);
    
    // Connect to database
    console.log('\n1. Connecting to database...');
    connection = await mysql.createConnection(config);
    console.log('✓ Connected to database');
    
    // Get email from args, env, or prompt
    let userEmail = process.argv[2] || process.env.USER_EMAIL;
    
    if (!userEmail) {
      // List existing users
      console.log('\n2. Listing existing users...\n');
      
      const users = await listUsers(connection);
      
      if (users.length === 0) {
        console.log('❌ No users found in the database.');
        console.log('   Run the seed script first: node seed-initial-setup.js');
        await connection.end();
        process.exit(1);
      }
      
      console.log('Available users:');
      console.log('─'.repeat(60));
      console.log(
        'Email'.padEnd(30) + 
        'Name'.padEnd(20) + 
        'Role'.padEnd(12)
      );
      console.log('─'.repeat(60));
      
      for (const user of users) {
        const status = user.is_active ? '' : ' (inactive)';
        console.log(
          (user.email || '').substring(0, 28).padEnd(30) + 
          (user.name || '').substring(0, 18).padEnd(20) + 
          (user.role + status).padEnd(12)
        );
      }
      
      console.log('─'.repeat(60));
      console.log(`Total: ${users.length} user(s)\n`);
      
      // Prompt for email
      userEmail = await prompt('Enter user email to reset password: ');
      
      if (!userEmail) {
        console.log('\n❌ No email provided. Exiting.');
        await connection.end();
        process.exit(1);
      }
    }
    
    // Find the user
    console.log(`\n3. Finding user: ${userEmail}...`);
    
    const user = await findUserByEmail(connection, userEmail);
    
    if (!user) {
      console.log(`\n❌ User not found: ${userEmail}`);
      console.log('\nPlease check the email address and try again.');
      await connection.end();
      process.exit(1);
    }
    
    console.log('✓ User found:');
    console.log(`    ID: ${user.id}`);
    console.log(`    Name: ${user.name}`);
    console.log(`    Email: ${user.email}`);
    console.log(`    Role: ${user.role}`);
    console.log(`    Tenant: ${user.tenant_name || 'N/A'}`);
    console.log(`    Status: ${user.is_active ? 'Active' : 'Inactive'}`);
    
    // Confirm password reset
    if (!process.env.USER_EMAIL && !process.argv[2]) {
      const confirm = await prompt('\nReset password for this user? (yes/no): ');
      
      if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
        console.log('\n❌ Password reset cancelled.');
        await connection.end();
        process.exit(0);
      }
    }
    
    // Generate or use provided password
    console.log('\n4. Generating new password...');
    
    const newPassword = process.env.USER_PASSWORD || generateSecurePassword(16);
    const isCustomPassword = !!process.env.USER_PASSWORD;
    
    if (isCustomPassword) {
      console.log('✓ Using custom password from USER_PASSWORD env variable');
    } else {
      console.log('✓ Generated secure random password');
    }
    
    // Update password
    console.log('\n5. Updating password...');
    
    await updatePassword(connection, user.id, newPassword);
    
    console.log('✓ Password updated successfully');
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('✓ Password Reset Complete!');
    console.log('='.repeat(60));
    
    printBox('NEW LOGIN CREDENTIALS', [
      `Email:    ${user.email}`,
      `Password: ${newPassword}`,
      '',
      '⚠️  SAVE THIS PASSWORD NOW! IT WILL NOT BE SHOWN AGAIN!'
    ]);
    
    console.log('\n');
    
    await connection.end();
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Password reset failed:', err.message);
    
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

// Run the script
resetUserPassword();
/**
 * AIVA Database Migration Script
 * 
 * This script runs the database migration to create/update all AIVA tables
 * in the correct order based on foreign key dependencies.
 * 
 * Usage:
 *   node run-migration.js
 * 
 * Requirements:
 *   - mysql2 package: npm install mysql2
 *   - .env file with database credentials (or update config below)
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

// Database Configuration
// You can either set these directly or use environment variables
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'yovo_db_cc',
  connectTimeout: 60000
};

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Log message with color
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Log section header
 */
function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

/**
 * Execute SQL file with proper procedure handling
 */
async function executeSQLFile(connection, filePath) {
  try {
    log(`Reading SQL file: ${filePath}`, 'cyan');
    let sql = await fs.readFile(filePath, 'utf8');
    
    log('Preparing migration...', 'cyan');
    
    // Remove DELIMITER commands as they are MySQL client-specific
    sql = sql.replace(/DELIMITER \$\$/g, '');
    sql = sql.replace(/DELIMITER ;/g, '');
    
    // Split into individual statements by $$
    const statements = sql
      .split('$$')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && s !== 'SET FOREIGN_KEY_CHECKS = 0' && s !== "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'");
    
    log('Executing migration...', 'cyan');
    log(`Total procedures to execute: ${statements.filter(s => s.includes('CREATE PROCEDURE')).length}`, 'cyan');
    
    const startTime = Date.now();
    let executed = 0;
    
    // Execute initial settings
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'");
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      
      if (stmt.length < 10) continue; // Skip very short statements
      
      try {
        // Show progress for procedure calls
        if (stmt.includes('CALL ')) {
          const match = stmt.match(/CALL (\w+)/);
          if (match) {
            executed++;
            if (executed % 5 === 0) {
              log(`  Progress: ${executed} procedures executed...`, 'cyan');
            }
          }
        }
        
        await connection.query(stmt);
      } catch (error) {
        // Log the error but continue with other statements if it's not critical
        if (error.code === 'ER_SP_ALREADY_EXISTS' || error.code === 'ER_TABLE_EXISTS_ERROR') {
          // These are expected and can be ignored
          continue;
        }
        log(`⚠ Warning on statement ${i + 1}: ${error.message}`, 'yellow');
        if (stmt.includes('DROP PROCEDURE') || stmt.includes('CREATE PROCEDURE')) {
          // Continue even if procedure operations fail
          continue;
        }
        throw error;
      }
    }
    
    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✓ Migration completed successfully in ${duration}s`, 'green');
    log(`  Executed ${executed} migration procedures`, 'green');
    
    return true;
  } catch (error) {
    log(`✗ Error executing SQL file: ${error.message}`, 'red');
    throw error;
  }
}

/**
 * Verify table creation
 */
async function verifyTables(connection) {
  try {
    log('Verifying table creation...', 'cyan');
    
    const [tables] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ? 
      AND table_name LIKE 'yovo_tbl_aiva_%'
      ORDER BY table_name
    `, [DB_CONFIG.database]);
    
    if (tables.length === 0) {
      log('✗ No AIVA tables found!', 'red');
      return false;
    }
    
    log(`\n✓ Found ${tables.length} AIVA tables:`, 'green');
    tables.forEach(table => {
      // MySQL returns column names in different cases depending on configuration
      const tableName = table.table_name || table.TABLE_NAME || Object.values(table)[0];
      console.log(`  - ${tableName}`);
    });
    
    return true;
  } catch (error) {
    log(`✗ Error verifying tables: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Get table statistics
 */
async function getTableStats(connection) {
  try {
    log('\nGathering table statistics...', 'cyan');
    
    const [stats] = await connection.query(`
      SELECT 
        table_name,
        table_rows,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
      FROM information_schema.tables
      WHERE table_schema = ?
      AND table_name LIKE 'yovo_tbl_aiva_%'
      ORDER BY (data_length + index_length) DESC
      LIMIT 10
    `, [DB_CONFIG.database]);
    
    if (stats.length > 0) {
      log('\nTop 10 tables by size:', 'cyan');
      console.log('\n  Table Name                              Rows        Size (MB)');
      console.log('  ' + '-'.repeat(70));
      
      stats.forEach(stat => {
        const tableName = (stat.table_name || stat.TABLE_NAME || Object.values(stat)[0]).padEnd(40);
        const rows = String(stat.table_rows || 0).padStart(10);
        const size = String(stat.size_mb || 0).padStart(10);
        console.log(`  ${tableName}${rows}${size}`);
      });
    }
  } catch (error) {
    log(`Warning: Could not gather statistics: ${error.message}`, 'yellow');
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  let connection;
  try {
    log('Testing database connection...', 'cyan');
    connection = await mysql.createConnection({
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
      connectTimeout: DB_CONFIG.connectTimeout
    });
    
    log('✓ Connection successful', 'green');
    
    // Check if database exists
    const [databases] = await connection.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [DB_CONFIG.database]
    );
    
    if (databases.length === 0) {
      log(`✗ Database '${DB_CONFIG.database}' does not exist!`, 'red');
      log(`  Please create the database first:`, 'yellow');
      log(`  CREATE DATABASE ${DB_CONFIG.database};`, 'yellow');
      return false;
    }
    
    log(`✓ Database '${DB_CONFIG.database}' exists`, 'green');
    return true;
    
  } catch (error) {
    log('✗ Connection failed:', 'red');
    log(`  ${error.message}`, 'red');
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Create backup of existing tables
 */
async function createBackup(connection) {
  try {
    log('Checking for existing tables...', 'cyan');
    
    const [tables] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? 
      AND table_name LIKE 'yovo_tbl_aiva_%'
    `, [DB_CONFIG.database]);
    
    if (tables[0].count > 0) {
      log(`Found ${tables[0].count} existing AIVA tables`, 'yellow');
      log('Note: Migration will preserve existing data and only add missing columns', 'yellow');
      
      // Optionally create a backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      log(`\nConsider creating a backup before proceeding:`, 'yellow');
      log(`  mysqldump -u${DB_CONFIG.user} -p ${DB_CONFIG.database} > backup_${timestamp}.sql`, 'cyan');
      
      // Wait for user confirmation in production
      if (process.env.NODE_ENV === 'production') {
        log('\nSet CONFIRM_MIGRATION=true to proceed with migration', 'yellow');
        if (process.env.CONFIRM_MIGRATION !== 'true') {
          return false;
        }
      }
    } else {
      log('No existing AIVA tables found. Will create new tables.', 'green');
    }
    
    return true;
  } catch (error) {
    log(`Warning: Could not check existing tables: ${error.message}`, 'yellow');
    return true; // Continue anyway
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  let connection;
  
  try {
    logSection('AIVA Database Migration');
    
    // Display configuration
    log('Configuration:', 'cyan');
    log(`  Host:     ${DB_CONFIG.host}:${DB_CONFIG.port}`, 'cyan');
    log(`  Database: ${DB_CONFIG.database}`, 'cyan');
    log(`  User:     ${DB_CONFIG.user}`, 'cyan');
    
    // Test connection first
    const connectionOk = await testConnection();
    if (!connectionOk) {
      process.exit(1);
    }
    
    // Connect to database
    logSection('Connecting to Database');
    connection = await mysql.createConnection(DB_CONFIG);
    log('✓ Connected successfully', 'green');
    
    // Create backup check
    logSection('Pre-Migration Check');
    const backupOk = await createBackup(connection);
    if (!backupOk) {
      log('\nMigration cancelled by user', 'yellow');
      process.exit(0);
    }
    
    // Execute migration
    logSection('Running Migration');
    const sqlFilePath = path.join(__dirname, 'migrations', 'aiva_database_migration.sql');
    await executeSQLFile(connection, sqlFilePath);
    
    // Verify tables
    logSection('Verification');
    const verified = await verifyTables(connection);
    
    if (verified) {
      // Get statistics
      await getTableStats(connection);
      
      logSection('Migration Complete');
      log('✓ All tables have been created/updated successfully!', 'green');
      log('\nNext steps:', 'cyan');
      log('  1. Verify your application connections', 'cyan');
      log('  2. Test the database schema', 'cyan');
      log('  3. Run any seed data scripts if needed', 'cyan');
    } else {
      log('⚠ Migration completed but verification failed', 'yellow');
      log('Please check the database manually', 'yellow');
    }
	
	logSection('AIVA Database Migrations');
    
    log('Configuration:', 'cyan');
    log(`  Host:     ${DB_CONFIG.host}:${DB_CONFIG.port}`, 'cyan');
    log(`  Database: ${DB_CONFIG.database}`, 'cyan');
    log(`  User:     ${DB_CONFIG.user}`, 'cyan');
    
    // Connect
    connection = await mysql.createConnection(DB_CONFIG);
    log('\n✓ Connected to database', 'green');
    
    // Get pending migrations
    const pending = await getPendingMigrations(connection);
    
    if (pending.length === 0) {
      log('\n✓ No pending migrations', 'green');
      return;
    }
    
    log(`\nFound ${pending.length} pending migration(s):`, 'yellow');
    pending.forEach(m => log(`  - ${m.name}`, 'yellow'));
    
    // Execute each migration
    logSection('Executing Migrations');
    
    for (const migration of pending) {
      await executeMigration(connection, migration);
    }
    
    logSection('Migration Complete');
    log('✓ All migrations executed successfully!', 'green');
	return;
    
  } catch (error) {
    logSection('Migration Failed');
    log('Error details:', 'red');
    console.error(error);
    
    if (error.sql) {
      log('\nFailed SQL:', 'red');
      log(error.sql.substring(0, 500) + '...', 'red');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      log('\n✓ Database connection closed', 'cyan');
    }
  }
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
AIVA Database Migration Script

Usage:
  node run-migration.js [options]

Environment Variables:
  DB_HOST       Database host (default: localhost)
  DB_PORT       Database port (default: 3306)
  DB_USER       Database user (default: root)
  DB_PASSWORD   Database password
  DB_NAME       Database name (default: yovo_db_cc)
  NODE_ENV      Environment (production requires CONFIRM_MIGRATION=true)
  CONFIRM_MIGRATION  Set to 'true' to confirm migration in production

Options:
  --help, -h    Show this help message

Examples:
  # Run with default settings
  node run-migration.js

  # Run with environment variables
  DB_HOST=localhost DB_USER=admin DB_PASSWORD=secret DB_NAME=aiva node run-migration.js

  # Run in production (requires confirmation)
  NODE_ENV=production CONFIRM_MIGRATION=true node run-migration.js

Requirements:
  - Node.js 12+
  - mysql2 package: npm install mysql2
  - aiva_database_migration.sql file in the same directory
`);
}

/**
 * Ensure migrations tracking table exists
 */
async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Get list of executed migrations
 */
async function getExecutedMigrations(connection) {
  await ensureMigrationsTable(connection);
  
  const [rows] = await connection.query(
    'SELECT name FROM yovo_tbl_aiva_migrations ORDER BY id ASC'
  );
  
  return rows.map(row => row.name);
}

/**
 * Mark migration as executed
 */
async function markMigrationExecuted(connection, migrationName) {
  await connection.query(
    'INSERT INTO yovo_tbl_aiva_migrations (name) VALUES (?)',
    [migrationName]
  );
}

/**
 * Remove migration from executed list
 */
async function unmarkMigration(connection, migrationName) {
  await connection.query(
    'DELETE FROM yovo_tbl_aiva_migrations WHERE name = ?',
    [migrationName]
  );
}

/**
 * Get list of available migration files
 */
async function getAvailableMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  try {
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.js'))
      .sort(); // Sort alphabetically (001-xxx.js, 002-xxx.js, etc.)
    
    return migrationFiles.map(f => ({
      name: f,
      path: path.join(migrationsDir, f)
    }));
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('Migrations directory not found. Creating it...', 'yellow');
      await fs.mkdir(migrationsDir, { recursive: true });
      return [];
    }
    throw error;
  }
}

/**
 * Get pending migrations
 */
async function getPendingMigrations(connection) {
  const available = await getAvailableMigrations();
  const executed = await getExecutedMigrations(connection);
  
  return available.filter(m => !executed.includes(m.name));
}

/**
 * Execute a single migration
 */
async function executeMigration(connection, migration) {
  log(`Running migration: ${migration.name}`, 'cyan');
  
  const migrationModule = require(migration.path);
  
  if (!migrationModule.up || typeof migrationModule.up !== 'function') {
    throw new Error(`Migration ${migration.name} does not export an 'up' function`);
  }
  
  // Create Sequelize-like queryInterface
  const queryInterface = {
    sequelize: connection,
    
    createTable: async (tableName, attributes, options = {}) => {
      let sql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (`;
      const columns = [];
      
      for (const [colName, colDef] of Object.entries(attributes)) {
        let colSql = `\`${colName}\` `;
        
        // Handle type
        if (colDef.type) {
          colSql += colDef.type.toString().replace('Sequelize.', '').toUpperCase();
        }
        
        // Handle constraints
        if (colDef.primaryKey) colSql += ' PRIMARY KEY';
        if (colDef.autoIncrement) colSql += ' AUTO_INCREMENT';
        if (colDef.unique) colSql += ' UNIQUE';
        if (colDef.allowNull === false) colSql += ' NOT NULL';
        if (colDef.defaultValue !== undefined) {
          if (colDef.defaultValue.val) {
            colSql += ` DEFAULT ${colDef.defaultValue.val}`;
          } else if (typeof colDef.defaultValue === 'string') {
            colSql += ` DEFAULT '${colDef.defaultValue}'`;
          } else if (typeof colDef.defaultValue === 'boolean') {
            colSql += ` DEFAULT ${colDef.defaultValue ? 1 : 0}`;
          } else {
            colSql += ` DEFAULT ${colDef.defaultValue}`;
          }
        }
        if (colDef.comment) colSql += ` COMMENT '${colDef.comment}'`;
        
        columns.push(colSql);
        
        // Handle foreign keys
        if (colDef.references) {
          const fkName = `fk_${tableName}_${colName}`;
          let fkSql = `CONSTRAINT \`${fkName}\` FOREIGN KEY (\`${colName}\`) `;
          fkSql += `REFERENCES \`${colDef.references.model}\`(\`${colDef.references.key}\`)`;
          if (colDef.onDelete) fkSql += ` ON DELETE ${colDef.onDelete}`;
          if (colDef.onUpdate) fkSql += ` ON UPDATE ${colDef.onUpdate}`;
          columns.push(fkSql);
        }
      }
      
      sql += columns.join(', ');
      sql += ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci';
      
      await connection.query(sql);
    },
    
    dropTable: async (tableName, options = {}) => {
      await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    },
    
    addColumn: async (tableName, columnName, attributes, options = {}) => {
      let sql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` `;
      
      sql += attributes.type.toString().replace('Sequelize.', '').toUpperCase();
      
      if (attributes.allowNull === false) sql += ' NOT NULL';
      if (attributes.defaultValue !== undefined) {
        if (attributes.defaultValue.val) {
          sql += ` DEFAULT ${attributes.defaultValue.val}`;
        } else if (typeof attributes.defaultValue === 'string') {
          sql += ` DEFAULT '${attributes.defaultValue}'`;
        } else if (typeof attributes.defaultValue === 'boolean') {
          sql += ` DEFAULT ${attributes.defaultValue ? 1 : 0}`;
        } else {
          sql += ` DEFAULT ${attributes.defaultValue}`;
        }
      }
      if (attributes.comment) sql += ` COMMENT '${attributes.comment}'`;
      if (attributes.after) sql += ` AFTER \`${attributes.after}\``;
      
      try {
        await connection.query(sql);
      } catch (error) {
        // If column already exists, that's okay
        if (error.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }
    },
    
    removeColumn: async (tableName, columnName, options = {}) => {
      try {
        await connection.query(
          `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``
        );
      } catch (error) {
        // If column doesn't exist, that's okay
        if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
          throw error;
        }
      }
    },
    
    addIndex: async (tableName, columns, options = {}) => {
      const indexName = options.name || `idx_${columns.join('_')}`;
      const indexType = options.unique ? 'UNIQUE INDEX' : 'INDEX';
      const columnList = Array.isArray(columns) ? columns.map(c => `\`${c}\``).join(', ') : `\`${columns}\``;
      
      try {
        await connection.query(
          `ALTER TABLE \`${tableName}\` ADD ${indexType} \`${indexName}\` (${columnList})`
        );
      } catch (error) {
        // If index already exists, that's okay
        if (error.code !== 'ER_DUP_KEYNAME') {
          throw error;
        }
      }
    },
    
    removeIndex: async (tableName, indexName, options = {}) => {
      try {
        await connection.query(
          `ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``
        );
      } catch (error) {
        // If index doesn't exist, that's okay
        if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
          throw error;
        }
      }
    }
  };
  
  // Mock Sequelize types
  const Sequelize = {
    STRING: (length) => `VARCHAR(${length || 255})`,
    TEXT: 'TEXT',
    INTEGER: 'INT',
    BIGINT: 'BIGINT',
    DECIMAL: (precision, scale) => `DECIMAL(${precision || 10},${scale || 2})`,
    BOOLEAN: 'TINYINT(1)',
    DATE: 'TIMESTAMP',
    DATEONLY: 'DATE',
    ENUM: (...values) => `ENUM(${values.map(v => `'${v}'`).join(',')})`,
    JSON: 'JSON',
    literal: (val) => ({ val }),
    fn: (name, ...args) => ({ val: `${name}(${args.join(',')})` })
  };
  
  // Execute migration
  await migrationModule.up(queryInterface, Sequelize);
  
  // Mark as executed
  await markMigrationExecuted(connection, migration.name);
  
  log(`✓ Migration ${migration.name} completed`, 'green');
}

/**
 * Rollback a single migration
 */
async function rollbackMigration(connection, migration) {
  log(`Rolling back migration: ${migration.name}`, 'cyan');
  
  const migrationModule = require(migration.path);
  
  if (!migrationModule.down || typeof migrationModule.down !== 'function') {
    throw new Error(`Migration ${migration.name} does not export a 'down' function`);
  }
  
  // Use same queryInterface as executeMigration
  const queryInterface = {
    sequelize: connection,
    createTable: async () => {},
    dropTable: async (tableName) => {
      await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    },
    addColumn: async () => {},
    removeColumn: async (tableName, columnName) => {
      try {
        await connection.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
      } catch (error) {
        if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error;
      }
    },
    addIndex: async () => {},
    removeIndex: async (tableName, indexName) => {
      try {
        await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
      } catch (error) {
        if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error;
      }
    }
  };
  
  const Sequelize = {
    STRING: (length) => `VARCHAR(${length || 255})`,
    TEXT: 'TEXT',
    INTEGER: 'INT',
    BIGINT: 'BIGINT',
    DECIMAL: (precision, scale) => `DECIMAL(${precision || 10},${scale || 2})`,
    BOOLEAN: 'TINYINT(1)',
    DATE: 'TIMESTAMP',
    DATEONLY: 'DATE',
    ENUM: (...values) => `ENUM(${values.map(v => `'${v}'`).join(',')})`,
    JSON: 'JSON'
  };
  
  await migrationModule.down(queryInterface, Sequelize);
  
  // Remove from executed list
  await unmarkMigration(connection, migration.name);
  
  log(`✓ Migration ${migration.name} rolled back`, 'green');
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Run migration
runMigration().catch(error => {
  log('\nUnexpected error:', 'red');
  console.error(error);
  process.exit(1);
});
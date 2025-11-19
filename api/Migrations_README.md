# AIVA Database Migration

Comprehensive database migration script for the AIVA platform that creates and updates all database tables in the correct order based on foreign key dependencies.

## Features

- ✅ **Smart Migration**: Checks if tables exist before creating
- ✅ **Safe Updates**: Only adds missing columns, preserves existing data
- ✅ **Proper Ordering**: Executes in correct order based on foreign key dependencies
- ✅ **Detailed Logging**: Color-coded console output with progress tracking
- ✅ **Verification**: Automatically verifies table creation and provides statistics
- ✅ **Error Handling**: Comprehensive error handling with helpful messages
- ✅ **Production Safety**: Requires confirmation for production environments

## Prerequisites

- Node.js 12 or higher
- MySQL 5.7 or higher / MySQL 8.0+
- Database must be created before running migration

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure database connection:**
   
   Copy `.env.example` to `.env` and update with your credentials:
   ```bash
   cp .env.example .env
   ```

   Edit `.env`:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=yovo_db_cc
   ```

3. **Ensure database exists:**
   ```sql
   CREATE DATABASE IF NOT EXISTS yovo_db_cc;
   ```

## Usage

### Basic Usage

Run the migration:
```bash
npm run migrate
```

Or directly:
```bash
node run-migration.js
```

### Using Environment Variables

You can pass configuration via environment variables:
```bash
DB_HOST=localhost DB_USER=admin DB_PASSWORD=secret DB_NAME=aiva node run-migration.js
```

### Production Migration

For production environments, you need to explicitly confirm:
```bash
NODE_ENV=production CONFIRM_MIGRATION=true npm run migrate
```

Or use the npm script:
```bash
npm run migrate:prod
```

### Help

Display help information:
```bash
node run-migration.js --help
```

## What Gets Created

The migration creates/updates the following table groups in order:

### Level 1: Base Tables
- `yovo_tbl_aiva_tenants` - Tenant/organization data
- `yovo_tbl_aiva_system_settings` - System configuration

### Level 2: Tenant-Dependent Tables
- `yovo_tbl_aiva_users` - User accounts
- `yovo_tbl_aiva_knowledge_bases` - Knowledge base definitions
- `yovo_tbl_aiva_user_sessions` - Active user sessions
- `yovo_tbl_aiva_user_audit_log` - Audit trail
- `yovo_tbl_aiva_tenant_notification_settings` - Notification preferences
- `yovo_tbl_aiva_credit_transactions` - Credit usage tracking

### Level 3: Knowledge Base & Agent Tables
- `yovo_tbl_aiva_agents` - AI agent configurations
- `yovo_tbl_aiva_documents` - Uploaded documents
- `yovo_tbl_aiva_shopify_stores` - Shopify integrations
- `yovo_tbl_aiva_images` - Image storage
- `yovo_tbl_aiva_document_chunks` - Text chunks for vector search
- `yovo_tbl_aiva_knowledge_searches` - Search analytics
- `yovo_tbl_aiva_image_searches` - Image search analytics
- `yovo_tbl_aiva_products` - Product catalog

### Level 4: Agent-Dependent Tables
- `yovo_tbl_aiva_call_logs` - Voice call records
- `yovo_tbl_aiva_chat_sessions` - Chat session data
- `yovo_tbl_aiva_did_mappings` - Phone number mappings
- `yovo_tbl_aiva_functions` - Custom functions
- `yovo_tbl_aiva_product_variants` - Product variations
- `yovo_tbl_aiva_sync_jobs` - Shopify sync jobs

### Level 5: Session-Dependent Tables
- `yovo_tbl_aiva_chat_messages` - Individual chat messages
- `yovo_tbl_aiva_function_call_logs` - Function execution logs
- `yovo_tbl_aiva_product_sync_status` - Product sync tracking

## Migration Behavior

### First Time Run (No Existing Tables)
- Creates all tables from scratch
- Sets up all indexes and foreign keys
- No data migration needed

### Subsequent Runs (Existing Tables)
- Checks each table for missing columns
- Adds only missing columns without affecting existing data
- Adds missing indexes
- **Does NOT drop or modify existing columns**
- **Does NOT delete any data**

## Output Example

```
================================================================================
AIVA Database Migration
================================================================================

Configuration:
  Host:     localhost:3306
  Database: yovo_db_cc
  User:     root

================================================================================
Connecting to Database
================================================================================

✓ Connected successfully

================================================================================
Running Migration
================================================================================

Reading SQL file: aiva_database_migration.sql
Executing migration...
✓ Migration completed successfully in 2.34s

================================================================================
Verification
================================================================================

Verifying table creation...

✓ Found 24 AIVA tables:
  - yovo_tbl_aiva_agents
  - yovo_tbl_aiva_call_logs
  - yovo_tbl_aiva_chat_messages
  ...

Gathering table statistics...

Top 10 tables by size:

  Table Name                              Rows        Size (MB)
  ----------------------------------------------------------------------
  yovo_tbl_aiva_chat_messages                  1250         2.50
  yovo_tbl_aiva_call_logs                       856         1.75
  ...

================================================================================
Migration Complete
================================================================================

✓ All tables have been created/updated successfully!

Next steps:
  1. Verify your application connections
  2. Test the database schema
  3. Run any seed data scripts if needed

✓ Database connection closed
```

## Safety Features

### Backup Reminder
The script reminds you to create a backup if existing tables are found:
```bash
mysqldump -u root -p yovo_db_cc > backup_2025-01-01.sql
```

### Production Confirmation
In production mode (`NODE_ENV=production`), the migration requires explicit confirmation via `CONFIRM_MIGRATION=true`.

### Transaction Safety
The migration uses stored procedures that can be rolled back if errors occur.

### Column Verification
Before adding columns, the script checks if they already exist to prevent duplication errors.

## Troubleshooting

### Connection Refused
```
✗ Connection failed: connect ECONNREFUSED
```
**Solution**: Ensure MySQL is running and credentials are correct.

### Database Doesn't Exist
```
✗ Database 'yovo_db_cc' does not exist!
```
**Solution**: Create the database first:
```sql
CREATE DATABASE yovo_db_cc;
```

### Permission Denied
```
✗ Error: Access denied for user
```
**Solution**: Ensure the database user has proper permissions:
```sql
GRANT ALL PRIVILEGES ON yovo_db_cc.* TO 'your_user'@'localhost';
FLUSH PRIVILEGES;
```

### Foreign Key Constraint Errors
The script is designed to create tables in the correct order. If you still encounter foreign key errors, ensure no manual modifications were made to the SQL file.

## Files Included

- `run-migration.js` - Main migration script
- `aiva_database_migration.sql` - SQL migration file
- `package.json` - Node.js package configuration
- `.env.example` - Environment variables template
- `README.md` - This documentation

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `3306` |
| `DB_USER` | Database username | `root` |
| `DB_PASSWORD` | Database password | (empty) |
| `DB_NAME` | Database name | `yovo_db_cc` |
| `NODE_ENV` | Environment | `development` |
| `CONFIRM_MIGRATION` | Production confirmation | `false` |

## Advanced Usage

### Programmatic Usage

You can also require the migration script in your Node.js application:

```javascript
const { runMigration } = require('./run-migration');

async function setupDatabase() {
  try {
    await runMigration();
    console.log('Database ready!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}
```

### Custom Configuration

Edit the `DB_CONFIG` object in `run-migration.js` for more advanced configurations:

```javascript
const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'yovo_db_cc',
  multipleStatements: true,
  connectTimeout: 60000,
  // Add more mysql2 options here
};
```

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the error logs in the console
- Verify your database credentials
- Ensure the SQL file is in the same directory as the script

## License

ISC

## Workflow
# AIVA Database Migration - Visual Workflow

## 🎯 Migration Process Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    START MIGRATION                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Install Dependencies                               │
│  ────────────────────────────────                           │
│  Command: npm install                                       │
│  Installs: mysql2 package                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Configure Database                                 │
│  ────────────────────────────────                           │
│  1. Copy: cp env.example .env                               │
│  2. Edit: .env file with your credentials                   │
│     - DB_HOST                                               │
│     - DB_USER                                               │
│     - DB_PASSWORD                                           │
│     - DB_NAME                                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Test Connection (Recommended)                      │
│  ────────────────────────────────                           │
│  Command: npm test                                          │
│                                                             │
│  Checks:                                                    │
│  ✓ Server connectivity                                      │
│  ✓ Database exists                                          │
│  ✓ User privileges                                          │
│  ✓ Existing tables                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                    ┌────┴────┐
                    │         │
             ❌ FAIL         ✅ PASS
                    │         │
         ┌──────────┘         └──────────┐
         │                                │
         ▼                                ▼
┌─────────────────┐          ┌─────────────────────────────────┐
│  Fix Issues:    │          │  STEP 4: Create Backup          │
│  - Credentials  │          │  ────────────────────────        │
│  - Server       │          │  (If tables exist)              │
│  - Database     │          │                                 │
│  - Privileges   │          │  mysqldump -u root -p           │
└────────┬────────┘          │  yovo_db_cc > backup.sql        │
         │                   └───────────┬─────────────────────┘
         │                               │
         └───────────────┐               │
                         │               ▼
                         │   ┌─────────────────────────────────┐
                         │   │  STEP 5: Run Migration          │
                         │   │  ────────────────────────        │
                         └──►│  Command: npm run migrate       │
                             │                                 │
                             │  Process:                       │
                             │  1. Connect to database         │
                             │  2. Execute migration SQL       │
                             │  3. Create/update tables        │
                             │  4. Verify results              │
                             └───────────┬─────────────────────┘
                                         │
                                    ┌────┴────┐
                                    │         │
                             ❌ FAIL         ✅ SUCCESS
                                    │         │
                         ┌──────────┘         └──────────┐
                         │                                │
                         ▼                                ▼
              ┌─────────────────────┐      ┌─────────────────────────────┐
              │  Review Error:      │      │  STEP 6: Verify Tables      │
              │  - Check logs       │      │  ────────────────────────    │
              │  - Check SQL        │      │  24+ tables created         │
              │  - Check FK refs    │      │  All indexes added          │
              │  - Retry            │      │  Foreign keys established   │
              └─────────────────────┘      └──────────┬──────────────────┘
                                                      │
                                                      ▼
                                          ┌─────────────────────────────┐
                                          │  STEP 7: Test Application   │
                                          │  ────────────────────────    │
                                          │  - Connect app to DB        │
                                          │  - Run basic queries        │
                                          │  - Verify functionality     │
                                          └──────────┬──────────────────┘
                                                      │
                                                      ▼
                                          ┌─────────────────────────────┐
                                          │     MIGRATION COMPLETE!     │
                                          │  ✅ Database ready to use   │
                                          └─────────────────────────────┘
```

## 📊 Table Creation Order

```
LEVEL 1: Foundation
┌─────────────────────────────────────┐
│  yovo_tbl_aiva_tenants              │ ← Root table
│  yovo_tbl_aiva_system_settings      │
└─────────────────┬───────────────────┘
                  │
                  ▼
LEVEL 2: User Management & Knowledge
┌─────────────────────────────────────┐
│  yovo_tbl_aiva_users                │
│  yovo_tbl_aiva_knowledge_bases      │
│  yovo_tbl_aiva_user_sessions        │
│  yovo_tbl_aiva_user_audit_log       │
│  yovo_tbl_aiva_tenant_notification  │
│  yovo_tbl_aiva_credit_transactions  │
└─────────────────┬───────────────────┘
                  │
                  ▼
LEVEL 3: Content & Configuration
┌─────────────────────────────────────┐
│  yovo_tbl_aiva_agents               │
│  yovo_tbl_aiva_documents            │
│  yovo_tbl_aiva_shopify_stores       │
│  yovo_tbl_aiva_images               │
│  yovo_tbl_aiva_document_chunks      │
│  yovo_tbl_aiva_knowledge_searches   │
│  yovo_tbl_aiva_image_searches       │
│  yovo_tbl_aiva_products             │
└─────────────────┬───────────────────┘
                  │
                  ▼
LEVEL 4: Activity & Operations
┌─────────────────────────────────────┐
│  yovo_tbl_aiva_call_logs            │
│  yovo_tbl_aiva_chat_sessions        │
│  yovo_tbl_aiva_did_mappings         │
│  yovo_tbl_aiva_functions            │
│  yovo_tbl_aiva_product_variants     │
│  yovo_tbl_aiva_sync_jobs            │
└─────────────────┬───────────────────┘
                  │
                  ▼
LEVEL 5: Detail Records
┌─────────────────────────────────────┐
│  yovo_tbl_aiva_chat_messages        │
│  yovo_tbl_aiva_function_call_logs   │
│  yovo_tbl_aiva_product_sync_status  │
└─────────────────────────────────────┘
```

## 🔄 Migration Logic Flow

```
For each table:
    │
    ├─► Check if table exists?
    │       │
    │       ├─► NO ──► Create table with full structure
    │       │              │
    │       │              └─► Add all indexes
    │       │                      │
    │       │                      └─► Add foreign keys
    │       │
    │       └─► YES ──► Check each column
    │                      │
    │                      ├─► Column missing? ──► Add column
    │                      │
    │                      ├─► Index missing? ──► Add index
    │                      │
    │                      └─► Column exists? ──► Skip (preserve data)
    │
    └─► Next table
```

## 🎭 Environment Modes

```
┌─────────────────────────────────────────────────────────────┐
│  Development Mode                                           │
│  ─────────────────────────────────                          │
│  • Runs immediately                                         │
│  • Shows warnings                                           │
│  • Suggests backups                                         │
│  • Full logging                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Production Mode                                            │
│  ─────────────────────────────────                          │
│  • Requires CONFIRM_MIGRATION=true                          │
│  • Forces backup recommendation                             │
│  • Extra safety checks                                      │
│  • Detailed verification                                    │
└─────────────────────────────────────────────────────────────┘
```

## 📈 Success Metrics

```
Expected Output:
┌─────────────────────────────────────────────────────────────┐
│  ✓ Connected successfully                                   │
│  ✓ Migration completed in 2.34s                             │
│  ✓ Found 24 AIVA tables                                     │
│  ✓ All foreign keys established                             │
│  ✓ All indexes created                                      │
│  ✓ Verification passed                                      │
└─────────────────────────────────────────────────────────────┘

Statistics:
┌──────────────────────────────────────┬──────┬──────────┐
│ Table Name                           │ Rows │ Size(MB) │
├──────────────────────────────────────┼──────┼──────────┤
│ yovo_tbl_aiva_chat_messages          │ 1250 │    2.50  │
│ yovo_tbl_aiva_call_logs              │  856 │    1.75  │
│ yovo_tbl_aiva_products               │  432 │    0.89  │
│ ...                                  │  ... │    ...   │
└──────────────────────────────────────┴──────┴──────────┘
```

## 🚨 Error Handling Flow

```
Error Occurs
    │
    ├─► Connection Error
    │       └─► Check: Server running? Credentials correct?
    │
    ├─► Database Not Found
    │       └─► Action: CREATE DATABASE yovo_db_cc;
    │
    ├─► Permission Denied
    │       └─► Action: GRANT ALL PRIVILEGES ON yovo_db_cc.*
    │
    ├─► Foreign Key Error
    │       └─► Action: Check table order, retry migration
    │
    └─► SQL Syntax Error
            └─► Action: Check SQL file integrity, review logs
```

## 🔐 Security Workflow

```
Before Migration:
    │
    ├─► Secure .env file (not in git)
    ├─► Use strong passwords
    ├─► Limit database user privileges
    └─► Create backup

During Migration:
    │
    ├─► Use SSL connection (optional)
    ├─► Log actions for audit
    └─► Monitor for errors

After Migration:
    │
    ├─► Verify table permissions
    ├─► Test application access
    ├─► Store backups securely
    └─► Document changes
```

## 📋 Checklist Visual

```
Pre-Migration:
[ ] Node.js installed (v12+)
[ ] MySQL running (v5.7+)
[ ] Database created
[ ] .env configured
[ ] Backup created (if needed)
[ ] Connection tested

During Migration:
[ ] Console output monitored
[ ] No error messages
[ ] All tables created
[ ] Foreign keys added

Post-Migration:
[ ] Verification passed
[ ] Statistics reviewed
[ ] Application tested
[ ] Backups stored
[ ] Documentation updated
```

## 🎯 Quick Commands Reference

```
╔════════════════════════════╦══════════════════════════════════╗
║ Task                       ║ Command                          ║
╠════════════════════════════╬══════════════════════════════════╣
║ Install                    ║ npm install                      ║
║ Test Connection            ║ npm test                         ║
║ Run Migration              ║ npm run migrate                  ║
║ Production Migration       ║ npm run migrate:prod             ║
║ Get Help                   ║ node run-migration.js --help     ║
║ View Tables                ║ SHOW TABLES LIKE 'yovo_%'        ║
║ Create Backup              ║ mysqldump -u root -p > backup.sql║
╚════════════════════════════╩══════════════════════════════════╝
```

---

**Legend:**
- ✅ Success / Pass
- ❌ Failure / Error
- ⚠️  Warning
- ► Action / Process
- ┌─┐ Box / Container
- │ │ Vertical Line
- ─── Horizontal Line
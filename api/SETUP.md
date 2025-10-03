# Complete Setup Guide

## Prerequisites

- Node.js 18+
- MySQL 8.0+
- Redis 6+
- Asterisk PBX (already configured)

## Step 1: Database Setup

# Create MySQL database
mysql -u root -p

sqlCREATE DATABASE agent_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'agent_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON agent_management.* TO 'agent_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
bash# Import schema
mysql -u root -p agent_management < api/database/schema.sql

Step 2: API Setup
bashcd api
npm install

# Create .env file
cp .env.example .env
# Edit .env with your settings

# Start API
npm start
API will run on http://localhost:4000

Step 3: Bridge Setup
bashcd bridge
npm install

# Update .env
# Add these new variables:
DYNAMIC_MODE=true
MANAGEMENT_API_URL=http://localhost:4000/api
MANAGEMENT_API_KEY=your_api_key_from_database
DEFAULT_TENANT_ID=your_tenant_uuid

# Start bridge
npm start

Step 4: Dashboard Setup
bashcd dashboard
npm install

# Create .env
echo "REACT_APP_API_URL=http://localhost:4000/api" > .env

# Start dashboard
npm start
Dashboard will run on http://localhost:3000

Step 5: Create First Admin User
bash# Generate password hash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('admin123', 10));"

# Insert into database
mysql -u root -p agent_management
sqlINSERT INTO tenants (id, name, email, password_hash, role, credit_balance) 
VALUES (
    UUID(), 
    'Admin User', 
    'admin@yourdomain.com', 
    'paste_hash_here',
    'super_admin',
    1000.00
);

# Get the UUID and API key
SELECT id, api_key FROM tenants WHERE email = 'admin@yourdomain.com';
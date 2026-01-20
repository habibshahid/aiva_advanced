/**
 * Flow Engine Quick Verification
 * 
 * Quick check to verify FlowEngine components are working:
 * - Database tables exist
 * - Services load correctly
 * - Basic functionality works
 * 
 * Run: node src/tests/flow-engine/verify-setup.js
 */

require('dotenv').config();

console.log('═'.repeat(60));
console.log('🔍 Flow Engine Setup Verification');
console.log('═'.repeat(60));

async function verify() {
    const results = [];
    
    // Test 1: Database connection
    console.log('\n1️⃣ Checking database connection...');
    try {
        const db = require('../../config/database');
        await db.query('SELECT 1');
        console.log('   ✅ Database connected');
        results.push(true);
    } catch (error) {
        console.log('   ❌ Database connection failed:', error.message);
        results.push(false);
    }
    
    // Test 2: Check if tables exist
    console.log('\n2️⃣ Checking database tables...');
    try {
        const db = require('../../config/database');
        
        const tables = [
            'yovo_tbl_aiva_flows',
            'yovo_tbl_aiva_message_buffer',
            'yovo_tbl_aiva_agents',
            'yovo_tbl_aiva_chat_sessions'
        ];
        
        for (const table of tables) {
            const [rows] = await db.query(`
                SELECT TABLE_NAME FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() AND table_name = ?
            `, [table]);
            
            if (rows.length > 0) {
                console.log(`   ✅ Table exists: ${table}`);
            } else {
                console.log(`   ❌ Table missing: ${table}`);
                console.log('      Run migration: npx sequelize db:migrate');
                results.push(false);
                continue;
            }
        }
        results.push(true);
    } catch (error) {
        console.log('   ❌ Table check failed:', error.message);
        results.push(false);
    }
    
    // Test 3: Check new columns
    console.log('\n3️⃣ Checking new agent columns...');
    try {
        const db = require('../../config/database');
        
        const columns = [
            'message_buffer_seconds',
            'session_timeout_minutes',
            'use_flow_engine'
        ];
        
        const [existingCols] = await db.query(`
            SELECT COLUMN_NAME FROM information_schema.COLUMNS 
            WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_agents'
            AND column_name IN (?)
        `, [columns]);
        
        const found = existingCols.map(c => c.COLUMN_NAME);
        
        for (const col of columns) {
            if (found.includes(col)) {
                console.log(`   ✅ Column exists: ${col}`);
            } else {
                console.log(`   ⚠️ Column missing: ${col}`);
                console.log('      Run migration: npx sequelize db:migrate');
            }
        }
        results.push(found.length === columns.length);
    } catch (error) {
        console.log('   ❌ Column check failed:', error.message);
        results.push(false);
    }
    
    // Test 4: Load services
    console.log('\n4️⃣ Loading FlowEngine services...');
    try {
        const FlowEngine = require('../../services/flow-engine');
        console.log('   ✅ FlowEngine loaded');
        
        const { 
            MessageBufferService, 
            SessionStateService, 
            ChatFlowService, 
            FlowExecutor 
        } = require('../../services/flow-engine');
        
        console.log('   ✅ MessageBufferService loaded');
        console.log('   ✅ SessionStateService loaded');
        console.log('   ✅ ChatFlowService loaded');
        console.log('   ✅ FlowExecutor loaded');
        
        results.push(true);
    } catch (error) {
        console.log('   ❌ Service loading failed:', error.message);
        console.log('   Stack:', error.stack);
        results.push(false);
    }
    
    // Test 5: Load integration
    console.log('\n5️⃣ Loading FlowEngineIntegration...');
    try {
        const FlowEngineIntegration = require('../../services/FlowEngineIntegration');
        console.log('   ✅ FlowEngineIntegration loaded');
        results.push(true);
    } catch (error) {
        console.log('   ❌ Integration loading failed:', error.message);
        results.push(false);
    }
    
    // Test 6: Check if any agent exists
    console.log('\n6️⃣ Checking for test agent...');
    try {
        const db = require('../../config/database');
        const [agents] = await db.query(
            "SELECT id, name FROM yovo_tbl_aiva_agents LIMIT 1"
        );
        
        if (agents.length > 0) {
            console.log(`   ✅ Found agent: ${agents[0].name}`);
            results.push(true);
        } else {
            console.log('   ⚠️ No active agents found');
            console.log('      Create an agent in the dashboard first');
            results.push(false);
        }
    } catch (error) {
        console.log('   ❌ Agent check failed:', error.message);
        results.push(false);
    }
    
    // Test 7: Check LLM configuration
    console.log('\n7️⃣ Checking LLM configuration...');
    try {
        const hasOpenAI = !!process.env.OPENAI_API_KEY;
        const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
        const hasGroq = !!process.env.GROQ_API_KEY;
        
        if (hasOpenAI) console.log('   ✅ OpenAI API key configured');
        if (hasAnthropic) console.log('   ✅ Anthropic API key configured');
        if (hasGroq) console.log('   ✅ Groq API key configured');
        
        if (!hasOpenAI && !hasAnthropic && !hasGroq) {
            console.log('   ❌ No LLM API keys configured');
            console.log('      Set OPENAI_API_KEY in .env');
            results.push(false);
        } else {
            results.push(true);
        }
    } catch (error) {
        console.log('   ❌ LLM check failed:', error.message);
        results.push(false);
    }
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log(`📊 Verification: ${passed}/${total} checks passed`);
    
    if (passed === total) {
        console.log('\n✅ FlowEngine is ready to use!');
        console.log('\nNext steps:');
        console.log('  1. Enable for an agent: POST /api/flow-engine/agents/{id}/enable');
        console.log('  2. Run tests: node src/tests/flow-engine/run-all-tests.js');
        console.log('  3. Test with WhatsApp messages');
    } else {
        console.log('\n⚠️ Some checks failed. Please fix the issues above.');
        
        if (!results[1] || !results[2]) {
            console.log('\n📋 To run migrations:');
            console.log('   cd api && npx sequelize db:migrate');
        }
    }
    
    console.log('═'.repeat(60));
    
    // Close DB connection
    try {
        const db = require('../../config/database');
        await db.end();
    } catch (e) {}
    
    process.exit(passed === total ? 0 : 1);
}

verify().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
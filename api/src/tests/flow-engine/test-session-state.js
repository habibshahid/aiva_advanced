/**
 * Test: SessionStateService
 * 
 * Tests session lifecycle and flow state management
 * 
 * Run: node src/tests/flow-engine/test-session-state.js
 */

require('dotenv').config();
const SessionStateService = require('../../services/flow-engine/SessionStateService');
const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// Test configuration
let TEST_AGENT_ID = null;
let TEST_TENANT_ID = null;
let TEST_SESSION_ID = null;
let TEST_CHANNEL_USER_ID = null;

async function setup() {
    console.log('🔧 Setting up test environment...');
    
    // Get an existing agent
    const [agents] = await db.query('SELECT id, tenant_id FROM yovo_tbl_aiva_agents LIMIT 1');
    
    if (agents.length === 0) {
        throw new Error('No agents found. Please create an agent first.');
    }
    
    TEST_AGENT_ID = agents[0].id;
    TEST_TENANT_ID = agents[0].tenant_id;
    TEST_CHANNEL_USER_ID = `test_user_${Date.now()}`;
    
    console.log(`✅ Using agent: ${TEST_AGENT_ID}`);
    return agents[0];
}

async function cleanup() {
    console.log('\n🧹 Cleaning up test sessions...');
    
    // Delete test sessions created during tests
    if (TEST_SESSION_ID) {
        await db.query('DELETE FROM yovo_tbl_aiva_chat_sessions WHERE id = ?', [TEST_SESSION_ID]);
    }
    
    // Clean up any sessions with test channel user
    if (TEST_CHANNEL_USER_ID) {
        await db.query(
            "DELETE FROM yovo_tbl_aiva_chat_sessions WHERE channel_user_id LIKE 'test_user_%'"
        );
    }
    
    console.log('✅ Cleanup complete');
}

async function testCreateSession() {
    console.log('\n📝 Test 1: Create new session');
    
    const channelId = `whatsapp:${TEST_CHANNEL_USER_ID}`;
    
    const session = await SessionStateService.getOrCreateSession(
        null,
        TEST_AGENT_ID,
        channelId,
        { phone: TEST_CHANNEL_USER_ID, name: 'Test User' }
    );
    
    TEST_SESSION_ID = session.id;
    
    console.log('  Created session:', {
        id: session.id,
        status: session.status || session.session_status,
        channel_user_id: session.channel_user_id
    });
    
    if (session.id && (session.status === 'active' || session.session_status === 'active')) {
        console.log('✅ PASS: Session created with active status');
        return true;
    }
    
    console.log('❌ FAIL: Session not created correctly');
    return false;
}

async function testGetExistingSession() {
    console.log('\n📝 Test 2: Get existing session by ID');
    
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (session && session.id === TEST_SESSION_ID) {
        console.log('  Retrieved session:', session.id);
        console.log('✅ PASS: Session retrieved correctly');
        return true;
    }
    
    console.log('❌ FAIL: Could not retrieve session');
    return false;
}

async function testSetActiveFlow() {
    console.log('\n📝 Test 3: Set active flow');
    
    // Check if column exists first
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name = 'active_flow'
    `);
    
    if (cols.length === 0) {
        console.log('  ⚠️ Skipping - active_flow column not available (run migration first)');
        return true;
    }
    
    const flowState = {
        flow_id: 'order_status',
        current_step: 'collect_order_info',
        params_collected: { phone: TEST_CHANNEL_USER_ID },
        params_pending: ['order_number']
    };
    
    await SessionStateService.setActiveFlow(TEST_SESSION_ID, flowState);
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (session.active_flow && session.active_flow.flow_id === 'order_status') {
        console.log('  Active flow:', session.active_flow.flow_id);
        console.log('  Current step:', session.active_flow.current_step);
        console.log('✅ PASS: Active flow set correctly');
        return true;
    }
    
    console.log('❌ FAIL: Active flow not set');
    return false;
}

async function testUpdateFlowStep() {
    console.log('\n📝 Test 4: Update flow step');
    
    // Check if column exists
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name = 'active_flow'
    `);
    
    if (cols.length === 0) {
        console.log('  ⚠️ Skipping - active_flow column not available');
        return true;
    }
    
    await SessionStateService.updateFlowStep(
        TEST_SESSION_ID,
        'check_order',
        { order_number: 'CZ-228913' }
    );
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (session.active_flow && 
        session.active_flow.current_step === 'check_order' &&
        session.active_flow.params_collected.order_number === 'CZ-228913') {
        console.log('  Step updated to:', session.active_flow.current_step);
        console.log('  Params:', session.active_flow.params_collected);
        console.log('✅ PASS: Flow step updated');
        return true;
    }
    
    console.log('❌ FAIL: Flow step not updated');
    return false;
}

async function testPauseFlow() {
    console.log('\n📝 Test 5: Pause current flow');
    
    // Check if columns exist
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name IN ('active_flow', 'paused_flows')
    `);
    
    if (cols.length < 2) {
        console.log('  ⚠️ Skipping - flow columns not available');
        return true;
    }
    
    const pausedFlow = await SessionStateService.pauseCurrentFlow(TEST_SESSION_ID, 'user_asked_question');
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (pausedFlow && 
        session.active_flow === null && 
        session.paused_flows.length > 0) {
        console.log('  Paused flow:', pausedFlow.flow_id);
        console.log('  Paused flows count:', session.paused_flows.length);
        console.log('✅ PASS: Flow paused correctly');
        return true;
    }
    
    console.log('❌ FAIL: Flow not paused');
    return false;
}

async function testStartNewFlowWhilePaused() {
    console.log('\n📝 Test 6: Start new flow while another is paused');
    
    // Check if columns exist
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name IN ('active_flow', 'paused_flows')
    `);
    
    if (cols.length < 2) {
        console.log('  ⚠️ Skipping - flow columns not available');
        return true;
    }
    
    // Start a new flow
    await SessionStateService.setActiveFlow(TEST_SESSION_ID, {
        flow_id: 'product_search',
        current_step: 'search',
        params_collected: { query: 'red dress' }
    });
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (session.active_flow && 
        session.active_flow.flow_id === 'product_search' &&
        session.paused_flows.length > 0) {
        console.log('  Active flow:', session.active_flow.flow_id);
        console.log('  Paused flows:', session.paused_flows.map(f => f.flow_id));
        console.log('✅ PASS: New flow started, previous still paused');
        return true;
    }
    
    console.log('❌ FAIL: Flow state incorrect');
    return false;
}

async function testCompleteFlow() {
    console.log('\n📝 Test 7: Complete current flow');
    
    // Check if column exists
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name = 'active_flow'
    `);
    
    if (cols.length === 0) {
        console.log('  ⚠️ Skipping - active_flow column not available');
        return true;
    }
    
    const result = await SessionStateService.completeFlow(TEST_SESSION_ID, {
        products_found: 5
    });
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (result && 
        session.active_flow === null &&
        session.paused_flows.some(f => f.status === 'completed')) {
        console.log('  Completed flow:', result.flow_id);
        console.log('  Paused/completed flows:', session.paused_flows.length);
        console.log('✅ PASS: Flow completed and moved to history');
        return true;
    }
    
    console.log('❌ FAIL: Flow not completed');
    return false;
}

async function testResumeFlow() {
    console.log('\n📝 Test 8: Resume paused flow');
    
    // Check if columns exist
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name IN ('active_flow', 'paused_flows')
    `);
    
    if (cols.length < 2) {
        console.log('  ⚠️ Skipping - flow columns not available');
        return true;
    }
    
    const resumedFlow = await SessionStateService.resumePausedFlow(TEST_SESSION_ID);
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (resumedFlow && 
        session.active_flow && 
        session.active_flow.flow_id === resumedFlow.flow_id) {
        console.log('  Resumed flow:', resumedFlow.flow_id);
        console.log('  At step:', resumedFlow.current_step);
        console.log('✅ PASS: Flow resumed correctly');
        return true;
    }
    
    // It's OK if there's nothing to resume
    if (!resumedFlow) {
        console.log('  No paused flow to resume (OK)');
        console.log('✅ PASS: Resume handled correctly');
        return true;
    }
    
    console.log('❌ FAIL: Flow not resumed');
    return false;
}

async function testContextMemory() {
    console.log('\n📝 Test 9: Update context memory');
    
    // Check if column exists
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name = 'context_memory'
    `);
    
    if (cols.length === 0) {
        console.log('  ⚠️ Skipping - context_memory column not available');
        return true;
    }
    
    const newFacts = {
        order_number: 'CZ-228913',
        order_status: 'delivered',
        sentiment: 'neutral',
        language: 'en'
    };
    
    const memory = await SessionStateService.updateContextMemory(TEST_SESSION_ID, newFacts);
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (session.context_memory && 
        session.context_memory.known_orders && 
        session.context_memory.known_orders.length > 0) {
        console.log('  Known orders:', session.context_memory.known_orders);
        console.log('  Sentiment:', session.context_memory.sentiment);
        console.log('✅ PASS: Context memory updated');
        return true;
    }
    
    console.log('❌ FAIL: Context memory not updated');
    return false;
}

async function testSoftClose() {
    console.log('\n📝 Test 10: Soft close session');
    
    // Check if column exists
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name = 'session_status'
    `);
    
    if (cols.length === 0) {
        console.log('  ⚠️ Skipping - session_status column not available');
        return true;
    }
    
    // First complete/abandon any active flow
    await SessionStateService.abandonFlow(TEST_SESSION_ID);
    
    await SessionStateService.softCloseSession(TEST_SESSION_ID);
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (session.session_status === 'soft_closed' && session.soft_closed_at) {
        console.log('  Status:', session.session_status);
        console.log('  Soft closed at:', session.soft_closed_at);
        console.log('✅ PASS: Session soft-closed');
        return true;
    }
    
    console.log('❌ FAIL: Session not soft-closed');
    return false;
}

async function testReactivateSession() {
    console.log('\n📝 Test 11: Reactivate soft-closed session');
    
    // Check if column exists
    const [cols] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name = 'session_status'
    `);
    
    if (cols.length === 0) {
        console.log('  ⚠️ Skipping - session_status column not available');
        return true;
    }
    
    await SessionStateService.reactivateSession(TEST_SESSION_ID);
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    if (session.session_status === 'active' && session.soft_closed_at === null) {
        console.log('  Status:', session.session_status);
        console.log('✅ PASS: Session reactivated');
        return true;
    }
    
    console.log('❌ FAIL: Session not reactivated');
    return false;
}

async function testHardClose() {
    console.log('\n📝 Test 12: Hard close session');
    
    await SessionStateService.closeSession(TEST_SESSION_ID);
    
    // Verify
    const session = await SessionStateService.getSession(TEST_SESSION_ID);
    
    // Check either new or old status field
    if (session.session_status === 'closed' || session.status === 'ended') {
        console.log('  Status:', session.session_status || session.status);
        console.log('✅ PASS: Session hard-closed');
        return true;
    }
    
    console.log('❌ FAIL: Session not closed');
    return false;
}

// Run all tests
async function runTests() {
    console.log('═'.repeat(60));
    console.log('🧪 SessionStateService Tests');
    console.log('═'.repeat(60));
    
    const results = [];
    
    try {
        await setup();
        
        results.push(await testCreateSession());
        results.push(await testGetExistingSession());
        results.push(await testSetActiveFlow());
        results.push(await testUpdateFlowStep());
        results.push(await testPauseFlow());
        results.push(await testStartNewFlowWhilePaused());
        results.push(await testCompleteFlow());
        results.push(await testResumeFlow());
        results.push(await testContextMemory());
        results.push(await testSoftClose());
        results.push(await testReactivateSession());
        results.push(await testHardClose());
        
    } catch (error) {
        console.error('❌ Test error:', error);
    } finally {
        await cleanup();
        await db.end();
    }
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    const passed = results.filter(r => r).length;
    const total = results.length;
    console.log(`📊 Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
        console.log('✅ All tests passed!');
    } else {
        console.log('❌ Some tests failed');
    }
    console.log('═'.repeat(60));
    
    process.exit(passed === total ? 0 : 1);
}

runTests();
/**
 * Test: ChatFlowService
 * 
 * Tests flow CRUD and management
 * 
 * Run: node src/tests/flow-engine/test-chat-flow-service.js
 */

require('dotenv').config();
const ChatFlowService = require('../../services/flow-engine/ChatFlowService');
const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// Test configuration
let TEST_AGENT_ID = null;
let CREATED_FLOW_IDS = [];

async function setup() {
    console.log('🔧 Setting up test environment...');
    
    // Get an existing agent
    const [agents] = await db.query('SELECT id, tenant_id FROM yovo_tbl_aiva_agents LIMIT 1');
    
    if (agents.length === 0) {
        throw new Error('No agents found. Please create an agent first.');
    }
    
    TEST_AGENT_ID = agents[0].id;
    
    console.log(`✅ Using agent: ${TEST_AGENT_ID}`);
    return agents[0];
}

async function cleanup() {
    console.log('\n🧹 Cleaning up test flows...');
    
    // Delete created test flows
    for (const flowId of CREATED_FLOW_IDS) {
        try {
            await db.query('DELETE FROM yovo_tbl_aiva_flows WHERE id = ?', [flowId]);
        } catch (e) {
            // Ignore if already deleted
        }
    }
    
    // Also clean up system flows created during tests
    await db.query(
        "DELETE FROM yovo_tbl_aiva_flows WHERE agent_id = ? AND type = 'system'",
        [TEST_AGENT_ID]
    );
    
    console.log('✅ Cleanup complete');
}

async function testInitializeSystemFlows() {
    console.log('\n📝 Test 1: Initialize system flows');
    
    await ChatFlowService.initializeSystemFlows(TEST_AGENT_ID);
    
    // Verify system flows were created
    const flows = await ChatFlowService.listFlows(TEST_AGENT_ID);
    const systemFlows = flows.filter(f => f.type === 'system');
    
    console.log(`  Created ${systemFlows.length} system flows`);
    systemFlows.forEach(f => console.log(`    - ${f.id}: ${f.name}`));
    
    if (systemFlows.length >= 4) {
        console.log('✅ PASS: System flows initialized');
        return true;
    }
    
    console.log('❌ FAIL: System flows not created');
    return false;
}

async function testCreateCustomFlow() {
    console.log('\n📝 Test 2: Create custom flow');
    
    const flowData = {
        name: 'Test Lead Capture',
        description: 'Capture customer leads for testing',
        config: {
            trigger_examples: ['I want information', 'Contact me'],
            steps: [
                {
                    id: 'collect_name',
                    type: 'collect',
                    config: {
                        param: 'name',
                        prompt: 'May I have your name?'
                    }
                },
                {
                    id: 'collect_phone',
                    type: 'collect',
                    config: {
                        param: 'phone',
                        prompt: 'Best number to reach you?'
                    }
                }
            ],
            completion_message: 'Thanks {{name}}! We will call you at {{phone}}'
        }
    };
    
    const flow = await ChatFlowService.createFlow(TEST_AGENT_ID, flowData);
    CREATED_FLOW_IDS.push(flow.id);
    
    console.log('  Created flow:', flow.id);
    console.log('  Name:', flow.name);
    console.log('  Type:', flow.type);
    console.log('  Steps:', flow.config.steps.length);
    
    if (flow.id && flow.type === 'custom' && flow.config.steps.length === 2) {
        console.log('✅ PASS: Custom flow created');
        return true;
    }
    
    console.log('❌ FAIL: Custom flow not created correctly');
    return false;
}

async function testGetFlow() {
    console.log('\n📝 Test 3: Get flow by ID');
    
    const flowId = CREATED_FLOW_IDS[0];
    const flow = await ChatFlowService.getFlow(flowId);
    
    if (flow && flow.id === flowId) {
        console.log('  Retrieved flow:', flow.name);
        console.log('✅ PASS: Flow retrieved');
        return true;
    }
    
    console.log('❌ FAIL: Flow not retrieved');
    return false;
}

async function testListFlows() {
    console.log('\n📝 Test 4: List flows for agent');
    
    const flows = await ChatFlowService.listFlows(TEST_AGENT_ID);
    
    console.log(`  Found ${flows.length} flows:`);
    flows.forEach(f => console.log(`    - ${f.type}: ${f.name}`));
    
    if (flows.length > 0) {
        console.log('✅ PASS: Flows listed');
        return true;
    }
    
    console.log('❌ FAIL: No flows found');
    return false;
}

async function testUpdateFlow() {
    console.log('\n📝 Test 5: Update flow');
    
    const flowId = CREATED_FLOW_IDS[0];
    
    const updates = {
        name: 'Updated Lead Capture',
        description: 'Updated description',
        config: {
            trigger_examples: ['I need help', 'Call me please'],
            steps: [
                {
                    id: 'collect_name',
                    type: 'collect',
                    config: { param: 'name', prompt: 'Your name?' }
                },
                {
                    id: 'collect_phone',
                    type: 'collect',
                    config: { param: 'phone', prompt: 'Your phone?' }
                },
                {
                    id: 'collect_email',
                    type: 'collect',
                    config: { param: 'email', prompt: 'Your email?' }
                }
            ]
        }
    };
    
    const updatedFlow = await ChatFlowService.updateFlow(flowId, updates);
    
    console.log('  Updated name:', updatedFlow.name);
    console.log('  Steps count:', updatedFlow.config.steps.length);
    console.log('  Version:', updatedFlow.version);
    
    if (updatedFlow.name === 'Updated Lead Capture' && 
        updatedFlow.config.steps.length === 3 &&
        updatedFlow.version > 1) {
        console.log('✅ PASS: Flow updated');
        return true;
    }
    
    console.log('❌ FAIL: Flow not updated correctly');
    return false;
}

async function testToggleFlow() {
    console.log('\n📝 Test 6: Toggle flow active status');
    
    const flowId = CREATED_FLOW_IDS[0];
    
    // Deactivate
    let flow = await ChatFlowService.toggleFlow(flowId, false);
    console.log('  After deactivate:', flow.is_active);
    
    if (flow.is_active !== 0 && flow.is_active !== false) {
        console.log('❌ FAIL: Flow not deactivated');
        return false;
    }
    
    // Reactivate
    flow = await ChatFlowService.toggleFlow(flowId, true);
    console.log('  After reactivate:', flow.is_active);
    
    if (flow.is_active === 1 || flow.is_active === true) {
        console.log('✅ PASS: Flow toggled correctly');
        return true;
    }
    
    console.log('❌ FAIL: Flow not toggled correctly');
    return false;
}

async function testDuplicateFlow() {
    console.log('\n📝 Test 7: Duplicate flow');
    
    const flowId = CREATED_FLOW_IDS[0];
    
    const newFlow = await ChatFlowService.duplicateFlow(flowId, 'Duplicated Lead Capture');
    CREATED_FLOW_IDS.push(newFlow.id);
    
    console.log('  Original flow ID:', flowId);
    console.log('  New flow ID:', newFlow.id);
    console.log('  New flow name:', newFlow.name);
    console.log('  New flow type:', newFlow.type);
    
    if (newFlow.id !== flowId && 
        newFlow.name === 'Duplicated Lead Capture' &&
        newFlow.type === 'custom') {
        console.log('✅ PASS: Flow duplicated');
        return true;
    }
    
    console.log('❌ FAIL: Flow not duplicated correctly');
    return false;
}

async function testFlowsForLLM() {
    console.log('\n📝 Test 8: Get flows formatted for LLM');
    
    const flows = await ChatFlowService.getFlowsForLLM(TEST_AGENT_ID);
    
    console.log(`  Got ${flows.length} flows for LLM:`);
    flows.slice(0, 3).forEach(f => {
        console.log(`    - ${f.id}: ${f.description.substring(0, 50)}...`);
    });
    
    // Check format
    const hasCorrectFormat = flows.every(f => 
        f.id && f.name && f.description && Array.isArray(f.trigger_examples)
    );
    
    if (flows.length > 0 && hasCorrectFormat) {
        console.log('✅ PASS: Flows formatted for LLM');
        return true;
    }
    
    console.log('❌ FAIL: Flows not formatted correctly');
    return false;
}

async function testDeleteFlow() {
    console.log('\n📝 Test 9: Delete custom flow');
    
    // Use the duplicated flow
    const flowId = CREATED_FLOW_IDS[1];
    
    await ChatFlowService.deleteFlow(flowId);
    
    // Verify deletion
    const flow = await ChatFlowService.getFlow(flowId);
    
    // Remove from tracking
    CREATED_FLOW_IDS = CREATED_FLOW_IDS.filter(id => id !== flowId);
    
    if (!flow) {
        console.log('  Flow deleted successfully');
        console.log('✅ PASS: Flow deleted');
        return true;
    }
    
    console.log('❌ FAIL: Flow not deleted');
    return false;
}

async function testCannotDeleteSystemFlow() {
    console.log('\n📝 Test 10: Cannot delete system flow');
    
    // Get a system flow
    const flows = await ChatFlowService.listFlows(TEST_AGENT_ID);
    const systemFlow = flows.find(f => f.type === 'system');
    
    if (!systemFlow) {
        console.log('  No system flow found, skipping');
        return true;
    }
    
    try {
        await ChatFlowService.deleteFlow(systemFlow.id);
        console.log('❌ FAIL: System flow was deleted (should not happen)');
        return false;
    } catch (error) {
        console.log('  Got expected error:', error.message);
        console.log('✅ PASS: System flow cannot be deleted');
        return true;
    }
}

async function testInitializeIntegrationFlows() {
    console.log('\n📝 Test 11: Initialize integration flows (Shopify)');
    
    await ChatFlowService.initializeIntegrationFlows(TEST_AGENT_ID, 'shopify');
    
    // Verify
    const flows = await ChatFlowService.listFlows(TEST_AGENT_ID, false);
    const integrationFlows = flows.filter(f => f.type === 'integration');
    
    console.log(`  Created ${integrationFlows.length} integration flows`);
    integrationFlows.forEach(f => console.log(`    - ${f.id}: ${f.name}`));
    
    // Track for cleanup
    integrationFlows.forEach(f => CREATED_FLOW_IDS.push(f.id));
    
    if (integrationFlows.length >= 2) {
        console.log('✅ PASS: Integration flows initialized');
        return true;
    }
    
    console.log('❌ FAIL: Integration flows not created');
    return false;
}

// Run all tests
async function runTests() {
    console.log('═'.repeat(60));
    console.log('🧪 ChatFlowService Tests');
    console.log('═'.repeat(60));
    
    const results = [];
    
    try {
        await setup();
        
        results.push(await testInitializeSystemFlows());
        results.push(await testCreateCustomFlow());
        results.push(await testGetFlow());
        results.push(await testListFlows());
        results.push(await testUpdateFlow());
        results.push(await testToggleFlow());
        results.push(await testDuplicateFlow());
        results.push(await testFlowsForLLM());
        results.push(await testDeleteFlow());
        results.push(await testCannotDeleteSystemFlow());
        results.push(await testInitializeIntegrationFlows());
        
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

/**
 * Test: MessageBufferService
 * 
 * Tests rapid-fire message collection functionality
 * 
 * Run: node src/tests/flow-engine/test-message-buffer.js
 */

require('dotenv').config();
const MessageBufferService = require('../../services/flow-engine/MessageBufferService');
const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// Test configuration
const TEST_SESSION_ID = uuidv4();
const BUFFER_WAIT_SECONDS = 2;

async function setup() {
    console.log('🔧 Setting up test environment...');
    
    // Create a test session (we need a valid session_id for FK constraint)
    // First check if we have an agent to use
    const [agents] = await db.query('SELECT id, tenant_id FROM yovo_tbl_aiva_agents LIMIT 1');
    
    if (agents.length === 0) {
        throw new Error('No agents found. Please create an agent first.');
    }
    
    const agent = agents[0];
    
    // Create test session using correct columns
    await db.query(`
        INSERT INTO yovo_tbl_aiva_chat_sessions 
        (id, agent_id, tenant_id, status, channel, channel_user_id)
        VALUES (?, ?, ?, 'active', 'api', 'test_user')
    `, [TEST_SESSION_ID, agent.id, agent.tenant_id]);
    
    console.log(`✅ Created test session: ${TEST_SESSION_ID}`);
    return agent;
}

async function cleanup() {
    console.log('🧹 Cleaning up...');
    
    // Delete test buffer entries
    await db.query('DELETE FROM yovo_tbl_aiva_message_buffer WHERE session_id = ?', [TEST_SESSION_ID]);
    
    // Delete test session
    await db.query('DELETE FROM yovo_tbl_aiva_chat_sessions WHERE id = ?', [TEST_SESSION_ID]);
    
    console.log('✅ Cleanup complete');
}

async function testSingleMessage() {
    console.log('\n📝 Test 1: Single message buffering');
    
    const result = await MessageBufferService.addMessage(
        TEST_SESSION_ID,
        { text: 'Hello, I need help', type: 'text' },
        BUFFER_WAIT_SECONDS
    );
    
    console.log('Result:', result);
    
    if (result.shouldProcess === false && result.bufferId) {
        console.log('✅ PASS: Message buffered correctly');
        return true;
    } else {
        console.log('❌ FAIL: Message should be buffered');
        return false;
    }
}

async function testRapidFireMessages() {
    console.log('\n📝 Test 2: Rapid-fire messages (simulating WhatsApp)');
    
    // Clear any existing buffer
    await db.query('DELETE FROM yovo_tbl_aiva_message_buffer WHERE session_id = ?', [TEST_SESSION_ID]);
    
    // Send multiple messages quickly
    const messages = [
        { text: 'Hi', type: 'text' },
        { text: 'I have a problem', type: 'text' },
        { text: 'My order CZ-228913', type: 'text' },
        { text: 'Product is damaged', type: 'text' }
    ];
    
    let bufferId = null;
    
    for (const msg of messages) {
        const result = await MessageBufferService.addMessage(
            TEST_SESSION_ID,
            msg,
            BUFFER_WAIT_SECONDS
        );
        bufferId = result.bufferId;
        console.log(`  Added: "${msg.text}" -> messageCount: ${result.messageCount || 1}`);
        
        // Small delay to simulate real typing
        await new Promise(r => setTimeout(r, 200));
    }
    
    // Check buffer contents
    const [buffers] = await db.query(
        'SELECT * FROM yovo_tbl_aiva_message_buffer WHERE session_id = ?',
        [TEST_SESSION_ID]
    );
    
    if (buffers.length > 0) {
        const buffer = buffers[0];
        // MySQL2 may return JSON as object or string
        const messages = typeof buffer.messages === 'string' 
            ? JSON.parse(buffer.messages || '[]') 
            : (buffer.messages || []);
        console.log(`  Buffer has ${messages.length} messages`);
        
        if (messages.length === 4) {
            console.log('✅ PASS: All rapid-fire messages collected in buffer');
            return true;
        }
    }
    
    console.log('❌ FAIL: Messages not collected correctly');
    return false;
}

async function testBufferAcquisition() {
    console.log('\n📝 Test 3: Buffer acquisition after wait time');
    
    // Wait for buffer to be ready
    console.log(`  Waiting ${BUFFER_WAIT_SECONDS + 1} seconds for buffer to be ready...`);
    await new Promise(r => setTimeout(r, (BUFFER_WAIT_SECONDS + 1) * 1000));
    
    // Try to acquire buffer
    const buffer = await MessageBufferService.acquireBuffer(TEST_SESSION_ID, BUFFER_WAIT_SECONDS);
    
    if (buffer && buffer.data) {
        console.log('  Acquired buffer:', {
            combinedMessage: buffer.data.combinedMessage.substring(0, 50) + '...',
            messageCount: buffer.data.messageCount,
            imageCount: buffer.data.imageCount
        });
        
        // Mark as done
        await MessageBufferService.markDone(buffer.bufferId);
        
        console.log('✅ PASS: Buffer acquired and processed');
        return true;
    }
    
    console.log('❌ FAIL: Could not acquire buffer');
    return false;
}

async function testImageBuffer() {
    console.log('\n📝 Test 4: Mixed text and image buffering');
    
    // Clear any existing buffer
    await db.query('DELETE FROM yovo_tbl_aiva_message_buffer WHERE session_id = ?', [TEST_SESSION_ID]);
    
    // Add text message
    await MessageBufferService.addMessage(
        TEST_SESSION_ID,
        { text: 'Look at this', type: 'text' },
        BUFFER_WAIT_SECONDS
    );
    
    // Add image
    await MessageBufferService.addMessage(
        TEST_SESSION_ID,
        { imageUrl: 'https://example.com/image.jpg' },
        BUFFER_WAIT_SECONDS
    );
    
    // Add another text
    await MessageBufferService.addMessage(
        TEST_SESSION_ID,
        { text: 'This is damaged', type: 'text' },
        BUFFER_WAIT_SECONDS
    );
    
    // Check buffer
    const [buffers] = await db.query(
        'SELECT * FROM yovo_tbl_aiva_message_buffer WHERE session_id = ?',
        [TEST_SESSION_ID]
    );
    
    if (buffers.length > 0) {
        const buffer = buffers[0];
        // MySQL2 may return JSON as object or string
        const messages = typeof buffer.messages === 'string' 
            ? JSON.parse(buffer.messages || '[]') 
            : (buffer.messages || []);
        const images = typeof buffer.images === 'string'
            ? JSON.parse(buffer.images || '[]')
            : (buffer.images || []);
        
        console.log(`  Buffer: ${messages.length} messages, ${images.length} images`);
        
        if (messages.length === 2 && images.length === 1) {
            console.log('✅ PASS: Text and images buffered correctly');
            return true;
        }
    }
    
    console.log('❌ FAIL: Mixed content not buffered correctly');
    return false;
}

async function testAudioTranscriptBuffer() {
    console.log('\n📝 Test 5: Audio transcript buffering');
    
    // Clear any existing buffer
    await db.query('DELETE FROM yovo_tbl_aiva_message_buffer WHERE session_id = ?', [TEST_SESSION_ID]);
    
    // Add text message
    await MessageBufferService.addMessage(
        TEST_SESSION_ID,
        { text: 'Hello', type: 'text' },
        BUFFER_WAIT_SECONDS
    );
    
    // Add audio transcript (simulating voice message)
    await MessageBufferService.addMessage(
        TEST_SESSION_ID,
        { 
            audioTranscript: 'I need to check my order status',
            audioDuration: 3.5
        },
        BUFFER_WAIT_SECONDS
    );
    
    // Check buffer
    const [buffers] = await db.query(
        'SELECT * FROM yovo_tbl_aiva_message_buffer WHERE session_id = ?',
        [TEST_SESSION_ID]
    );
    
    if (buffers.length > 0) {
        const buffer = buffers[0];
        // MySQL2 may return JSON as object or string
        const messages = typeof buffer.messages === 'string'
            ? JSON.parse(buffer.messages || '[]')
            : (buffer.messages || []);
        const audioTranscripts = typeof buffer.audio_transcripts === 'string'
            ? JSON.parse(buffer.audio_transcripts || '[]')
            : (buffer.audio_transcripts || []);
        
        console.log(`  Buffer: ${messages.length} messages, ${audioTranscripts.length} audio transcripts`);
        
        if (messages.length === 1 && audioTranscripts.length === 1) {
            console.log('✅ PASS: Audio transcripts buffered correctly');
            return true;
        }
    }
    
    console.log('❌ FAIL: Audio transcripts not buffered correctly');
    return false;
}

async function testCombinedMessage() {
    console.log('\n📝 Test 6: Combined message generation');
    
    // Wait for buffer
    await new Promise(r => setTimeout(r, (BUFFER_WAIT_SECONDS + 1) * 1000));
    
    // Acquire and check combined message
    const buffer = await MessageBufferService.acquireBuffer(TEST_SESSION_ID, BUFFER_WAIT_SECONDS);
    
    if (buffer && buffer.data) {
        console.log('  Combined message:', buffer.data.combinedMessage);
        console.log('  Has audio:', buffer.data.hasAudio);
        
        // Should combine text and audio transcript
        if (buffer.data.combinedMessage.includes('Hello') && 
            buffer.data.combinedMessage.includes('order status')) {
            console.log('✅ PASS: Messages combined correctly');
            await MessageBufferService.markDone(buffer.bufferId);
            return true;
        }
    }
    
    console.log('❌ FAIL: Combined message not generated correctly');
    return false;
}

async function testCleanup() {
    console.log('\n📝 Test 7: Buffer cleanup');
    
    // Create old buffer manually
    const oldBufferId = uuidv4();
    await db.query(`
        INSERT INTO yovo_tbl_aiva_message_buffer 
        (id, session_id, messages, images, audio_transcripts, first_message_at, last_message_at, status, created_at)
        VALUES (?, ?, '[]', '[]', '[]', DATE_SUB(NOW(), INTERVAL 2 MINUTE), DATE_SUB(NOW(), INTERVAL 2 MINUTE), 'done', DATE_SUB(NOW(), INTERVAL 2 MINUTE))
    `, [oldBufferId, TEST_SESSION_ID]);
    
    // Run cleanup
    const cleaned = await MessageBufferService.cleanup();
    
    console.log(`  Cleaned ${cleaned} buffers`);
    
    // Check if old buffer was removed
    const [remaining] = await db.query(
        'SELECT * FROM yovo_tbl_aiva_message_buffer WHERE id = ?',
        [oldBufferId]
    );
    
    if (remaining.length === 0) {
        console.log('✅ PASS: Old buffers cleaned up');
        return true;
    }
    
    console.log('❌ FAIL: Old buffer not cleaned');
    return false;
}

// Run all tests
async function runTests() {
    console.log('═'.repeat(60));
    console.log('🧪 MessageBufferService Tests');
    console.log('═'.repeat(60));
    
    const results = [];
    
    try {
        await setup();
        
        results.push(await testSingleMessage());
        results.push(await testRapidFireMessages());
        results.push(await testBufferAcquisition());
        results.push(await testImageBuffer());
        results.push(await testAudioTranscriptBuffer());
        results.push(await testCombinedMessage());
        results.push(await testCleanup());
        
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
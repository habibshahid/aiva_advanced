/**
 * Flow Engine Test Runner
 * 
 * Runs all Flow Engine tests in sequence
 * 
 * Run: node src/tests/flow-engine/run-all-tests.js
 */

const { spawn } = require('child_process');
const path = require('path');

const TESTS = [
    {
        name: 'MessageBufferService',
        file: 'test-message-buffer.js',
        description: 'Tests rapid-fire message collection'
    },
    {
        name: 'SessionStateService',
        file: 'test-session-state.js',
        description: 'Tests session lifecycle and flow state'
    },
    {
        name: 'ChatFlowService',
        file: 'test-chat-flow-service.js',
        description: 'Tests flow CRUD operations'
    },
    {
        name: 'FlowEngine E2E',
        file: 'test-flow-engine-e2e.js',
        description: 'Tests complete message flow'
    }
];

async function runTest(test) {
    return new Promise((resolve) => {
        console.log('\n' + '─'.repeat(60));
        console.log(`🧪 Running: ${test.name}`);
        console.log(`   ${test.description}`);
        console.log('─'.repeat(60));
        
        const testPath = path.join(__dirname, test.file);
        const proc = spawn('node', [testPath], {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..', '..', '..')
        });
        
        proc.on('close', (code) => {
            resolve({
                name: test.name,
                passed: code === 0,
                exitCode: code
            });
        });
        
        proc.on('error', (err) => {
            console.error(`Error running ${test.name}:`, err);
            resolve({
                name: test.name,
                passed: false,
                error: err.message
            });
        });
    });
}

async function runAllTests() {
    console.log('═'.repeat(60));
    console.log('🚀 Flow Engine Test Suite');
    console.log('═'.repeat(60));
    console.log(`Running ${TESTS.length} test files...`);
    
    const results = [];
    
    for (const test of TESTS) {
        const result = await runTest(test);
        results.push(result);
        
        // Small delay between tests
        await new Promise(r => setTimeout(r, 1000));
    }
    
    // Final Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('═'.repeat(60));
    
    let allPassed = true;
    for (const result of results) {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`  ${status}: ${result.name}`);
        if (!result.passed) allPassed = false;
    }
    
    console.log('─'.repeat(60));
    const passed = results.filter(r => r.passed).length;
    console.log(`Total: ${passed}/${results.length} test suites passed`);
    
    if (allPassed) {
        console.log('\n✅ All test suites passed!');
    } else {
        console.log('\n❌ Some test suites failed!');
    }
    
    console.log('═'.repeat(60));
    
    process.exit(allPassed ? 0 : 1);
}

// Check for specific test argument
const args = process.argv.slice(2);
if (args.length > 0) {
    const testName = args[0].toLowerCase();
    const test = TESTS.find(t => 
        t.name.toLowerCase().includes(testName) || 
        t.file.toLowerCase().includes(testName)
    );
    
    if (test) {
        console.log(`Running single test: ${test.name}`);
        runTest(test).then(result => {
            process.exit(result.passed ? 0 : 1);
        });
    } else {
        console.log('Available tests:');
        TESTS.forEach(t => console.log(`  - ${t.name} (${t.file})`));
        process.exit(1);
    }
} else {
    runAllTests();
}

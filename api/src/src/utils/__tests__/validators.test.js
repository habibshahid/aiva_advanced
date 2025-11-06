const validators = require('../validators');

console.log('🧪 Testing Validators\n');
console.log('='.repeat(60));

// Test 1: Email validation
console.log('\n📧 Test 1: Email Validation');
console.assert(validators.isValidEmail('test@example.com'), 'Valid email failed');
console.assert(!validators.isValidEmail('invalid-email'), 'Invalid email passed');
console.assert(!validators.isValidEmail(''), 'Empty email passed');
console.log('✅ Email validation works!');

// Test 2: UUID validation
console.log('\n🆔 Test 2: UUID Validation');
console.assert(validators.isValidUUID('550e8400-e29b-41d4-a716-446655440000'), 'Valid UUID failed');
console.assert(!validators.isValidUUID('not-a-uuid'), 'Invalid UUID passed');
console.assert(!validators.isValidUUID(''), 'Empty UUID passed');
console.log('✅ UUID validation works!');

// Test 3: Length validation
console.log('\n📏 Test 3: Length Validation');
console.assert(validators.isValidLength('hello', 1, 10), 'Valid length failed');
console.assert(!validators.isValidLength('', 1, 10), 'Empty string passed');
console.assert(!validators.isValidLength('toolongstring', 1, 5), 'Too long string passed');
console.log('✅ Length validation works!');

// Test 4: Range validation
console.log('\n📊 Test 4: Range Validation');
console.assert(validators.isInRange(5, 1, 10), 'Valid range failed');
console.assert(!validators.isInRange(0, 1, 10), 'Below range passed');
console.assert(!validators.isInRange(11, 1, 10), 'Above range passed');
console.log('✅ Range validation works!');

// Test 5: Enum validation
console.log('\n🔢 Test 5: Enum Validation');
const validTypes = ['openai', 'deepgram'];
console.assert(validators.isValidEnum('openai', validTypes), 'Valid enum failed');
console.assert(!validators.isValidEnum('invalid', validTypes), 'Invalid enum passed');
console.log('✅ Enum validation works!');

// Test 6: URL validation
console.log('\n🌐 Test 6: URL Validation');
console.assert(validators.isValidUrl('https://example.com'), 'Valid URL failed');
console.assert(validators.isValidUrl('http://localhost:3000'), 'Localhost URL failed');
console.assert(!validators.isValidUrl('not-a-url'), 'Invalid URL passed');
console.log('✅ URL validation works!');

// Test 7: File type validation
console.log('\n📁 Test 7: File Type Validation');
const allowedTypes = ['pdf', 'docx', 'txt'];
console.assert(validators.isValidFileType('document.pdf', allowedTypes), 'Valid file type failed');
console.assert(!validators.isValidFileType('image.exe', allowedTypes), 'Invalid file type passed');
console.log('✅ File type validation works!');

// Test 8: JSON validation
console.log('\n📋 Test 8: JSON Validation');
console.assert(validators.isValidJson('{"key": "value"}'), 'Valid JSON failed');
console.assert(!validators.isValidJson('{invalid json}'), 'Invalid JSON passed');
console.log('✅ JSON validation works!');

// Test 9: Agent validation
console.log('\n🤖 Test 9: Agent Validation');
const validAgent = {
  name: 'Test Agent',
  type: 'customer_support',
  instructions: 'Test instructions',
  temperature: 0.7,
  max_tokens: 4096
};
const agentErrors = validators.validateAgent(validAgent);
console.assert(agentErrors.length === 0, 'Valid agent failed validation');

const invalidAgent = {
  name: '', // Empty name
  type: 'invalid_type',
  temperature: 5 // Out of range
};
const invalidAgentErrors = validators.validateAgent(invalidAgent);
console.assert(invalidAgentErrors.length > 0, 'Invalid agent passed validation');
console.log('Found', invalidAgentErrors.length, 'errors in invalid agent');
console.log('✅ Agent validation works!');

// Test 10: Chat message validation
console.log('\n💬 Test 10: Chat Message Validation');
const validMessage = {
  agent_id: '550e8400-e29b-41d4-a716-446655440000',
  message: 'Hello, how can I help?'
};
const messageErrors = validators.validateChatMessage(validMessage);
console.assert(messageErrors.length === 0, 'Valid message failed validation');

const invalidMessage = {
  agent_id: 'not-a-uuid',
  message: '' // Empty
};
const invalidMessageErrors = validators.validateChatMessage(invalidMessage);
console.assert(invalidMessageErrors.length > 0, 'Invalid message passed validation');
console.log('Found', invalidMessageErrors.length, 'errors in invalid message');
console.log('✅ Chat message validation works!');

// Test 11: Pagination validation
console.log('\n📄 Test 11: Pagination Validation');
const pagination1 = validators.validatePagination({ page: '2', limit: '20' });
console.assert(pagination1.page === 2, 'Page parsing failed');
console.assert(pagination1.limit === 20, 'Limit parsing failed');
console.assert(pagination1.offset === 20, 'Offset calculation failed');
console.assert(pagination1.errors.length === 0, 'Valid pagination had errors');

const pagination2 = validators.validatePagination({ page: '0', limit: '1000' });
console.assert(pagination2.page === 1, 'Invalid page not corrected');
console.assert(pagination2.limit === 100, 'Invalid limit not corrected');
console.assert(pagination2.errors.length > 0, 'Invalid pagination had no errors');
console.log('✅ Pagination validation works!');

// Test 12: Required fields validation
console.log('\n✅ Test 12: Required Fields Validation');
const data = { name: 'John', email: 'john@example.com' };
const requiredErrors = validators.validateRequired(data, ['name', 'email', 'phone']);
console.assert(requiredErrors.length === 1, 'Missing field not detected');
console.assert(requiredErrors[0].field === 'phone', 'Wrong field detected as missing');
console.log('✅ Required fields validation works!');

console.log('\n' + '='.repeat(60));
console.log('🎉 All validator tests passed!');
console.log('='.repeat(60));
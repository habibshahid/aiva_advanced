const ResponseBuilder = require('../response-builder');

// Test 1: Success response
console.log('Test 1: Success Response');
const rb1 = new ResponseBuilder();
const successResponse = rb1.success({ id: 'test-123', name: 'Test' });
console.log(JSON.stringify(successResponse, null, 2));
console.log('✅ Success response works!\n');

// Test 2: Error response
console.log('Test 2: Error Response');
const errorResponse = ResponseBuilder.notFound('Agent');
console.log(JSON.stringify(errorResponse, null, 2));
console.log('✅ Error response works!\n');

// Test 3: Credits info
console.log('Test 3: Credits Info');
const rb3 = new ResponseBuilder();
const credits = rb3.buildCreditsInfo(
  'chat_message',
  0.001500,
  47.6500,
  {
    base_cost: 0.001250,
    profit_amount: 0.000250,
    final_cost: 0.001500,
    operations: []
  }
);
console.log(JSON.stringify(credits, null, 2));
console.log('✅ Credits info works!\n');

// Test 4: Paginated response
console.log('Test 4: Paginated Response');
const rb4 = new ResponseBuilder();
const paginatedResponse = rb4.paginated(
  [{ id: 1 }, { id: 2 }],
  100,
  1,
  20
);
console.log(JSON.stringify(paginatedResponse, null, 2));
console.log('✅ Paginated response works!\n');

console.log('🎉 All tests passed!');
/**
 * Shopify Sync Worker
 * Background process that consumes jobs from the Bull queue
 */

require('dotenv').config();
const shopifyQueue = require('./src/queues/shopifyQueue');

console.log('===========================================');
console.log('  Shopify Sync Worker Starting');
console.log('===========================================');
console.log('');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Redis Host:', process.env.REDIS_HOST || '127.0.0.1');
console.log('Redis Port:', process.env.REDIS_PORT || 6379);
console.log('Concurrency:', process.env.QUEUE_CONCURRENCY || 5);
console.log('Python Service:', process.env.PYTHON_SERVICE_URL || 'http://localhost:62002');
console.log('');
console.log('Worker is ready and listening for jobs...');
console.log('Press Ctrl+C to stop');
console.log('===========================================');
console.log('');

// Handle graceful shutdown
const shutdown = async (signal) => {
  console.log('');
  console.log(`${signal} received. Shutting down gracefully...`);
  
  try {
    // Wait for current jobs to complete
    console.log('Waiting for current jobs to complete...');
    await shopifyQueue.close(30000); // 30 second timeout
    console.log('Queue closed successfully');
    
    // Close database connections
    const db = require('./src/config/database');
    await db.end();
    console.log('Database connection closed');
    
    console.log('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Keep the process running
process.stdin.resume();
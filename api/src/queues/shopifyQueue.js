/**
 * Shopify Sync Queue
 * Uses Bull for background job processing
 */

const Queue = require('bull');
const redis = require('../config/redis');

// Create queue with Redis connection
const shopifyQueue = new Queue('shopify-sync', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || 0)
  },
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 5000 // 5s, 10s, 20s
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 1000, // Keep last 1000 failed jobs
    timeout: 7200000, // 2 hours timeout per job
    lockDuration: 300000, // 5 minutes lock duration (default is 30s)
    lockRenewTime: 150000 // Renew lock every 2.5 minutes
  }
});

// Register processor
const shopifySyncProcessor = require('./processors/shopifySyncProcessor');
const concurrency = parseInt(process.env.QUEUE_CONCURRENCY) || 5;

shopifyQueue.process('full-sync', concurrency, shopifySyncProcessor);
shopifyQueue.process('incremental-sync', concurrency, shopifySyncProcessor);
shopifyQueue.process('manual-sync', concurrency, shopifySyncProcessor);

console.log(`Shopify queue processor registered with concurrency: ${concurrency}`);

// Event handlers for monitoring
shopifyQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

shopifyQueue.on('waiting', (jobId) => {
  console.log(`Job ${jobId} is waiting`);
});

shopifyQueue.on('active', (job) => {
  console.log(`Job ${job.id} has started`);
});

shopifyQueue.on('progress', (job, progress) => {
  console.log(`Job ${job.id} progress: ${progress}%`);
});

shopifyQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

shopifyQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error.message);
});

shopifyQueue.on('stalled', (job) => {
  console.warn(`Job ${job.id} has stalled`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing queue gracefully...');
  await shopifyQueue.close();
  process.exit(0);
});

module.exports = shopifyQueue;
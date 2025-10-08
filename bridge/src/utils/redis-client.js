/**
 * Redis Client Utility
 */

const redis = require('redis');
const logger = require('./logger');

class RedisClient {
    constructor(config) {
        this.config = {
            socket: {
                port: config.port || process.env.REDIS_PORT || 6379,
                host: config.host || process.env.REDIS_HOST || '127.0.0.1'
            },
            password: config.password || process.env.REDIS_PASSWORD || undefined,
            database: config.database || process.env.REDIS_DATABASE || 0
        };
        
        this.client = null;
        this.isConnected = false;
    }
    
    async connect() {
        try {
            this.client = redis.createClient(this.config);
            
            this.client.on('connect', () => {
                logger.info('Connected to Redis');
                this.isConnected = true;
            });
            
            this.client.on('error', (err) => {
                logger.error('Redis error:', err);
                this.isConnected = false;
            });
            
            this.client.on('reconnecting', () => {
                logger.warn('Reconnecting to Redis...');
            });
            
            await this.client.connect();
            
            return true;
            
        } catch (error) {
            logger.error('Failed to connect to Redis:', error);
            throw error;
        }
    }
    
    async get(key) {
        try {
            return await this.client.get(key);
        } catch (error) {
            logger.error(`Redis GET error for key ${key}:`, error);
            return null;
        }
    }
    
    async set(key, value, expirySeconds = null) {
        try {
            if (expirySeconds) {
                return await this.client.setEx(key, expirySeconds, value);
            } else {
                return await this.client.set(key, value);
            }
        } catch (error) {
            logger.error(`Redis SET error for key ${key}:`, error);
            return false;
        }
    }
    
    async hGetAll(key) {
        try {
            return await this.client.hGetAll(key);
        } catch (error) {
            logger.error(`Redis HGETALL error for key ${key}:`, error);
            return {};
        }
    }
    
    async hSet(key, data) {
        try {
            return await this.client.hSet(key, data);
        } catch (error) {
            logger.error(`Redis HSET error for key ${key}:`, error);
            return false;
        }
    }
    
    async del(key) {
        try {
            return await this.client.del(key);
        } catch (error) {
            logger.error(`Redis DEL error for key ${key}:`, error);
            return false;
        }
    }
    
    async exists(key) {
        try {
            return await this.client.exists(key);
        } catch (error) {
            logger.error(`Redis EXISTS error for key ${key}:`, error);
            return false;
        }
    }
    
	/**
	 * Publish message to Redis channel
	 */
	async publish(channel, message) {
		try {
			return await this.client.publish(channel, message);
		} catch (error) {
			logger.error(`Redis PUBLISH error for channel ${channel}:`, error);
			return false;
		}
	}

	/**
	 * Subscribe to Redis channel
	 * Note: Requires a separate subscriber client
	 */
	async subscribe(channel, callback) {
		try {
			const subscriber = this.client.duplicate();
			await subscriber.connect();
			
			await subscriber.subscribe(channel, (message) => {
				callback(message);
			});
			
			logger.info(`Subscribed to Redis channel: ${channel}`);
			return subscriber;
		} catch (error) {
			logger.error(`Redis SUBSCRIBE error for channel ${channel}:`, error);
			return null;
		}
	}

	/**
	 * Set expiry on existing key
	 */
	async expire(key, seconds) {
		try {
			return await this.client.expire(key, seconds);
		} catch (error) {
			logger.error(`Redis EXPIRE error for key ${key}:`, error);
			return false;
		}
	}

    async disconnect() {
        if (this.client && this.isConnected) {
            await this.client.quit();
            this.isConnected = false;
            logger.info('Disconnected from Redis');
        }
    }
    
    getClient() {
        return this.client;
    }
}

module.exports = RedisClient;
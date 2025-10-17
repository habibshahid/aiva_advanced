/**
 * MongoDB Configuration for Transcription Storage
 */

const { MongoClient } = require('mongodb');
const logger = require('../utils/logger');

class MongoDBClient {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
        
        this.config = {
            url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
            dbName: process.env.MONGODB_DB || 'aiva_transcriptions',
            options: {
                maxPoolSize: 10,
                minPoolSize: 2,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            }
        };
    }
    
    async connect() {
        try {
            this.client = new MongoClient(this.config.url, this.config.options);
            await this.client.connect();
            
            this.db = this.client.db(this.config.dbName);
            this.isConnected = true;
            
            logger.info(`✅ MongoDB connected: ${this.config.dbName}`);
            
            // Create indexes
            await this.createIndexes();
            
            return true;
            
        } catch (error) {
            logger.error('❌ MongoDB connection error:', error);
            this.isConnected = false;
            throw error;
        }
    }
    
    async createIndexes() {
        try {
            const collection = this.db.collection('interactiontranscriptions');
            
            // Index on interactionId for quick lookups
            await collection.createIndex({ interactionId: 1 });
            
            // Index on transcriptionVersion
            await collection.createIndex({ transcriptionVersion: 1 });
            
            // Compound index for queries
            await collection.createIndex({ 
                interactionId: 1, 
                transcriptionVersion: 1 
            });
            
            logger.info('MongoDB indexes created successfully');
            
        } catch (error) {
            logger.error('Error creating MongoDB indexes:', error);
        }
    }
    
    getCollection(name) {
        if (!this.isConnected) {
            throw new Error('MongoDB not connected');
        }
        return this.db.collection(name);
    }
    
    async close() {
        if (this.client) {
            await this.client.close();
            this.isConnected = false;
            logger.info('MongoDB connection closed');
        }
    }
}

module.exports = new MongoDBClient();
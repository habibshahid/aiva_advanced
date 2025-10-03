/**
 * Monitor Server - WebSocket server for monitoring
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const logger = require('../utils/logger');

class MonitorServer {
    constructor(port = 3001) {
        this.port = port;
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.monitors = new Set();
        this.activeConnections = new Map();
        
        this.setupExpress();
        this.setupWebSocket();
    }
    
    setupExpress() {
        // Serve static files
        this.app.use(express.static(path.join(__dirname, '../../public')));
        
        // Serve monitor page
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public/monitor.html'));
        });
        
        // API endpoints
        this.app.get('/api/stats', (req, res) => {
            res.json(this.getStats());
        });
        
        this.app.get('/api/connections', (req, res) => {
            res.json({
                connections: Array.from(this.activeConnections.values())
            });
        });
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            logger.info('Monitor client connected');
            
            this.monitors.add(ws);
            
            // Send initial status
            ws.send(JSON.stringify({
                type: 'status',
                status: 'connected',
                message: 'Connected to monitor server',
                stats: this.getStats()
            }));
            
            // Send current connections
            this.activeConnections.forEach((conn, key) => {
                ws.send(JSON.stringify({
                    type: 'connection_info',
                    data: conn
                }));
            });
            
            ws.on('close', () => {
                logger.info('Monitor client disconnected');
                this.monitors.delete(ws);
            });
            
            ws.on('error', (error) => {
                logger.error('Monitor WebSocket error:', error);
                this.monitors.delete(ws);
            });
        });
    }
    
    broadcast(message) {
        const messageStr = typeof message === 'object' 
            ? JSON.stringify(message) 
            : message;
        
        this.monitors.forEach(monitor => {
            if (monitor.readyState === WebSocket.OPEN) {
                try {
                    monitor.send(messageStr);
                } catch (error) {
                    logger.error('Error broadcasting to monitor:', error);
                }
            }
        });
    }
    
    addConnection(clientKey, connectionInfo) {
        this.activeConnections.set(clientKey, {
            clientKey,
            ...connectionInfo,
            connectedAt: new Date().toISOString()
        });
        
        this.broadcast({
            type: 'connection_added',
            data: this.activeConnections.get(clientKey)
        });
    }
    
    updateConnection(clientKey, updates) {
        const conn = this.activeConnections.get(clientKey);
        if (conn) {
            Object.assign(conn, updates, {
                lastUpdated: new Date().toISOString()
            });
            
            this.broadcast({
                type: 'connection_updated',
                data: conn
            });
        }
    }
    
    removeConnection(clientKey) {
        const conn = this.activeConnections.get(clientKey);
        if (conn) {
            this.activeConnections.delete(clientKey);
            
            this.broadcast({
                type: 'connection_removed',
                data: { clientKey }
            });
        }
    }
    
    broadcastTranscript(clientKey, speaker, text) {
        this.broadcast({
            type: 'transcript',
            data: {
                clientKey,
                speaker,
                text,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    broadcastCostUpdate(clientKey, cost) {
        this.broadcast({
            type: 'cost_update',
            data: {
                clientKey,
                cost,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    broadcastFunctionCall(clientKey, functionName, args) {
        this.broadcast({
            type: 'function_call',
            data: {
                clientKey,
                functionName,
                args,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    broadcastFunctionResponse(clientKey, functionName, result) {
        this.broadcast({
            type: 'function_response',
            data: {
                clientKey,
                functionName,
                result,
                timestamp: new Date().toISOString()
            }
        });
    }
    
    getStats() {
        return {
            monitors: this.monitors.size,
            activeConnections: this.activeConnections.size,
            uptime: process.uptime()
        };
    }
    
    start() {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                logger.info(`Monitor server running on port ${this.port}`);
                logger.info(`Monitor available at http://localhost:${this.port}/`);
                resolve();
            });
        });
    }
}

module.exports = MonitorServer;
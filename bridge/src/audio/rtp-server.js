/**
 * RTP UDP Server for Asterisk Integration
 * Bidirectional audio streaming via RTP/UDP
 * 
 * FIXED: Per-client RTP sequence/timestamp/SSRC tracking for concurrent calls
 * 
 * Port: 9999 (configurable via RTP_HOST)
 */

const dgram = require('dgram');
const EventEmitter = require('events');

class RtpUdpServer extends EventEmitter {
    constructor(host, options = {}) {
        super();
        
        this.options = {
            swap16: false,
            debug: false,
            ...options
        };
        
        const parts = host.split(':');
        this.inboundAddress = parts[0] || '127.0.0.1';
        this.inboundPort = parseInt(parts[1], 10) || 9999;
        
        // Create TWO separate UDP sockets (inbound and outbound)
        this.inboundServer = dgram.createSocket('udp4');
        this.outboundServer = dgram.createSocket('udp4');
        
        // Client tracking - includes per-client RTP state
        this.clients = new Map();

        // REMOVED: Global RTP state (was causing concurrent call issues)
        // this.outboundSequence = 0;      // BAD - shared across all calls
        // this.outboundTimestamp = 0;     // BAD - shared across all calls
        // this.outboundSSRC = ...;        // BAD - one SSRC for everyone

        this.setupInboundServer();
        this.setupOutboundServer();
        
        // Cleanup stale clients every 30s
        setInterval(() => this.cleanupStaleClients(), 30000);
    }
    
    setupInboundServer() {
        this.inboundServer.on('error', (err) => {
            console.error(`[RTP] Inbound server error: ${err.message}`);
            this.emit('error', err);
        });

        this.inboundServer.on('close', () => {
            console.log('[RTP] Inbound server closed');
            this.emit('close');
        });

        this.inboundServer.on('message', (msg, rinfo) => {
            const clientKey = `${rinfo.address}:${rinfo.port}`;
            
            // Track client
            if (!this.clients.has(clientKey)) {
                console.log(`[RTP] New client: ${clientKey}`);
                
                // FIXED: Each client gets their own RTP state
                const client = {
                    address: rinfo.address,
                    port: rinfo.port,
                    lastSeen: Date.now(),
                    
                    // Inbound RTP state (from Asterisk)
                    inbound: {
                        sequenceNumber: 0,
                        timestamp: 0,
                        ssrc: 0,
                        payloadType: 0
                    },
                    
                    // Outbound RTP state (to Asterisk) - PER CLIENT!
                    outbound: {
                        sequenceNumber: Math.floor(Math.random() * 10000),  // Random start
                        timestamp: Math.floor(Math.random() * 100000),       // Random start
                        ssrc: Math.floor(Math.random() * 0xFFFFFFFF)         // Unique SSRC per client
                    }
                };
                
                this.clients.set(clientKey, client);
                this.emit('client', client);
                
                if (this.options.debug) {
                    console.log(`[RTP] Client ${clientKey} initialized with SSRC: ${client.outbound.ssrc.toString(16)}`);
                }
            } else {
                const client = this.clients.get(clientKey);
                client.lastSeen = Date.now();
                
                // Extract RTP header info from inbound packets
                if (msg.length >= 12) {
                    client.inbound.sequenceNumber = msg.readUInt16BE(2);
                    client.inbound.timestamp = msg.readUInt32BE(4);
                    client.inbound.ssrc = msg.readUInt32BE(8);
                    client.inbound.payloadType = msg[1] & 0x7F;
                }
            }
            
            // Strip RTP header (12 bytes), emit raw audio
            let audioData = msg.slice(12);
            
            if (this.options.swap16) {
                audioData.swap16();
            }
            
            this.emit('audio', {
                client: clientKey,
                buffer: audioData,
                rinfo: rinfo
            });
        });

        this.inboundServer.bind(this.inboundPort, this.inboundAddress, () => {
            const address = this.inboundServer.address();
            console.log(`[RTP] Inbound server listening on ${address.address}:${address.port}`);
            this.emit('listening', address);
        });
    }
    
    setupOutboundServer() {
        this.outboundServer.on('error', (err) => {
            console.error(`[RTP] Outbound server error: ${err.message}`);
        });

        this.outboundServer.on('close', () => {
            console.log('[RTP] Outbound server closed');
        });

        // Bind outbound to port-1 (e.g., 9998 if inbound is 9999)
        const outboundPort = this.inboundPort - 1;
        this.outboundServer.bind(outboundPort, this.inboundAddress, () => {
            const address = this.outboundServer.address();
            console.log(`[RTP] Outbound server bound to ${address.address}:${address.port}`);
        });
    }
    
    /**
     * Send audio back to Asterisk client
     * FIXED: Now uses PER-CLIENT RTP sequence/timestamp/SSRC
     */
    sendAudio(clientKey, audioData) {
        const client = this.clients.get(clientKey);
        if (!client) {
            if (this.options.debug) {
                console.error(`[RTP] Cannot send - unknown client: ${clientKey}`);
            }
            return false;
        }
        
        try {
            // Build RTP header (12 bytes)
            const header = Buffer.alloc(12);
            
            // Version=2, Padding=0, Extension=0, CC=0
            header.writeUInt8(0x80, 0);
            
            // Marker=0, PayloadType (0 = PCMU/mulaw)
            header.writeUInt8(client.inbound.payloadType || 0, 1);
            
            // Sequence number - PER CLIENT (was global before!)
            client.outbound.sequenceNumber = (client.outbound.sequenceNumber + 1) % 65536;
            header.writeUInt16BE(client.outbound.sequenceNumber, 2);
            
            // Timestamp - PER CLIENT (increment by 160 samples = 20ms @ 8kHz)
            client.outbound.timestamp = (client.outbound.timestamp + 160) % 0xFFFFFFFF;
            header.writeUInt32BE(client.outbound.timestamp, 4);
            
            // SSRC - PER CLIENT (unique per call - was shared before!)
            header.writeUInt32BE(client.outbound.ssrc, 8);
            
            // Combine header + audio
            const packet = Buffer.concat([header, audioData]);
            
            // Send to client
            this.outboundServer.send(packet, 0, packet.length, client.port, client.address, (err) => {
                if (err && this.options.debug) {
                    console.error(`[RTP] Send error to ${clientKey}:`, err.message);
                }
            });
            
            return true;
        } catch (error) {
            console.error(`[RTP] Error creating packet for ${clientKey}:`, error.message);
            return false;
        }
    }
    
    /**
     * Get client RTP stats (for debugging)
     */
    getClientStats(clientKey) {
        const client = this.clients.get(clientKey);
        if (!client) return null;
        
        return {
            address: client.address,
            port: client.port,
            lastSeen: client.lastSeen,
            inbound: { ...client.inbound },
            outbound: { ...client.outbound }
        };
    }
    
    /**
     * Get all active clients
     */
    getActiveClients() {
        return Array.from(this.clients.keys());
    }
    
    /**
     * Cleanup clients that haven't sent audio recently
     */
    cleanupStaleClients() {
        const now = Date.now();
        const staleThreshold = 30000; // 30 seconds
        
        for (const [clientKey, client] of this.clients.entries()) {
            if (now - client.lastSeen > staleThreshold) {
                console.log(`[RTP] Removing stale client: ${clientKey} (SSRC: ${client.outbound.ssrc.toString(16)})`);
                this.clients.delete(clientKey);
                this.emit('clientDisconnected', clientKey);
            }
        }
    }
    
    /**
     * Remove a specific client
     */
    removeClient(clientKey) {
        if (this.clients.has(clientKey)) {
            const client = this.clients.get(clientKey);
            console.log(`[RTP] Removing client: ${clientKey} (SSRC: ${client.outbound.ssrc.toString(16)})`);
            this.clients.delete(clientKey);
            this.emit('clientDisconnected', clientKey);
            return true;
        }
        return false;
    }
    
    /**
     * Close servers
     */
    close() {
        console.log(`[RTP] Closing servers, ${this.clients.size} active clients`);
        this.clients.clear();
        this.inboundServer.close();
        this.outboundServer.close();
    }
}

module.exports = RtpUdpServer;
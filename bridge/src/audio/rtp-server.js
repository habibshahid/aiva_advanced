/**
 * RTP UDP Server - PRESERVED FROM ORIGINAL
 * This is your working audio bridge - NO BREAKING CHANGES
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
        
        this.inboundAddress = host.split(':')[0];
        this.inboundPort = parseInt(host.split(':')[1], 10);
        
        // Create TWO separate UDP sockets
        this.inboundServer = dgram.createSocket('udp4');
        this.outboundServer = dgram.createSocket('udp4');
        
        this.clients = new Map();
        this.outputStreams = new Map();
        
        // Separate tracking for outbound RTP
        this.outboundSequence = 0;
        this.outboundTimestamp = 0;
        this.outboundSSRC = Math.floor(Math.random() * 0xFFFFFFFF);

        this.setupInboundServer();
        this.setupOutboundServer();
        
        setInterval(() => this.cleanupStaleClients(), 30000);
    }
    
    setupInboundServer() {
        this.inboundServer.on('error', (err) => {
            console.error(`Inbound RTP server error:\n${err.stack}`);
            this.emit('error', err);
        });

        this.inboundServer.on('close', () => {
            console.log('Inbound RTP server closed');
            this.emit('close');
        });

        this.inboundServer.on('message', (msg, rinfo) => {
            const clientKey = `${rinfo.address}:${rinfo.port}`;
            
            if (!this.clients.has(clientKey)) {
                console.log(`New RTP client connected: ${clientKey}`);
                
                const client = {
                    address: rinfo.address,
                    port: rinfo.port,
                    lastSeen: Date.now(),
                    inboundPort: rinfo.port,
                    sequenceNumber: 0,
                    timestamp: 0,
                    ssrc: 0,
                    payloadType: 0
                };
                
                this.clients.set(clientKey, client);
                this.emit('client', client);
            } else {
                const client = this.clients.get(clientKey);
                client.lastSeen = Date.now();
                
                if (msg.length >= 12) {
                    client.sequenceNumber = msg.readUInt16BE(2);
                    client.timestamp = msg.readUInt32BE(4);
                    client.ssrc = msg.readUInt32BE(8);
                    client.payloadType = msg[1] & 0x7F;
                }
            }
            
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
            console.log(`Inbound RTP server listening on ${address.address}:${address.port}`);
            this.emit('listening', address);
        });
    }
    
    setupOutboundServer() {
        this.outboundServer.on('error', (err) => {
            console.error(`Outbound RTP server error:\n${err.stack}`);
        });

        this.outboundServer.on('close', () => {
            console.log('Outbound RTP server closed');
        });

        const outboundPort = this.inboundPort - 1;
        this.outboundServer.bind(outboundPort, this.inboundAddress, () => {
            const address = this.outboundServer.address();
            console.log(`Outbound RTP server bound to ${address.address}:${address.port}`);
        });
    }
    
    sendAudio(clientKey, audioData) {
        const client = this.clients.get(clientKey);
        if (!client) {
            console.error(`Cannot send audio - unknown client: ${clientKey}`);
            return false;
        }
        
        try {
            const header = Buffer.alloc(12);
            
            header.writeUInt8(0x80, 0);
            header.writeUInt8(client.payloadType || 0, 1);
            
            this.outboundSequence = (this.outboundSequence + 1) % 65536;
            header.writeUInt16BE(this.outboundSequence, 2);
            
            this.outboundTimestamp += 160;
            header.writeUInt32BE(this.outboundTimestamp, 4);
            
            header.writeUInt32BE(this.outboundSSRC, 8);
            
            const packet = Buffer.concat([header, audioData]);
            
            this.outboundServer.send(packet, 0, packet.length, client.port, client.address, (err) => {
                if (err && this.options.debug) {
                    console.error(`Error sending audio to ${clientKey}:`, err);
                }
            });
            
            return true;
        } catch (error) {
            console.error(`Error creating RTP packet:`, error);
            return false;
        }
    }
    
    cleanupStaleClients() {
        const now = Date.now();
        const staleThreshold = 30000;
        
        for (const [clientKey, client] of this.clients.entries()) {
            if (now - client.lastSeen > staleThreshold) {
                console.log(`Removing stale client: ${clientKey}`);
                this.clients.delete(clientKey);
                this.emit('clientDisconnected', clientKey);
            }
        }
    }
    
    close() {
        this.inboundServer.close();
        this.outboundServer.close();
    }
}

module.exports = RtpUdpServer;
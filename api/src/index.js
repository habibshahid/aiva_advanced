const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const functionRoutes = require('./routes/functions');
const creditRoutes = require('./routes/credits');
const callRoutes = require('./routes/calls');
const realtimeRoutes = require('./routes/realtime');
const aiAssistRoutes = require('./routes/ai-assist');
const chatRoutes = require('./routes/chat');
const knowledgeRoutes = require('./routes/knowledge');
const shopifyRoutes = require('./routes/shopify');

const app = express();
const PORT = process.env.API_PORT || 62001;

// Security middleware
app.use(helmet());

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString() 
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/ai-assist', aiAssistRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/shopify', shopifyRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not found' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('Agent Management API Server');
    console.log('='.repeat(60));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API URL: http://localhost:${PORT}/api`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    console.log('='.repeat(60));
});
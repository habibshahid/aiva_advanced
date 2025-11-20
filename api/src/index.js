const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { swaggerUi, swaggerSpec } = require('./config/swagger');
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
const conversationStrategyRoutes = require('./routes/conversationStrategy');
const usersRoutes = require('./routes/users');
const publicChatRoutes = require('./routes/public-chat');
const widgetRoutes = require('./routes/widget');
const imagesRoutes = require('./routes/images');
const settingsRoutes = require('./routes/settings');
const transcriptionRoutes = require('./routes/transcriptions');
const analyticsRoutes = require('./routes/analytics');

const sessionCleanup = require('./jobs/session-cleanup');

const app = express();
const PORT = process.env.API_PORT || 62001;

// 1. TRUST PROXY - MUST BE FIRST
app.set('trust proxy', 1); 

// 2. SECURITY MIDDLEWARE
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 3. CORS - Allow all for public widget
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// 4. BODY PARSING - BEFORE routes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 5. RATE LIMITING - Only for protected routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => {
    // Skip rate limiting for public endpoints
    return req.path.startsWith('/api/public/') || 
           req.path === '/widget.js' ||
           req.path === '/api/health';
  }
});

// Apply rate limiter to API routes (but will skip public routes)
app.use('/api/', limiter);

// 6. PUBLIC ROUTES FIRST (NO AUTH, NO RATE LIMIT)
app.use('/', widgetRoutes); // Serves /widget.js
app.use('/api/public/chat', publicChatRoutes); // Public chat API

// 7. HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    routes: {
      public_chat: '/api/public/chat',
      widget: '/widget.js'
    }
  });
});

// 8. SWAGGER DOCUMENTATION
app.use('/swagger/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: `
    .swagger-ui .topbar { background-color: #2c3e50; }
    .swagger-ui .topbar-wrapper img { display: none; }
    .swagger-ui .topbar-wrapper::after {
      content: 'AiVA API';
      color: white;
      font-size: 24px;
      font-weight: bold;
    }
  `,
  swaggerOptions: {
    persistAuthorization: true
  },
  customSiteTitle: 'AiVA API Documentation',
  customfavIcon: '/favicon.ico'
}));

// Swagger JSON endpoint
app.get('/swagger/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// 9. PROTECTED API ROUTES (WITH AUTH)
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
app.use('/api/conversation-strategy', conversationStrategyRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/images', imagesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/transcriptions', transcriptionRoutes);
app.use('/api/analytics', analyticsRoutes);

// 10. ERROR HANDLING MIDDLEWARE
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 11. 404 HANDLER (MUST BE LAST)
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.path);
  res.status(404).json({ 
    error: 'Not found',
    path: req.path
  });
});

// 12. START SERVER
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Agent Management API Server');
  console.log('='.repeat(60));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 API URL: http://localhost:${PORT}/api`);
  console.log(`💬 Public Chat: http://localhost:${PORT}/api/public/chat`);
  console.log(`📦 Widget: http://localhost:${PORT}/widget.js`);
  console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
  console.log(`📚 Swagger: http://localhost:${PORT}/swagger/api-docs`);
  console.log('='.repeat(60));
  console.log('');
  sessionCleanup.start();
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  sessionCleanup.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  sessionCleanup.stop();
  process.exit(0);
});

module.exports = app;
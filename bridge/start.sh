#!/bin/bash

# Asterisk-OpenAI Bridge Startup Script

echo "======================================"
echo "Asterisk-OpenAI Realtime Bridge v2.0"
echo "======================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please copy .env.example to .env and configure it"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create logs directory
mkdir -p logs

# Check Redis connection
echo "🔍 Checking Redis connection..."
if ! redis-cli ping > /dev/null 2>&1; then
    echo "⚠️  Warning: Redis is not running"
    echo "   Start Redis with: redis-server"
fi

# Start the application
echo ""
echo "🚀 Starting bridge..."
echo ""

npm start
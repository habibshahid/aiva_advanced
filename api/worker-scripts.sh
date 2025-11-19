#!/bin/bash
#
# Shopify Worker Management Scripts
# Quick commands to manage the worker process
#

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Function: Start worker (development)
start_dev() {
    echo -e "${BLUE}Starting Shopify Worker (Development)...${NC}"
    NODE_ENV=development node worker.js
}

# Function: Start worker with PM2 (production)
start_prod() {
    echo -e "${BLUE}Starting Shopify Worker with PM2...${NC}"
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}PM2 is not installed. Installing...${NC}"
        npm install -g pm2
    fi
    
    # Create logs directory
    mkdir -p logs
    
    # Start only the worker
    pm2 start ecosystem.config.js --only shopify-worker
    
    echo -e "${GREEN}Worker started!${NC}"
    echo ""
    echo "View logs: pm2 logs shopify-worker"
    echo "View status: pm2 status"
    echo "Stop worker: pm2 stop shopify-worker"
}

# Function: Start all services (API + Worker)
start_all() {
    echo -e "${BLUE}Starting all services (API + Worker)...${NC}"
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}PM2 is not installed. Installing...${NC}"
        npm install -g pm2
    fi
    
    # Create logs directory
    mkdir -p logs
    
    # Start all services
    pm2 start ecosystem.config.js
    
    echo -e "${GREEN}All services started!${NC}"
    echo ""
    echo "View logs: pm2 logs"
    echo "View status: pm2 status"
    echo "Stop all: pm2 stop all"
}

# Function: Stop worker
stop() {
    echo -e "${YELLOW}Stopping Shopify Worker...${NC}"
    pm2 stop shopify-worker
    echo -e "${GREEN}Worker stopped!${NC}"
}

# Function: Restart worker
restart() {
    echo -e "${YELLOW}Restarting Shopify Worker...${NC}"
    pm2 restart shopify-worker
    echo -e "${GREEN}Worker restarted!${NC}"
}

# Function: View logs
logs() {
    echo -e "${BLUE}Showing worker logs (Ctrl+C to exit)...${NC}"
    pm2 logs shopify-worker --lines 50
}

# Function: View status
status() {
    echo -e "${BLUE}Worker Status:${NC}"
    pm2 status shopify-worker
}

# Function: Monitor
monitor() {
    echo -e "${BLUE}Opening PM2 monitor...${NC}"
    pm2 monit
}

# Function: Delete worker from PM2
delete() {
    echo -e "${YELLOW}Removing worker from PM2...${NC}"
    pm2 delete shopify-worker
    echo -e "${GREEN}Worker removed!${NC}"
}

# Function: Show help
show_help() {
    echo -e "${BLUE}Shopify Worker Management${NC}"
    echo ""
    echo "Usage: ./worker-scripts.sh [command]"
    echo ""
    echo "Commands:"
    echo "  dev           Start worker in development mode"
    echo "  start         Start worker with PM2 (production)"
    echo "  start-all     Start API + Worker with PM2"
    echo "  stop          Stop worker"
    echo "  restart       Restart worker"
    echo "  logs          View worker logs"
    echo "  status        View worker status"
    echo "  monitor       Open PM2 monitor"
    echo "  delete        Remove worker from PM2"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./worker-scripts.sh dev          # Run in development"
    echo "  ./worker-scripts.sh start        # Start with PM2"
    echo "  ./worker-scripts.sh logs         # View logs"
    echo ""
}

# Main script logic
case "$1" in
    dev)
        start_dev
        ;;
    start)
        start_prod
        ;;
    start-all)
        start_all
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    monitor)
        monitor
        ;;
    delete)
        delete
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
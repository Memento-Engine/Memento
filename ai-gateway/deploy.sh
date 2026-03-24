#!/bin/bash

# AI Gateway Deployment Script for EC2
# This script automates the deployment process

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="ai-gateway"
DOCKER_IMAGE="${DOCKER_IMAGE:-yourusername/ai-gateway:latest}"
CONTAINER_NAME="ai-gateway"
POSTGRES_CONTAINER="ai-gateway-postgres"
ENV_FILE=".env"
BACKUP_DIR="backups"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AI Gateway Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please create a .env file with the required environment variables."
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to backup database
backup_database() {
    echo -e "${YELLOW}Creating database backup...${NC}"
    
    if docker ps | grep -q "$POSTGRES_CONTAINER"; then
        BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql"
        docker exec "$POSTGRES_CONTAINER" pg_dump -U aigateway aigateway > "$BACKUP_FILE"
        echo -e "${GREEN}✓ Database backed up to $BACKUP_FILE${NC}"
    else
        echo -e "${YELLOW}⚠ PostgreSQL container not running, skipping backup${NC}"
    fi
}

# Function to pull latest image
pull_image() {
    echo -e "${YELLOW}Pulling latest Docker image...${NC}"
    docker pull "$DOCKER_IMAGE"
    echo -e "${GREEN}✓ Image pulled successfully${NC}"
}

# Function to stop and remove old container
stop_old_container() {
    echo -e "${YELLOW}Stopping old container...${NC}"
    
    if docker ps -a | grep -q "$CONTAINER_NAME"; then
        docker stop "$CONTAINER_NAME" || true
        docker rm "$CONTAINER_NAME" || true
        echo -e "${GREEN}✓ Old container removed${NC}"
    else
        echo -e "${YELLOW}⚠ No existing container found${NC}"
    fi
}

# Function to start new container
start_new_container() {
    echo -e "${YELLOW}Starting new container...${NC}"
    
    # Check if network exists, create if not
    if ! docker network ls | grep -q "ai-gateway-network"; then
        docker network create ai-gateway-network
        echo -e "${GREEN}✓ Created Docker network${NC}"
    fi
    
    # Start PostgreSQL if not running
    if ! docker ps | grep -q "$POSTGRES_CONTAINER"; then
        echo -e "${YELLOW}Starting PostgreSQL container...${NC}"
        docker run -d \
            --name "$POSTGRES_CONTAINER" \
            --restart unless-stopped \
            --network ai-gateway-network \
            -e POSTGRES_USER=aigateway \
            -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}" \
            -e POSTGRES_DB=aigateway \
            -v ai-gateway-postgres-data:/var/lib/postgresql/data \
            postgres:16-alpine
        
        echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
        sleep 10
    fi
    
    # Start AI Gateway
    docker run -d \
        --name "$CONTAINER_NAME" \
        --restart unless-stopped \
        --network ai-gateway-network \
        -p 4180:4180 \
        --env-file "$ENV_FILE" \
        "$DOCKER_IMAGE"
    
    echo -e "${GREEN}✓ New container started${NC}"
}

# Function to wait for health check
wait_for_health() {
    echo -e "${YELLOW}Waiting for application to be healthy...${NC}"
    
    for i in {1..30}; do
        if curl -sf http://localhost:4180/health > /dev/null; then
            echo -e "${GREEN}✓ Application is healthy!${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    
    echo -e "${RED}✗ Health check failed${NC}"
    echo -e "${YELLOW}Checking logs:${NC}"
    docker logs --tail 50 "$CONTAINER_NAME"
    return 1
}

# Function to cleanup old images
cleanup() {
    echo -e "${YELLOW}Cleaning up old Docker images...${NC}"
    docker image prune -f
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# Function to show logs
show_logs() {
    echo -e "${YELLOW}Showing recent logs:${NC}"
    docker logs --tail 30 "$CONTAINER_NAME"
}

# Main deployment flow
main() {
    echo ""
    echo -e "${YELLOW}Step 1/6: Backing up database${NC}"
    backup_database
    
    echo ""
    echo -e "${YELLOW}Step 2/6: Pulling latest image${NC}"
    pull_image
    
    echo ""
    echo -e "${YELLOW}Step 3/6: Stopping old container${NC}"
    stop_old_container
    
    echo ""
    echo -e "${YELLOW}Step 4/6: Starting new container${NC}"
    start_new_container
    
    echo ""
    echo -e "${YELLOW}Step 5/6: Health check${NC}"
    if wait_for_health; then
        echo ""
        echo -e "${YELLOW}Step 6/6: Cleanup${NC}"
        cleanup
        
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        show_logs
        
        echo ""
        echo -e "${GREEN}Service is now running at: http://localhost:4180${NC}"
        echo -e "${GREEN}Health check: http://localhost:4180/health${NC}"
    else
        echo ""
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}✗ Deployment failed!${NC}"
        echo -e "${RED}========================================${NC}"
        exit 1
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    logs)
        docker logs -f "$CONTAINER_NAME"
        ;;
    restart)
        docker restart "$CONTAINER_NAME"
        echo -e "${GREEN}✓ Container restarted${NC}"
        ;;
    stop)
        docker stop "$CONTAINER_NAME"
        echo -e "${GREEN}✓ Container stopped${NC}"
        ;;
    status)
        docker ps -a | grep "$CONTAINER_NAME"
        echo ""
        curl -s http://localhost:4180/health | jq . || echo "Health check failed"
        ;;
    backup)
        backup_database
        ;;
    *)
        echo "Usage: $0 {deploy|logs|restart|stop|status|backup}"
        echo ""
        echo "Commands:"
        echo "  deploy  - Deploy the latest version (default)"
        echo "  logs    - Show and follow container logs"
        echo "  restart - Restart the container"
        echo "  stop    - Stop the container"
        echo "  status  - Show container status and health"
        echo "  backup  - Backup the database"
        exit 1
        ;;
esac

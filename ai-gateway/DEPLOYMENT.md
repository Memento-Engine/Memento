# AI Gateway - EC2 Deployment Guide

This guide walks you through deploying the AI Gateway to AWS EC2 using Docker and GitHub Actions.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [EC2 Instance Setup](#ec2-instance-setup)
3. [Database Setup](#database-setup)
4. [GitHub Secrets Configuration](#github-secrets-configuration)
5. [Deployment](#deployment)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- AWS Account with EC2 access
- GitHub repository with Actions enabled
- Docker Hub account (or AWS ECR)
- Domain name (optional, for HTTPS)

## EC2 Instance Setup

### 1. Launch EC2 Instance

```bash
# Recommended: t3.small or larger (2GB+ RAM)
# AMI: Amazon Linux 2023 or Ubuntu 22.04 LTS
```

**Instance specifications:**
- Instance Type: t3.small (minimum) or t3.medium (recommended)
- Storage: 20GB gp3
- Security Group rules:
  - SSH (22) - Your IP only
  - HTTP (80) - 0.0.0.0/0
  - HTTPS (443) - 0.0.0.0/0
  - Custom TCP (4180) - 0.0.0.0/0 (or use ALB/Nginx reverse proxy)

### 2. Connect to EC2 and Install Dependencies

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# Update system
sudo yum update -y  # Amazon Linux
# OR
sudo apt update && sudo apt upgrade -y  # Ubuntu

# Install Docker
# For Amazon Linux 2023:
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# For Ubuntu:
sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ubuntu

# Install Docker Compose (optional but recommended)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and log back in for group changes to take effect
exit
```

### 3. Setup Application Directory

```bash
# SSH back in
ssh -i your-key.pem ec2-user@your-ec2-ip

# Create application directory
mkdir -p ~/ai-gateway
cd ~/ai-gateway

# Create Docker network for inter-container communication
docker network create ai-gateway-network
```

## Database Setup

### Option 1: PostgreSQL in Docker (Development/Small Scale)

```bash
# Create postgres data directory
mkdir -p ~/ai-gateway/postgres-data

# Run PostgreSQL container
docker run -d \
  --name postgres \
  --restart unless-stopped \
  --network ai-gateway-network \
  -p 5432:5432 \
  -e POSTGRES_USER=aigateway \
  -e POSTGRES_PASSWORD=your_secure_password_here \
  -e POSTGRES_DB=aigateway \
  -v ~/ai-gateway/postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine
```

### Option 2: AWS RDS PostgreSQL (Production Recommended)

1. Create RDS PostgreSQL instance via AWS Console
2. Configure security group to allow EC2 instance access
3. Note the endpoint URL for your .env file

## Environment Configuration

Create the `.env` file on your EC2 instance:

```bash
cd ~/ai-gateway
nano .env
```

Add the following configuration:

```env
# Server Configuration
AI_GATEWAY_HOST=0.0.0.0
AI_GATEWAY_PORT=4180
NODE_ENV=production

# Database Configuration
# For Docker PostgreSQL:
DATABASE_URL=postgresql://aigateway:your_secure_password_here@postgres:5432/aigateway

# For AWS RDS:
# DATABASE_URL=postgresql://username:password@your-rds-endpoint:5432/aigateway

# Provider Credentials
OPENROUTER_API_KEY=your_openrouter_api_key_here
AI_GATEWAY_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Model Configuration
AI_GATEWAY_DEFAULT_MODEL=openai/gpt-4o-mini
AI_GATEWAY_DEFAULT_TEMPERATURE=0

# Rate Limiting
AI_GATEWAY_FREE_RPM=20
AI_GATEWAY_FREE_DAILY_TOKENS=40000
AI_GATEWAY_PRO_RPM=120
AI_GATEWAY_PRO_DAILY_TOKENS=300000

# JWT Secrets (CHANGE THESE!)
JWT_ACCESS_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)

# Google OAuth (if needed)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional: Tavily API for web search
TAVILY_API_KEY=your_tavily_api_key

# Optional: Sentry for error tracking
SENTRY_DSN=your_sentry_dsn_here
```

**Security Note:** Keep this file secure and never commit it to version control.

## GitHub Secrets Configuration

Add the following secrets to your GitHub repository (Settings → Secrets and variables → Actions):

### Docker Hub Secrets
```
DOCKER_USERNAME=your_dockerhub_username
DOCKER_PASSWORD=your_dockerhub_password_or_token
```

### AWS Secrets (if using ECR or AWS deployment)
```
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
```

### EC2 Deployment Secrets
```
EC2_SSH_PRIVATE_KEY=your_private_key_content
EC2_HOST=your-ec2-public-ip-or-domain
EC2_USER=ec2-user  # or ubuntu for Ubuntu AMI
```

### Optional Secrets
```
SLACK_WEBHOOK=your_slack_webhook_url  # For deployment notifications
```

## Deployment

### Manual Deployment (First Time)

```bash
# On your EC2 instance
cd ~/ai-gateway

# Pull the Docker image
docker pull yourusername/ai-gateway:latest

# Run the container
docker run -d \
  --name ai-gateway \
  --restart unless-stopped \
  --network ai-gateway-network \
  -p 4180:4180 \
  --env-file .env \
  yourusername/ai-gateway:latest

# Check logs
docker logs -f ai-gateway

# Test the health endpoint
curl http://localhost:4180/health
```

### Automated Deployment via GitHub Actions

1. **Push to main branch** - Automatically builds and deploys
2. **Manual trigger** - Go to Actions → AI Gateway Deploy → Run workflow

### Using Docker Compose (Alternative)

Create `docker-compose.yml` on EC2:

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: aigateway
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: aigateway
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    networks:
      - ai-gateway-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aigateway"]
      interval: 10s
      timeout: 5s
      retries: 5

  ai-gateway:
    image: yourusername/ai-gateway:latest
    container_name: ai-gateway
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "4180:4180"
    env_file:
      - .env
    networks:
      - ai-gateway-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:4180/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  ai-gateway-network:
    driver: bridge
```

Then deploy with:
```bash
docker-compose up -d
```

## Setup Nginx Reverse Proxy (Recommended)

```bash
# Install Nginx
sudo yum install -y nginx  # Amazon Linux
# OR
sudo apt install -y nginx  # Ubuntu

# Configure Nginx
sudo nano /etc/nginx/conf.d/ai-gateway.conf
```

Add configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:4180;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long-running requests
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:4180/health;
        access_log off;
    }
}
```

```bash
# Test configuration
sudo nginx -t

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

## SSL/TLS with Let's Encrypt (Recommended for Production)

```bash
# Install Certbot
sudo yum install -y certbot python3-certbot-nginx  # Amazon Linux
# OR
sudo apt install -y certbot python3-certbot-nginx  # Ubuntu

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
sudo systemctl status certbot-renew.timer
```

## Monitoring and Maintenance

### View Logs

```bash
# Real-time logs
docker logs -f ai-gateway

# Last 100 lines
docker logs --tail 100 ai-gateway

# With timestamps
docker logs -t ai-gateway
```

### Monitor Container Health

```bash
# Check container status
docker ps -a

# Check resource usage
docker stats ai-gateway

# Inspect container
docker inspect ai-gateway
```

### Database Backup

```bash
# Backup PostgreSQL
docker exec postgres pg_dump -U aigateway aigateway > backup-$(date +%Y%m%d).sql

# Restore from backup
docker exec -i postgres psql -U aigateway aigateway < backup-20240324.sql
```

### Update Deployment

```bash
# Pull latest image
docker pull yourusername/ai-gateway:latest

# Stop and remove old container
docker stop ai-gateway
docker rm ai-gateway

# Start new container
docker run -d \
  --name ai-gateway \
  --restart unless-stopped \
  --network ai-gateway-network \
  -p 4180:4180 \
  --env-file ~/ai-gateway/.env \
  yourusername/ai-gateway:latest

# Cleanup old images
docker image prune -f
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs ai-gateway

# Common issues:
# 1. Database connection - ensure PostgreSQL is running
docker ps | grep postgres

# 2. Environment variables - verify .env file
cat ~/ai-gateway/.env

# 3. Port conflicts
sudo netstat -tlnp | grep 4180
```

### Database connection issues

```bash
# Test database connection
docker exec -it postgres psql -U aigateway -d aigateway

# Check network
docker network inspect ai-gateway-network
```

### High memory usage

```bash
# Check memory
free -h
docker stats ai-gateway

# Restart container
docker restart ai-gateway

# Consider upgrading instance type
```

### API errors

```bash
# Test health endpoint
curl http://localhost:4180/health

# Test with verbose output
curl -v -X POST http://localhost:4180/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "test"}], "user_id": "test"}'
```

## Security Best Practices

1. **Keep secrets secure** - Never commit .env files
2. **Use IAM roles** - For EC2 to access other AWS services
3. **Enable CloudWatch** - For logs and monitoring
4. **Security groups** - Restrict access appropriately
5. **Regular updates** - Keep Docker images and system packages updated
6. **HTTPS only** - Use SSL/TLS certificates
7. **Database security** - Use strong passwords, enable SSL connections

## Cost Optimization

1. **Use Reserved Instances** - For production workloads
2. **Enable auto-scaling** - For variable loads
3. **Use RDS** - With appropriate instance sizing
4. **CloudWatch alarms** - Monitor and alert on high usage
5. **Regular cleanup** - Remove unused Docker images and volumes

## Support

For issues or questions:
- Check application logs: `docker logs ai-gateway`
- Review GitHub Actions logs
- Check AWS CloudWatch (if configured)

---

**Last Updated:** March 2026

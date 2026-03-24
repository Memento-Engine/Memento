# EC2 Deployment - Step by Step Guide

## Prerequisites Checklist
- ✅ EC2 instance created (t3.small or larger recommended)
- ✅ .pem key file downloaded
- ✅ Security Group configured with ports: 22 (SSH), 80 (HTTP), 443 (HTTPS), 4180 (Custom)
- ✅ Public IP address noted

## Step 1: Connect to EC2

### From Windows (PowerShell/CMD)

```powershell
# Set correct permissions on .pem file (PowerShell as Administrator)
icacls Downloads\your-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Connect via SSH
ssh -i Downloads\your-key.pem ec2-user@YOUR_EC2_PUBLIC_IP
```

**Note:** Replace `YOUR_EC2_PUBLIC_IP` with your actual EC2 public IP address.

**For Ubuntu AMI, use:** `ubuntu@YOUR_EC2_PUBLIC_IP`

## Step 2: Install Docker on EC2

Once connected to EC2, run these commands:

### For Amazon Linux 2023 / Amazon Linux 2

```bash
# Update system
sudo yum update -y

# Install Docker
sudo yum install -y docker

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add current user to docker group
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes
exit
```

### For Ubuntu

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add current user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes
exit
```

**Important:** Log out and SSH back in after adding user to docker group!

## Step 3: Reconnect and Verify Docker

```bash
# Reconnect via SSH
ssh -i Downloads\your-key.pem ec2-user@YOUR_EC2_PUBLIC_IP

# Verify Docker is working
docker --version
docker-compose --version
docker ps
```

## Step 4: Setup Application Directory

```bash
# Create application directory
mkdir -p ~/ai-gateway
cd ~/ai-gateway

# Create Docker network
docker network create ai-gateway-network
```

## Step 5: Create .env File

```bash
# Create .env file
nano .env
```

Paste this configuration (update with your actual values):

```env
# ============================================
# Server Configuration
# ============================================
AI_GATEWAY_HOST=0.0.0.0
AI_GATEWAY_PORT=4180
NODE_ENV=production

# ============================================
# Database Configuration
# ============================================
POSTGRES_USER=aigateway
POSTGRES_PASSWORD=CHANGE_TO_STRONG_PASSWORD
POSTGRES_DB=aigateway
DATABASE_URL=postgresql://aigateway:CHANGE_TO_STRONG_PASSWORD@postgres:5432/aigateway

# ============================================
# Provider API Keys (REQUIRED)
# ============================================
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE
AI_GATEWAY_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# ============================================
# Model Configuration
# ============================================
AI_GATEWAY_DEFAULT_MODEL=openai/gpt-4o-mini
AI_GATEWAY_DEFAULT_TEMPERATURE=0

# Role-based models
AI_GATEWAY_PLANNER_MODEL=openai/gpt-4o-mini
AI_GATEWAY_EXECUTOR_MODEL=deepseek/deepseek-chat
AI_GATEWAY_FINAL_MODEL=openai/gpt-4o-mini

# ============================================
# Rate Limiting
# ============================================
AI_GATEWAY_FREE_RPM=20
AI_GATEWAY_FREE_DAILY_TOKENS=40000
AI_GATEWAY_PRO_RPM=120
AI_GATEWAY_PRO_DAILY_TOKENS=300000

# ============================================
# JWT Secrets (REQUIRED - Generate unique values!)
# ============================================
JWT_ACCESS_SECRET=GENERATE_WITH_OPENSSL_RAND_BASE64_32
JWT_REFRESH_SECRET=GENERATE_WITH_OPENSSL_RAND_BASE64_32

# ============================================
# Google OAuth (Optional)
# ============================================
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ============================================
# Web Search (Optional)
# ============================================
TAVILY_API_KEY=
```

**Generate JWT secrets:**
```bash
# Generate random secrets
openssl rand -base64 32
openssl rand -base64 32
```

**Save and exit nano:** Press `Ctrl+X`, then `Y`, then `Enter`

## Step 6: Deploy with Docker Compose

### Option A: Using Docker Compose (Recommended - Easiest)

```bash
# Still in ~/ai-gateway directory
cd ~/ai-gateway

# Create docker-compose.yml
nano docker-compose.yml
```

Paste this content:

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: ai-gateway-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-aigateway}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-aigateway}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - ai-gateway-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aigateway"]
      interval: 10s
      timeout: 5s
      retries: 5

  ai-gateway:
    image: YOUR_DOCKERHUB_USERNAME/ai-gateway:latest
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
    external: true

volumes:
  postgres_data:
```

**Save and exit:** `Ctrl+X`, `Y`, `Enter`

**Deploy:**
```bash
# Pull and start containers
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Option B: Using Docker Run Commands

```bash
# Start PostgreSQL
docker run -d \
  --name ai-gateway-postgres \
  --restart unless-stopped \
  --network ai-gateway-network \
  -e POSTGRES_USER=aigateway \
  -e POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD \
  -e POSTGRES_DB=aigateway \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine

# Wait for PostgreSQL to start
sleep 10

# Start AI Gateway
docker run -d \
  --name ai-gateway \
  --restart unless-stopped \
  --network ai-gateway-network \
  -p 4180:4180 \
  --env-file ~/ai-gateway/.env \
  YOUR_DOCKERHUB_USERNAME/ai-gateway:latest
```

## Step 7: Verify Deployment

```bash
# Check containers are running
docker ps

# Check logs
docker logs -f ai-gateway

# Test health endpoint (from another terminal or after Ctrl+C)
curl http://localhost:4180/health
```

**Expected response:**
```json
{"success":true,"data":{"ok":true,"service":"memento-ai-gateway"}}
```

## Step 8: Test from Your Local Machine

```bash
# From your Windows machine (replace with your EC2 IP)
curl http://YOUR_EC2_PUBLIC_IP:4180/health
```

Or open in browser: `http://YOUR_EC2_PUBLIC_IP:4180/health`

## Step 9: Setup GitHub Actions for Auto-Deploy (Optional)

### Add GitHub Secrets

Go to: `GitHub Repo → Settings → Secrets and variables → Actions → New repository secret`

Add these secrets:

1. **DOCKER_USERNAME** - Your Docker Hub username
2. **DOCKER_PASSWORD** - Your Docker Hub password/token
3. **EC2_SSH_PRIVATE_KEY** - Content of your .pem file
4. **EC2_HOST** - Your EC2 public IP
5. **EC2_USER** - `ec2-user` or `ubuntu`
6. **AWS_ACCESS_KEY_ID** - (optional) Your AWS access key
7. **AWS_SECRET_ACCESS_KEY** - (optional) Your AWS secret key

### Enable Auto-Deploy

Now when you push to `main` branch:
1. GitHub Actions builds Docker image
2. Pushes to Docker Hub
3. SSHs to EC2
4. Pulls latest image
5. Restarts container

## Common Commands

### View Logs
```bash
docker logs -f ai-gateway
docker logs --tail 100 ai-gateway
```

### Restart Service
```bash
docker restart ai-gateway
# OR
docker-compose restart
```

### Stop Service
```bash
docker stop ai-gateway
# OR
docker-compose down
```

### Update to Latest Version
```bash
# Pull latest image
docker pull YOUR_DOCKERHUB_USERNAME/ai-gateway:latest

# Restart with new image
docker-compose up -d --force-recreate ai-gateway
# OR
docker stop ai-gateway && docker rm ai-gateway
docker run -d --name ai-gateway --env-file .env -p 4180:4180 --network ai-gateway-network YOUR_DOCKERHUB_USERNAME/ai-gateway:latest
```

### Database Backup
```bash
docker exec ai-gateway-postgres pg_dump -U aigateway aigateway > backup-$(date +%Y%m%d).sql
```

### Check Resource Usage
```bash
docker stats
free -h
df -h
```

## Troubleshooting

### Container won't start
```bash
docker logs ai-gateway
docker inspect ai-gateway
```

### Database connection error
```bash
# Check if postgres is running
docker ps | grep postgres

# Test connection
docker exec -it ai-gateway-postgres psql -U aigateway -d aigateway
```

### Port 4180 not accessible
```bash
# Check if container is listening
docker ps
netstat -tlnp | grep 4180

# Check EC2 Security Group - ensure port 4180 is open to 0.0.0.0/0
```

### Can't SSH to EC2
- Check .pem file permissions
- Verify Security Group allows SSH (port 22) from your IP
- Ensure you're using correct username (ec2-user vs ubuntu)

## Next Steps

### 1. Setup Nginx Reverse Proxy (Recommended)
```bash
sudo yum install -y nginx  # Amazon Linux
sudo systemctl start nginx
sudo systemctl enable nginx

# Copy nginx config (see nginx.conf in repo)
sudo nano /etc/nginx/conf.d/ai-gateway.conf
```

### 2. Setup SSL with Let's Encrypt
```bash
sudo yum install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 3. Monitor with CloudWatch
- Enable CloudWatch logs
- Set up alarms for high CPU/memory
- Monitor request rates

## Security Checklist

- [ ] Changed default PostgreSQL password
- [ ] Generated unique JWT secrets
- [ ] Restricted Security Group rules
- [ ] Setup HTTPS/SSL
- [ ] .env file contains no sensitive data in repo
- [ ] Regular backups configured
- [ ] CloudWatch monitoring enabled

---

**Your AI Gateway is now deployed! 🎉**

Access it at: `http://YOUR_EC2_PUBLIC_IP:4180`

# AI Gateway Deployment - Quick Start

## 🚀 Quick Deployment Checklist

### 1. Build Docker Image Locally (Optional)

```bash
# From the project root
docker build -t yourusername/ai-gateway:latest -f ai-gateway/Dockerfile .

# Test locally
docker run -p 4180:4180 --env-file ai-gateway/.env yourusername/ai-gateway:latest
```

### 2. Push to Docker Hub

```bash
# Login to Docker Hub
docker login

# Tag and push
docker tag yourusername/ai-gateway:latest yourusername/ai-gateway:v1.0.0
docker push yourusername/ai-gateway:latest
docker push yourusername/ai-gateway:v1.0.0
```

### 3. Configure GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets → Actions):

**Required:**
- `DOCKER_USERNAME` - Your Docker Hub username
- `DOCKER_PASSWORD` - Your Docker Hub access token

**For EC2 Deployment:**
- `EC2_SSH_PRIVATE_KEY` - Your EC2 private key content
- `EC2_HOST` - EC2 public IP or domain
- `EC2_USER` - SSH user (ec2-user or ubuntu)

**For AWS:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

### 4. EC2 Server Setup

```bash
# Connect to EC2
ssh -i your-key.pem ec2-user@your-ec2-ip

# Install Docker
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Create app directory
mkdir -p ~/ai-gateway
cd ~/ai-gateway

# Create .env file (see DEPLOYMENT.md for full template)
nano .env

# Create Docker network
docker network create ai-gateway-network

# Start PostgreSQL
docker run -d \
  --name postgres \
  --network ai-gateway-network \
  -e POSTGRES_USER=aigateway \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=aigateway \
  -v ~/ai-gateway/postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine
```

### 5. Deploy

**Option A: GitHub Actions (Recommended)**
- Push to `main` branch
- Workflow automatically builds and deploys

**Option B: Manual Deploy Script**
```bash
# On EC2
cd ~/ai-gateway
wget https://raw.githubusercontent.com/yourorg/yourrepo/main/ai-gateway/deploy.sh
chmod +x deploy.sh
./deploy.sh deploy
```

**Option C: Docker Compose**
```bash
# On EC2
cd ~/ai-gateway
docker-compose -f docker-compose.production.yml up -d
```

### 6. Verify Deployment

```bash
# Check health
curl http://localhost:4180/health

# View logs
docker logs -f ai-gateway

# Test chat endpoint
curl -X POST http://localhost:4180/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "user_id": "test-user"
  }'
```

## 📋 Environment Variables Reference

### Required
```env
# Provider API Key
OPENROUTER_API_KEY=sk-...

# JWT Secrets
JWT_ACCESS_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-secret-here

# Database
POSTGRES_PASSWORD=your-password
```

### Optional
```env
# Models
AI_GATEWAY_DEFAULT_MODEL=openai/gpt-4o-mini

# Rate Limits
AI_GATEWAY_FREE_RPM=20
AI_GATEWAY_PRO_RPM=120

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Search
TAVILY_API_KEY=...
```

## 🔧 Common Commands

```bash
# View logs
docker logs -f ai-gateway

# Restart service
docker restart ai-gateway

# Update to latest
docker pull yourusername/ai-gateway:latest
docker stop ai-gateway && docker rm ai-gateway
docker run -d --name ai-gateway --env-file .env -p 4180:4180 yourusername/ai-gateway:latest

# Backup database
docker exec postgres pg_dump -U aigateway aigateway > backup.sql

# Check resource usage
docker stats ai-gateway
```

## 📚 Full Documentation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide including:
- Nginx reverse proxy setup
- SSL/TLS configuration
- Production best practices
- Monitoring and troubleshooting
- Security hardening

## 🆘 Troubleshooting

**Container won't start:**
```bash
docker logs ai-gateway
docker inspect ai-gateway
```

**Database connection issues:**
```bash
docker exec -it postgres psql -U aigateway
docker network inspect ai-gateway-network
```

**Port already in use:**
```bash
sudo netstat -tlnp | grep 4180
```

## 🔒 Security Checklist

- [ ] Change default database password
- [ ] Generate strong JWT secrets
- [ ] Restrict EC2 security group rules
- [ ] Enable HTTPS with SSL certificate
- [ ] Keep .env file secure (never commit)
- [ ] Use AWS Secrets Manager for production
- [ ] Enable CloudWatch logging
- [ ] Set up backup automation

## 📞 Support

For issues:
1. Check application logs
2. Review [DEPLOYMENT.md](./DEPLOYMENT.md)
3. Check GitHub Actions workflow logs
4. Review AWS CloudWatch (if configured)

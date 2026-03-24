# AI Gateway

A production-ready AI gateway service that provides rate limiting, usage tracking, and multi-provider LLM routing.

## Features

- 🔄 **Multi-Provider Support** - OpenRouter, OpenAI, Anthropic, Gemini
- 🚦 **Rate Limiting** - Free and premium tier rate limiting
- 📊 **Usage Tracking** - Track token usage and costs
- 🔐 **Authentication** - JWT-based auth with Google OAuth support
- 🔍 **Web Search** - Integrated Tavily search API
- 💾 **Database** - PostgreSQL with automatic migrations
- 🎯 **Role-Based Routing** - Different models for different agent roles
- ⚡️ **Streaming Support** - Server-sent events for streaming responses

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Setup PostgreSQL (using Docker)
docker-compose up -d postgres

# Copy environment file
cp .env.example .env
# Edit .env with your API keys

# Run development server
npm run dev

# Server starts at http://localhost:4180
```

### Production Deployment

See the deployment guides:

- **[Quick Start Guide](./DEPLOY_QUICKSTART.md)** - Get up and running quickly
- **[Full Deployment Guide](./DEPLOYMENT.md)** - Comprehensive EC2 deployment documentation

## Docker Deployment

### Build Image

```bash
# From project root
docker build -t yourusername/ai-gateway:latest -f ai-gateway/Dockerfile .
```

### Run with Docker

```bash
docker run -d \
  --name ai-gateway \
  -p 4180:4180 \
  --env-file .env \
  yourusername/ai-gateway:latest
```

### Run with Docker Compose

```bash
docker-compose -f docker-compose.production.yml up -d
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Chat Completion
```bash
POST /v1/chat
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "Hello, how are you?"}
  ],
  "user_id": "user-123",
  "role": "final",
  "temperature": 0.7,
  "max_tokens": 1000
}
```

### Streaming Chat
```bash
POST /v1/chat/stream
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "Tell me a story"}
  ],
  "user_id": "user-123"
}
```

### Web Search
```bash
POST /v1/search
Content-Type: application/json

{
  "query": "latest AI news",
  "limit": 5
}
```

## Environment Variables

### Required

```env
# Provider API Key
OPENROUTER_API_KEY=sk-or-v1-...

# JWT Secrets (generate with: openssl rand -base64 32)
JWT_ACCESS_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-secret-here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### Optional

```env
# Server
AI_GATEWAY_HOST=0.0.0.0
AI_GATEWAY_PORT=4180
NODE_ENV=production

# Models
AI_GATEWAY_DEFAULT_MODEL=openai/gpt-4o-mini
AI_GATEWAY_DEFAULT_TEMPERATURE=0

# Rate Limits
AI_GATEWAY_FREE_RPM=20
AI_GATEWAY_FREE_DAILY_TOKENS=40000
AI_GATEWAY_PRO_RPM=120
AI_GATEWAY_PRO_DAILY_TOKENS=300000

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Web Search
TAVILY_API_KEY=tvly-xxx
```

## Project Structure

```
ai-gateway/
├── src/
│   ├── server.ts           # Main server entry point
│   ├── config.ts           # Configuration loader
│   ├── modelRouter.ts      # LLM routing logic
│   ├── rateLimiter.ts      # Rate limiting
│   ├── usageTracker.ts     # Usage tracking
│   ├── controllers/        # Route controllers
│   ├── db/                 # Database schema & migrations
│   ├── middlewares/        # Express middlewares
│   ├── providers/          # LLM provider adapters
│   ├── routes/             # API routes
│   ├── types/              # TypeScript types
│   └── utils/              # Utility functions
├── migrations/             # SQL migration files
├── Dockerfile             # Production Docker image
├── docker-compose.yml     # Local development setup
├── docker-compose.production.yml  # Production setup
├── deploy.sh              # Deployment automation script
├── nginx.conf             # Nginx reverse proxy config
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Type checking
npm run typecheck

# Run development server with auto-reload
npm run dev

# Run production build
npm start
```

## Deployment Options

### 1. GitHub Actions (Recommended)

Push to `main` branch to automatically:
- Build Docker image
- Push to Docker Hub/ECR
- Deploy to EC2 instance

See [.github/workflows/ai-gateway-deploy.yml](../.github/workflows/ai-gateway-deploy.yml)

### 2. Manual EC2 Deployment

Use the deployment script:

```bash
# On your EC2 instance
./deploy.sh deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full setup instructions.

### 3. Docker Compose

```bash
docker-compose -f docker-compose.production.yml up -d
```

## Authentication

The gateway supports two authentication methods:

1. **Device-based** - Anonymous users identified by device ID
2. **User-based** - Authenticated users with Google OAuth

### Example Request with Auth

```bash
curl -X POST http://localhost:4180/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "user_id": "user-123"
  }'
```

## Rate Limiting

- **Free Tier**: 20 requests/minute, 40k tokens/day
- **Premium Tier**: 120 requests/minute, 300k tokens/day

Rate limits are enforced per device ID or user ID.

## Monitoring

### View Logs

```bash
# Docker logs
docker logs -f ai-gateway

# Application logs (structured JSON with Pino)
# Logs include: request/response, token usage, rate limits, errors
```

### Health Check

```bash
curl http://localhost:4180/health
```

Response:
```json
{
  "success": true,
  "data": {
    "ok": true,
    "service": "memento-ai-gateway"
  }
}
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs ai-gateway

# Inspect container
docker inspect ai-gateway
```

### Database connection errors

```bash
# Test database connection
docker exec -it postgres psql -U aigateway -d aigateway

# Check if database is running
docker ps | grep postgres
```

### Port already in use

```bash
# Find process using port 4180
sudo netstat -tlnp | grep 4180

# Kill the process
sudo kill -9 <PID>
```

## Security

- Always use HTTPS in production
- Keep JWT secrets secure and rotate regularly
- Use environment variables for sensitive data
- Restrict EC2 security group rules
- Enable CloudWatch logging
- Use AWS Secrets Manager for production secrets

## License

See [LICENSE](../LICENSE) file for details.

## Support

For deployment issues, see:
- [Deployment Quick Start](./DEPLOY_QUICKSTART.md)
- [Full Deployment Guide](./DEPLOYMENT.md)

For development issues:
- Check application logs
- Review TypeScript errors
- Ensure all environment variables are set

---

**Ready to deploy?** Start with the [Quick Start Guide](./DEPLOY_QUICKSTART.md)

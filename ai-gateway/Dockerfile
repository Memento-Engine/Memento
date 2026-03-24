# Production Dockerfile for AI Gateway
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY ai-gateway/package*.json ./ai-gateway/
COPY shared/package*.json ./shared/

# Install dependencies
WORKDIR /app/ai-gateway
RUN npm ci --only=production && npm cache clean --force

# Install shared dependencies if they exist
WORKDIR /app/shared
RUN if [ -f package.json ]; then npm ci --only=production && npm cache clean --force; fi

# Production image
FROM base AS runner
WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 aigateway

# Copy dependencies
COPY --from=deps --chown=aigateway:nodejs /app/ai-gateway/node_modules ./ai-gateway/node_modules
COPY --from=deps --chown=aigateway:nodejs /app/shared ./shared

# Copy source code
COPY --chown=aigateway:nodejs ai-gateway ./ai-gateway
COPY --chown=aigateway:nodejs shared ./shared

WORKDIR /app/ai-gateway

USER aigateway

# Expose the port
EXPOSE 4180

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4180/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]

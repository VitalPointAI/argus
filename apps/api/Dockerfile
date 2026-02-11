# Argus API Dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/db/package*.json ./packages/db/

# Install dependencies
RUN npm ci --workspace=@argus/api --include-workspace-root

# Development image
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
WORKDIR /app/apps/api
CMD ["npx", "tsx", "watch", "src/index.ts"]

# Production build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/api
RUN npm run build || true

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 argus
USER argus

COPY --from=builder --chown=argus:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=argus:nodejs /app/apps/api ./apps/api
COPY --from=builder --chown=argus:nodejs /app/packages ./packages

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]

# Argus Content Gate - Shade Agent
# Optimized for Phala Cloud TEE deployment

FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY dist ./dist

# Environment
ENV NODE_ENV=production
ENV API_PORT=3140
ENV NFT_CONTRACT=source-lists.argus-intel.near
ENV NEAR_RPC=https://rpc.mainnet.fastnear.com

# Expose port
EXPOSE 3140

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3140/health || exit 1

# Start
CMD ["node", "dist/server.js"]

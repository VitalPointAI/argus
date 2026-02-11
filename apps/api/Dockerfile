# Argus API Dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy all package files (root + workspace)
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install ALL dependencies including phantom-auth
RUN npm install

# Copy source code
COPY apps/api ./apps/api

# Install phantom-auth explicitly in case it's missing
RUN npm install @vitalpoint/near-phantom-auth@latest

WORKDIR /app/apps/api

ENV NODE_ENV=production

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]

# Argus API Dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy all package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install dependencies
RUN npm install

# Force install latest phantom-auth (clear cache first)
RUN npm cache clean --force && npm install @vitalpoint/near-phantom-auth@0.2.4

# Copy source code
COPY apps/api ./apps/api

WORKDIR /app/apps/api

ENV NODE_ENV=production

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]

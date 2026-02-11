# Argus API Dockerfile - Simple production build with tsx
FROM node:22-alpine

WORKDIR /app

# Copy root package files and install all deps
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install all dependencies (including tsx for runtime)
RUN npm install --include=dev

# Copy source code
COPY apps/api ./apps/api

WORKDIR /app/apps/api

ENV NODE_ENV=production

EXPOSE 3001

# Run with tsx (TypeScript execution)
CMD ["npx", "tsx", "src/index.ts"]

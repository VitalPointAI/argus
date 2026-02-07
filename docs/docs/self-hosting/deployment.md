---
sidebar_position: 1
---

# Deployment

Deploy Argus to your own infrastructure.

## Quick Deploy

### Hetzner Cloud (Recommended)

Argus runs well on a Hetzner CPX22 (~$7/month):

```bash
# SSH to your server
ssh root@your-server-ip

# Clone and setup
git clone https://github.com/VitalPointAI/argus.git
cd argus
cp .env.example .env
# Edit .env with your settings

# Install dependencies
npm install

# Build
npm run build

# Setup PM2
npm install -g pm2
pm2 start npm --name argus -- start
pm2 save
pm2 startup
```

### Docker

```bash
# Clone repo
git clone https://github.com/VitalPointAI/argus.git
cd argus

# Configure
cp .env.example .env

# Run with Docker Compose
docker-compose up -d
```

## Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name argus.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Add SSL with Certbot:

```bash
certbot --nginx -d argus.yourdomain.com
```

## PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs argus

# Restart
pm2 restart argus

# Stop
pm2 stop argus
```

## GitHub Actions Deploy

Example workflow:

```yaml
name: Deploy Argus

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HOST }}
          username: root
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /root/argus
            git pull
            npm install
            npm run build
            pm2 restart argus
```

## Health Checks

Add monitoring:

```bash
# Check if running
curl http://localhost:3000/api/health

# Expected response
{"status": "ok", "uptime": 12345}
```

## Backups

Backup your PostgreSQL database:

```bash
# Daily backup cron
0 2 * * * pg_dump argus > /backups/argus-$(date +\%Y\%m\%d).sql
```

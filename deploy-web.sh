#!/bin/bash
set -e

SERVER="root@157.90.122.69"
SSH_KEY=~/.ssh/hetzner_argus
REMOTE_DIR="/opt/argus/web"

echo "📦 Preparing deployment..."

# Create remote directory
ssh -i $SSH_KEY $SERVER "mkdir -p $REMOTE_DIR"

# Sync the web app (excluding .git, node_modules)
echo "📤 Uploading web app..."
rsync -avz --delete \
  -e "ssh -i $SSH_KEY" \
  --exclude='.git' \
  --exclude='node_modules' \
  /home/agent/openclaw/projects/strategic-scanner/apps/web/ \
  $SERVER:$REMOTE_DIR/

echo "📥 Installing dependencies on server..."
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && npm install --omit=dev"

# Set up environment
echo "🔧 Setting up environment..."
ssh -i $SSH_KEY $SERVER "cat > $REMOTE_DIR/.env.local << 'ENVEOF'
NEXT_PUBLIC_API_URL=https://argus.vitalpoint.ai
ENVEOF"

echo "🚀 Starting web server..."
ssh -i $SSH_KEY $SERVER "cd $REMOTE_DIR && pm2 delete argus-web 2>/dev/null || true && pm2 start npm --name argus-web -- start -- -p 3002"
ssh -i $SSH_KEY $SERVER "pm2 save"

echo "✅ Deployment complete!"
echo "🌐 Dashboard will be at https://argus.vitalpoint.ai (after nginx config)"

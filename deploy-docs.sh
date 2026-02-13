#!/bin/bash
set -e

REMOTE_USER="deploy"
REMOTE_HOST="157.90.122.69"
REMOTE_PATH="/var/www/argus-docs"
SSH_KEY="$HOME/.ssh/hetzner_argus"

echo "📚 Building Argus docs..."
cd docs
npm run build

echo "📤 Deploying to $REMOTE_HOST..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_PATH"
rsync -avz --delete -e "ssh -i $SSH_KEY" build/ "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

echo "✅ Docs deployed to https://docs.argus.vitalpoint.ai"

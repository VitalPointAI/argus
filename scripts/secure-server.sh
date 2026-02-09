#!/bin/bash
# Argus Server Security Hardening
# Run this as root on the production server

set -e

echo "🔒 Securing Argus server..."

# 1. Create dedicated deploy user (no sudo, limited access)
echo "Creating deploy user..."
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash deploy
    echo "Created user: deploy"
else
    echo "User deploy already exists"
fi

# 2. Set up deploy user's SSH key (you'll add the public key)
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# 3. Give deploy user ownership of code directory (not .env!)
echo "Setting code directory permissions..."
chown -R deploy:deploy /opt/argus
chown root:root /opt/argus/.env  # Secrets stay root-owned
chmod 600 /opt/argus/.env         # Only root can read

# 4. Create a sudoers entry for PM2 only (no other sudo access)
echo "Configuring limited sudo for PM2..."
cat > /etc/sudoers.d/deploy-pm2 << 'EOF'
# Allow deploy user to restart PM2 services only
deploy ALL=(root) NOPASSWD: /usr/bin/pm2 restart argus-api
deploy ALL=(root) NOPASSWD: /usr/bin/pm2 restart argus-web
deploy ALL=(root) NOPASSWD: /usr/bin/pm2 status
EOF
chmod 440 /etc/sudoers.d/deploy-pm2

# 5. Configure PM2 to load env from root-owned file
echo "Configuring PM2 ecosystem..."
cat > /opt/argus/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'argus-api',
      cwd: '/opt/argus/apps/api',
      script: 'npx',
      args: 'tsx src/index.ts',
      env_file: '/opt/argus/.env',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'argus-web',
      cwd: '/opt/argus/apps/web',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
};
EOF
chown root:root /opt/argus/ecosystem.config.js

# 6. Remove any existing .env from git tracking
cd /opt/argus
git update-index --assume-unchanged .env 2>/dev/null || true

# 7. Set up log directory with proper permissions
mkdir -p /var/log/argus
chown deploy:deploy /var/log/argus

echo ""
echo "✅ Server secured!"
echo ""
echo "Next steps for Aaron:"
echo "1. Generate a NEW SSH key pair for GitHub Actions (not shared with Jim)"
echo "   ssh-keygen -t ed25519 -C 'github-actions-deploy' -f ~/.ssh/github_deploy"
echo ""
echo "2. Add the PUBLIC key to /home/deploy/.ssh/authorized_keys"
echo "   cat ~/.ssh/github_deploy.pub >> /home/deploy/.ssh/authorized_keys"
echo ""
echo "3. Add these secrets to GitHub repo settings:"
echo "   - SERVER_HOST: 157.90.122.69"
echo "   - SERVER_USER: deploy"
echo "   - SERVER_SSH_KEY: (contents of ~/.ssh/github_deploy)"
echo ""
echo "4. Revoke Jim's SSH key by removing it from /root/.ssh/authorized_keys"
echo ""
echo "5. Test deployment by pushing to main branch"

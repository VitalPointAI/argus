# Argus Security Model

## Threat Model

Jim (the AI agent) has access to:
- This codebase (read/write)
- OpenClaw sandbox environment
- Previously: SSH root access to production server

### Risks we're mitigating:
1. **Prompt injection** - Malicious content in ingested articles could trick Jim
2. **Social engineering** - Someone could manipulate Jim into revealing secrets
3. **Accidental exposure** - Jim might log or remember secrets

## Security Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│    Jim      │────▶│   GitHub     │────▶│  Production     │
│  (Sandbox)  │push │   Actions    │ SSH │    Server       │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │                      │
                     Uses secrets:          Has secrets:
                     - SSH key (deploy)     - .env (root only)
                     - Server host          - API keys
                                           - DB passwords
```

**Jim can:**
- Push code to GitHub
- Trigger deployments (via git push)
- Read deployment logs (sanitized)

**Jim cannot:**
- SSH directly to server
- Read .env file
- Access API keys, DB passwords, wallet keys

## Implementation

### 1. Server Security (`scripts/secure-server.sh`)

Run as root on production:
```bash
curl -sL https://raw.githubusercontent.com/VitalPointAI/argus/main/scripts/secure-server.sh | bash
```

This script:
- Creates `deploy` user with limited permissions
- Locks `.env` to root-only (chmod 600)
- Configures PM2 to load secrets from root-owned file
- Sets up limited sudo for PM2 restarts only

### 2. GitHub Actions (`.github/workflows/deploy.yml`)

Automated deployment on push to main:
1. Checks out code
2. SSHs to server as `deploy` user
3. Pulls latest code
4. Restarts services

### 3. Required GitHub Secrets

Add these in repo Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | `157.90.122.69` |
| `SERVER_USER` | `deploy` |
| `SERVER_SSH_KEY` | Contents of new deploy SSH key |

### 4. SSH Key Rotation

**Create new key for GitHub Actions:**
```bash
ssh-keygen -t ed25519 -C 'github-deploy' -f ~/.ssh/github_deploy -N ''
```

**Add to deploy user:**
```bash
cat ~/.ssh/github_deploy.pub >> /home/deploy/.ssh/authorized_keys
```

**Revoke Jim's key:**
```bash
# On server, edit /root/.ssh/authorized_keys
# Remove the key that was shared with Jim
```

## Secrets Management

### Production secrets (in `/opt/argus/.env`):
```
DATABASE_URL=postgres://...
NEARAI_API_KEY=sk-...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
TELEGRAM_BOT_TOKEN=...
XTTS_API_KEY=...
```

These are:
- Owned by root
- chmod 600 (only root can read)
- Loaded by PM2 at runtime
- Never committed to git
- Never visible to Jim

### Development/local secrets:
- Use `.env.example` with dummy values
- Real values only on production server

## Verification

After setup, verify:

```bash
# As deploy user, should fail:
su - deploy -c "cat /opt/argus/.env"
# Permission denied

# As deploy user, should work:
su - deploy -c "sudo pm2 restart argus-api"
# OK

# Jim's SSH key should not work:
ssh -i old_jim_key root@server
# Permission denied
```

## Emergency Procedures

### If secrets are compromised:
1. Rotate all API keys immediately
2. Change database password
3. Regenerate Telegram bot token
4. Check logs for unauthorized access
5. Revoke and regenerate SSH keys

### Contact
- Aaron: @VitalPointAI (Telegram)

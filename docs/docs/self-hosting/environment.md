---
sidebar_position: 3
---

# Environment Variables

Complete reference for all configuration options.

## Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/argus` |

## AI / LLM

| Variable | Description | Default |
|----------|-------------|---------|
| `NEAR_AI_API_KEY` | Near AI API key for briefings | - |
| `NEAR_AI_MODEL` | Model for briefing generation | `deepseek-ai/DeepSeek-V3.1` |
| `NEAR_AI_MAX_TOKENS` | Max tokens for responses | `4096` |

## Telegram

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather | - |
| `TELEGRAM_CHAT_ID` | Target chat for delivery | - |
| `TELEGRAM_CHAT_IDS` | Multiple chats (comma-separated) | - |

## Server

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging verbosity | `info` |

## Ingestion

| Variable | Description | Default |
|----------|-------------|---------|
| `INGEST_INTERVAL_MINUTES` | How often to fetch sources | `30` |
| `INGEST_TIMEOUT_MS` | Feed fetch timeout | `30000` |
| `INGEST_MAX_ARTICLES` | Max articles per source per run | `50` |

## Briefings

| Variable | Description | Default |
|----------|-------------|---------|
| `BRIEFING_SCHEDULE` | Cron for auto-generation | `0 10,23 * * *` |
| `BRIEFING_DEFAULT_HOURS` | Default time window | `24` |
| `BRIEFING_MIN_CONFIDENCE` | Minimum article confidence | `0.7` |
| `BRIEFING_DELIVERY_CHANNEL` | Auto-delivery channel | - |

## Verification

| Variable | Description | Default |
|----------|-------------|---------|
| `VERIFY_ENABLED` | Enable AI verification | `true` |
| `VERIFY_MIN_SOURCES` | Sources needed for high confidence | `2` |

## Webhooks

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBHOOK_URL` | URL for event notifications | - |
| `WEBHOOK_SECRET` | Shared secret for signatures | - |
| `WEBHOOK_EVENTS` | Events to send (comma-separated) | `briefing.generated` |

## Example .env

```bash
# Database
DATABASE_URL=postgresql://argus:password@localhost:5432/argus

# Near AI
NEAR_AI_API_KEY=sk_live_xxxxx
NEAR_AI_MODEL=deepseek-ai/DeepSeek-V3.1

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHAT_ID=666796372

# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Scheduling
INGEST_INTERVAL_MINUTES=30
BRIEFING_SCHEDULE="0 10,23 * * *"
BRIEFING_DELIVERY_CHANNEL=telegram
```

## Security Notes

- Never commit `.env` to version control
- Use secrets management in production
- Rotate API keys periodically
- Use strong database passwords

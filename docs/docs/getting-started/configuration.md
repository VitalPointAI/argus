---
sidebar_position: 2
---

# Configuration

Configure Argus through environment variables.

## Environment Variables

Create a `.env` file in the project root:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/argus

# Near AI (for briefings)
NEAR_AI_API_KEY=your_near_ai_key
NEAR_AI_MODEL=nearai/deepseek-ai/DeepSeek-V3.1

# Telegram Delivery (optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Server
PORT=3000
NODE_ENV=production
```

## Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |

## Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEAR_AI_API_KEY` | API key for briefing generation | - |
| `NEAR_AI_MODEL` | LLM model for briefings | `deepseek-ai/DeepSeek-V3.1` |
| `TELEGRAM_BOT_TOKEN` | Bot token for delivery | - |
| `TELEGRAM_CHAT_ID` | Chat ID for delivery | - |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |

## Near AI Setup

1. Create an account at [near.ai](https://near.ai)
2. Generate an API key in settings
3. Add to your `.env` file

## Telegram Setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Get your chat ID by messaging the bot and checking `/getUpdates`
3. Add both values to your `.env` file

Briefings will be delivered automatically at configured times.

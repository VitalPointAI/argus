---
sidebar_position: 1
---

# Telegram Integration

Receive briefings directly in Telegram.

## Setup

### 1. Create a Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name (e.g., "Argus Briefings")
4. Choose a username (e.g., "argus_briefings_bot")
5. Copy the bot token

### 2. Get Your Chat ID

1. Message your new bot
2. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Find the `chat.id` in the response

### 3. Configure Argus

Add to your `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=666796372
```

### 4. Test Delivery

```bash
curl -X POST http://localhost:3000/api/briefings/latest/deliver \
  -d '{"channels": ["telegram"]}'
```

## Scheduled Delivery

Configure automatic briefings:

```bash
# Deliver at 5am and 6pm EST
BRIEFING_DELIVERY_SCHEDULE="0 10,23 * * *"  # UTC times
BRIEFING_DELIVERY_CHANNEL=telegram
```

## Message Format

Briefings are formatted for Telegram readability:

```
📊 Strategic Intelligence Briefing
━━━━━━━━━━━━━━━━━━━━━━━━
📅 Feb 7, 2026 | 42 articles

🔥 Priority Developments

1️⃣ Major Trade Agreement Announced
Reuters reports significant changes...
✅ Confidence: 94%

2️⃣ Technology Sector Disruption
Multiple sources confirm breakthrough...
✅ Confidence: 87%

📈 By Domain
• Geopolitics: 12 articles
• Economics: 8 articles  
• Technology: 15 articles
```

## Group Delivery

To send to a group:

1. Add the bot to your group
2. Make it an admin (for posting)
3. Get the group chat ID (negative number)
4. Update `TELEGRAM_CHAT_ID`

## Multiple Channels

Send to multiple chats:

```bash
TELEGRAM_CHAT_IDS=666796372,-1001234567890
```

## Troubleshooting

**Bot not responding?**
- Check bot token is correct
- Ensure bot has been messaged at least once

**Messages not sending?**
- Verify chat ID format
- Check Argus logs for errors

**Rate limited?**
- Telegram limits: 30 messages/second to different chats
- Argus batches automatically

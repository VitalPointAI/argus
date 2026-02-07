---
sidebar_position: 3
---

# Your First Briefing

Generate your first intelligence briefing in minutes.

## 1. Add Sources

Navigate to **Sources → Manage Sources** and add RSS feeds:

```
https://feeds.reuters.com/reuters/topNews
https://rss.nytimes.com/services/xml/rss/nyt/World.xml
https://feeds.bbci.co.uk/news/world/rss.xml
```

Or use the **Add Multiple** feature to import feeds in bulk.

## 2. Run Ingestion

Trigger article ingestion manually:

```bash
npm run ingest
```

Or wait for the scheduled cron job (runs every 30 minutes by default).

## 3. Generate a Briefing

From the dashboard, click **Generate Briefing** or use the API:

```bash
curl -X POST http://localhost:3000/api/briefings/generate \
  -H "Content-Type: application/json" \
  -d '{"hours": 24}'
```

## 4. View Results

Your briefing appears in the dashboard under **Briefings**.

Example output:

```markdown
## Strategic Intelligence Briefing
**Period:** Last 24 hours | **Sources:** 12 | **Articles:** 47

### 🔥 Top Developments

1. **Major Policy Shift in Trade Relations**
   Reuters reports significant changes to tariff structures...
   [Confidence: 94%]

2. **Technology Sector Disruption**
   Multiple sources confirm breakthrough in...
   [Confidence: 87%]

### 📊 By Domain
- Geopolitics: 12 articles
- Economics: 8 articles
- Technology: 15 articles
```

## 5. Set Up Delivery

Configure automatic delivery in the dashboard under **Settings → Delivery**:

- **Morning briefing:** 5:00 AM EST
- **Evening briefing:** 6:00 PM EST

Briefings will be sent to your configured Telegram chat.

---
sidebar_position: 1
---

# Sources

Argus aggregates content from RSS feeds across multiple domains.

## Adding Sources

### Via Dashboard

1. Navigate to **Sources → Manage Sources**
2. Click **Add Source**
3. Enter the RSS feed URL
4. Select a domain category
5. Click **Save**

### Via API

```bash
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Reuters World",
    "url": "https://feeds.reuters.com/reuters/worldNews",
    "domain": "geopolitics"
  }'
```

### Bulk Import

Add multiple sources at once:

```bash
curl -X POST http://localhost:3000/api/sources/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "sources": [
      {"name": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml", "domain": "geopolitics"},
      {"name": "TechCrunch", "url": "https://techcrunch.com/feed/", "domain": "technology"}
    ]
  }'
```

## Domain Categories

Sources are organized by domain:

| Domain | Description |
|--------|-------------|
| `geopolitics` | International relations, diplomacy |
| `economics` | Markets, trade, finance |
| `technology` | Tech industry, innovation |
| `security` | Cybersecurity, defense |
| `energy` | Oil, gas, renewables |
| `health` | Public health, pharma |
| `environment` | Climate, sustainability |
| `science` | Research, discoveries |

## Source Health

Monitor source status in the dashboard:

- **✅ Active** - Fetching successfully
- **⚠️ Degraded** - Intermittent failures
- **❌ Failed** - Consistent errors

## Ingestion Schedule

By default, sources are checked every 30 minutes. Customize in settings:

```bash
# .env
INGEST_INTERVAL_MINUTES=15
```

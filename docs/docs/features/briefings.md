---
sidebar_position: 2
---

# Briefings

AI-generated intelligence summaries from your collected articles.

## How Briefings Work

1. **Collection** - Recent articles gathered from your sources
2. **Filtering** - Verified articles prioritized (confidence > 70%)
3. **Synthesis** - LLM analyzes and summarizes key developments
4. **Formatting** - Structured output with sources and confidence scores

## Generating Briefings

### Manual Generation

Click **Generate Briefing** in the dashboard, or:

```bash
curl -X POST http://localhost:3000/api/briefings/generate \
  -H "Content-Type: application/json" \
  -d '{"hours": 24}'
```

### Scheduled Generation

Configure automatic briefings:

```bash
# Generate briefing every day at 5am and 6pm
BRIEFING_SCHEDULE="0 5,18 * * *"
```

## Briefing Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `hours` | Time window to analyze | `24` |
| `domains` | Filter by domains | All |
| `minConfidence` | Minimum verification score | `0.7` |
| `maxArticles` | Cap on articles to include | `50` |

## Output Format

```markdown
## Strategic Intelligence Briefing
**Generated:** 2026-02-07 05:00 EST
**Period:** Last 24 hours
**Sources:** 15 feeds | **Articles:** 42 analyzed

### 🔥 Priority Developments

1. **[Title]**
   [Summary of key points]
   Sources: Reuters, AP, BBC
   Confidence: 94%

### 📊 Domain Summary
- Geopolitics: 12 articles, 3 high-priority
- Economics: 8 articles, 2 high-priority
- Technology: 15 articles, 4 high-priority

### 📈 Trends
- Increasing coverage of [topic]
- New developments in [area]
```

## Delivery

Briefings can be delivered via:

- **Dashboard** - View in web interface
- **Telegram** - Push to configured chat
- **API** - Fetch programmatically
- **Webhook** - POST to custom endpoint

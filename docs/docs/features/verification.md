---
sidebar_position: 3
---

# Verification

AI-powered fact-checking and confidence scoring for all articles.

## How Verification Works

Each ingested article is analyzed for:

1. **Source Credibility** - Historical accuracy of the source
2. **Cross-Reference** - Corroboration from other sources
3. **Claim Analysis** - Factual claims extracted and checked
4. **Recency** - Timeliness and freshness of information

## Confidence Scores

Articles receive a confidence score from 0-100%:

| Score | Label | Description |
|-------|-------|-------------|
| 90-100% | ✅ Verified | Multiple corroborating sources |
| 70-89% | 🟡 Likely | Single credible source, plausible |
| 50-69% | 🟠 Unverified | Limited corroboration |
| 0-49% | 🔴 Disputed | Contradicted or suspicious |

## Verification in Briefings

By default, briefings prioritize verified content:

```json
{
  "minConfidence": 0.7,
  "showUnverified": false
}
```

Override to include all content:

```bash
curl -X POST http://localhost:3000/api/briefings/generate \
  -d '{"minConfidence": 0, "showUnverified": true}'
```

## Manual Verification

Mark articles as verified/disputed in the dashboard:

1. Open article detail view
2. Click **Verification Status**
3. Select status and add notes

## Verification API

```bash
# Get verification status
curl http://localhost:3000/api/articles/123/verification

# Update verification
curl -X PUT http://localhost:3000/api/articles/123/verification \
  -d '{"status": "verified", "notes": "Confirmed via official source"}'
```

## Improving Accuracy

- Add more diverse sources for better cross-referencing
- Regularly review flagged articles
- Report false positives to improve the model

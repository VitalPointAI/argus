---
sidebar_position: 2
---

# Bastion Integration

Connect Argus to Bastion for agent-powered intelligence.

## What is Bastion?

Bastion is an AI agent orchestration platform. Argus integrates as an intelligence source for Bastion agents.

## API v1 Endpoints

Argus exposes a simplified API for Bastion consumption:

### Get Latest Briefing

```http
GET /api/v1/briefing/latest
```

**Response:**

```json
{
  "briefing": "## Strategic Intelligence Briefing\n\n...",
  "generatedAt": "2026-02-07T05:00:00Z",
  "stats": {
    "sources": 15,
    "articles": 42
  }
}
```

### Search Intelligence

```http
GET /api/v1/search?q=trade+policy
```

**Response:**

```json
{
  "results": [
    {
      "title": "...",
      "summary": "...",
      "url": "...",
      "confidence": 0.94
    }
  ]
}
```

### Get Domain Summary

```http
GET /api/v1/domains/:domain/summary
```

**Response:**

```json
{
  "domain": "geopolitics",
  "summary": "Key developments in the past 24 hours...",
  "articleCount": 45,
  "topStories": [...]
}
```

## Bastion Configuration

Add Argus as an intelligence source in your Bastion config:

```yaml
sources:
  - name: argus
    type: rest
    baseUrl: https://argus.vitalpoint.ai/api/v1
    capabilities:
      - briefings
      - search
      - domain_summaries
```

## Agent Prompts

Example prompts for Bastion agents:

```
You have access to Argus, a strategic intelligence platform.
Use the argus_briefing tool to get the latest intelligence summary.
Use the argus_search tool to find specific topics.
```

## Webhook Integration

Configure Argus to push briefings to Bastion:

```bash
WEBHOOK_URL=https://bastion.example.com/webhook/argus
WEBHOOK_SECRET=your_shared_secret
```

Payload:

```json
{
  "event": "briefing.generated",
  "data": {
    "id": 57,
    "content": "...",
    "generatedAt": "..."
  },
  "signature": "sha256=..."
}
```

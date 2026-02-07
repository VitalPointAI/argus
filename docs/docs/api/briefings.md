---
sidebar_position: 4
---

# Briefings API

Generate and retrieve intelligence briefings.

## List Briefings

```http
GET /api/briefings
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `from` | string | Start date |
| `to` | string | End date |
| `limit` | number | Max results |

**Response:**

```json
{
  "data": [
    {
      "id": 56,
      "title": "Strategic Intelligence Briefing",
      "generatedAt": "2026-02-07T05:00:00Z",
      "period": {
        "from": "2026-02-06T05:00:00Z",
        "to": "2026-02-07T05:00:00Z"
      },
      "stats": {
        "sources": 15,
        "articles": 42,
        "verified": 38
      }
    }
  ]
}
```

## Get Briefing

```http
GET /api/briefings/:id
```

**Response:**

```json
{
  "data": {
    "id": 56,
    "title": "Strategic Intelligence Briefing",
    "content": "## Strategic Intelligence Briefing\n\n...",
    "generatedAt": "2026-02-07T05:00:00Z",
    "period": {
      "from": "2026-02-06T05:00:00Z",
      "to": "2026-02-07T05:00:00Z"
    },
    "stats": {
      "sources": 15,
      "articles": 42,
      "verified": 38
    },
    "articles": [1234, 1235, 1236]
  }
}
```

## Generate Briefing

```http
POST /api/briefings/generate
```

**Request Body:**

```json
{
  "hours": 24,
  "domains": ["geopolitics", "economics"],
  "minConfidence": 0.7,
  "maxArticles": 50,
  "sourceListId": 5
}
```

**Response:** `202 Accepted`

```json
{
  "data": {
    "id": 57,
    "status": "generating",
    "estimatedSeconds": 30
  }
}
```

Poll for completion:

```http
GET /api/briefings/57
```

## Deliver Briefing

Send a briefing to configured channels:

```http
POST /api/briefings/:id/deliver
```

**Request Body:**

```json
{
  "channels": ["telegram"]
}
```

**Response:**

```json
{
  "data": {
    "delivered": true,
    "channels": [
      {"channel": "telegram", "success": true}
    ]
  }
}
```

## Latest Briefing

Get the most recent briefing:

```http
GET /api/briefings/latest
```

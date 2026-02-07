---
sidebar_position: 2
---

# Sources API

Manage RSS feed sources.

## List Sources

```http
GET /api/sources
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `domain` | string | Filter by domain |
| `active` | boolean | Filter by active status |

**Response:**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Reuters World",
      "url": "https://feeds.reuters.com/reuters/worldNews",
      "domain": "geopolitics",
      "active": true,
      "lastFetch": "2026-02-07T10:30:00Z",
      "articleCount": 156,
      "createdAt": "2026-02-01T00:00:00Z"
    }
  ],
  "meta": {
    "total": 80
  }
}
```

## Get Source

```http
GET /api/sources/:id
```

## Create Source

```http
POST /api/sources
```

**Request Body:**

```json
{
  "name": "BBC World",
  "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
  "domain": "geopolitics"
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": 81,
    "name": "BBC World",
    "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
    "domain": "geopolitics",
    "active": true
  }
}
```

## Update Source

```http
PUT /api/sources/:id
```

**Request Body:**

```json
{
  "name": "BBC World News",
  "active": false
}
```

## Delete Source

```http
DELETE /api/sources/:id
```

**Response:** `204 No Content`

## Bulk Create

```http
POST /api/sources/bulk
```

**Request Body:**

```json
{
  "sources": [
    {"name": "Source 1", "url": "...", "domain": "technology"},
    {"name": "Source 2", "url": "...", "domain": "economics"}
  ]
}
```

## Source Stats

```http
GET /api/sources/:id/stats
```

**Response:**

```json
{
  "data": {
    "articleCount": 156,
    "verifiedCount": 142,
    "avgConfidence": 0.87,
    "lastWeekArticles": 23,
    "fetchErrors": 0
  }
}
```

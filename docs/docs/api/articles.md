---
sidebar_position: 3
---

# Articles API

Query and manage ingested articles.

## List Articles

```http
GET /api/articles
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `domain` | string | Filter by domain |
| `sourceId` | number | Filter by source |
| `verified` | boolean | Only verified articles |
| `minConfidence` | number | Minimum confidence (0-1) |
| `from` | string | Start date (ISO 8601) |
| `to` | string | End date (ISO 8601) |
| `page` | number | Page number |
| `limit` | number | Items per page |

**Response:**

```json
{
  "data": [
    {
      "id": 1234,
      "title": "Major Trade Agreement Announced",
      "url": "https://example.com/article",
      "source": {
        "id": 1,
        "name": "Reuters"
      },
      "domain": "economics",
      "summary": "...",
      "confidence": 0.94,
      "verified": true,
      "publishedAt": "2026-02-07T08:00:00Z",
      "ingestedAt": "2026-02-07T08:15:00Z"
    }
  ],
  "meta": {
    "total": 4852,
    "page": 1,
    "limit": 20
  }
}
```

## Get Article

```http
GET /api/articles/:id
```

**Response:**

```json
{
  "data": {
    "id": 1234,
    "title": "Major Trade Agreement Announced",
    "url": "https://example.com/article",
    "content": "Full article text...",
    "source": {
      "id": 1,
      "name": "Reuters",
      "domain": "economics"
    },
    "confidence": 0.94,
    "verified": true,
    "verification": {
      "score": 0.94,
      "sources": ["AP", "BBC"],
      "claims": [
        {"text": "Agreement signed", "verified": true}
      ]
    },
    "publishedAt": "2026-02-07T08:00:00Z"
  }
}
```

## Article Stats

```http
GET /api/articles/stats
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `hours` | number | Time window (default: 24) |
| `sourceListId` | number | Filter by source list |

**Response:**

```json
{
  "data": {
    "total": 4852,
    "verified": 2246,
    "last24h": 127,
    "byDomain": {
      "geopolitics": 45,
      "technology": 38,
      "economics": 22
    },
    "isFiltered": false
  }
}
```

## Update Verification

```http
PUT /api/articles/:id/verification
```

**Request Body:**

```json
{
  "verified": true,
  "notes": "Confirmed via official statement"
}
```

---
sidebar_position: 5
---

# Search API

Full-text search across all articles.

## Search Articles

```http
GET /api/search
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `domain` | string | Filter by domain |
| `from` | string | Start date |
| `to` | string | End date |
| `limit` | number | Max results (default: 20) |

**Example:**

```bash
curl "http://localhost:3000/api/search?q=trade+agreement&domain=economics"
```

**Response:**

```json
{
  "data": [
    {
      "id": 1234,
      "title": "Major Trade Agreement Announced",
      "snippet": "...the new <mark>trade agreement</mark> will reduce tariffs...",
      "url": "https://example.com/article",
      "source": "Reuters",
      "domain": "economics",
      "confidence": 0.94,
      "publishedAt": "2026-02-07T08:00:00Z",
      "relevance": 0.95
    }
  ],
  "meta": {
    "query": "trade agreement",
    "total": 23,
    "took": 45
  }
}
```

## Search Syntax

### Basic Search

```
trade agreement
```

Matches articles containing both "trade" and "agreement".

### Phrase Search

```
"trade agreement"
```

Matches the exact phrase.

### OR Search

```
trade | tariff
```

Matches articles containing either term.

### Exclude Terms

```
trade -china
```

Matches "trade" but excludes articles mentioning "china".

### Field Search

```
title:trade
source:reuters
domain:economics
```

Search within specific fields.

## Search Tips

1. **Use quotes** for exact phrases
2. **Combine filters** for precision: `?q=AI&domain=technology&from=2026-02-01`
3. **Check relevance scores** - higher = better match
4. **Narrow by date** if results are too broad

## PostgreSQL Full-Text Search

Under the hood, Argus uses PostgreSQL's built-in full-text search:

- **tsvector** for document indexing
- **tsquery** for search parsing
- **ts_rank** for relevance scoring

This provides fast, accurate search without external dependencies.

---
sidebar_position: 1
---

# API Overview

Argus provides a REST API for programmatic access to all features.

## Base URL

```
https://argus.vitalpoint.ai/api
```

For self-hosted instances:
```
http://localhost:3000/api
```

## Authentication

Currently, the API is unauthenticated for local development. Production authentication coming soon.

```bash
# Future: Bearer token auth
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://argus.vitalpoint.ai/api/sources
```

## Response Format

All responses are JSON:

```json
{
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

Error responses:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

## Pagination

List endpoints support pagination:

```bash
GET /api/articles?page=2&limit=50
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `page` | Page number (1-indexed) | `1` |
| `limit` | Items per page | `20` |

## Filtering

Filter by query parameters:

```bash
# Articles from specific domain
GET /api/articles?domain=technology

# Articles from date range
GET /api/articles?from=2026-02-01&to=2026-02-07

# Verified articles only
GET /api/articles?verified=true
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| [`/api/sources`](/api/sources) | Manage RSS sources |
| [`/api/articles`](/api/articles) | Query articles |
| [`/api/briefings`](/api/briefings) | Generate and view briefings |
| [`/api/search`](/api/search) | Full-text search |

## Rate Limits

| Tier | Requests/min |
|------|-------------|
| Development | Unlimited |
| Production | 60 |

## Versioning

The API is currently v1 (implicit). Future versions will use path prefixes:

```
/api/v1/sources
/api/v2/sources
```

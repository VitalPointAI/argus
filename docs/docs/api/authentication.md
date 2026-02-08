---
sidebar_position: 1
---

# Authentication

Argus supports two authentication methods: **JWT tokens** (for web sessions) and **API keys** (for programmatic access).

## JWT Authentication

JWT tokens are obtained by logging in via the `/api/auth/login` endpoint. Include the token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

JWT tokens expire after 7 days.

## API Key Authentication

API keys are designed for external integrations, scripts, and automated access. They provide long-lived authentication without requiring a login flow.

### Creating an API Key

1. Authenticate with your JWT token
2. Call `POST /api/keys` with a name for your key
3. **Save the returned key immediately** - it cannot be retrieved again!

```bash
curl -X POST https://api.argus.example.com/api/keys \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Integration"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "My Integration",
    "keyPrefix": "argus_ab",
    "isActive": true,
    "createdAt": "2026-02-08T03:00:00.000Z",
    "key": "argus_1234567890abcdef1234567890abcdef"
  },
  "message": "API key created. Save it now - it cannot be retrieved again."
}
```

### Using an API Key

Include the API key in the `X-API-Key` header:

```bash
curl https://api.argus.example.com/api/v1/articles/latest \
  -H "X-API-Key: argus_1234567890abcdef1234567890abcdef"
```

### Managing API Keys

#### List Your Keys

```bash
curl https://api.argus.example.com/api/keys \
  -H "Authorization: Bearer <your-jwt-token>"
```

Note: The actual keys are never returned after creation - only the prefix for identification.

#### Revoke a Key

```bash
curl -X DELETE https://api.argus.example.com/api/keys/<key-id> \
  -H "Authorization: Bearer <your-jwt-token>"
```

## Rate Limiting

API key requests are rate-limited to **100 requests per minute** by default.

Rate limit information is included in response headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

When rate limited, you'll receive a `429 Too Many Requests` response:

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 45
}
```

## Security Best Practices

1. **Never share API keys** - Each integration should have its own key
2. **Use descriptive names** - Makes it easy to identify and revoke compromised keys
3. **Rotate keys periodically** - Create a new key and revoke the old one
4. **Monitor usage** - Check `lastUsedAt` to identify unused keys
5. **Revoke immediately** if a key is compromised

## Admin API Key Management

Administrators can view and manage all API keys across users:

- `GET /api/admin/api-keys` - List all API keys
- `PUT /api/admin/api-keys/:id` - Activate/deactivate a key
- `DELETE /api/admin/api-keys/:id` - Delete any API key

---
sidebar_position: 7
---

# Analytics

Argus provides comprehensive analytics for both platform administrators and source list creators.

## Platform Analytics

Access the analytics dashboard at `/analytics` to view:

### Overview Stats

- **Source Lists** - Total curated lists on platform
- **Users** - Registered accounts
- **Sources** - Active RSS/web sources
- **Articles** - Total ingested content
- **Subscriptions** - Active Access Passes
- **Revenue** - Total platform revenue (USDC)

### Activity Charts

Interactive 30-day charts showing:

- Articles ingested per day
- New subscriptions over time
- User signups

Toggle between metrics using the dropdown.

### Platform Health

Progress bars showing:

- Active sources vs capacity
- Weekly article volume
- Active subscriptions
- Source list growth

## Leaderboard

The Source List Leaderboard ranks lists by:

| Sort Option | Description |
|-------------|-------------|
| **Subscribers** | Most popular by user count |
| **Revenue** | Highest earning lists |
| **Rating** | Best reviewed content |

Top 3 lists receive medals: 🥇 🥈 🥉

## API Endpoints

### Overview Stats

```bash
GET /api/analytics/overview
```

Returns platform totals and activity metrics.

### Leaderboard

```bash
GET /api/analytics/leaderboard?sort=subscribers&limit=10
```

Parameters:
- `sort` - `subscribers`, `revenue`, or `rating`
- `limit` - Number of results (default: 20)

### Time Series

```bash
GET /api/analytics/timeseries?metric=articles&days=30
```

Parameters:
- `metric` - `articles`, `subscriptions`, or `users`
- `days` - Lookback period (default: 30)

### Top Creators

```bash
GET /api/analytics/top-creators?limit=10
```

Returns creators ranked by total subscribers across all lists.

## Creator Analytics

*Coming soon:* Individual dashboard for creators showing:

- Subscriber growth
- Revenue breakdown
- Content engagement
- Referral sources

# Source Reputation System

The Source Reputation System provides a robust framework for tracking and calculating source reliability scores based on user ratings, cross-reference verification, and historical accuracy.

## Features

### 1. User Ratings (1-5 Stars)

Users can rate sources on a 1-5 star scale with optional comments:

```bash
# Rate a source
POST /api/sources/:id/rate
Content-Type: application/json

{
  "rating": 4,
  "comment": "Generally reliable, but occasional bias detected"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "rating": 4,
    "weight": 1.2,
    "isUpdate": false
  }
}
```

### 2. Anti-Gaming Measures

The system includes multiple layers of protection against rating manipulation:

#### Rate Limiting
- **20 ratings per user per day** (configurable)
- Updates to existing ratings don't count against the limit
- Prevents bulk rating attacks

#### Weighted Ratings
- Ratings are weighted by the user's **trust score** (0.1 - 3.0)
- New users start at 1.0
- Trust scores increase when users' ratings align with verified accuracy
- Higher-trust users have more influence on the final score

#### Anomaly Detection
- **Spike Detection:** Flags when 5+ ratings occur within 1 hour
- **Coordination Detection:** Flags when 80%+ of recent ratings are identical
- Flagged ratings are excluded from score calculations
- All anomalies are logged for admin review

### 3. Reputation Decay

Sources that become stale (no new articles in 30+ days) experience reputation decay:

- **2 points per week** after the 30-day threshold
- Maximum decay of 20 points total
- Minimum score of 10 (never goes lower)
- Decay is applied weekly, tracked per-source

```bash
# Trigger decay manually (admin only)
POST /api/sources/decay/trigger
```

### 4. Cross-Reference Accuracy Tracking

The system tracks whether claims from sources are verified by other sources:

```typescript
import { recordCrossReference } from './services/reputation';

// Record a verified claim
await recordCrossReference(
  sourceId,
  contentId,
  true,  // wasAccurate
  'Reuters confirmed this claim',
  0.9,   // confidence
  claimId
);
```

Accuracy data contributes 50% to the final reliability score.

## API Endpoints

### Rate a Source
```
POST /api/sources/:id/rate
```
**Body:** `{ rating: 1-5, comment?: string }`
**Auth:** Required

### Get Ratings
```
GET /api/sources/:id/ratings?limit=20&offset=0
```
Returns paginated ratings with distribution stats.

### Get Full Reputation Data
```
GET /api/sources/:id/reputation
```
Returns:
- Reliability score
- Total/average/weighted ratings
- Accuracy stats from cross-references
- Stale status
- Recent ratings

### Get Reliability History
```
GET /api/sources/:id/reliability-history?limit=50
```
Returns a timeline of score changes with reasons.

## Database Tables

### reliability_history
Tracks all score changes over time:
- `source_id` - The source
- `old_score`, `new_score` - Before/after scores
- `change_reason` - 'user_rating', 'decay', 'cross_reference', 'manual', 'anomaly_correction'
- `change_metadata` - Additional context (JSON)

### source_ratings
User ratings:
- `source_id`, `user_id` - References
- `rating` (1-5), `comment`
- `weight` - Based on user trust at rating time
- `is_flagged`, `flag_reason` - For anomalies

### user_rating_limits
Daily rate limiting:
- `user_id`, `date`, `rating_count`

### cross_reference_results
Verification tracking:
- `source_id`, `content_id`, `claim_id`
- `was_accurate` - Whether claim was verified
- `verification_source` - What verified/contradicted it
- `confidence` - 0-1 confidence score

### rating_anomalies
Anomaly log:
- `source_id`, `anomaly_type` ('spike', 'coordinated', 'bot_suspected')
- `details`, `affected_rating_ids`
- `resolved`, `resolution_action`

## Score Calculation

The reliability score is calculated as a weighted combination:

| Component | Weight | Description |
|-----------|--------|-------------|
| User Ratings | 30% | Weighted average of non-flagged ratings |
| Cross-Reference Accuracy | 50% | % of verified claims that were accurate |
| Current Score | 20% | Smoothing factor for stability |

Formula:
```
new_score = (rating_component * 0.3) + (accuracy_component * 0.5) + (current_score * 0.2)
```

## Configuration

All thresholds are configurable in `services/reputation/index.ts`:

```typescript
const CONFIG = {
  MAX_RATINGS_PER_DAY: 20,
  MIN_TRUST_SCORE: 0.1,
  MAX_TRUST_SCORE: 3.0,
  SPIKE_THRESHOLD: 5,
  SPIKE_WINDOW_HOURS: 1,
  COORDINATED_THRESHOLD: 0.8,
  STALE_DAYS: 30,
  DECAY_PER_WEEK: 2,
  MAX_DECAY: 20,
  WEIGHT_USER_RATINGS: 0.3,
  WEIGHT_CROSS_REFERENCE: 0.5,
  WEIGHT_CURRENT_SCORE: 0.2,
};
```

## Integration with Ingestion

When new content is ingested, call `recordNewArticle()` to reset the stale timer:

```typescript
import { recordNewArticle } from './services/reputation';

// In your ingestion service
await recordNewArticle(sourceId);
```

## Migration

Run the migration to add new tables:

```bash
psql $DATABASE_URL -f migrations/002_source_reputation_system.sql
```

Or via npm:
```bash
npm run db:migrate
```

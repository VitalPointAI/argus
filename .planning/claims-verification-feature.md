# Claims Verification Feature - Implementation Status

## Completed ✅

### 1. Database Schema
- Added `article_claims` table to store extracted claims:
  - `id` (UUID, primary key)
  - `content_id` (FK to content)
  - `claim_text` (the extracted claim)
  - `confidence` (0-100 score)
  - `verification_status` (verified, partially_verified, unverified, contradicted)
  - `verification_method` (how it was/can be verified)
  - `verified_by` (JSON array of corroborating sources)
  - `contradicted_by` (JSON array of contradicting sources)
  - `extracted_at` (timestamp)
- Migration applied to production database

### 2. Backend LLM Claim Extraction
- Updated `llm-verify.ts` to:
  - Extract 3-7 factual claims from each article using LLM
  - Assess verification status for each claim
  - Suggest verification methods
  - Store claims in `article_claims` table
- LLM prompt updated to request detailed claim analysis

### 3. API Endpoints
- Added `GET /api/verification/claims/:contentId` endpoint:
  - Returns all extracted claims for a content item
  - Includes claim text, confidence, status, method, and sources
  - Working in production

### 4. Frontend Modal Enhancement
- Enhanced `FactVerificationModal` with:
  - Overall confidence bar and status indicator
  - Summary stats (verified/partial/unverified counts)
  - Expandable claim list with status icons:
    - ✓ = Verified (green)
    - ◐ = Partially verified (yellow)
    - ? = Unverified (gray)
    - ✗ = Contradicted (red)
  - Expandable details for each claim showing:
    - Verification method
    - Corroborating sources
    - Contradicting sources
    - Individual confidence bar
- Currently shows generated/mock claims (see "Remaining Work")

## Remaining Work 🔨

### 1. Wire Frontend to Real Claims API
The modal currently generates placeholder claims because:
- The briefing page parses text from markdown (no content IDs available)
- Need to either:
  a) Include content IDs in the briefing generation/parsing
  b) Add a search/lookup by title to match content
  c) Store briefing-to-content mappings

**To implement:**
```typescript
// In FactVerificationModal, fetch real claims:
const response = await fetch(`${API_URL}/api/verification/claims/${contentId}`);
const data = await response.json();
if (data.success && data.data.claims.length > 0) {
  setClaims(data.data.claims);
}
```

### 2. Batch LLM Verification for Claims
- Run `POST /api/verification/llm/batch` periodically to extract claims
- Currently claims are only extracted on-demand via individual verification
- Could add to cron job or background worker

### 3. Cross-Reference Engine for Claims
- Implement actual cross-referencing between articles
- When same claim appears in multiple articles, update `verified_by`
- Could use embedding similarity or exact text matching

### 4. Content ID in Briefings
- Update briefing generation to include content IDs with each item
- Or store a mapping table: `briefing_content_items`
- Would enable fetching real claims for each briefing item

## Testing the Feature

### Test API:
```bash
# Get claims for a content item
curl "https://argus.vitalpoint.ai/api/verification/claims/8e7256bb-4e80-4e04-9b02-c2192c095dd1"

# Trigger LLM verification (extracts claims)
curl -X POST "https://argus.vitalpoint.ai/api/verification/llm/8e7256bb-4e80-4e04-9b02-c2192c095dd1"

# Batch verify content
curl -X POST "https://argus.vitalpoint.ai/api/verification/llm/batch?limit=5"
```

### Test Frontend:
1. Go to https://argus.vitalpoint.ai/briefings
2. Click on any verified/unverified development card
3. Modal shows claim-level verification (currently with generated data)

## Files Changed

- `apps/api/src/db/schema.ts` - Added `articleClaims` table
- `apps/api/src/services/verification/llm-verify.ts` - Claim extraction logic
- `apps/api/src/routes/verification.ts` - Claims API endpoint
- `apps/web/src/app/briefings/page.tsx` - Enhanced modal UI
- `apps/api/migrations/add-article-claims.sql` - Database migration

## Deployed
- ✅ Database migration applied
- ✅ API deployed and restarted
- ✅ Web app deployed

Server: 157.90.122.69

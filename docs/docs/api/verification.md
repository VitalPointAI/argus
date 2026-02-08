---
sidebar_position: 6
---

# Verification API

Multi-layered content verification endpoints.

## Claim Extraction

### Extract Claims from Article
```http
POST /api/verification/verify-claims/{contentId}
```

Query params:
- `force=true` - Re-extract claims even if cached

Returns extracted factual claims with initial verification status.

### Get Claims for Article
```http
GET /api/verification/claims/{contentId}
```

### Batch Extract Recent Content
```http
POST /api/verification/claims/extract-recent?limit=10&minConfidence=60
```

## Cross-Reference Verification

### Cross-Reference Single Claim
```http
POST /api/verification/cross-reference/claim/{claimId}?daysBack=7
```

Searches the article database for corroborating or contradicting sources.

### Cross-Reference All Claims for Article
```http
POST /api/verification/cross-reference/content/{contentId}?daysBack=7
```

### Batch Cross-Reference
```http
POST /api/verification/cross-reference/batch?limit=20&daysBack=7
```

### Cross-Reference Statistics
```http
GET /api/verification/cross-reference/stats
```

Response:
```json
{
  "success": true,
  "data": {
    "totalReferences": 1250,
    "accurateReferences": 980,
    "accuracyRate": 78,
    "topCorroboratingSources": [...],
    "groundTruthSources": ["Associated Press", "AP News", "Reuters", ...]
  }
}
```

## Bias Detection

### Analyze Article Bias
```http
POST /api/verification/bias/{contentId}
```

Response:
```json
{
  "success": true,
  "data": {
    "contentId": "...",
    "politicalBias": "center-left",
    "politicalConfidence": 65,
    "emotionalLevel": "low",
    "sensationalismLevel": "none",
    "indicators": {
      "loadedLanguage": [],
      "unsupportedClaims": [],
      "cherryPicking": false,
      "adHominem": false,
      "falseBalance": false,
      "omission": ["missing poll methodology"]
    },
    "overallBiasScore": 35,
    "summary": "...",
    "recommendations": [...]
  }
}
```

### Batch Bias Analysis
```http
POST /api/verification/bias/batch?limit=20
```

### Source Bias Summary
```http
GET /api/verification/bias/source/{sourceId}
```

## Verification Trail

### Full Verification Trail
```http
GET /api/verification/trail/{contentId}
```

Step-by-step breakdown of confidence score calculation:

```json
{
  "success": true,
  "data": {
    "contentId": "...",
    "contentTitle": "...",
    "finalConfidenceScore": 75,
    "confidenceLevel": "medium",
    "steps": [
      {
        "type": "source",
        "label": "Source Reliability",
        "description": "Reuters has a reliability score of 85/100...",
        "impact": "positive",
        "scoreContribution": 10
      },
      {
        "type": "ground_truth",
        "label": "Wire Service Source",
        "description": "Reuters is a wire service (ground truth source)...",
        "impact": "positive",
        "scoreContribution": 15
      }
    ],
    "summary": {
      "positiveFactors": ["High source reliability", "Wire service"],
      "negativeFactors": [],
      "recommendation": "This content appears highly reliable..."
    },
    "comparison": {
      "sourceAverage": 72,
      "domainAverage": 65,
      "percentileRank": 85
    }
  }
}
```

### Verification Summary (Lightweight)
```http
GET /api/verification/summary/{contentId}
```

## Deep Verification

Run the full verification pipeline in one call:

```http
POST /api/verification/deep/{contentId}
```

Performs:
1. Claim extraction via LLM
2. Cross-reference verification
3. Bias analysis
4. Trail generation

Response includes all results plus final recommendation.

⚠️ **Note**: This is expensive (multiple LLM calls). Use for high-priority content.

## LLM Verification

### Verify Single Article
```http
POST /api/verification/llm/{contentId}
```

### Batch LLM Verification
```http
POST /api/verification/llm/batch?limit=10
```

## Heuristic Verification

Faster, cheaper verification using pattern matching:

```http
POST /api/verification/content/{contentId}
POST /api/verification/batch?limit=50
```

## Statistics

### Overview
```http
GET /api/verification/stats/overview
```

Response:
```json
{
  "success": true,
  "data": {
    "verified": 6000,
    "unverified": 30000,
    "averageConfidence": 62,
    "distribution": {
      "high": 2300,
      "medium": 3700,
      "low": 1
    }
  }
}
```

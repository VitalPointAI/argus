---
sidebar_position: 3
---

# Verification & Trust

Argus provides multi-layered verification to help you assess content reliability.

## Confidence Scores

Every article gets a confidence score (0-100) based on:

- **Source reliability** - Historical accuracy of the publication
- **Credibility indicators** - Citations, specific data, expert quotes
- **Claim verification** - Cross-referenced with other sources
- **Bias analysis** - Emotional language, sensationalism, political lean

### Score Levels

| Level | Score | Meaning |
|-------|-------|---------|
| High | 80-100 | Well-sourced, factually accurate, neutral tone |
| Medium | 60-79 | Moderately reliable, consider cross-referencing |
| Low | 40-59 | Exercise caution, verify key claims |
| Very Low | 0-39 | Significant concerns, verify with trusted sources |

## Ground Truth Sources

Wire services are treated as ground truth due to their journalistic standards:

- **Associated Press (AP News)**
- **Reuters**
- **AFP (Agence France-Presse)**

Claims corroborated by wire services get an automatic confidence boost.

## Claim Extraction

Argus extracts factual claims from articles using AI:

```bash
# Extract and verify claims for an article
curl -X POST "https://argus.vitalpoint.ai/api/verification/verify-claims/{contentId}"
```

Each claim is assessed for:
- **Verifiability** - Can it be fact-checked?
- **Status** - verified, partially_verified, unverified, contradicted
- **Corroboration** - Which other sources support or contradict it?

## Cross-Reference Verification

Claims are automatically compared against your article database:

```bash
# Cross-reference all claims for an article
curl -X POST "https://argus.vitalpoint.ai/api/verification/cross-reference/content/{contentId}"
```

A claim is marked **verified** when:
- Found in 3+ independent sources, OR
- Corroborated by a wire service (ground truth)

## Bias Detection

AI-powered analysis of political lean and journalistic quality:

```bash
# Analyze article bias
curl -X POST "https://argus.vitalpoint.ai/api/verification/bias/{contentId}"
```

Returns:
- **Political bias**: far-left to far-right spectrum
- **Emotional language**: none/low/medium/high
- **Sensationalism**: clickbait detection
- **Specific indicators**: loaded language, unsupported claims, ad hominem attacks

## Verification Trail

See exactly why an article got its confidence score:

```bash
# Get full verification trail
curl "https://argus.vitalpoint.ai/api/verification/trail/{contentId}"
```

Returns a step-by-step breakdown:
- Source reliability contribution
- Claim verification results
- Cross-reference matches
- Bias indicators
- Overall recommendation

## Deep Verification

Run the full verification pipeline in one call:

```bash
# Full verification: claims + cross-reference + bias + trail
curl -X POST "https://argus.vitalpoint.ai/api/verification/deep/{contentId}"
```

This is expensive (multiple LLM calls) but provides comprehensive analysis.

## Batch Operations

### Batch Claim Extraction
```bash
curl -X POST "https://argus.vitalpoint.ai/api/verification/claims/extract-recent?limit=10"
```

### Batch Cross-Reference
```bash
curl -X POST "https://argus.vitalpoint.ai/api/verification/cross-reference/batch?limit=20"
```

### Batch Bias Analysis
```bash
curl -X POST "https://argus.vitalpoint.ai/api/verification/bias/batch?limit=20"
```

## Statistics

```bash
# Overall verification stats
curl "https://argus.vitalpoint.ai/api/verification/stats/overview"

# Cross-reference stats
curl "https://argus.vitalpoint.ai/api/verification/cross-reference/stats"

# Source bias summary
curl "https://argus.vitalpoint.ai/api/verification/bias/source/{sourceId}"
```

## Best Practices

1. **Trust but verify** - High-confidence scores are a good signal, but always check important claims
2. **Wire services first** - Prioritize AP, Reuters, AFP for breaking news
3. **Check the trail** - Use `/trail` to understand why a score was assigned
4. **Bias awareness** - Use bias analysis to understand perspective, not to dismiss content
5. **Cross-reference important claims** - Run deep verification on high-stakes content

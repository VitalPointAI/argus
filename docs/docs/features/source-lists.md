---
sidebar_position: 4
---

# Source Lists

Create filtered views of your sources for focused intelligence.

## What Are Source Lists?

Source lists let you group sources by topic, region, or priority. When activated, your dashboard and briefings show only content from that list.

## Creating a Source List

### Via Dashboard

1. Go to **Sources → Manage Sources**
2. Click **Create List**
3. Name your list (e.g., "APAC Focus", "Tech Only")
4. Add sources to the list
5. Click **Save**

### Via API

```bash
curl -X POST http://localhost:3000/api/sources/lists \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Critical Infrastructure",
    "sourceIds": [1, 5, 12, 23]
  }'
```

## Activating a List

Click **🎯 Use for Dashboard** on any source list page, or:

```bash
curl -X POST http://localhost:3000/api/sources/lists/5/activate
```

When active:
- Dashboard shows only articles from listed sources
- Stats reflect filtered view
- Briefings use filtered sources
- UI shows "Filtered: [list name]" indicator

## Deactivating

Click the green **✓ Active** button, or:

```bash
curl -X DELETE http://localhost:3000/api/sources/lists/active
```

## Use Cases

### Regional Focus
Create lists for different regions:
- "North America" - US/Canada sources
- "Europe" - EU-focused feeds
- "APAC" - Asia-Pacific coverage

### Topic Deep-Dive
Narrow to specific domains:
- "Crypto & DeFi" - Blockchain-focused
- "Climate" - Environmental sources
- "Defense" - Security and military

### Priority Tiers
Organize by importance:
- "Tier 1" - Must-read sources
- "Tier 2" - Secondary sources
- "Experimental" - New sources on trial

## API Reference

```bash
# List all source lists
GET /api/sources/lists

# Get specific list
GET /api/sources/lists/:id

# Create list
POST /api/sources/lists

# Update list
PUT /api/sources/lists/:id

# Delete list
DELETE /api/sources/lists/:id

# Activate list
POST /api/sources/lists/:id/activate

# Get active list
GET /api/sources/lists/active

# Deactivate (show all)
DELETE /api/sources/lists/active
```

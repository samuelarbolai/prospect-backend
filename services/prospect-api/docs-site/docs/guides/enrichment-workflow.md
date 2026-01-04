---
id: enrichment-workflow
title: Enrichment Workflow
sidebar_label: Enrichment Workflow
---

# Enrichment Workflow

This guide explains how to queue prospects for enrichment and track their progress through the enrichment pipeline.

## Overview

The enrichment process involves two stages:

1. **LinkedIn Enrichment** - Find LinkedIn profiles and extract professional data
2. **Domain Enrichment** - Enrich with company domain information and metadata

Each stage can be triggered independently or sequentially.

## Queuing Prospects for Enrichment

### Basic Enrichment Request

Queue prospects for LinkedIn enrichment:

```bash
curl -X POST http://localhost:4000/api/enqueue_enrichment \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": ["prospect123", "prospect456"],
    "listId": "my_list",
    "jobType": "linkedin"
  }'
```

**Response:**
```json
{
  "runId": "run_abc123",
  "queued": 2,
  "listTag": "enrichment_queue",
  "listId": "my_list",
  "jobType": "linkedin"
}
```

### With Custom List Tag

Add prospects to a specific list after queuing:

```bash
curl -X POST http://localhost:4000/api/enqueue_enrichment \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": ["prospect123"],
    "listId": "my_list",
    "listTag": "priority_enrichment",
    "jobType": "linkedin"
  }'
```

### With Metadata

Include custom metadata for tracking:

```bash
curl -X POST http://localhost:4000/api/enqueue_enrichment \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": ["prospect123"],
    "listId": "my_list",
    "metadata": {
      "campaign": "Q1_2024",
      "source": "trade_show",
      "notes": "High priority leads"
    }
  }'
```

### With Pricing Tracking

Track costs for this enrichment job:

```bash
curl -X POST http://localhost:4000/api/enqueue_enrichment \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": ["prospect123", "prospect456"],
    "listId": "my_list",
    "sessionId": "session_xyz789"
  }'
```

## Enrichment Lifecycle

### 1. Before Queuing

**Prospect Status:**
```json
{
  "enrichment": {
    "status": "pending",
    "linkedin_status": "pending",
    "domain_status": "pending"
  },
  "list_ids": ["my_list"]
}
```

### 2. After Queuing (LinkedIn)

**Prospect Status:**
```json
{
  "enrichment": {
    "status": "queued",
    "linkedin_status": "queued",
    "linkedin_run_id": "run_abc123",
    "linkedin_queue_timestamp": "2024-01-01T12:00:00Z"
  },
  "list_ids": ["my_list", "enrichment_queue"]
}
```

### 3. During Processing

**Prospect Status:**
```json
{
  "enrichment": {
    "status": "in_progress",
    "linkedin_status": "in_progress",
    "linkedin_run_id": "run_abc123",
    "linkedin_queue_timestamp": "2024-01-01T12:00:00Z"
  },
  "list_ids": ["my_list", "enrichment_queue"]
}
```

### 4. After Completion

**Prospect Status:**
```json
{
  "enrichment": {
    "status": "completed",
    "linkedin_status": "completed",
    "linkedin_run_id": "run_abc123",
    "linkedin_queue_timestamp": "2024-01-01T12:00:00Z",
    "linkedin_updated_at": "2024-01-01T12:05:00Z"
  },
  "list_ids": ["my_list", "enrichment_queue"]
}
```

## Monitoring Enrichment Progress

### Query Prospects by Status

Get all prospects currently being enriched:

```bash
curl "http://localhost:4000/api/prospects?statuses=in_progress"
```

Get completed prospects:

```bash
curl "http://localhost:4000/api/prospects?statuses=completed"
```

Get failed prospects:

```bash
curl "http://localhost:4000/api/prospects?statuses=failed"
```

### Filter by List and Status

Get enrichment queue prospects that are completed:

```bash
curl "http://localhost:4000/api/prospects?listIds=enrichment_queue&statuses=completed"
```

## Domain Enrichment

After LinkedIn enrichment completes, queue for domain enrichment:

```bash
curl -X POST http://localhost:4000/api/enqueue_enrichment \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": ["prospect123"],
    "listId": "my_list",
    "jobType": "domain"
  }'
```

**Updated Status:**
```json
{
  "enrichment": {
    "status": "queued",
    "linkedin_status": "completed",
    "domain_status": "queued",
    "domain_run_id": "run_def456",
    "domain_queue_timestamp": "2024-01-01T12:10:00Z"
  }
}
```

## Tagging for Outreach

Once prospects are enriched and ready, mark them for outreach:

```bash
curl -X POST http://localhost:4000/api/tag_outreach_ready \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": ["prospect123", "prospect456"],
    "listTag": "outreach_ready"
  }'
```

**Response:**
```json
{
  "updated": 2,
  "listTag": "outreach_ready"
}
```

**Updated Prospect:**
```json
{
  "outreach": {
    "ready": true,
    "ready_at": "2024-01-01T12:15:00Z",
    "updated_at": "2024-01-01T12:15:00Z"
  },
  "list_ids": ["my_list", "enrichment_queue", "outreach_ready"]
}
```

## Best Practices

### 1. Validate List Membership

Always ensure prospects belong to the specified `listId` before queuing. The API will reject requests if prospects aren't in the list.

### 2. Use Meaningful List Tags

Choose descriptive list tags that help organize prospects:
- `high_priority_enrichment`
- `q1_campaign`
- `trade_show_leads`

### 3. Monitor Failed Enrichments

Regularly check for failed prospects and retry or handle manually:

```bash
curl "http://localhost:4000/api/prospects?statuses=failed&pageSize=100"
```

### 4. Batch Enrichment Requests

For large datasets, batch prospects in groups of 100-500 to avoid timeouts and improve throughput.

### 5. Use Pricing Sessions

If tracking costs, always create a pricing session first:

```bash
# Start session
curl -X POST http://localhost:4000/api/pricing/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123"}'

# Use returned sessionId in enrichment requests
```

## Error Handling

### Invalid List ID

**Error:** 400 Bad Request
```json
{
  "error": "All prospects must be part of the list: my_list"
}
```

**Solution:** Verify prospects have `my_list` in their `list_ids` array.

### Prospect Not Found

**Error:** 404 Not Found
```json
{
  "error": "Prospect not found"
}
```

**Solution:** Verify prospect IDs exist in Firestore.

### SQS Queue Error

**Error:** Logged but request succeeds
```
Error publishing to SQS: ...
```

**Solution:** Check AWS credentials and queue URL configuration. The enrichment run is still created in Firestore for manual processing.

## Local Development Mode

For testing without AWS SQS, enable local enrichment scripts:

```bash
LOCAL_ENRICHMENT=1 npm run dev
```

This will spawn local Python scripts instead of publishing to SQS queues.

## Complete Example Workflow

```bash
# 1. Start pricing session
SESSION_RESPONSE=$(curl -s -X POST http://localhost:4000/api/pricing/sessions/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123"}')

SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.session_id')

# 2. Queue for LinkedIn enrichment
curl -X POST http://localhost:4000/api/enqueue_enrichment \
  -H "Content-Type: application/json" \
  -d "{
    \"prospectIds\": [\"prospect123\", \"prospect456\"],
    \"listId\": \"my_list\",
    \"jobType\": \"linkedin\",
    \"sessionId\": \"$SESSION_ID\",
    \"metadata\": {
      \"campaign\": \"Q1_2024\"
    }
  }"

# 3. Monitor progress
curl "http://localhost:4000/api/prospects?statuses=queued,in_progress&listIds=enrichment_queue"

# 4. After completion, queue for domain enrichment
curl -X POST http://localhost:4000/api/enqueue_enrichment \
  -H "Content-Type: application/json" \
  -d "{
    \"prospectIds\": [\"prospect123\", \"prospect456\"],
    \"listId\": \"my_list\",
    \"jobType\": \"domain\",
    \"sessionId\": \"$SESSION_ID\"
  }"

# 5. Tag as outreach ready
curl -X POST http://localhost:4000/api/tag_outreach_ready \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": ["prospect123", "prospect456"],
    "listTag": "outreach_ready"
  }'

# 6. Get final cost
curl "http://localhost:4000/api/pricing/sessions/total/$SESSION_ID"
```

## Next Steps

- 📖 [Pricing System](pricing) - Learn about cost tracking
- 🔌 [API Reference](/docs/api) - Explore all endpoints
- 🏗️ [Architecture Overview](../architecture/overview) - Understand the system

---
id: overview
title: Architecture Overview
sidebar_label: Overview
---

# Architecture Overview

The Prospect Pipeline API is an Express.js microservice that orchestrates prospect data management and enrichment workflows.

## System Components

### Core Service (Express.js)

- **Language:** TypeScript
- **Runtime:** Node.js 20
- **Framework:** Express.js 4.x
- **Port:** 4000 (configurable)

### Data Storage (Firestore)

- **Provider:** Google Cloud Firestore
- **Collections:**
  - `prospects` - Prospect documents with enrichment and outreach metadata
  - `enrichment_runs` - Enrichment job tracking
  - `pricing_sessions` - Active pricing sessions
  - `pricing_transactions` - Cost transaction history
  - `user_billing` - Aggregated billing data

### Job Queue (AWS SQS - Optional)

- **LinkedIn Enrichment Queue** - Triggers Python Lambda for LinkedIn data enrichment
- **Domain Enrichment Queue** - Triggers Python Lambda for domain metadata enrichment

## Request Flow

### 1. Prospect Query Flow

```
Client Request
      ↓
GET /api/prospects?statuses=queued&pageSize=50
      ↓
Express Route Handler (routes/prospects.ts)
      ↓
Firestore Query with Filters
      ↓
In-Memory Filtering (priorities, statuses, search)
      ↓
Cursor-Based Pagination
      ↓
JSON Response
```

### 2. Enrichment Queue Flow

```
Client Request
      ↓
POST /api/enqueue_enrichment
      ↓
Validation (Zod Schema)
      ↓
Create Enrichment Run Document
      ↓
Update Prospects (Batched Writes - 400/batch)
      ↓
Optional: Publish to SQS Queue
      ↓
Optional: Trigger Local Scripts (LOCAL_ENRICHMENT=1)
      ↓
Optional: Record Pricing Transaction
      ↓
Response { runId, queued, listTag }
```

### 3. Pricing Session Flow

```
POST /api/pricing/sessions/start
      ↓
Create Pricing Session Document
      ↓
Return Session ID
      ↓
(Later during enrichment)
      ↓
POST /api/enqueue_enrichment with sessionId
      ↓
Calculate Cost (prospectCount × PRICING_COST_PER_PROSPECT)
      ↓
Create Transaction Document
      ↓
Update Session Total
```

## Data Models

### Prospect Document

```typescript
{
  id: string,                     // Firestore document ID
  name: string,
  organization: string,
  role_title: string,
  priority_bucket: string,        // P1, P2, P3, etc.
  list_ids: string[],             // Array of list memberships
  batch_id?: string,              // Optional batch ID
  enrichment: {
    status: "pending" | "queued" | "in_progress" | "completed" | "failed",
    linkedin_status: string,
    domain_status: string,
    linkedin_run_id?: string,
    domain_run_id?: string,
    linkedin_queue_timestamp?: Timestamp,
    domain_queue_timestamp?: Timestamp,
    linkedin_updated_at?: Timestamp,
    domain_updated_at?: Timestamp
  },
  outreach: {
    ready: boolean,
    ready_at?: Timestamp,
    updated_at?: Timestamp
  },
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### Enrichment Run Document

```typescript
{
  id: string,
  created_at: Timestamp,
  status: "queued" | "in_progress" | "completed" | "failed",
  prospect_count: number,
  list_tag: string,
  metadata?: object,
  job_type: "linkedin" | "domain"
}
```

### Pricing Session Document

```typescript
{
  session_id: string,              // UUID
  user_id: string,
  start_time: Timestamp,
  current_total: number,           // Dollars
  status: "active" | "completed"
}
```

## Deployment Architecture

### Local Development

```
Developer Machine
      ↓
Node.js Express Server (port 4000)
      ↓
Service Account JSON File
      ↓
Google Cloud Firestore
```

### Cloud Run Production

```
Client Request (HTTPS)
      ↓
Cloud Run Service (prospect-api)
      ↓
Application Default Credentials
      ↓
Firestore + SQS Queues
```

## Authentication & Authorization

### Firestore Access

Three authentication methods supported (choose one):

1. **Application Default Credentials (ADC)** - Recommended for Cloud Run
2. **Service Account JSON File** - `GOOGLE_APPLICATION_CREDENTIALS` environment variable
3. **Inline JSON** - `GOOGLE_APPLICATION_CREDENTIALS_JSON` or `GOOGLE_APPLICATION_CREDENTIALS_B64`

### AWS SQS Access

Uses standard AWS SDK credential chain:
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM role (when running on Cloud Run with configured service account)
- AWS credentials file

## Scalability Patterns

### Cursor-Based Pagination

- Uses Firestore document IDs as cursor tokens
- Supports unlimited dataset sizes
- No offset-based query limitations

### Batch Writes

- Firestore writes batched in groups of 400 (below 500 limit)
- Reduces API calls and improves performance

### Asynchronous Processing

- SQS queues decouple enrichment processing
- Python Lambda workers process jobs independently
- Firestore status updates for progress tracking

## Error Handling

### Request Validation

- Zod schemas validate all request bodies
- Returns 400 with descriptive error messages

### Firestore Errors

- Catches and logs Firestore exceptions
- Returns 500 with generic error message
- Detailed errors logged to console

### SQS Failures

- Logs SQS publishing failures
- Does not block the main request
- Enrichment run still created in Firestore

## Performance Considerations

### Query Optimization

- Firestore indexes required for:
  - `list_ids` array contains queries
  - `enrichment.status` equality queries
  - Composite queries on list membership + status

### Memory Management

- Pagination limits prevent loading large datasets
- In-memory filtering only after initial Firestore query
- Batch processing for bulk operations

### Connection Pooling

- Firebase Admin SDK manages connection pooling
- SQS client reused across requests

## Security

### CORS Configuration

- Configurable allowed origins via `CORS_ALLOWED_ORIGINS`
- Supports multiple origins (comma-separated)
- Defaults to restrictive policy

### Data Validation

- All user inputs validated with Zod schemas
- No direct Firestore query exposure
- Parameterized queries prevent injection

### Service Account Permissions

- Principle of least privilege
- Only `datastore.user` role required for basic operations
- Separate service accounts for different environments

## Monitoring & Logging

### Application Logs

- Console logging for all requests
- Error stack traces logged
- Timestamps included in log entries

### Cloud Run Metrics (Production)

- Request count and latency
- Error rates
- Memory and CPU usage
- Auto-scaling metrics

## Related Documentation

- [Setup Guide](../getting-started/setup) - Installation and configuration
- [Cloud Run Deployment](cloud-run-setup) - Production deployment guide
- [Pricing System](../guides/pricing) - Cost tracking details
- [API Reference](/docs/api) - Complete endpoint documentation

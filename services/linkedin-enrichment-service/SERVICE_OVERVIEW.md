# LinkedIn Enrichment Service - Overview

## What Is This?

A standalone Express.js service that enriches prospect data with LinkedIn profiles. This is a **simplified, HTTP-based version** of the existing Lambda enrichment pipeline.

### Key Differences from Lambda Version

| Feature | Lambda Version | This Service |
|---------|---------------|--------------|
| **Trigger** | SQS queue messages | HTTP POST requests |
| **Deployment** | AWS Lambda | Any Node.js host (Cloud Run, EC2, local) |
| **Orchestration** | Requires SQS setup | Direct API calls |
| **Batching** | Implicit (via queue) | Explicit (batch endpoint) |
| **Configuration** | Environment variables only | Request-level keyword configs |
| **Testing** | Requires AWS/SQS | Simple `curl` commands |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Express.js Server                       │
│                   (Port 4200)                            │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  API Routes      Enrichment Service   Firestore Service
        │                 │                 │
        │        ┌────────┴────────┐        │
        │        │                 │        │
        │        ▼                 ▼        ▼
        │   Google Search      OpenAI   Firestore DB
        │        API             API    (prospects,
        │                              enrichments)
        └──────────────────────────────────┘
```

## File Structure

```
linkedin-enrichment-service/
│
├── src/
│   ├── index.ts                      # Main entry point, Express app setup
│   ├── types/
│   │   └── index.ts                  # TypeScript type definitions
│   ├── services/
│   │   ├── enrichment.service.ts     # Core enrichment logic
│   │   └── firestore.service.ts      # Firestore read/write operations
│   └── routes/
│       └── enrichment.routes.ts      # API endpoint definitions
│
├── .env.example                       # Environment template
├── .gitignore
├── Dockerfile                         # Multi-stage Docker build
├── package.json
├── tsconfig.json
│
├── README.md                          # Full documentation
├── QUICKSTART.md                      # 5-minute setup guide
├── examples.md                        # API usage examples
├── SERVICE_OVERVIEW.md                # This file
└── test-service.sh                    # Automated API tests
```

## Core Components

### 1. Enrichment Service (`enrichment.service.ts`)

**Responsibilities:**
- Generate search keywords from prospect data
- Call Google Custom Search API
- Evaluate results with OpenAI
- Apply fallback strategies if needed

**Key Methods:**
- `generateKeywords()` - Builds search query from prospect fields
- `fetchGoogleResults()` - Queries Google Custom Search
- `evaluateWithOpenAI()` - Sends results to OpenAI for selection
- `enrichProspect()` - Main workflow orchestration

### 2. Firestore Service (`firestore.service.ts`)

**Responsibilities:**
- Read prospect data from Firestore
- Write enrichment results back to prospects
- Save enrichment history to separate collection
- Handle batch operations

**Key Methods:**
- `getProspect()` - Fetch single prospect
- `getProspectsBatch()` - Fetch multiple prospects
- `updateProspectEnrichment()` - Update prospect with LinkedIn URL
- `saveEnrichmentResult()` - Save to enrichments collection

### 3. Routes (`enrichment.routes.ts`)

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/enrich` | Enrich single prospect |
| POST | `/api/enrich/batch` | Enrich multiple prospects |
| POST | `/api/test-keywords` | Test keyword generation |

## Data Flow

### Single Prospect Enrichment

```
1. Client sends POST /api/enrich with prospectId
         │
2. Fetch prospect data from Firestore
         │
3. Generate keywords (or use custom)
         │
4. Call Google Custom Search API
         │
5. Send results to OpenAI for evaluation
         │
6. Extract LinkedIn URL from OpenAI response
         │
7. Apply fallback if no URL found
         │
8. Update prospect in Firestore
         │
9. Save enrichment record to collection
         │
10. Return result to client
```

### Batch Enrichment

```
1. Client sends POST /api/enrich/batch with prospectIds[]
         │
2. Fetch all prospects in batch (Firestore batch read)
         │
3. For each prospect:
         ├─ Generate keywords
         ├─ Google Search
         ├─ OpenAI evaluation
         └─ Collect result
         │
4. Batch update all prospects (Firestore batch write)
         │
5. Save all enrichment records
         │
6. Return aggregated results to client
```

## Keyword Configuration

### Default Configuration

```typescript
{
  includeName: true,
  includeOrganization: true,
  includeTitle: false,
  includeLocation: false,
  additionalKeywords: ['site:linkedin.com/in']
}
```

**Generated:** `"John Doe" Acme Corp site:linkedin.com/in`

### Custom Template

```typescript
{
  customTemplate: "{name} works at {organization} as {title}"
}
```

**Generated:** `John Doe works at Acme Corp as CEO`

### Custom Keywords

```typescript
{
  customKeywords: "Jane Smith healthcare executive LinkedIn"
}
```

**Used as-is:** `Jane Smith healthcare executive LinkedIn`

## Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| `SUCCESS` | Found and validated LinkedIn URL | ✅ Use the URL |
| `FALLBACK_LINKEDIN_RESULT` | Used first LinkedIn result from Google | ⚠️ May need validation |
| `NO_GOOGLE_RESULTS` | Search returned nothing | ❌ Try different keywords |
| `GOOGLE_ERROR` | API call failed | ❌ Check API key/quota |
| `OPENAI_ERROR` | OpenAI call failed | ❌ Check API key/quota |
| `MODEL_NOT_AVAILABLE` | OpenAI says profile not available | ℹ️ Profile doesn't exist |
| `MODEL_AMBIGUOUS` | Multiple possible matches | ⚠️ Manual review needed |
| `NOT_FOUND` | Prospect not in Firestore | ❌ Invalid prospect ID |

## Environment Variables

### Required

```bash
OPENAI_API_KEY=sk-...           # OpenAI API key
GOOGLE_API_KEY=AIzaSy...        # Google API key
GOOGLE_CSE_ID=12413e62e1382465a # Programmable Search Engine ID
```

### Optional

```bash
PORT=4200                              # Server port
HOST=0.0.0.0                          # Server host
NODE_ENV=development                  # Environment
OPENAI_MODEL=gpt-4o-mini              # OpenAI model
CORS_ALLOWED_ORIGINS=http://localhost:3000  # CORS origins
```

### Firestore Auth (choose one)

```bash
# Option 1: ADC (Cloud Run, gcloud auth)
# No configuration needed

# Option 2: Service account JSON inline
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}

# Option 3: Service account JSON file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## API Usage Examples

### Enrich with default config

```bash
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"prospectId": "abc123"}'
```

### Enrich with custom config

```bash
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "abc123",
    "keywordConfig": {
      "includeName": true,
      "includeOrganization": true,
      "includeTitle": true
    }
  }'
```

### Batch enrich

```bash
curl -X POST http://localhost:4200/api/enrich/batch \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": ["id1", "id2", "id3"]
  }'
```

## Deployment Options

### Local Development

```bash
npm run dev
```

### Docker

```bash
docker build -t linkedin-enrichment-service .
docker run -p 4200:4200 --env-file .env linkedin-enrichment-service
```

### Cloud Run

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/linkedin-enrichment-service
gcloud run deploy linkedin-enrichment-service \
  --image gcr.io/PROJECT_ID/linkedin-enrichment-service \
  --platform managed \
  --region us-central1
```

## Monitoring

### Logs

All operations logged to stdout:

```
POST /api/enrich - 200 (1234ms)
[POST /enrich] Starting enrichment for prospect: abc123
[POST /enrich] Enrichment completed for abc123: SUCCESS
```

### Health Check

```bash
curl http://localhost:4200/api/health
# {"status":"healthy","timestamp":"...","service":"linkedin-enrichment-service"}
```

## Performance

- **Single enrichment**: ~2-5 seconds (Google + OpenAI)
- **Batch enrichment**: ~2-5 seconds per prospect (sequential)
- **Google API**: 100 queries/day on free tier
- **OpenAI API**: Rate limits vary by model and tier
- **Firestore**: 500 operations per batch write

## Use Cases

1. **Manual enrichment** - Enrich prospects on-demand via UI
2. **Scheduled enrichment** - Cron job hits batch endpoint
3. **Webhook integration** - Trigger enrichment on prospect creation
4. **Keyword testing** - Tune keyword strategies with `/test-keywords`
5. **Bulk import** - Enrich new prospects after CSV import

## Next Steps

1. **Read QUICKSTART.md** - Get service running in 5 minutes
2. **Read README.md** - Full API documentation
3. **Check examples.md** - Common use cases and curl commands
4. **Run test-service.sh** - Verify all endpoints work
5. **Customize keywords** - Modify `enrichment.service.ts` for your needs

## Questions?

- **How is this different from the Lambda?** No SQS, simpler deployment, HTTP-based
- **Can I use both?** Yes, they're independent services
- **Which should I use?** Lambda for scheduled batch jobs, this for on-demand enrichment
- **How do I customize keywords?** Use `keywordConfig` in request or modify service code
- **Where are results stored?** Both in `prospects` collection and `linkedin_enrichments` collection

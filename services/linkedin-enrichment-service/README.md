# LinkedIn Enrichment Service

Express.js microservice for enriching prospect data with LinkedIn profiles using Google Custom Search and OpenAI evaluation.

## Overview

This service provides a simple REST API for finding and validating LinkedIn profiles for prospects stored in Firestore. It uses:

- **Google Custom Search API** - To find potential LinkedIn profile matches
- **OpenAI GPT** - To evaluate search results and select the best match
- **Firestore** - To read prospect data and store enrichment results

Unlike the Lambda-based enrichment pipeline, this service operates as a standalone HTTP API with no SQS queues or complex orchestration. It's designed for flexibility and ease of integration.

## Features

- ✅ **Single prospect enrichment** - Enrich one prospect at a time via POST request
- ✅ **Batch enrichment** - Enrich multiple prospects in a single request
- ✅ **Prospect discovery** - Discover new prospects from Google search keywords (up to 100 results per search)
- ✅ **Configurable keyword generation** - Customize search queries per request
- ✅ **Custom keyword override** - Provide your own search query
- ✅ **Keyword testing endpoint** - Preview generated search queries without running enrichment
- ✅ **Comprehensive logging** - All operations logged to console for debugging
- ✅ **Firestore integration** - Automatic storage of results in both `prospects` and `linkedin_enrichments` collections
- ✅ **Detailed status codes** - Rich status information for each enrichment operation

## Installation

```bash
cd services/linkedin-enrichment-service
npm install
```

## Configuration

Copy the example environment file and configure your API keys:

```bash
cp .env.example .env
```

Edit `.env` and provide the following required variables:

```bash
# Required
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIzaSy...
GOOGLE_CSE_ID=your-cse-id

# Optional
PORT=4200
OPENAI_MODEL=gpt-4o-mini
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### Firestore Authentication

Choose one of three authentication methods:

**Option 1: Application Default Credentials (ADC)** - Recommended for Cloud Run
```bash
# No additional configuration needed
# Service will use the environment's default credentials
```

**Option 2: Service Account JSON (inline)**
```bash
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
```

**Option 3: Service Account JSON (file path)** - Recommended for local development
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Getting API Keys

**OpenAI API Key:**
1. Visit https://platform.openai.com/api-keys
2. Create a new API key
3. Copy to `.env` as `OPENAI_API_KEY`

**Google Custom Search API:**
1. Enable Custom Search API: https://console.cloud.google.com/apis/library/customsearch.googleapis.com
2. Create credentials: https://console.cloud.google.com/apis/credentials
3. Copy API key to `.env` as `GOOGLE_API_KEY`
4. Create Programmable Search Engine: https://programmablesearchengine.google.com/
5. Copy Search Engine ID to `.env` as `GOOGLE_CSE_ID`

## Usage

### Development

Start the service in development mode with hot reload:

```bash
npm run dev
```

The service will start on `http://localhost:4200` by default.

### Production

Build and run the compiled TypeScript:

```bash
npm run build
npm start
```

## API Endpoints

### Health Check

**GET** `/api/health`

Check if the service is running.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "linkedin-enrichment-service"
}
```

---

### Enrich Single Prospect

**POST** `/api/enrich`

Enrich a single prospect with LinkedIn profile data.

**Request Body:**
```json
{
  "prospectId": "firestore-doc-id",
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "includeTitle": false,
    "includeLocation": false,
    "additionalKeywords": ["site:linkedin.com/in"]
  },
  "customKeywords": "John Doe Acme Corp LinkedIn"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prospectId` | string | Yes | Firestore document ID of the prospect |
| `keywordConfig` | object | No | Configuration for keyword generation (see below) |
| `customKeywords` | string | No | Custom search query (bypasses keyword generation) |

**Keyword Configuration:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `includeName` | boolean | true | Include prospect's name in search |
| `includeOrganization` | boolean | true | Include organization/company name |
| `includeTitle` | boolean | false | Include job title |
| `includeLocation` | boolean | false | Include location |
| `customTemplate` | string | - | Custom template with placeholders: `{name}`, `{organization}`, `{title}`, `{location}` |
| `additionalKeywords` | string[] | `["site:linkedin.com/in"]` | Static keywords to append |

**Response:**
```json
{
  "success": true,
  "result": {
    "prospectId": "abc123",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "status": "SUCCESS",
    "keywords": "\"John Doe\" Acme Corp site:linkedin.com/in",
    "notes": "Successfully enriched",
    "openaiResponse": "{\"linkedin_url\":\"...\",\"confidence\":0.95}",
    "googleResults": [...]
  },
  "enrichmentId": "xyz789"
}
```

**Status Codes:**

| Status | Description |
|--------|-------------|
| `SUCCESS` | Successfully found and validated LinkedIn profile |
| `FALLBACK_LINKEDIN_RESULT` | Used first LinkedIn result from Google (OpenAI didn't select one) |
| `FALLBACK_FIRST_LINK` | Used first Google result (no LinkedIn domain found) |
| `MODEL_NOT_AVAILABLE` | OpenAI determined profile is not available |
| `MODEL_AMBIGUOUS` | Multiple possible matches found |
| `NO_GOOGLE_RESULTS` | Google search returned no results |
| `MISSING_KEYWORDS` | Could not generate keywords from prospect data |
| `GOOGLE_ERROR` | Error calling Google Custom Search API |
| `OPENAI_ERROR` | Error calling OpenAI API |
| `OPENAI_NO_JSON` | OpenAI response was not valid JSON |
| `OPENAI_NO_LINK` | OpenAI response didn't contain a LinkedIn URL |
| `NOT_FOUND` | Prospect document not found in Firestore |

---

### Enrich Batch

**POST** `/api/enrich/batch`

Enrich multiple prospects in a single request.

**Request Body:**
```json
{
  "prospectIds": ["id1", "id2", "id3"],
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "additionalKeywords": ["site:linkedin.com/in"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "total": 3,
  "processed": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    {
      "prospectId": "id1",
      "linkedinUrl": "https://linkedin.com/in/person1",
      "status": "SUCCESS",
      "keywords": "..."
    },
    {
      "prospectId": "id2",
      "linkedinUrl": "https://linkedin.com/in/person2",
      "status": "SUCCESS",
      "keywords": "..."
    },
    {
      "prospectId": "id3",
      "linkedinUrl": null,
      "status": "NO_GOOGLE_RESULTS",
      "keywords": "..."
    }
  ]
}
```

---

### Test Keywords

**POST** `/api/test-keywords`

Test keyword generation without running enrichment. Useful for debugging and tuning keyword configurations.

**Request Body:**
```json
{
  "prospectId": "firestore-doc-id",
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "customTemplate": "{name} works at {organization}"
  }
}
```

**Response:**
```json
{
  "success": true,
  "prospectId": "abc123",
  "prospectData": {
    "name": "John Doe",
    "organization": "Acme Corp",
    "title": "CEO"
  },
  "keywords": "John Doe works at Acme Corp"
}
```

---

### Discover Prospects

**POST** `/api/discover-prospects`

Discover new prospects by searching Google with custom keywords. Creates new prospect records in Firestore.

**Request Body:**
```json
{
  "keywords": "software engineer San Francisco site:linkedin.com/in",
  "maxResults": 50,
  "batchId": "my-custom-batch-id"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keywords` | string | Yes | Google search query |
| `maxResults` | number | No | Number of results to fetch (1-100, default: 10) |
| `batchId` | string | No | Custom batch ID (auto-generated if not provided) |

**Response:**
```json
{
  "success": true,
  "batchId": "batch_1234567890",
  "keywords": "software engineer San Francisco site:linkedin.com/in",
  "prospectsCreated": 48,
  "prospectsFailed": 2,
  "totalAttempted": 50,
  "prospectIds": ["id1", "id2", "..."],
  "errors": [
    {
      "index": 5,
      "error": "Failed to parse snippet"
    }
  ]
}
```

**Notes:**
- Google Custom Search API has a hard limit of **100 results per query**
- For more prospects, run multiple searches with different keywords
- Prospects are automatically saved to Firestore with `batch_id` field
- OpenAI extracts: name, title, organization, location, LinkedIn URL from snippets

---

### Get All Prospects

**GET** `/api/prospects`

Retrieve all prospects with optional filtering.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Maximum number of results (default: 100) |
| `status` | string | No | Filter by enrichment status (e.g., "pending", "completed") |
| `batch_id` | string | No | Filter by batch ID |

**Response:**
```json
{
  "success": true,
  "count": 5,
  "prospects": [
    {
      "id": "abc123",
      "name": "John Doe",
      "organization": "Acme Corp",
      "title": "CEO",
      "social": {
        "linkedin": {
          "primary": "https://linkedin.com/in/johndoe",
          "status": "discovered"
        }
      },
      "batch_id": "batch_123",
      "enrichment": {
        "status": "pending"
      }
    }
  ]
}
```

**Examples:**
```bash
# Get first 10 prospects
curl http://localhost:4200/api/prospects?limit=10

# Get pending prospects
curl "http://localhost:4200/api/prospects?status=pending"

# Get prospects from a specific batch
curl "http://localhost:4200/api/prospects?batch_id=batch_123"
```

---

### Get Single Prospect

**GET** `/api/prospects/:id`

Retrieve a single prospect by ID.

**Response:**
```json
{
  "success": true,
  "prospect": {
    "id": "abc123",
    "name": "John Doe",
    "organization": "Acme Corp",
    "title": "CEO",
    "social": {
      "linkedin": {
        "primary": "https://linkedin.com/in/johndoe",
        "status": "discovered"
      }
    }
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Not found",
  "message": "Prospect with ID abc123 not found"
}
```

---

### Get All Batches

**GET** `/api/batches`

Retrieve all batch discovery records.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Maximum number of results (default: 100) |
| `status` | string | No | Filter by batch status (e.g., "completed", "in_progress") |

**Response:**
```json
{
  "success": true,
  "count": 2,
  "batches": [
    {
      "id": "batch_123",
      "batch_id": "batch_123",
      "keywords": "software engineer San Francisco",
      "max_results": 10,
      "prospects_created": 8,
      "prospects_failed": 2,
      "total_attempted": 10,
      "status": "completed",
      "prospect_ids": ["id1", "id2", "..."],
      "created_at": "2024-01-01T00:00:00.000Z",
      "completed_at": "2024-01-01T00:01:00.000Z"
    }
  ]
}
```

---

### Get Single Batch

**GET** `/api/batches/:id`

Retrieve a single batch by ID.

**Response:**
```json
{
  "success": true,
  "batch": {
    "id": "batch_123",
    "batch_id": "batch_123",
    "keywords": "software engineer San Francisco",
    "prospects_created": 8,
    "prospects_failed": 2,
    "status": "completed",
    "prospect_ids": ["id1", "id2", "..."]
  }
}
```

---

### Get Prospects by Batch

**GET** `/api/batches/:id/prospects`

Retrieve all prospects for a specific batch.

**Response:**
```json
{
  "success": true,
  "batchId": "batch_123",
  "count": 8,
  "prospects": [
    {
      "id": "id1",
      "name": "John Doe",
      "organization": "Acme Corp",
      "batch_id": "batch_123"
    }
  ]
}
```

## Keyword Configuration Examples

### Default Configuration
Uses name + organization + LinkedIn site filter:
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "additionalKeywords": ["site:linkedin.com/in"]
  }
}
```
**Generated:** `"John Doe" Acme Corp site:linkedin.com/in`

### Include Title and Location
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "includeTitle": true,
    "includeLocation": true
  }
}
```
**Generated:** `"John Doe" Acme Corp CEO San Francisco`

### Custom Template
```json
{
  "keywordConfig": {
    "customTemplate": "{name} {title} at {organization} LinkedIn profile"
  }
}
```
**Generated:** `John Doe CEO at Acme Corp LinkedIn profile`

### Healthcare-Specific Example
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "additionalKeywords": ["healthcare", "site:linkedin.com/in"]
  }
}
```
**Generated:** `"Jane Smith" Memorial Hospital healthcare site:linkedin.com/in`

## Data Storage

### Firestore Collections

**1. `prospects` collection (updated)**

The service updates existing prospect documents with enrichment results:

```javascript
{
  // Existing prospect fields...
  "enrichment": {
    "linkedin_status": "SUCCESS",
    "linkedin_last_run_at": Timestamp,
    "linkedin_updated_at": Timestamp,
    "notes": "Optional notes",
    "linkedin_evaluation": "Raw OpenAI response JSON",
    "linkedin_results": "Raw Google results JSON"
  },
  "social": {
    "linkedin": {
      "primary": "https://linkedin.com/in/johndoe",
      "status": "SUCCESS"
    }
  }
}
```

**2. `linkedin_enrichments` collection (created)**

A separate collection for historical tracking:

```javascript
{
  "prospectId": "abc123",
  "linkedinUrl": "https://linkedin.com/in/johndoe",
  "status": "SUCCESS",
  "keywords": "\"John Doe\" Acme Corp site:linkedin.com/in",
  "notes": "...",
  "openaiResponse": "...",
  "googleResults": "[...]",
  "createdAt": Timestamp
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Express.js Server                       │
│                 (linkedin-enrichment-service)            │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
  ┌──────────┐    ┌──────────────┐   ┌──────────┐
  │  Routes  │    │  Enrichment  │   │Firestore │
  │  Layer   │───▶│   Service    │◀─▶│ Service  │
  └──────────┘    └──────────────┘   └──────────┘
                         │                  │
              ┌──────────┴────────┐        │
              │                   │        │
              ▼                   ▼        ▼
      ┌─────────────┐     ┌───────────┐  ┌──────────┐
      │   Google    │     │  OpenAI   │  │Firestore │
      │Custom Search│     │    API    │  │    DB    │
      └─────────────┘     └───────────┘  └──────────┘
```

### Service Layers

**1. Routes Layer** (`src/routes/enrichment.routes.ts`)
- HTTP request validation
- Request/response formatting
- Error handling

**2. Enrichment Service** (`src/services/enrichment.service.ts`)
- Keyword generation logic
- Google Custom Search integration
- OpenAI evaluation
- Fallback strategies

**3. Firestore Service** (`src/services/firestore.service.ts`)
- Reading prospect data
- Writing enrichment results
- Batch operations

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Validation error (invalid request body)
- `404` - Prospect not found
- `500` - Internal server error (API failures, Firestore errors)

## Development

### Project Structure

```
linkedin-enrichment-service/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── services/
│   │   ├── enrichment.service.ts   # Core enrichment logic
│   │   └── firestore.service.ts    # Firestore operations
│   └── routes/
│       └── enrichment.routes.ts    # API endpoints
├── .env.example                     # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

### Adding Custom Keyword Strategies

To add new keyword generation strategies, modify `generateKeywords()` in `enrichment.service.ts`:

```typescript
generateKeywords(prospect: ProspectData, config: KeywordConfig): string {
  // Add your custom logic here
  if (config.customStrategy === 'industry-specific') {
    // Custom keyword generation
  }
  // ... existing logic
}
```

### Customizing OpenAI Prompts

The default OpenAI prompt can be found in `enrichment.service.ts`. To customize:

1. Modify `DEFAULT_OPENAI_PROMPT` constant
2. Or pass a custom prompt to `evaluateWithOpenAI()`

## Deployment

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 4200
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t linkedin-enrichment-service .
docker run -p 4200:4200 --env-file .env linkedin-enrichment-service
```

### Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/<PROJECT_ID>/linkedin-enrichment-service

# Deploy
gcloud run deploy linkedin-enrichment-service \
  --image gcr.io/<PROJECT_ID>/linkedin-enrichment-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=sk-...,GOOGLE_API_KEY=...,GOOGLE_CSE_ID=...
```

## Monitoring & Debugging

### Logs

All operations are logged to stdout:

```
✅ Environment validation passed
🔧 Initializing services...
✅ Services initialized
🚀 LinkedIn Enrichment Service is running!

POST /api/enrich - 200 (1234ms)
[POST /enrich] Starting enrichment for prospect: abc123
[POST /enrich] Enrichment completed for abc123: SUCCESS
```

### Testing Keywords

Use the `/api/test-keywords` endpoint to preview generated search queries:

```bash
curl -X POST http://localhost:4200/api/test-keywords \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "abc123",
    "keywordConfig": {
      "includeName": true,
      "includeTitle": true
    }
  }'
```

## Performance Considerations

- **Google Custom Search API** - Limited to 100 queries/day on free tier, 100 results max per query
- **OpenAI API** - Rate limits vary by model and tier
- **Firestore** - Batch operations limited to 500 documents
- **Batch Enrichment** - Process 10-50 prospects per request for best performance
- **Prospect Discovery** - Maximum 100 results per search query (Google API constraint)

## Troubleshooting

**Service won't start:**
- Check that all required environment variables are set
- Verify API keys are valid
- Ensure Firestore credentials are properly configured

**No Google results:**
- Verify `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` are correct
- Check Google Custom Search quota
- Try simplifying the search query (use `/api/test-keywords`)

**OpenAI errors:**
- Verify `OPENAI_API_KEY` is valid
- Check OpenAI API rate limits and quota
- Try switching to a different model

**Firestore errors:**
- Verify service account has Firestore permissions
- Check Firestore rules allow reads/writes
- Ensure collection names match (`prospects`, `linkedin_enrichments`)

## License

This service is part of the LinkedIn Enrichment Backend monorepo.

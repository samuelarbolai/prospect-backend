# LinkedIn Enrichment Service - Context for Code Agent

## Project Overview

The **LinkedIn Enrichment Service** is an Express.js microservice that enriches prospect data with LinkedIn profiles using Google Custom Search and OpenAI. It provides REST API endpoints for:

1. **Single prospect enrichment** - Find LinkedIn profiles for existing prospects
2. **Batch enrichment** - Enrich multiple prospects at once
3. **Direct enrichment** - Enrich prospect data without Firestore lookup
4. **Prospect discovery** - Discover new prospects from Google search keywords
5. **Keyword testing** - Preview generated search queries
6. **Prospect retrieval** - Get prospects with filtering (all, by ID, by batch, by status)
7. **Batch retrieval** - Get batches with filtering (all, by ID, by status)

**Technology Stack:**
- **Runtime:** Node.js 22+ with TypeScript (ES Modules)
- **Framework:** Express.js 4.x
- **Database:** Google Cloud Firestore
- **APIs:** OpenAI GPT-4o-mini, Google Custom Search API
- **Authentication:** Firebase Admin SDK

## Project Architecture (Flow)

```
┌─────────────────────────────────────────────────────────┐
│              Express.js Server (Port 4200)               │
│                   src/index.ts                           │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
  ┌──────────┐    ┌──────────────┐   ┌──────────┐
  │  Routes  │    │  Services    │   │  Models  │
  │  Layer   │───▶│    Layer     │◀─▶│  Layer   │
  └──────────┘    └──────────────┘   └──────────┘
                         │
              ┌──────────┼────────┐
              │          │        │
              ▼          ▼        ▼
      ┌─────────────┐ ┌───────┐ ┌──────────┐
      │   Google    │ │OpenAI │ │Firestore │
      │Custom Search│ │  API  │ │    DB    │
      └─────────────┘ └───────┘ └──────────┘
```

### Request Flow Examples

**1. Discover Prospects Flow:**
```
POST /api/discover-prospects
  ↓
enrichment.routes.ts
  ↓
batch.service.createBatch() → Create batch record
  ↓
enrichment.service.fetchGoogleResults() → Search Google
  ↓
snippet-parser.service.parseSnippetsWithErrors() → Parse with OpenAI
  ↓
batch.service.createProspect() → Save each prospect
  ↓
batch.service.completeBatch() → Update batch status
  ↓
Response: { batchId, prospectsCreated, prospectIds }
```

**2. Enrich Prospect Flow:**
```
POST /api/enrich
  ↓
enrichment.routes.ts
  ↓
firestore.service.getProspect() → Fetch prospect data
  ↓
enrichment.service.enrichProspect() → Generate keywords, search Google, evaluate with OpenAI
  ↓
firestore.service.saveEnrichmentResult() → Save to linkedin_enrichments
  ↓
firestore.service.updateProspectEnrichment() → Update prospect document
  ↓
Response: { result, enrichmentId }
```

## Project Modules

### Core Modules

1. **src/index.ts** - Main entry point, server initialization
2. **src/routes/** - API route handlers
3. **src/services/** - Business logic layer
4. **src/models/** - TypeScript interfaces for Firestore documents
5. **src/types/** - Shared TypeScript types
6. **src/utils/** - Utility functions

### Module Structure

```
src/
├── index.ts                              # Server entry point
├── routes/
│   └── enrichment.routes.ts              # All API endpoints
├── services/
│   ├── enrichment.service.ts             # LinkedIn enrichment logic
│   ├── firestore.service.ts              # Firestore operations
│   ├── batch.service.ts                  # Batch/prospect creation
│   └── snippet-parser.service.ts         # OpenAI snippet parsing
├── models/
│   ├── index.ts                          # Model exports
│   ├── prospect.model.ts                 # Prospect document schema
│   ├── batch.model.ts                    # Batch document schema
│   └── enrichment.model.ts               # Enrichment document schema
├── types/
│   └── index.ts                          # Shared types
└── utils/                                # Utility functions (if any)
```

## Module Overviews

### 1. Routes Layer (`src/routes/enrichment.routes.ts`)

**Purpose:** HTTP request handling and validation

**Endpoints:**
- `GET /api/health` - Health check
- `POST /api/enrich` - Enrich single prospect by ID
- `POST /api/enrich/batch` - Enrich multiple prospects
- `POST /api/enrich-direct` - Enrich without Firestore lookup
- `POST /api/test-keywords` - Test keyword generation
- `POST /api/discover-prospects` - Discover new prospects from search
- `GET /api/prospects` - Get all prospects (with filters: limit, status, batch_id)
- `GET /api/prospects/:id` - Get single prospect by ID
- `GET /api/batches` - Get all batches (with filters: limit, status)
- `GET /api/batches/:id` - Get single batch by ID
- `GET /api/batches/:id/prospects` - Get all prospects for a batch

**Key Responsibilities:**
- Request validation
- Error handling
- Response formatting
- Service orchestration

### 2. Enrichment Service (`src/services/enrichment.service.ts`)

**Purpose:** Core LinkedIn enrichment logic

**Key Methods:**
- `enrichProspect()` - Main enrichment workflow
- `generateKeywords()` - Create search queries from prospect data
- `fetchGoogleResults()` - Call Google Custom Search API
- `evaluateWithOpenAI()` - Use GPT to select best LinkedIn match
- `selectFallbackLinkedIn()` - Fallback selection logic

**Fallback Strategy:**
1. OpenAI selects best match
2. If no selection, use first LinkedIn domain result
3. If no LinkedIn, use first Google result
4. If no results, return failure status

### 3. Firestore Service (`src/services/firestore.service.ts`)

**Purpose:** Database operations

**Key Methods:**
- `getProspect(id)` - Fetch prospect by ID
- `saveEnrichmentResult(result)` - Save to linkedin_enrichments collection
- `updateProspectEnrichment(id, result)` - Update prospect document
- `batchGetProspects(ids)` - Fetch multiple prospects

**Collections Used:**
- `prospects` - Main prospect data
- `linkedin_enrichments` - Enrichment history
- `batches` - Batch discovery records

### 4. Batch Service (`src/services/batch.service.ts`)

**Purpose:** Batch and prospect creation for discovery workflow

**Key Methods:**
- `generateBatchId()` - Create unique batch ID
- `createBatch(id, keywords, maxResults)` - Initialize batch record
- `createProspect(data, batchId)` - Save new prospect
- `completeBatch(id, created, failed, ids)` - Update batch completion

### 5. Snippet Parser Service (`src/services/snippet-parser.service.ts`)

**Purpose:** Parse Google search snippets with OpenAI

**Key Methods:**
- `parseSnippetsWithErrors(results)` - Extract prospect data from snippets
- Uses OpenAI to extract: name, title, organization, location, LinkedIn URL

## Module Files

### src/index.ts
**Purpose:** Application entry point
- Validates environment variables
- Initializes services (Firestore, Enrichment, Batch, SnippetParser)
- Creates Express app with CORS
- Mounts routes at `/api`
- Starts server on PORT (default: 4200)

**Recent Changes:**
- Added SnippetParserService initialization
- Added BatchService initialization
- Added discover-prospects endpoint to startup logs

### src/routes/enrichment.routes.ts
**Purpose:** All API route handlers
- Implements 11 endpoints (6 POST, 5 GET)
- Request validation with detailed error messages
- Comprehensive logging for debugging

**Recent Changes:**
- Added `/discover-prospects` endpoint (lines 487-611)
- Added 5 GET endpoints for retrieving prospects and batches:
  - `GET /prospects` - Get all prospects with filtering
  - `GET /prospects/:id` - Get single prospect
  - `GET /batches` - Get all batches
  - `GET /batches/:id` - Get single batch
  - `GET /batches/:id/prospects` - Get prospects by batch
- Integrates Google search → OpenAI parsing → Firestore storage

### src/services/enrichment.service.ts
**Purpose:** LinkedIn enrichment business logic
- Keyword generation with configurable templates
- Google Custom Search integration
- OpenAI evaluation with structured prompts
- Fallback selection strategies

**Recent Changes:**
- Made `fetchGoogleResults()` public for discovery endpoint
- Supports custom keyword templates

### src/services/firestore.service.ts
**Purpose:** Firestore database operations
- Handles all Firestore reads/writes
- Supports three auth methods: ADC, JSON inline, file path
- Batch operations for multiple prospects

**Recent Changes:**
- Stable, no recent changes

### src/services/batch.service.ts
**Purpose:** Batch and prospect management
- Creates batch records in `batches` collection
- Creates prospect documents in `prospects` collection
- Tracks batch completion status

**Recent Changes:**
- Created for discover-prospects feature
- Generates unique batch IDs with timestamp

### src/services/snippet-parser.service.ts
**Purpose:** OpenAI-powered snippet parsing
- Extracts structured prospect data from Google snippets
- Returns both successful parses and errors
- Uses GPT-4o-mini for cost efficiency

**Recent Changes:**
- Created for discover-prospects feature
- Handles parsing errors gracefully

### src/models/*.ts
**Purpose:** TypeScript interfaces for Firestore documents
- `prospect.model.ts` - ProspectDocument, ProspectFromSnippet
- `batch.model.ts` - BatchDocument, CreateBatchRequest
- `enrichment.model.ts` - EnrichmentDocument, EnrichmentRunDocument

**Recent Changes:**
- Added `batch_id` field to ProspectDocument
- Added ProspectFromSnippet interface

### src/types/index.ts
**Purpose:** Shared TypeScript types
- GoogleSearchResult
- EnrichmentResult
- KeywordConfig
- ProspectData

**Recent Changes:**
- Stable, no recent changes

## Building and Running

### Prerequisites
- Node.js 22+
- npm or yarn
- Google Cloud Firestore database
- OpenAI API key
- Google Custom Search API key and CSE ID
- Firebase service account credentials

### Environment Variables

Required in `.env`:
```bash
# Required
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIzaSy...
GOOGLE_CSE_ID=your-cse-id

# Optional
PORT=4200
OPENAI_MODEL=gpt-4o-mini
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Firestore Auth (choose one)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# OR
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
```

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode (hot reload)
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start
```

### Testing

```bash
# Health check
curl http://localhost:4200/api/health

# Discover prospects
curl -X POST http://localhost:4200/api/discover-prospects \
  -H "Content-Type: application/json" \
  -d '{"keywords": "software engineer San Francisco site:linkedin.com/in", "maxResults": 3}'

# Enrich prospect
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"prospectId": "abc123"}'

# Get all prospects
curl http://localhost:4200/api/prospects?limit=10

# Get prospects by batch
curl "http://localhost:4200/api/prospects?batch_id=batch_123"

# Get single prospect
curl http://localhost:4200/api/prospects/abc123

# Get all batches
curl http://localhost:4200/api/batches?limit=10

# Get batch with prospects
curl http://localhost:4200/api/batches/batch_123/prospects
```

## Development Conventions

### Language
- **TypeScript 5.6+** with strict mode
- **ES Modules** (type: "module" in package.json)
- **Async/await** for asynchronous operations

### Code Style
- Use explicit types, avoid `any`
- Prefer interfaces over types for objects
- Use optional chaining (`?.`) for nested properties
- Use nullish coalescing (`??`) for defaults

### Logging
- Use `console.log()` for info
- Use `console.error()` for errors
- Prefix logs with endpoint/function name: `[POST /enrich]`
- Log key operations: start, completion, errors

### Error Handling
- Try-catch blocks in all route handlers
- Return structured error responses: `{ success: false, error, message }`
- Continue on non-critical errors (e.g., Firestore save failures)

### API Documentation
- JSDoc comments on all public functions
- Inline comments in route handlers explaining request/response format
- See README.md for full API documentation

## CI/CD

### Deployment

**Current Status:** Manual deployment

**Deployment Options:**

1. **Cloud Run (Recommended)**
```bash
# Build container
gcloud builds submit --tag gcr.io/<PROJECT_ID>/linkedin-enrichment-service

# Deploy
gcloud run deploy linkedin-enrichment-service \
  --image gcr.io/<PROJECT_ID>/linkedin-enrichment-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=...,GOOGLE_API_KEY=...,GOOGLE_CSE_ID=...
```

2. **Docker**
```bash
docker build -t linkedin-enrichment-service .
docker run -p 4200:4200 --env-file .env linkedin-enrichment-service
```

### GitHub Actions
- No automated CI/CD currently configured
- See `backend/.github/workflows/` for Lambda deployment workflows (separate services)

## Next Steps

### Completed Features
✅ Single prospect enrichment
✅ Batch enrichment
✅ Direct enrichment (no Firestore lookup)
✅ Keyword testing endpoint
✅ Prospect discovery from Google search
✅ Batch tracking in Firestore
✅ GET endpoints for prospects (all, by ID, by batch, with filters)
✅ GET endpoints for batches (all, by ID, with prospects)

### Potential Enhancements
- [ ] Add rate limiting for API endpoints
- [ ] Implement caching for Google search results
- [ ] Add webhook support for async enrichment
- [ ] Create admin endpoints for batch management
- [ ] Add metrics/monitoring (Prometheus, DataDog)
- [ ] Implement retry logic for failed enrichments
- [ ] Add unit tests (Jest/Vitest)
- [ ] Add integration tests
- [ ] Set up GitHub Actions for automated deployment
- [ ] Add API authentication (JWT, API keys)

### Known Issues
- One prospect failed in testing due to undefined `organization` field (Firestore validation)
  - Solution: Enable `ignoreUndefinedProperties` in Firestore settings or filter undefined values
- No automated tests yet
- No rate limiting on endpoints

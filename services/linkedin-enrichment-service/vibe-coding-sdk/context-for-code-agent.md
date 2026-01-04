# LinkedIn Enrichment Service - Context for Code Agent

**Last Verified:** December 30, 2024
**Service Version:** 1.0.0
**Status:** Production Ready

## Project Overview

The **LinkedIn Enrichment Service** is an Express.js microservice that enriches prospect data with LinkedIn profiles using Google Custom Search and OpenAI. It provides REST API endpoints for:

1. **Single prospect enrichment** - Find LinkedIn profiles for existing prospects
2. **Batch enrichment** - Enrich multiple prospects at once
3. **Direct enrichment** - Enrich prospect data without Firestore lookup
4. **Prospect discovery** - Discover new prospects from Google search keywords
5. **Keyword testing** - Preview generated search queries
6. **Prospect retrieval** - Get prospects with filtering (all, by ID, by batch, by status)
7. **Batch retrieval** - Get batches with filtering (all, by ID, by status)
8. **Web interface** - Browser-based UI for testing all endpoints (`interface.html`)

**Technology Stack:**
- **Runtime:** Node.js 18+ with TypeScript (ES Modules)
- **Framework:** Express.js 4.x
- **Database:** Google Cloud Firestore
- **APIs:** OpenAI GPT-4o-mini, Google Custom Search API
- **Authentication:** Firebase Admin SDK

## Quick Links

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Complete API documentation and usage guide |
| [QUICKSTART.md](../QUICKSTART.md) | Quick start guide for new developers |
| [SERVICE_OVERVIEW.md](../SERVICE_OVERVIEW.md) | High-level service architecture overview |
| [examples.md](../examples.md) | API usage examples and sample requests |
| [GET_ENDPOINTS_TEST_RESULTS.md](../GET_ENDPOINTS_TEST_RESULTS.md) | Test results for GET endpoints |
| [data_model_schema.md](data_model_schema.md) | Firestore collections and document schemas |
| [current-plan.md](current-plan.md) | Project roadmap and future enhancements |
| [deployment-commands.md](deployment-commands.md) | Deployment history and working commands |
| [interface.html](../interface.html) | Web-based testing interface |

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
- `GET /` - Service metadata and endpoint listing
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
- Creates Express app with CORS and JSON body parser (10mb limit)
- Serves static files from root directory (for interface.html)
- Adds request logging middleware
- Mounts routes at `/api`
- Provides root endpoint (`GET /`) with service metadata
- Global error handler and 404 handler
- Starts server on PORT (default: 4200)

**Recent Changes:**
- Added SnippetParserService initialization
- Added BatchService initialization
- Added static file serving middleware (line 84)
- Added request logging middleware (lines 86-94)
- Added root endpoint with service metadata (lines 106-121)
- Added 404 and global error handlers (lines 124-139)

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

## Additional Files

### interface.html
**Purpose:** Browser-based web interface for testing all API endpoints
**Location:** Root directory
**Features:**
- Interactive UI for all 12 endpoints
- Pre-filled example requests
- Response visualization with JSON formatting
- No authentication required (development mode)
- Served via static file middleware in index.ts

**Access:** Navigate to `http://localhost:4200/` when service is running

**Recent Changes:**
- Created for easier API testing during development
- Provides visual feedback for all endpoint types

### test-service.sh
**Purpose:** Comprehensive bash script to test all endpoints
**Location:** Root directory
**Features:**
- Tests all 11 API endpoints sequentially
- Color-coded output (green for success, red for errors)
- JSON response formatting with jq
- Creates test data and cleans up after

**Usage:**
```bash
chmod +x test-service.sh
./test-service.sh
```

### test-quick.sh
**Purpose:** Quick health check script
**Location:** Root directory
**Features:**
- Fast service health verification
- Tests root endpoint and health check
- Minimal output for CI/CD

**Usage:**
```bash
chmod +x test-quick.sh
./test-quick.sh
```

### GET_ENDPOINTS_TEST_RESULTS.md
**Purpose:** Documentation of GET endpoint test results
**Location:** Root directory
**Contains:**
- Test results for all 5 GET endpoints
- Sample responses
- Query parameter examples
- Verification of filtering functionality

### .dockerignore
**Purpose:** Excludes files from Docker image
**Excludes:**
- node_modules
- dist
- .env
- Test files and scripts
- Documentation

### Dockerfile
**Purpose:** Container definition for deployment
**Features:**
- Multi-stage build (not currently used, single stage)
- Node.js 20 alpine base
- Production dependencies only
- Runs on port 4200
- Sets NODE_ENV=production

**Build:**
```bash
docker build -t linkedin-enrichment-service .
```

## Building and Running

### Prerequisites
- Node.js 18+ (recommended: 20 or 22)
- npm or yarn
- Google Cloud Firestore database
- OpenAI API key
- Google Custom Search API key and CSE ID
- Firebase service account credentials (or Application Default Credentials)

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

**Option 1: Web Interface (Recommended)**
```bash
# Start the service
npm run dev

# Open browser and navigate to:
http://localhost:4200/

# Use the interactive UI to test all endpoints
```

**Option 2: Test Scripts**
```bash
# Comprehensive test suite (all endpoints)
./test-service.sh

# Quick health check
./test-quick.sh
```

**Option 3: Manual curl Commands**
```bash
# Service metadata
curl http://localhost:4200/

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

**Test Results Documentation:**
See [GET_ENDPOINTS_TEST_RESULTS.md](../GET_ENDPOINTS_TEST_RESULTS.md) for detailed test results.

## Development Conventions

### Language
- **TypeScript 5.6+** with strict mode
- **ES Modules** (type: "module" in package.json)
- **Async/await** for asynchronous operations
- **Compiler Options:**
  - Target: ES2022
  - Module: ES2022
  - Module Resolution: bundler
  - Strict mode enabled
  - Source maps and declarations enabled

### Linting
- No explicit linter configured (ESLint/Prettier not in package.json)
- TypeScript compiler handles basic linting via strict mode
- Consider adding ESLint + Prettier for production

### Formatting
- No automated formatter currently configured
- Manual formatting conventions:
  - 2 spaces for indentation
  - Single quotes preferred
  - Semicolons required

### Code Style
- Use explicit types, avoid `any`
- Prefer interfaces over types for objects
- Use optional chaining (`?.`) for nested properties
- Use nullish coalescing (`??`) for defaults
- Async/await over promises
- Destructuring for cleaner code

### Logging
- Use `console.log()` for info
- Use `console.error()` for errors
- Prefix logs with endpoint/function name: `[POST /enrich]`
- Log key operations: start, completion, errors
- Request/response logging middleware active (duration tracking)
- **TODO:** Consider migrating to structured logging (winston/pino)

### Error Handling
- Try-catch blocks in all route handlers
- Return structured error responses: `{ success: false, error, message }`
- Continue on non-critical errors (e.g., Firestore save failures)
- Global error handler catches unhandled errors
- 404 handler for unknown routes

### Testing
- **Current:** Manual testing only
- Test scripts: `test-service.sh`, `test-quick.sh`
- No unit tests or integration tests yet
- `npm test` returns placeholder message
- **TODO:** Add Vitest or Jest test suite

### API Documentation
- JSDoc comments on all public functions
- Inline comments in route handlers explaining request/response format
- Zod schemas for request validation
- See [README.md](../README.md) for full API documentation
- See [examples.md](../examples.md) for usage examples

## CI/CD

### GitHub Actions
- **Status:** No automated CI/CD currently configured for this service
- Other services in the monorepo use GitHub Actions (see `backend/.github/workflows/deploy-lambdas.yml`)
- **TODO:** Create GitHub Actions workflow for automated Cloud Run deployment

### Deployment

**Current Status:** Manual deployment

**Deployment Options:**

1. **Cloud Run (Recommended)**

**Using gcloud CLI:**
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

**Using Dockerfile:**
```bash
# Build image
docker build -t gcr.io/<PROJECT_ID>/linkedin-enrichment-service .

# Push to GCR
docker push gcr.io/<PROJECT_ID>/linkedin-enrichment-service

# Deploy to Cloud Run
gcloud run deploy linkedin-enrichment-service \
  --image gcr.io/<PROJECT_ID>/linkedin-enrichment-service \
  --platform managed \
  --region us-central1
```

2. **Docker (Local/Any Host)**
```bash
# Build image
docker build -t linkedin-enrichment-service .

# Run container
docker run -p 4200:4200 --env-file .env linkedin-enrichment-service

# Or with environment variables
docker run -p 4200:4200 \
  -e OPENAI_API_KEY=... \
  -e GOOGLE_API_KEY=... \
  -e GOOGLE_CSE_ID=... \
  linkedin-enrichment-service
```

3. **Direct Node.js Deployment**
```bash
# Build TypeScript
npm run build

# Run production server
npm start
```

### Deployment Commands That Have Worked

See [deployment-commands.md](deployment-commands.md) for detailed deployment history and commands that have been tested successfully.

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

### Known Issues & Limitations

1. **Undefined Field Validation** - ✅ FIXED
   - **Issue:** Firestore rejects `undefined` values in documents
   - **Fix:** Implemented filtering of undefined values before saving to Firestore
   - **Location:** [batch.service.ts](../src/services/batch.service.ts) - filters undefined fields when creating prospects

2. **Google Custom Search API Limit**
   - **Issue:** Hard limit of 100 results per query
   - **Impact:** Cannot discover more than 100 prospects per search
   - **Workaround:** Run multiple searches with different keywords
   - **Status:** Google API constraint, not a service limitation

3. **No Automated Tests**
   - **Issue:** No unit or integration tests
   - **Impact:** Manual testing required for all changes
   - **Priority:** Medium
   - **TODO:** Add Vitest/Jest test suite

4. **No Rate Limiting**
   - **Issue:** No rate limiting on API endpoints
   - **Impact:** Potential abuse or cost overruns
   - **Priority:** High for production deployment
   - **TODO:** Add express-rate-limit middleware

5. **No Authentication**
   - **Issue:** All endpoints are publicly accessible
   - **Impact:** Security risk in production
   - **Priority:** High for production deployment
   - **TODO:** Add API key authentication or JWT

6. **Root Endpoint Missing All Endpoints**
   - **Issue:** `GET /` only lists 5 endpoints, missing GET endpoints
   - **Location:** [src/index.ts:111-118](../src/index.ts#L111-L118)
   - **Priority:** Low
   - **TODO:** Update root endpoint to list all 12 endpoints

## Version History & Changelog

### Version 1.0.0 (Current)
**Status:** Production Ready
**Date:** December 2024

**Features:**
- ✅ 12 API endpoints (6 POST, 6 GET)
- ✅ Single and batch prospect enrichment
- ✅ Prospect discovery from Google search
- ✅ Web interface for testing
- ✅ Firestore integration
- ✅ OpenAI and Google Custom Search integration
- ✅ Comprehensive error handling
- ✅ Request logging middleware
- ✅ Docker support

**Recent Changes (December 17, 2024):**
- Added 5 GET endpoints for prospects and batches retrieval
- Added web interface (interface.html)
- Added static file serving middleware
- Added request logging with duration tracking
- Added root endpoint with service metadata
- Added global error handler and 404 handler
- Created test scripts (test-service.sh, test-quick.sh)
- Fixed undefined field validation in Firestore saves

**Known Git Commits:**
- `0731a81` - Update
- `d48a3b3` - Update
- `bfaf31a` - Fix TypeScript build: add @types/uuid dependency
- `3671bb3` - Add pricing system and LinkedIn enrichment billing
- `574956e` - Added deployment files

### Upcoming Features (See current-plan.md)
- [ ] Rate limiting
- [ ] API authentication
- [ ] Automated tests
- [ ] Structured logging
- [ ] Metrics/monitoring
- [ ] GitHub Actions CI/CD

## Related Documentation

For more context about this service within the larger backend monorepo, see:
- [backend/CLAUDE.md](../../../../CLAUDE.md) - Monorepo-wide guidance
- [backend/docs/microservices-architecture.md](../../../../docs/microservices-architecture.md) - Architecture overview
- [backend/logs.md](../../../../logs.md) - Session-to-session context and deployment history

---

**Document Last Updated:** December 30, 2024 by Claude Code
**Next Review Date:** January 2025 or after major feature releases

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Context

This is the **backend monorepo** for the LinkedIn enrichment pipeline. **Do not confuse this with the legacy `prospect-backend` repository.** Always verify you are in `linkedin_enrichment/backend` before making changes.

**CRITICAL**: Read `logs.md` at the repository root before contributing. It contains session-to-session context, production incidents, and deployment history.

## Build & Development Commands

### Node Services (TypeScript)

From the **backend root** (`linkedin_enrichment/backend`):

```bash
# Install workspace dependencies
npm install

# Build all TypeScript services
npm run build

# Run smoke tests
node scripts/test-backend.mjs

# Override test URLs for deployed services
PROSPECT_API_BASE=https://prospect-backend.example/api \
LISTS_API_BASE=https://prospect-lists.example/api \
node scripts/test-backend.mjs
```

Individual services (`prospect-api`, `prospect-lists-api`, `linkedin-enrichment-service`):

```bash
cd services/<service-name>
npm run dev     # Development with hot reload (tsx watch)
npm run build   # Compile TypeScript
npm run start   # Run compiled code
```

**LinkedIn Enrichment Service** (standalone HTTP service):

```bash
cd services/linkedin-enrichment-service
npm run dev     # Start on port 4200 (default)

# Test the service
./test-service.sh

# See QUICKSTART.md and examples.md for detailed usage
```

**Key Features:**
- `/api/enrich` - Enrich existing prospect by ID (reads from Firestore)
- `/api/enrich-direct` - Enrich prospect data sent in request body
- `/api/discover-prospects` - NEW: Discover prospects from keywords, uses OpenAI to parse Google snippets into structured data
- Writes to `arbol-outreach-machine` Firestore by default (uses ADC)
- Data models defined in `src/models/` directory

### Python Lambda Services

Local enrichment testing:

```bash
# Seed Firestore with test data
GOOGLE_APPLICATION_CREDENTIALS=services/prospect-api/leadgen-475923-29d2eed038e0.json \
  node scripts/seed-firestore.mjs

# Seed mock enrichment list (15 prospects)
GOOGLE_APPLICATION_CREDENTIALS=../leadgen-475923-29d2eed038e0.json \
  python3 scripts/seed-mock-enrichment.py

# Dry run LinkedIn enrichment (no external API calls)
python3 scripts/run_linkedin_enrichment.py --dry-run

# Full LinkedIn enrichment with API keys
OPENAI_API_KEY=<KEY> GOOGLE_API_KEY=<KEY> GOOGLE_CSE_ID=12413e62e1382465a \
  python3 scripts/run_linkedin_enrichment.py

# Domain enrichment
ANTHROPIC_API_KEY=<KEY> \
  python3 scripts/run_domain_enrichment.py
```

**Local enrichment mode**: Set `LOCAL_ENRICHMENT=1` in `services/prospect-api/.env` to auto-trigger Python scripts when calling `/api/enqueue_enrichment` (no manual script execution needed).

## Architecture Overview

This monorepo contains five independently deployable services:

| Service | Runtime | Purpose | Deployment |
|---------|---------|---------|------------|
| `prospect-api` | Node 20 | REST API for prospect queries, enrichment orchestration, pricing | Cloud Run |
| `prospect-lists-api` | Node 20 | List CRUD API for UI | Cloud Run |
| `linkedin-enrichment-service` | Node 20 | **NEW:** HTTP-based LinkedIn enrichment with configurable keywords | Cloud Run / any Node.js host |
| `enrichment-linkedin-lambda` | Python 3.11 | LinkedIn data enrichment (queues domain job) | AWS Lambda (SQS-triggered) |
| `enrichment-domain-lambda` | Python 3.11 | Corporate domain + vertical metadata enrichment | AWS Lambda (SQS-triggered) |

### Enrichment Pipeline Flow

**Queue-based (Lambda pipeline):**

1. UI calls `prospect-api` → `/api/enqueue_enrichment` with prospect IDs
2. `prospect-api` updates Firestore (`enrichment.status = "queued"`) and sends SQS message
3. `enrichment-linkedin-lambda` consumes SQS, enriches LinkedIn data, publishes to domain queue
4. `enrichment-domain-lambda` consumes domain queue, adds corporate metadata
5. Both lambdas update Firestore with results

**HTTP-based (linkedin-enrichment-service):**

1. Client calls `linkedin-enrichment-service` → `/api/enrich` with prospect IDs
2. Service reads prospect from Firestore, generates keywords, calls Google + OpenAI
3. Service writes results directly to Firestore (no queues)
4. Use for on-demand enrichment with custom keyword configurations

See `services/linkedin-enrichment-service/SERVICE_OVERVIEW.md` for details on the HTTP service.

### Data Storage

- **Firestore collections**: `prospects`, `lists`, `batches`, `enrichment_runs`, `linkedin_enrichments`, `pricing_sessions`, `billing`
- **Firestore project**: `arbol-outreach-machine` (default for linkedin-enrichment-service)
- Prospects have nested `enrichment` and `outreach` fields
- Prospect `list_ids` array tracks membership across lists (user-modifiable)
- Prospect `batch_id` field tracks batch membership (set before outreach campaigns)
- **Data models**: See `services/linkedin-enrichment-service/src/models/` for complete Firestore schemas

### Pricing System

The prospect-api includes a session-based pricing tracker:
- Base: $0.14/enrichment + $0.11/additional organization
- 50% markup applied
- See `services/prospect-api/docs/pricing-api.md` for endpoints

## Deployment

### Cloud Run (prospect-api, prospect-lists-api)

**Manual deployment via Cloud Build configs:**

```bash
# Build image
gcloud builds submit \
  --config cloudbuild-prospect-api.yaml

# Deploy (set environment variables in Cloud Run console or via gcloud)
gcloud run deploy prospect-api \
  --image us-docker.pkg.dev/<PROJECT_ID>/prospect-backend/api \
  --region us-central1 \
  --allow-unauthenticated \
  --service-account <SERVICE_ACCOUNT_EMAIL> \
  --set-env-vars "DEFAULT_QUEUE_LIST_ID=enrichment_queue" \
  --set-env-vars "OUTREACH_READY_LIST_ID=outreach_ready" \
  --set-env-vars "ENRICHMENT_JOBS_QUEUE_URL=<SQS_URL>" \
  --set-env-vars "AWS_REGION=us-east-1"
```

Repeat for `prospect-lists-api` using `cloudbuild-prospect-lists.yaml`.

### AWS Lambda (enrichment services)

**Automated via GitHub Actions:**
- Workflow: `.github/workflows/deploy-lambdas.yml`
- Triggers: Pushes to `main` affecting `services/enrichment-*/**` or manual dispatch
- Required secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `LINKEDIN_LAMBDA_NAME`, `DOMAIN_LAMBDA_NAME`, `LINKEDIN_CREDENTIAL_JSON`, `DOMAIN_CREDENTIAL_JSON`

**Manual deployment:**

```bash
cd services/enrichment-linkedin-lambda
pip install -r requirements.txt --target build/
cp -R *.py build/
cd build && zip -r ../linkedin_enrichment.zip .
aws lambda update-function-code \
  --function-name linkedin-enrichment \
  --zip-file fileb://linkedin_enrichment.zip
```

Same process for `enrichment-domain-lambda` with `domain_enrichment.zip`.

## Critical Guardrails

1. **NEVER modify workflows/microservices without reviewing `docs/` and `logs.md` first**
2. **Keep Cloud Run and Lambda pipelines separate** — mixing them has caused outages
3. **Document every deployment change** in `backend/docs/` and `logs.md`
4. **Verify repository** — confirm you're in `linkedin_enrichment/backend`, not legacy `prospect-backend`
5. **Test before deploying** — run `node scripts/test-backend.mjs` against staging/local endpoints

## Key Files & Directories

- `docs/microservices-architecture.md` — Service responsibilities, deployment steps, test commands
- `docs/ci-lambda-deploy.md` — Lambda CI expectations, required secrets, IAM policies
- `scripts/` — Firestore seeders, enrichment runners, smoke tests
- `cloudbuild-*.yaml` — Cloud Build configs for Cloud Run services
- `.github/workflows/deploy-lambdas.yml` — Automated Lambda deployment
- `firestore.indexes.json` — Firestore index definitions

## Common Patterns

- **Environment variables**: Each service has `.env.example` — copy and populate with credentials
- **Firestore access**: Services use `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- **SQS integration**: prospect-api sends messages, lambdas consume and forward to next stage
- **Batch writes**: Lambdas process Firestore updates in batches (max 500 writes/batch)
- **Error handling**: Lambdas log errors but continue processing remaining prospects

## TypeScript Configuration

Services use individual `tsconfig.json` files with `"module": "ES2022"` and `"moduleResolution": "bundler"`. Compiled output goes to `dist/`.

## Python Dependencies

- **LinkedIn lambda**: `openai`, `google-api-python-client`, `firebase-admin`, `boto3`
- **Domain lambda**: `anthropic`, `firebase-admin`, `boto3`
- Python 3.11 runtime on AWS Lambda (matches local dev)

## Notes

- The `packages/shared-firestore` directory exists but is currently empty
- No automated tests beyond smoke tests in `scripts/test-backend.mjs`
- Cloud Run services default to ports 4000 (prospect-api) and 4100 (prospect-lists-api) in local dev

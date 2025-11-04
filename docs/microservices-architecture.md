# Prospect Backend Microservices

This repo groups every deployable workload that powers the enrichment pipeline. Each service can be deployed independently, but they share common conventions, tooling, and Firestore helpers.

| Service | Runtime | Responsibility | Deployment Target |
|---------|---------|----------------|-------------------|
| `services/prospect-api` | Node 20 | Public REST API consumed by the UI for querying prospects and queueing enrichment runs. | Cloud Run container |
| `services/prospect-lists-api` | Node 20 | Dedicated list CRUD API backing the UI list modal. | Cloud Run container |
| `services/enrichment-linkedin-lambda` | Python 3.11 | Processes queued runs, enriches LinkedIn data, and schedules the domain follow-up job. | AWS Lambda (triggered by SQS) |
| `services/enrichment-domain-lambda` | Python 3.11 | Adds corporate domain and vertical metadata after LinkedIn enrichment completes. | AWS Lambda (triggered by SQS) |

## Repository Conventions

- **Workspaces:** `backend/package.json` enables npm workspaces (`services/*`, `packages/*`). Run `npm run build` at the repo root to compile every Node/TypeScript service.
- **Shared utilities:** `packages/shared-firestore` exports Firestore helpers and constants that both Cloud Run services and Lambdas can import (via transpiled JS).
- **Environment files:** Each service keeps its own `.env.example` with required variables. The Cloud Run services load configuration with `dotenv` in local dev, while Lambda functions rely on AWS environment variables + Secrets Manager.

## Deployment Overview

### Cloud Run services

1. Build container images with Cloud Build:
   ```bash
   cd backend/services/prospect-api
   gcloud builds submit --tag us-docker.pkg.dev/<PROJECT_ID>/prospect-backend/api
   ```
2. Deploy to Cloud Run:
   ```bash
   gcloud run deploy prospect-api \
     --image us-docker.pkg.dev/<PROJECT_ID>/prospect-backend/api \
     --region us-central1 \
     --allow-unauthenticated \
     --service-account <SERVICE_ACCOUNT_EMAIL> \
     --set-env-vars "DEFAULT_QUEUE_LIST_ID=enrichment_queue" \
     --set-env-vars "OUTREACH_READY_LIST_ID=outreach_ready" \
     --set-env-vars "ENRICHMENT_JOBS_QUEUE_URL=<SQS_QUEUE_URL>" \
     --set-env-vars "AWS_REGION=<AWS_REGION>"
   ```
3. Repeat the same build/deploy flow for `prospect-lists-api` with its own image name and env vars.

### Lambda services

1. Package dependencies:
   ```bash
   cd backend/services/enrichment-linkedin-lambda
   pip install -r requirements.txt --target build/
   cp -R *.py build/
   cd build && zip -r ../linkedin_enrichment.zip .
   ```
2. Update the Lambda code:
   ```bash
   aws lambda update-function-code \
     --function-name linkedin-enrichment \
     --zip-file fileb://linkedin_enrichment.zip
   ```
3. Configure environment variables:
   - `DOMAIN_JOBS_QUEUE_URL` (for chaining to the domain lambda)
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` (or Secrets Manager ARN)
   - `OPENAI_API_KEY`, `GOOGLE_API_KEY`, etc.
4. Add an SQS event source mapping so the LinkedIn lambda consumes `prospect-enrichment-jobs`. The lambda publishes the follow-up message to `prospect-domain-jobs`, which triggers the domain lambda.

### CI/CD suggestions

- Use GitHub Actions workflow per service (triggered by path filters) to run tests, build artifacts, and deploy to the appropriate platform.
- Keep Terraform/CDK definitions under `backend/infra/` so infrastructure updates stay in sync with code changes.

## Next Steps

- Migrate shared Firestore access logic into `@prospect/shared-firestore` and import it from the APIs.
- Add smoke tests for each lambda that can be run locally with AWS SAM.
- Extend the docs with runbooks for on-call troubleshooting (e.g., where to find CloudWatch logs, SQS DLQs).

## Test Runner

Use the bundled script to exercise the core backend endpoints (health checks, list fetches, and validation errors) without clicking through the UI.

```bash
# default: expects prospect API on :4000 and lists API on :4100
node scripts/test-backend.mjs

# override to hit deployed services
PROSPECT_API_BASE=https://prospect-backend.example/api \
LISTS_API_BASE=https://prospect-lists.example/api \
node scripts/test-backend.mjs
```

A non-zero exit code flags failures so the command can plug into CI pipelines.

### Seed Sample Data

Populate deterministic test fixtures in Firestore before exercising the backend smoke tests:

```bash
cd backend
GOOGLE_APPLICATION_CREDENTIALS=services/prospect-api/leadgen-475923-29d2eed038e0.json \
  node scripts/seed-firestore.mjs
```

This upserts the `test_automation_list` lists document and three prospects (`aaa_test_prospect`, `test_prospect_1`, `test_prospect_2`) so the automated test runner can assert response payloads.

For end-to-end enrichment testing you can also seed a dedicated mock list:

```bash
cd backend
GOOGLE_APPLICATION_CREDENTIALS=../leadgen-475923-29d2eed038e0.json \
  python3 scripts/seed-mock-enrichment.py
```

This creates `mock_enrichment_list` with 15 sample prospects tagged as `pending`.

### Local Lambda Invocations

Dry-run the enrichment lambdas (skips external APIs) against the mock list:

```bash
cd backend
cp services/enrichment-linkedin-lambda/.env.example services/enrichment-linkedin-lambda/.env
cp services/enrichment-domain-lambda/.env.example services/enrichment-domain-lambda/.env
# edit each .env with real keys when ready

python3 scripts/run_linkedin_enrichment.py --dry-run   # processes latest run stage=linkedin
python3 scripts/run_domain_enrichment.py --dry-run     # processes latest run stage=domain
```

For full runs provide the necessary API keys, e.g.:

```bash
cd backend
OPENAI_API_KEY=<KEY> GOOGLE_API_KEY=<KEY> GOOGLE_CSE_ID=12413e62e1382465a \
  python3 scripts/run_linkedin_enrichment.py

ANTHROPIC_API_KEY=<KEY> \
  python3 scripts/run_domain_enrichment.py
```
Both scripts default to the repository service-account JSON (see the `.env.example` files) and automatically pick the latest queued run based on the `stage` field (`linkedin` then `domain`). Override `--run-id`, `--env-file`, or `--credentials` as needed.

When running the TypeScript API locally, set `LOCAL_ENRICHMENT=1` in `services/prospect-api/.env` so every `/api/enqueue_enrichment` call will automatically chain to the local Python scripts (no manual command needed).

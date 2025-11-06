
# Backend Monorepo Guide

This directory contains every deployable workload that powers the LinkedIn enrichment pipeline. Before touching any code or workflows:

1. **Read `logs.md` at the repository root.** It captures session-to-session context, production incidents, and deployment history. Assume it is required reading before each contribution.
2. **Skim the existing docs in `backend/docs/`.** They explain the microservice boundaries (`microservices-architecture.md`), Lambda CI expectations (`ci-lambda-deploy.md`), and Cloud Run environment variables (`prospect-api-env.yaml`).
3. **Confirm you are inside this monorepo (`linkedin_enrichment/backend`) and *not* the legacy `prospect-backend` repository.** The latter was an earlier extraction of the same services and should only be touched when explicitly requested.

## Layout

| Path | Description |
|------|-------------|
| `services/prospect-api` | Express/TypeScript API consumed by the UI for prospect queries and enrichment orchestration. |
| `services/prospect-lists-api` | Dedicated list CRUD API for the UI modal and bulk list operations. |
| `services/enrichment-linkedin-lambda` | Python 3.11 Lambda that enriches LinkedIn data for queued runs. |
| `services/enrichment-domain-lambda` | Python 3.11 Lambda that enriches corporate domain + vertical metadata. |
| `packages/shared-firestore` | Shared Firestore helpers used across Node services and Lambdas. |
| `scripts/` | Firestore seeders, enrichment runners, and CI smoke tests. |
| `docs/` | Reference documentation for architecture, deployment, and environment variables. |

The top-level `package.json` enables npm workspaces so the Node services and packages can share TypeScript configuration and dependencies.

## Required Guardrails

- **Never modify workflows or microservices without first reviewing the latest documentation and `logs.md`.** Many deployment steps (service accounts, queue URLs, env vars) are captured there.
- **Keep Cloud Run and Lambda pipelines separate.** Cloud Run services are deployed manually via the Cloud Build configs in `backend/cloudbuild-*.yaml`. The AWS Lambdas are managed by `.github/workflows/deploy-lambdas.yml`. Mixing the two has previously caused outages.
- **Document every meaningful change.** If you alter automation, service behaviour, or deployment processes, update the relevant doc under `backend/docs/` and add a note to `logs.md`.

## Workflows & Automation

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `.github/workflows/deploy-lambdas.yml` | Packages and deploys the LinkedIn & domain enrichment Lambdas. Validates secrets are set before running. | Pushes touching `backend/services/enrichment-*/**` or the workflow itself; manual dispatch. |

> ℹ️ The Cloud Run CI that hits live endpoints currently lives outside this monorepo. When in doubt, check `logs.md` for the authoritative location and status of that pipeline.

### Lambda CI Expectations

The Lambda workflow expects these GitHub secrets:

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `LINKEDIN_LAMBDA_NAME`, `DOMAIN_LAMBDA_NAME`

If either lambda uses inline Firestore credentials, supply `LINKEDIN_CREDENTIAL_JSON` / `DOMAIN_CREDENTIAL_JSON`. The workflow will warn (but not fail) when they are missing.

Successful runs produce commit statuses so you can confirm packaging and deployment without opening raw logs.

## Developer Checklist

1. `npm install` (from `backend/`) to hydrate workspace dependencies.
2. `npm run build` to compile the Node services and shared package.
3. `node scripts/test-backend.mjs` (or set `PROSPECT_API_BASE` / `LISTS_API_BASE` to the deployed URLs) for smoke testing.
4. Run `python` seed/enrichment scripts as needed (see `backend/docs/microservices-architecture.md` for commands).
5. Update documentation & `logs.md` alongside code changes.

Following the process above should prevent confusion between repositories and keep the automation aligned with the documented architecture.

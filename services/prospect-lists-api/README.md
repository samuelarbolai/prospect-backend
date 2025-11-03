# Prospect Lists Service

Serverless-ready microservice that manages named prospect lists. It owns list
creation, membership updates, and exposes lightweight list metadata for the UI.

## Endpoints

All endpoints are rooted at `/api`.

| Method | Path                       | Description                                   |
|--------|---------------------------|-----------------------------------------------|
| GET    | `/lists`                  | Returns all lists with aggregated counts      |
| POST   | `/lists`                  | Creates (or reuses) a list with the given name |
| POST   | `/lists/:listId/members`  | Adds prospect document IDs to the list        |

The service reads/writes the same `prospects` collection as the main pipeline
API, appending list IDs to each prospect’s `list_ids` array.

### Environment variables

| Variable                        | Purpose                                                                 |
|--------------------------------|-------------------------------------------------------------------------|
| `PORT`                         | Optional. Defaults to `4100`.                                           |
| `CORS_ALLOWED_ORIGINS`         | Comma-separated list of allowed origins. Defaults to `*`.              |
| `GOOGLE_APPLICATION_CREDENTIALS` / `_JSON` / `_B64` | Any ADC-compatible credential configuration, shared with the main API. |

## Local development

```bash
npm install
npm run dev
# Service listens on http://localhost:4100
```

Point the frontend’s `VITE_LISTS_API_BASE_URL` to this address while developing.

## Deployment

Deploy via Cloud Run (mirrors the main API’s Dockerfile/CD pipeline). Make sure
the runtime service account has Firestore access (`roles/datastore.user` or higher).

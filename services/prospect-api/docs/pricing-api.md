# Pricing API Documentation

## Overview

The pricing system tracks enrichment costs per user session for manual invoicing. It calculates costs based on the number of unique organizations being enriched.

## Cost Structure

- Base cost: $0.14 per enrichment
- Additional organization cost: $0.11 per additional organization beyond the first
- Markup: 50% applied to subtotal
- Formula: `(base_cost + (additional_orgs * additional_cost)) * (1 + markup)`

## Endpoints

### Start Session
`POST /api/pricing/sessions/start`

Creates a new pricing session for a user.

**Request Body:**
```json
{
  "userId": "string"
}
```

**Response:**
```json
{
  "sessionId": "uuid"
}
```

### Get Current Session
`GET /api/pricing/sessions/current/:userId`

Retrieves the active session for a user.

**Response:**
```json
{
  "session": {
    "session_id": "uuid",
    "user_id": "string",
    "start_time": "timestamp",
    "current_total": 0.21,
    "status": "active"
  }
}
```

### Get Session Total
`GET /api/pricing/sessions/total/:sessionId`

Gets the current total for a specific session.

**Response:**
```json
{
  "total": 0.42
}
```

### Reset Session
`POST /api/pricing/sessions/reset/:userId`

Resets a user's session and moves the total to billing.

**Response:**
```json
{
  "success": true
}
```

### Admin Reset
`POST /api/pricing/admin/reset/:userId`

Admin endpoint to manually reset a user's session.

**Response:**
```json
{
  "success": true
}
```

### Cost Estimator
`POST /api/pricing/estimate`

Estimates the cost for enriching a set of prospects.

**Request Body:**
```json
{
  "prospectIds": ["id1", "id2", "id3"]
}
```

**Response:**
```json
{
  "orgCount": 2,
  "cost": 0.38,
  "breakdown": {
    "baseCost": 0.14,
    "additionalOrgs": 1,
    "additionalCost": 0.11,
    "markup": 0.5
  }
}
```

## Integration with Enrichment

The enrichment endpoint (`/api/enqueue_enrichment`) accepts an optional `sessionId` parameter. When provided, the system will:

1. Calculate the number of unique organizations in the prospect set
2. Record a transaction with the calculated cost
3. Update the session total

## Error Handling

All endpoints return appropriate HTTP status codes:
- 400: Bad Request (validation errors)
- 404: Not Found (session/user not found)
- 500: Internal Server Error

Error responses include a descriptive message:
```json
{
  "error": "Description of the error"
}
```

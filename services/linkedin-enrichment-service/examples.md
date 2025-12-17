# API Examples

Quick reference for calling the LinkedIn Enrichment Service API.

## Prerequisites

Start the service locally:
```bash
npm run dev
```

The service will be available at `http://localhost:4200`

## Example 1: Enrich Single Prospect (Default Configuration)

Uses the default keyword configuration (name + organization + site:linkedin.com/in):

```bash
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "your-prospect-id"
  }'
```

**Response:**
```json
{
  "success": true,
  "result": {
    "prospectId": "your-prospect-id",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "status": "SUCCESS",
    "keywords": "\"John Doe\" Acme Corporation site:linkedin.com/in"
  },
  "enrichmentId": "abc123xyz"
}
```

## Example 2: Enrich with Custom Keyword Configuration

Include job title and location in search:

```bash
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "your-prospect-id",
    "keywordConfig": {
      "includeName": true,
      "includeOrganization": true,
      "includeTitle": true,
      "includeLocation": true,
      "additionalKeywords": ["LinkedIn"]
    }
  }'
```

## Example 3: Enrich with Custom Keywords

Bypass keyword generation and provide your own search query:

```bash
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "your-prospect-id",
    "customKeywords": "Jane Smith CEO Healthcare LinkedIn profile"
  }'
```

## Example 4: Custom Template

Use a custom template for keyword generation:

```bash
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "your-prospect-id",
    "keywordConfig": {
      "customTemplate": "{name} works at {organization} as {title} in {location}"
    }
  }'
```

**Generated keywords:** `John Doe works at Acme Corp as CEO in San Francisco`

## Example 5: Test Keywords (No Enrichment)

Preview generated keywords without running enrichment:

```bash
curl -X POST http://localhost:4200/api/test-keywords \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "your-prospect-id",
    "keywordConfig": {
      "includeName": true,
      "includeOrganization": true,
      "includeTitle": false
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "prospectId": "your-prospect-id",
  "prospectData": {
    "name": "John Doe",
    "organization": "Acme Corp",
    "title": "CEO"
  },
  "keywords": "\"John Doe\" Acme Corp"
}
```

## Example 6: Batch Enrichment

Enrich multiple prospects at once:

```bash
curl -X POST http://localhost:4200/api/enrich/batch \
  -H "Content-Type: application/json" \
  -d '{
    "prospectIds": [
      "prospect-id-1",
      "prospect-id-2",
      "prospect-id-3"
    ],
    "keywordConfig": {
      "includeName": true,
      "includeOrganization": true,
      "additionalKeywords": ["site:linkedin.com/in"]
    }
  }'
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
      "prospectId": "prospect-id-1",
      "linkedinUrl": "https://linkedin.com/in/person1",
      "status": "SUCCESS",
      "keywords": "..."
    },
    {
      "prospectId": "prospect-id-2",
      "linkedinUrl": "https://linkedin.com/in/person2",
      "status": "SUCCESS",
      "keywords": "..."
    },
    {
      "prospectId": "prospect-id-3",
      "linkedinUrl": null,
      "status": "NO_GOOGLE_RESULTS",
      "keywords": "..."
    }
  ]
}
```

## Example 7: Health Check

Check if the service is running:

```bash
curl http://localhost:4200/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "linkedin-enrichment-service"
}
```

## Example 8: Healthcare-Specific Keywords

Optimized for healthcare professionals:

```bash
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "your-prospect-id",
    "keywordConfig": {
      "includeName": true,
      "includeOrganization": true,
      "includeTitle": true,
      "additionalKeywords": ["MD", "healthcare", "site:linkedin.com/in"]
    }
  }'
```

**Generated keywords:** `"Dr. Jane Smith" Memorial Hospital Cardiologist MD healthcare site:linkedin.com/in`

## Example 9: Using with JavaScript/TypeScript

```typescript
// enrich-prospect.ts
async function enrichProspect(prospectId: string) {
  const response = await fetch('http://localhost:4200/api/enrich', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prospectId,
      keywordConfig: {
        includeName: true,
        includeOrganization: true,
        additionalKeywords: ['site:linkedin.com/in'],
      },
    }),
  });

  const result = await response.json();

  if (result.success) {
    console.log('LinkedIn URL:', result.result.linkedinUrl);
    console.log('Status:', result.result.status);
  } else {
    console.error('Enrichment failed:', result.error);
  }
}

enrichProspect('your-prospect-id');
```

## Example 10: Batch with Error Handling

```typescript
async function enrichBatch(prospectIds: string[]) {
  try {
    const response = await fetch('http://localhost:4200/api/enrich/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prospectIds,
        keywordConfig: {
          includeName: true,
          includeOrganization: true,
        },
      }),
    });

    const result = await response.json();

    console.log(`Total: ${result.total}`);
    console.log(`Succeeded: ${result.succeeded}`);
    console.log(`Failed: ${result.failed}`);

    // Process results
    for (const enrichment of result.results) {
      if (enrichment.linkedinUrl) {
        console.log(`✓ ${enrichment.prospectId}: ${enrichment.linkedinUrl}`);
      } else {
        console.log(`✗ ${enrichment.prospectId}: ${enrichment.status}`);
      }
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

enrichBatch(['id1', 'id2', 'id3']);
```

## Testing Different Keyword Strategies

### Strategy 1: Exact Name Match
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": false,
    "additionalKeywords": ["site:linkedin.com/in"]
  }
}
```

### Strategy 2: Organization Focus
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "includeTitle": false,
    "additionalKeywords": ["site:linkedin.com"]
  }
}
```

### Strategy 3: Title-Based Search
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeTitle": true,
    "includeLocation": true,
    "additionalKeywords": ["LinkedIn"]
  }
}
```

### Strategy 4: Location-Based
```json
{
  "keywordConfig": {
    "customTemplate": "{name} {location} {organization}"
  }
}
```

## Common Use Cases

### Use Case 1: Find C-Level Executives
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "includeTitle": true,
    "additionalKeywords": ["C-suite", "executive", "site:linkedin.com/in"]
  }
}
```

### Use Case 2: Find Healthcare Professionals
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "additionalKeywords": ["MD", "physician", "doctor", "site:linkedin.com/in"]
  }
}
```

### Use Case 3: Find Tech Professionals
```json
{
  "keywordConfig": {
    "includeName": true,
    "includeOrganization": true,
    "includeTitle": true,
    "additionalKeywords": ["software", "engineer", "developer"]
  }
}
```

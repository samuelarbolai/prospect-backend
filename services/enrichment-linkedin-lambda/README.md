# LinkedIn Enrichment Lambda

AWS Lambda handler that consumes prospect batches from SQS, enriches their LinkedIn data, and updates Firestore.

## Packaging

```bash
pip install -r requirements.txt --target build/
cp -R *.py build/
cd build && zip -r ../linkedin_enrichment.zip .
```

Deploy the zip with:

```bash
aws lambda update-function-code \
  --function-name linkedin-enrichment \
  --zip-file fileb://linkedin_enrichment.zip
```

## Environment

Set the following variables in Lambda:

- `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_APPLICATION_CREDENTIALS_B64`, or rely on the execution role.
- Either `GOOGLE_API_KEY` **or** `GOOGLE_SERVICE_ACCOUNT_FILE` (`GOOGLE_SERVICE_ACCOUNT_SCOPES`) so Google search can authenticate.
- `GOOGLE_CSE_ID` – Programmable Search Engine ID used for queries.
- `OPENAI_API_KEY` (optionally override `OPENAI_MODEL`).
- Optional: `ENRICHMENT_DRY_RUN=1` to skip external APIs during local tests.
- Any queue chaining settings (e.g. `DOMAIN_JOBS_QUEUE_URL`) your workflow relies on.
- Set `PROSPECT_FIRESTORE_PROJECT` if you need to pin the Firestore project when using workload identity.

Secrets can also come from AWS Secrets Manager; fetch them inside the handler before processing messages.

## Local Testing

Use the AWS CLI to invoke the lambda with a sample SQS payload:

```bash
aws lambda invoke \
  --function-name linkedin-enrichment \
  --payload '{"Records":[{"body":"{\\"runId\\":\\"debug\\",\\"listId\\":\\"test-list\\",\\"prospectIds\\":[\\"abc123\\"]}"}]}' \
  out.json
```

Monitor CloudWatch logs for progress and failures.

For offline/local testing use the dry-run mode:

```bash
export ENRICHMENT_DRY_RUN=1
python3 - <<'PY'
from handler import handler

payload = {
    "Records": [
        {"body": "{\"runId\":\"dry-run\",\"prospectIds\":[\"demo-prospect\"]}"}
    ]
}
handler(payload, None)
PY
```

This bypasses Google/OpenAI calls and writes mock LinkedIn URLs into Firestore (or the emulator).

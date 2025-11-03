# Corporate Domain Enrichment Lambda

AWS Lambda handler that augments organizations with vertical/domain data after the LinkedIn enrichment completes.

## Packaging

```bash
pip install -r requirements.txt --target build/
cp -R *.py build/
cd build && zip -r ../domain_enrichment.zip .
```

Deploy with:

```bash
aws lambda update-function-code \
  --function-name domain-enrichment \
  --zip-file fileb://domain_enrichment.zip
```

## Environment Variables

- `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_APPLICATION_CREDENTIALS_B64`, or rely on the Lambda execution role.
- `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY_WORKSPACE`).
- Optional: `ANTHROPIC_MODEL` / `ANTHROPIC_TEMPERATURE` to override defaults.
- Optional: `ENRICHMENT_DRY_RUN=1` to return mock domains/verticals during local testing.
- `PROSPECT_FIRESTORE_PROJECT` if you need to pin a project when using workload identity.
- Any downstream queue configuration (`RESULT_QUEUE_URL`, etc.).

## Local Invocation

```bash
aws lambda invoke \
  --function-name domain-enrichment \
  --payload '{"Records":[{"body":"{\\"runId\\":\\"debug\\",\\"listId\\":\\"test-list\\",\\"prospectIds\\":[\\"abc123\\"]}"}]}' \
  out.json
```

Capture logs in CloudWatch or via `aws logs tail /aws/lambda/domain-enrichment`.

Dry-run mode lets you test without calling Anthropic:

```bash
export ENRICHMENT_DRY_RUN=1
python3 - <<'PY'
from handler import handler

payload = {
    "Records": [
        {"body": "{\"runId\":\"dry\",\"prospectIds\":[\"demo-prospect\"]}"}
    ]
}
handler(payload, None)
PY
```

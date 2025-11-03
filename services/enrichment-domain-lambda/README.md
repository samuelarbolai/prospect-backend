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

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` or `GOOGLE_APPLICATION_CREDENTIALS_B64`
- `ANTHROPIC_API_KEY`
- `PROSPECT_FIRESTORE_PROJECT`
- `RESULT_QUEUE_URL` (optional completion queue)

## Local Invocation

```bash
aws lambda invoke \
  --function-name domain-enrichment \
  --payload '{"Records":[{"body":"{\\"runId\\":\\"debug\\",\\"listId\\":\\"test-list\\",\\"prospectIds\\":[\\"abc123\\"]}"}]}' \
  out.json
```

Capture logs in CloudWatch or via `aws logs tail /aws/lambda/domain-enrichment`.

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

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` or `GOOGLE_APPLICATION_CREDENTIALS_B64`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`
- `DOMAIN_JOBS_QUEUE_URL`
- `PROSPECT_FIRESTORE_PROJECT`

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

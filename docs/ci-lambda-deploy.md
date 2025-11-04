# Lambda Deployment CI

This repository ships a GitHub Actions workflow (`.github/workflows/deploy-lambdas.yml`)
that rebuilds and deploys both enrichment lambdas whenever their source
directories change or when the workflow is triggered manually.

## Prerequisites

1. **AWS IAM user (or role) for CI**  
   The credentials you place in GitHub must have permission to:

   - `lambda:UpdateFunctionCode` on the `linkedin-enrichment` and `domain-enrichment` lambdas.
   - `lambda:PublishVersion` (included implicitly when you call `update-function-code --publish`).
   - `iam:PassRole` is **not** required because the workflow only updates code.

   A minimal policy looks like:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["lambda:UpdateFunctionCode", "lambda:GetFunction"],
         "Resource": [
           "arn:aws:lambda:us-east-1:856121895401:function:linkedin-enrichment",
           "arn:aws:lambda:us-east-1:856121895401:function:domain-enrichment"
         ]
       }
     ]
   }
   ```

   Use AWS Secrets Manager (or another approved channel) to rotate these
   credentials regularly.

2. **GitHub repository secrets**

   Add the following secrets in *Settings → Secrets and variables → Actions*:

   | Secret name              | Description                                           |
   |--------------------------|-------------------------------------------------------|
   | `AWS_ACCESS_KEY_ID`      | Access key for the deployer IAM user/role.            |
   | `AWS_SECRET_ACCESS_KEY`  | Secret key for the same principal.                    |
   | `AWS_REGION`             | Region where the lambdas live (e.g. `us-east-1`).     |
   | `LINKEDIN_LAMBDA_NAME`   | Function name for the LinkedIn enrichment lambda.     |
   | `DOMAIN_LAMBDA_NAME`     | Function name for the domain enrichment lambda.       |

   If you ever rename the functions, update these secrets instead of changing
   the workflow.

## How the workflow works

1. Checks out the repo and installs Python 3.11.
2. Builds the LinkedIn lambda package (`pip install … --target build/`, copy source
   files, zip).
3. Calls `aws lambda update-function-code` for the LinkedIn lambda.
4. Repeats the same steps for the domain lambda.
5. Cleans up temporary build directories so they do not accumulate as artifacts.

The workflow runs automatically on pushes to `main` that touch either lambda’s
source or the workflow file, and you can trigger it manually from the GitHub UI
(`Actions → Deploy Enrichment Lambdas → Run workflow`).

If any of the required secrets are missing the workflow fails immediately with
an actionable error so you know which values to add before re-running.

If you need to deploy from a feature branch, run the workflow manually or
temporarily adjust the trigger branch list.

import { SQSClient } from "@aws-sdk/client-sqs";

const region = process.env.AWS_REGION ?? "us-east-1";

export const sqsClient = new SQSClient({ region });


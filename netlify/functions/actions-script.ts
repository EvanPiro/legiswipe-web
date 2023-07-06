import * as dotenv from "dotenv";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { indexActionsJob } from "./actions-utils";

dotenv.config();

const region = "us-east-1";
const actionsTable = "actions";

const congressApiKey: any = process.env.CONGRESS_API_KEY;
const accessKeyId: any = process.env.MY_AWS_ACCESS_KEY_ID;
const secretAccessKey: any = process.env.MY_AWS_SECRET_ACCESS_KEY;

const ddb = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const run = async () => {
  await indexActionsJob(congressApiKey)(actionsTable)(ddb)({
    numberOfBatches: 100,
    batchSize: 25,
  });
};

run();

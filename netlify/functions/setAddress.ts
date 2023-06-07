import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import * as dotenv from "dotenv";
import { setAddressResp } from "./utils";

dotenv.config();

const region = "us-east-1";
const voterTableName = "voter";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const client = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
  },
});

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) =>
  await setAddressResp(googleClientId)(voterTableName)(client)(event);

export { handler };

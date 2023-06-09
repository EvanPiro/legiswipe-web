import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import * as dotenv from "dotenv";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { getRedeemResp } from "./utils";

dotenv.config();

const region = "us-east-1";
const voterTableName = "voter";
const voteTableName = "vote";
const client = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
  },
});

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  console.log(event.queryStringParameters);
  return await getRedeemResp(voterTableName)(voteTableName)(client)(event);
};

export { handler };

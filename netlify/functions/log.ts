import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import * as dotenv from "dotenv";

dotenv.config();

const region = "us-east-1";
const tableName = "basic_data_service";
const user = "legiswipe";

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
  if (event.httpMethod != "POST")
    return {
      statusCode: 405,
    };
  event.headers;

  const timestamp = `${new Date().getTime().toString()}-${
    event.headers["x-nf-request-id"]
  }`;
  const command = new PutItemCommand({
    TableName: tableName,
    Item: marshall({
      user,
      timestamp,
      ...event,
      ...JSON.parse(event.body),
    }),
  });

  await client.send(command);
  return {
    statusCode: 200,
  };
};

export { handler };

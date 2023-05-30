import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import * as dotenv from "dotenv";
import * as gal from "google-auth-library";

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

  const timestamp = `${new Date().getTime().toString()}-${
    event.headers["x-nf-request-id"]
  }`;

  const data = JSON.parse(event.body);

  const authClient = new gal.OAuth2Client();

  const verifyRes = await authClient.verifyIdToken({
    idToken: data.credential,
    audience: process.env.ELM_APP_GOOGLE_CLIENT_ID,
  });

  const command = new PutItemCommand({
    TableName: tableName,
    Item: marshall({
      user,
      timestamp,
      ...event,
      ...data,
    }),
  });

  await client.send(command);
  return {
    statusCode: 200,
  };
};

export { handler };

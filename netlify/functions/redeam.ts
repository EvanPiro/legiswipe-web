import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import * as dotenv from "dotenv";

dotenv.config();

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  const data = {
    quantity: 610,
    address: event.queryStringParameters.address,
    timestamp: event.queryStringParameters.timestamp,
  };

  console.log(data);

  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
};

export { handler };

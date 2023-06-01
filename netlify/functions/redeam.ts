import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import * as dotenv from "dotenv";

dotenv.config();

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  console.log();
  return {
    statusCode: 200,
    body: JSON.stringify({
      quantity: 610,
      address: event.queryStringParameters.address,
    }),
  };
};

export { handler };

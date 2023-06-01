import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import * as dotenv from "dotenv";

dotenv.config();

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      quantity: 610,
      address: "0x1A22f8e327adD0320d7ea341dFE892e43bC60322",
    }),
  };
};

export { handler };

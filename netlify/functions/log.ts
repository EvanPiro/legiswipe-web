import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  if (event.httpMethod != "POST")
    return {
      statusCode: 405,
    };
  console.log("request made");
  console.log(event.body);

  return {
    statusCode: 200,
  };
};

export { handler };

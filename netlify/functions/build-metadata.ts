import { schedule } from "@netlify/functions";
import * as t from "io-ts";
import { flow, pipe } from "fp-ts/function";
import { task, taskEither as te } from "fp-ts";
import { StatusCodes } from "http-status-codes";
import { TaskEither } from "fp-ts/TaskEither";
import axios from "axios";
import * as dotenv from "dotenv";
import {
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { parse } from "./utils";

dotenv.config();

const congressApiKey = process.env.CONGRESS_API_KEY;

const congressApiUrl =
  "https://api.congress.gov/v3/bill?api_key=" + congressApiKey;

const region = "us-east-1";
const billsTableName = "Bills";
const client = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
  },
});

// To learn about scheduled functions and supported cron extensions,
// see: https://ntl.fyi/sched-func

// Request bills
// Decode bills
// Batch write bills

const BillMetadata = t.type({
  congress: t.number,
  originChamber: t.string,
  originChamberCode: t.string,
  number: t.string,
  text: t.string,
});

const BillsResp = t.type({
  bills: t.array(BillMetadata),
});

type IBillsResp = t.TypeOf<typeof BillsResp>;

const BillWithId = t.type({
  congress_chamber: t.string,
});

const BillItem = t.intersection([BillMetadata, BillWithId]);

type IBillItem = t.TypeOf<typeof BillItem>;

const getRawResp = (): TaskEither<string, any> =>
  te.tryCatch(
    async () => {
      const resp = await axios.get(congressApiUrl);
      return resp.data;
    },
    () => "Bills request failed"
  );

const rawRespToBillsResp = (resp: any): TaskEither<string, IBillsResp> =>
  pipe(
    te.fromEither(BillsResp.decode(resp)),
    te.mapLeft((err) => JSON.stringify(err))
  );

const billRespToBillItems = (billsResp: IBillsResp): IBillItem[] =>
  billsResp.bills.map((bill) => ({
    congress_chamber: `${bill.congress + ""}_${bill.originChamberCode}`,
    ...bill,
  }));

const saveBillItems =
  (tableName: string) =>
  (ddb: DynamoDBClient) =>
  (billItems: IBillItem[]): TaskEither<string, string[]> =>
    te.tryCatch(
      async () => {
        const params: BatchWriteItemCommandInput = {
          RequestItems: {
            [tableName]: billItems.map((item) => ({
              PutRequest: {
                Item: marshall(item),
              },
            })),
          },
        };

        const command = new BatchWriteItemCommand(params);

        await ddb.send(command);

        return billItems.map((item) => item.congress_chamber);
      },
      () => "Saving bills to DDB failed."
    );

export const handler = schedule(
  "* * * * *",
  async (event) =>
    await pipe(
      getRawResp(),
      te.chain(parse),
      te.chain(rawRespToBillsResp),
      te.map(billRespToBillItems),
      te.chain(saveBillItems(billsTableName)(client)),
      te.fold(
        (err) => {
          console.log(err, "asdfasdf");
          return task.of({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            body: "asdfdsaf",
          });
        },
        (ids) => {
          console.log(ids);

          return task.of({
            statusCode: StatusCodes.OK,
            body: ids.reduce((acc, val) => `${acc}, ${val}`, ""),
          });
        }
      )
    )()
);

// {
//   const eventBody = JSON.parse(event.body);
//
//   console.log(`Next function run at ${eventBody.next_run}.`);
//
//   return {
//     statusCode: 200,
//   };
// }

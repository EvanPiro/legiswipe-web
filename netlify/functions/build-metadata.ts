import { schedule } from "@netlify/functions";
import { pipe } from "fp-ts/function";
import { task, taskEither as te } from "fp-ts";
import { StatusCodes } from "http-status-codes";
import { TaskEither } from "fp-ts/TaskEither";
import axios from "axios";
import * as dotenv from "dotenv";
import {
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  PutItemCommand,
  PutItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import {
  congressApiBillsUrl,
  IBillMetadata,
  IBillsResp,
  IBillTweetQueueItem,
  rawRespToBillsResp,
} from "./tweet-utils";

dotenv.config();

const congressApiKey = process.env.CONGRESS_API_KEY;

const region = "us-east-1";
const billsTableName = "bill_tweet_queue";
const tweetReceiptTable = "bill_tweet_receipt";
const client = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
  },
});

const billMetadataToBillItem = ({
  congress,
  originChamberCode,
  latestAction,
  number,
  url,
}: IBillMetadata): IBillTweetQueueItem => ({
  id: `${congress + ""}_${originChamberCode}_${number}_${
    latestAction.actionDate
  }_${latestAction.text.slice(0, 80)}`,
  timestamp_added: new Date().getTime(),
  url,
});

const getRawResp = (congressApiKey: string): TaskEither<string, any> =>
  te.tryCatch(
    async () => {
      const resp = await axios.get(congressApiBillsUrl(congressApiKey));
      return resp.data;
    },
    () => "Bills request failed"
  );

const billRespToBillItems = (billsResp: IBillsResp): IBillTweetQueueItem[] =>
  billsResp.bills.map(billMetadataToBillItem);

const hasTweetBeenSent =
  (tweetTable: string) =>
  (ddb: DynamoDBClient) =>
  async (bill: IBillTweetQueueItem): Promise<boolean> => {
    const params: GetItemCommandInput = {
      TableName: tweetTable,
      Key: marshall({ id: bill.id }),
    };

    const command = new GetItemCommand(params);

    const res = await ddb.send(command);
    return !!res.Item;
  };

const saveBillItems =
  (tweetReceiptTable: string) =>
  (billQueueItemTable: string) =>
  (ddb: DynamoDBClient) =>
  (billItems: IBillTweetQueueItem[]): TaskEither<string, string[]> =>
    te.tryCatch(
      async () => {
        for (const bill of billItems) {
          try {
            const isSent = await hasTweetBeenSent(tweetReceiptTable)(ddb)(bill);

            if (!isSent) {
              const putParams: PutItemCommandInput = {
                TableName: billQueueItemTable,
                ConditionExpression: "attribute_not_exists(id)",
                Item: marshall(bill),
                ReturnValues: "NONE",
              };

              const putCommand = new PutItemCommand(putParams);
              await ddb.send(putCommand);
            }
          } catch (err) {
            console.log(err);
            if (err.code === "ConditionalCheckFailedException") throw err;
          }
        }

        return billItems.map((item) => `${item.id}`);
      },
      (err) => {
        console.log(err);
        return "Bill save failed";
      }
    );

export const handler = schedule(
  "0 */2 * * *",
  async (event) =>
    await pipe(
      getRawResp(congressApiKey),
      te.chain(rawRespToBillsResp),
      te.map(billRespToBillItems),
      te.chain(saveBillItems(tweetReceiptTable)(billsTableName)(client)),
      te.fold(
        (err) => {
          console.log(err);
          return task.of({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          });
        },
        (ids) => {
          console.log("Succeeded saving", ids);

          return task.of({
            statusCode: StatusCodes.OK,
          });
        }
      )
    )()
);

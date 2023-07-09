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
  billRespToBillItems,
  congressApiBillsUrl,
  getRawResp,
  IBillMetadata,
  IBillsResp,
  IBillTweetQueueItem,
  rawRespToBillsResp,
  saveBillItems,
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

export const handler = schedule(
  "0 */2 * * *",
  async (event) =>
    await pipe(
      getRawResp(0)(40)(congressApiKey),
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

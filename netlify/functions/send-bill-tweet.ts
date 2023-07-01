import { schedule } from "@netlify/functions";
import { ITwitterConfig, tweetLatestBill } from "./tweet-utils";
import * as dotenv from "dotenv";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

dotenv.config();

const congressApiKey = process.env.CONGRESS_API_KEY;

const region = "us-east-1";
const billsQueueTable = "bill_tweet_queue";
const tweetReceiptTable = "bill_tweet_receipt";
const dbb = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
  },
});

const twitter: ITwitterConfig = {
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  tokenSecret: process.env.TWITTER_TOKEN_SECRET,
};

// To learn about scheduled functions and supported cron extensions,
// see: https://ntl.fyi/sched-func
export const handler = schedule(
  "@hourly",
  tweetLatestBill(twitter)(congressApiKey)(billsQueueTable)(tweetReceiptTable)(
    dbb
  )
);

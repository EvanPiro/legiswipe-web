import * as t from "io-ts";
import { TaskEither } from "fp-ts/TaskEither";
import { task, taskEither as te } from "fp-ts";
import { pipe } from "fp-ts/function";
import { StatusCodes } from "http-status-codes";
import {
  DeleteItemCommand,
  DeleteItemInput,
  DynamoDBClient,
  PutItemCommand,
  PutItemCommandInput,
  ScanCommand,
  ScanCommandInput,
} from "@aws-sdk/client-dynamodb";
import axios from "axios";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import addOAuthInterceptor, { OAuthInterceptorConfig } from "axios-oauth-1.0a";
import { handles } from "./member-handles";

export const congressApiBillsUrl = (congressApiKey: string) =>
  "https://api.congress.gov/v3/bill?api_key=" + congressApiKey;

const authCongressApiUrl = (url: string) => (congressApiKey: string) =>
  `${url}&api_key=${congressApiKey}`;

export interface ITwitterConfig {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  tokenSecret: string;
}

const LatestAction = t.type({
  actionDate: t.string,
  text: t.string,
});

const BillMetadata = t.type({
  congress: t.number,
  originChamberCode: t.string,
  number: t.string,
  url: t.string,
  latestAction: LatestAction,
});

export type IBillMetadata = t.TypeOf<typeof BillMetadata>;

export const BillsResp = t.type({
  bills: t.array(BillMetadata),
});

export type IBillsResp = t.TypeOf<typeof BillsResp>;

const BillTweetQueueItem = t.type({
  id: t.string,
  url: t.string,
  timestamp_added: t.number,
});

const Sponsor = t.type({
  bioguideId: t.string,
  firstName: t.string,
  lastName: t.string,
  fullName: t.string,
  party: t.string,
  state: t.string,
  url: t.string,
});

const BillItem = t.type({
  congress: t.number,
  number: t.string,
  title: t.string,
  type: t.string,
  originChamber: t.string,
  policyArea: t.type({
    name: t.string,
  }),
  sponsors: t.array(Sponsor),
  latestAction: LatestAction,
});

type IBillItem = t.TypeOf<typeof BillItem>;

const BillResp = t.type({
  bill: BillItem,
});

type IBillResp = t.TypeOf<typeof BillResp>;

const BillTweetReceipt = t.type({
  id: t.string,
  bill: BillItem,
  tweet: t.any,
  tweet_id: t.string,
  time_sent: t.number,
});

type IBillTweetReceipt = t.TypeOf<typeof BillTweetReceipt>;

export const rawRespToBillsResp = (resp: any): TaskEither<string, IBillsResp> =>
  pipe(
    te.fromEither(BillsResp.decode(resp)),
    te.mapLeft((err) => JSON.stringify(err))
  );

export type IBillTweetQueueItem = t.TypeOf<typeof BillTweetQueueItem>;

const getLatestRawBillTweetQueueItem =
  (tweetQueueTable: string) =>
  (ddb: DynamoDBClient): TaskEither<string, any> =>
    te.tryCatch(
      async () => {
        const params: ScanCommandInput = {
          TableName: tweetQueueTable,
          Limit: 1,
        };

        const command = new ScanCommand(params);

        const res = await ddb.send(command);
        console.log(res.Items);
        return unmarshall(res.Items[0]);
      },
      (err) => {
        console.log(err);
        return "get latest bill tweet queue item look up failed";
      }
    );

const anyToBillTweetQueueItem = (
  data: any
): TaskEither<string, IBillTweetQueueItem> =>
  pipe(
    te.fromEither(BillTweetQueueItem.decode(data)),
    te.mapLeft((err) => {
      console.log(err);
      return JSON.stringify("any to bill tweet queue item parser failed");
    })
  );

const getRawBillFromQueueItem =
  (congressApiKey: string) =>
  (queueItem: IBillTweetQueueItem): TaskEither<string, any> =>
    te.tryCatch(
      async () => {
        const res = await axios.get(
          authCongressApiUrl(queueItem.url)(congressApiKey)
        );
        return res.data;
      },
      (err) => {
        console.log(err);
        return "getRawBillFromQueueItem failed";
      }
    );

const rawBillItemToBillResp = (resp: any): TaskEither<string, IBillResp> =>
  pipe(
    te.fromEither(BillResp.decode(resp)),
    te.mapLeft((err) => {
      console.log(JSON.stringify(err));
      return "raw bill item failed to parse";
    })
  );

const billToLink = (bill: IBillItem) => {
  const base = `https://www.congress.gov/bill/118th-congress`;
  switch (bill.type) {
    case "S":
      return `${base}/senate-bill/${bill.number}`;
    case "HJRES":
      return `${base}/house-joint-resolution/${bill.number}`;
    case "SRES":
      return `${base}/senate-resolution/${bill.number}`;
    case "HR":
      return `${base}/house-bill/${bill.number}`;
    case "HRES":
      return `${base}/house-resolution/${bill.number}`;
    default:
      return `${base}/senate-bill/${bill.number}`;
  }
};
``;

const billRespToTweetTuple = ({ bill }: IBillResp): [IBillItem, any] => {
  const sponsorHandle = handles.filter(
    ({ bioguideId }) => bioguideId === bill.sponsors[0]?.bioguideId
  )[0]?.handle;
  const sponsor = sponsorHandle ? sponsorHandle : bill.sponsors[0].fullName;
  console.log(handles.filter(({ bioguideId }) => bill.sponsors[0]?.bioguideId));
  console.log(sponsor);
  const tweet = {
    text: `"${bill.title}"

Latest Action: ${bill.latestAction.text}

${billToLink(bill)}

Sponsor: @${sponsor}`,
    poll: {
      options: ["Yes", "No"],
      duration_minutes: 60 * 24 * 7,
    },
  };
  return [bill, tweet];
};

const sendTweet =
  (twitter: ITwitterConfig) =>
  (billQueueItem: IBillTweetQueueItem) =>
  ([bill, tweet]: [IBillItem, any]): TaskEither<string, IBillTweetReceipt> =>
    te.tryCatch(
      async () => {
        const client = axios.create();

        const options: OAuthInterceptorConfig = {
          key: twitter.consumerKey,
          secret: twitter.consumerSecret,
          token: twitter.accessToken,
          tokenSecret: twitter.tokenSecret,
          algorithm: "HMAC-SHA1",
        };

        addOAuthInterceptor(client, options);

        const { data } = await client.post(
          "https://api.twitter.com/2/tweets",
          tweet
        );
        return {
          id: billQueueItem.id,
          bill,
          tweet,
          tweet_id: data.id,
          time_sent: new Date().getTime(),
        };
      },
      (err) => {
        console.log(err);
        return "tweet send failed";
      }
    );

const saveBillTweetReceipt =
  (tweetReceiptTable: string) =>
  (ddb: DynamoDBClient) =>
  (tweetReceipt: IBillTweetReceipt): TaskEither<string, IBillTweetReceipt> =>
    te.tryCatch(
      async () => {
        const params: PutItemCommandInput = {
          TableName: tweetReceiptTable,
          Item: marshall(tweetReceipt, { removeUndefinedValues: true }),
        };
        const command = new PutItemCommand(params);
        await ddb.send(command);
        return tweetReceipt;
      },
      (err) => {
        console.log(err);
        return "Save bill tweet receipt failed";
      }
    );

const removeBillTweetQueueItem =
  (queueTable: string) =>
  (ddb: DynamoDBClient) =>
  (queueItem: IBillTweetQueueItem) =>
  (): TaskEither<string, IBillTweetQueueItem> =>
    te.tryCatch(
      async () => {
        const params: DeleteItemInput = {
          TableName: queueTable,
          Key: {
            id: {
              S: queueItem.id,
            },
          },
        };
        const command = new DeleteItemCommand(params);
        await ddb.send(command);
        return queueItem;
      },
      (err) => {
        console.log(err);
        return "bill tweet queue item deletion failed";
      }
    );

export const tweetLatestBill =
  (twitterConfig: ITwitterConfig) =>
  (congressApiKey: string) =>
  (tweetQueueTable: string) =>
  (tweetReceiptTable: string) =>
  (ddb: DynamoDBClient) =>
  async () =>
    await pipe(
      getLatestRawBillTweetQueueItem(tweetQueueTable)(ddb),
      te.chain(anyToBillTweetQueueItem),
      te.chain((queueItem: IBillTweetQueueItem) =>
        pipe(
          getRawBillFromQueueItem(congressApiKey)(queueItem),
          te.chain(rawBillItemToBillResp),
          te.map(billRespToTweetTuple),
          te.chain(sendTweet(twitterConfig)(queueItem)),
          te.chain(saveBillTweetReceipt(tweetReceiptTable)(ddb)),
          te.chain(removeBillTweetQueueItem(tweetQueueTable)(ddb)(queueItem))
        )
      ),
      te.fold(
        (err) => {
          console.log(err);
          return task.of({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          });
        },
        (receipt) => {
          console.log("Tweet sent", receipt);
          return task.of({
            statusCode: StatusCodes.OK,
          });
        }
      )
    )();

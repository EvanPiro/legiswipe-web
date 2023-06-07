import { StatusCodes } from "http-status-codes";
import { HandlerEvent } from "@netlify/functions";
import { TaskEither } from "fp-ts/TaskEither";
import { task, taskEither as te } from "fp-ts";
import * as t from "io-ts";
import * as gal from "google-auth-library";
import {
  LoginTicket,
  TokenPayload,
} from "google-auth-library/build/src/auth/loginticket";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb/dist-types/DynamoDBClient";
import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import abi from "../../src/tokenAbi";
import { BigNumber, ethers } from "ethers";
import { flow, pipe } from "fp-ts/function";

interface AppError {
  statusCode: StatusCodes;
  message: string;
}

const VoterRequired = t.type({
  id: t.string,
  firstName: t.string,
  lastName: t.string,
  email: t.string,
});

const VoterPartial = t.partial({
  address: t.string,
  googleAuthPayload: t.any,
});

export const Voter = t.intersection([VoterRequired, VoterPartial]);

export const Voters = t.array(Voter);

export type IVoter = t.TypeOf<typeof Voter>;

const VoterRespRequired = t.type({
  firstName: t.string,
  canRedeem: t.number,
});

const VoterRespPartial = t.partial({
  address: t.string,
});

export const VoterResp = t.intersection([VoterRespRequired, VoterRespPartial]);

export type IVoterResp = t.TypeOf<typeof VoterResp>;

export const Vote = t.type({
  voterId: t.string,
  timestamp: t.number,
  billId: t.string,
  verdict: t.boolean,
  bill: t.any,
});

export type IVote = t.TypeOf<typeof Vote>;

export const Votes = t.array(Vote);

const VoteReq = t.type({
  verdict: t.boolean,
  billId: t.string,
  bill: t.any,
});

export type IVoteReq = t.TypeOf<typeof VoteReq>;

const RedeemReq = t.type({
  from: t.string,
  address: t.string,
});

export type IRedeemReq = t.TypeOf<typeof RedeemReq>;

const RedeemResp = t.type({
  quantity: t.number,
  address: t.string,
  from: t.number,
});

export type IRedeemResp = t.TypeOf<typeof RedeemResp>;

const mustBePost = (req: HandlerEvent): TaskEither<AppError, HandlerEvent> =>
  req.httpMethod === "POST"
    ? te.right(req)
    : te.left({
        statusCode: StatusCodes.METHOD_NOT_ALLOWED,
        message: "method must be post",
      });

const toBody = (req: HandlerEvent): TaskEither<AppError, any> =>
  te.tryCatch(
    async () => JSON.parse(req.body),
    () => ({
      statusCode: StatusCodes.BAD_REQUEST,
      message: "request JSON failed to parse",
    })
  );

const toCredentials = (body: any): TaskEither<AppError, any> =>
  body.credentials
    ? te.right(body.credentials)
    : te.left({
        statusCode: StatusCodes.BAD_REQUEST,
        message: "body must have credentials",
      });

const toLoginTicket =
  (googleClientId: string) =>
  (idToken: string): TaskEither<AppError, LoginTicket> =>
    te.tryCatch(
      async () => {
        const authClient = new gal.OAuth2Client();

        return await authClient.verifyIdToken({
          idToken,
          audience: googleClientId,
        });
      },
      () => ({
        statusCode: StatusCodes.UNAUTHORIZED,
        message: "invalid id token",
      })
    );

const toGoogleAuthPayload = (loginTicket: LoginTicket): TokenPayload =>
  loginTicket.getPayload();

const googleAuthPayloadToVoter = (payload: TokenPayload): IVoter => ({
  id: payload.sub,
  email: payload.email,
  firstName: payload.given_name,
  lastName: payload.family_name,
  googleAuthPayload: payload,
});

const addressToRawVoters =
  (voterTable: string) =>
  (client: DynamoDBClient) =>
  (address: string): TaskEither<AppError, any[]> =>
    te.tryCatch(
      async () => {
        const query = new ScanCommand({
          TableName: voterTable,
          Limit: 1,
          ExpressionAttributeValues: {
            ":address": { S: address.toLowerCase() },
          },
          FilterExpression: "address = :address",
        });
        const res = await client.send(query);
        const marshalledRes: any = res.Items.map((item) => {
          return unmarshall(item);
        });

        return marshalledRes;
      },
      (e) => {
        console.log(e);
        return {
          statusCode: StatusCodes.BAD_GATEWAY,
          message: "Voter by address lookup failed",
        };
      }
    );

const rawVotersToVoters = (d: any): TaskEither<AppError, IVoter[]> =>
  pipe(
    te.fromEither(Voters.decode(d)),
    te.mapLeft(() => ({
      statusCode: StatusCodes.BAD_GATEWAY,
      message: "Error decoding ddb voters",
    }))
  );

const votersToVoter = (voters: IVoter[]): TaskEither<AppError, IVoter> =>
  voters.length > 0
    ? te.right(voters[0])
    : te.left({
        statusCode: StatusCodes.NOT_FOUND,
        message: "voter is not found in database",
      });

const doesVoterExist =
  (tableName: string) =>
  (client: DynamoDBClient) =>
  (voter: IVoter): TaskEither<AppError, [IVoter, boolean]> =>
    te.tryCatch(
      async () => {
        const getItemCommand = new GetItemCommand({
          TableName: tableName,
          Key: {
            id: {
              S: voter.id,
            },
          },
        });
        const res = await client.send(getItemCommand);
        return res.Item
          ? [
              {
                ...voter,
                address: unmarshall(res.Item).address || null,
              },
              true,
            ]
          : [voter, false];
      },
      () => ({
        statusCode: StatusCodes.BAD_GATEWAY,
        message: "error connecting to voter database",
      })
    );

const createVoterIfNotExists =
  (tableName: string) =>
  (client: DynamoDBClient) =>
  ([voter, exists]: [IVoter, boolean]): TaskEither<AppError, IVoter> =>
    te.tryCatch(
      async () => {
        if (exists) return voter;
        else {
          const createItemCommand = new PutItemCommand({
            TableName: tableName,
            Item: marshall(voter),
            ConditionExpression: "attribute_not_exists(id)",
          });
          await client.send(createItemCommand);
          return voter;
        }
      },
      (err) => {
        console.log(err);
        return {
          statusCode: StatusCodes.BAD_GATEWAY,
          message: "Error finding or creating voter",
        };
      }
    );

const voterToLastRedeemed =
  (nodeUrl: string) =>
  (contractAddress: string) =>
  (voter: IVoter): TaskEither<AppError, number> =>
    te.tryCatch(
      async () => {
        if (!voter.address) {
          return 0;
        } else {
          const contract = flow(
            (url: string) => new ethers.providers.JsonRpcProvider(url),
            (provider) =>
              new ethers.Contract(contractAddress, abi.abi, provider)
          )(nodeUrl);
          const res = await contract.lastRedeemed(voter.address);
          console.log(res.toNumber());
          return res.toNumber();
        }
      },
      (e) => {
        console.log(e);
        return {
          statusCode: StatusCodes.BAD_GATEWAY,
          message: "Error loading last redeemed timestamp from chain",
        };
      }
    );

const getVotesFrom =
  (voteTableName: string) =>
  (client: DynamoDBClient) =>
  (voter: IVoter) =>
  (from: number): TaskEither<AppError, any[]> =>
    te.tryCatch(
      async () => {
        console.log("last redeemed on chain: ", from);
        const now = Math.floor(new Date().getTime() / 1000);
        console.log("now time: ", now);
        console.log("difference: ", now - from);
        const query = new QueryCommand({
          TableName: voteTableName,
          ExpressionAttributeValues: {
            ":from": { N: from + "" },
            ":id": { S: voter.id },
          },
          ExpressionAttributeNames: {
            "#ts": "timestamp",
          },
          KeyConditionExpression: "voterId = :id AND #ts > :from",
        });
        const res = await client.send(query);
        const marshalledRes: any = res.Items.map((item) => {
          return unmarshall(item);
        });

        return marshalledRes;
      },
      (err) => {
        console.log(err);
        return {
          statusCode: StatusCodes.BAD_GATEWAY,
          message: "Get votes DDB request failed",
        };
      }
    );

const decodeVotes = (d: any[]): TaskEither<AppError, IVote[]> =>
  pipe(
    te.fromEither(Votes.decode(d)),
    te.mapLeft(() => ({
      statusCode: StatusCodes.BAD_GATEWAY,
      message: "Error decoding DDB votes response ",
    }))
  );

const countVoterVotes = (votes: IVote[]): number => votes.length;

const countVotesFrom =
  (tableName: string) =>
  (client: DynamoDBClient) =>
  (voter: IVoter) =>
  (from: number): TaskEither<AppError, number> =>
    pipe(
      te.of(from),
      te.chain(getVotesFrom(tableName)(client)(voter)),
      te.chain(decodeVotes),
      te.map(countVoterVotes)
    );

const voterToVoterResp =
  (nodeUrl: string) =>
  (contractAddress: string) =>
  (tableName: string) =>
  (client: DynamoDBClient) =>
  (voter: IVoter): TaskEither<AppError, IVoterResp> =>
    pipe(
      te.of(voter),
      te.chain(voterToLastRedeemed(nodeUrl)(contractAddress)),
      te.chain(countVotesFrom(tableName)(client)(voter)),
      te.map((canRedeem: number) => ({
        firstName: voter.firstName,
        canRedeem,
        address: voter.address || null,
      }))
    );

const authVoter =
  (googleClientId: string) =>
  (voterTableName: string) =>
  (client: DynamoDBClient) =>
  (req: HandlerEvent): TaskEither<AppError, IVoter> =>
    pipe(
      te.of(req),
      te.chain(mustBePost),
      te.chain(toBody),
      te.chain(toCredentials),
      te.chain(toLoginTicket(googleClientId)),
      te.map(toGoogleAuthPayload),
      te.map(googleAuthPayloadToVoter),
      te.chain(doesVoterExist(voterTableName)(client)),
      te.chain(createVoterIfNotExists(voterTableName)(client))
    );

const decodeVoteReq = (rawVoteReq: any): TaskEither<AppError, IVoteReq> =>
  pipe(
    te.fromEither(VoteReq.decode(rawVoteReq)),
    te.mapLeft(() => ({
      statusCode: StatusCodes.BAD_REQUEST,
      message: "Error decoding Vote request",
    }))
  );

const toVote =
  (voter: IVoter) =>
  (voteReq: IVoteReq): IVote => ({
    voterId: voter.id,
    timestamp: Math.floor(new Date().getTime() / 1000),
    billId: voteReq.billId,
    verdict: voteReq.verdict,
    bill: voteReq.bill,
  });

const saveVote =
  (voteTable: string) =>
  (client: DynamoDBClient) =>
  (vote: IVote): TaskEither<AppError, IVote> =>
    te.tryCatch(
      async () => {
        const createItemCommand = new PutItemCommand({
          TableName: voteTable,
          Item: marshall(vote),
        });
        await client.send(createItemCommand);
        return vote;
      },
      () => ({
        statusCode: StatusCodes.BAD_GATEWAY,
        message: "Saving vote to database failed",
      })
    );

const toAddress = (data: any): TaskEither<AppError, string> =>
  data.address
    ? te.right(data.address)
    : te.left({
        statusCode: StatusCodes.BAD_REQUEST,
        message: "address is missing from request body",
      });

const toRedeemReq = (req: HandlerEvent): TaskEither<AppError, IRedeemReq> =>
  pipe(
    te.fromEither(RedeemReq.decode(req.queryStringParameters)),
    te.mapLeft((e) => {
      console.log(e);
      return {
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Error decoding redeem query string",
      };
    })
  );

const setAddressOnce =
  (voterTable: string) =>
  (client: DynamoDBClient) =>
  (voter: IVoter) =>
  (address: string): TaskEither<AppError, IVoter> =>
    te.tryCatch(
      async () => {
        if (voter.address) {
          return voter;
        } else {
          const updateItemCommand = new UpdateItemCommand({
            TableName: voterTable,
            Key: {
              id: { S: voter.id },
            },
            UpdateExpression: "SET address = :address",
            ExpressionAttributeValues: {
              ":address": { S: address.toLowerCase() },
            },
          });
          await client.send(updateItemCommand);
          return {
            ...voter,
            address,
          };
        }
      },
      (e) => {
        console.log(e);
        return {
          statusCode: StatusCodes.BAD_GATEWAY,
          message: "Saving address to database failed",
        };
      }
    );

export const getVoteResp =
  (googleClientId: string) =>
  (voterTableName: string) =>
  (voteTableName: string) =>
  (client: DynamoDBClient) =>
  async (req: HandlerEvent) =>
    await pipe(
      te.of(req),
      te.chain(authVoter(googleClientId)(voterTableName)(client)),
      te.chain((voter: IVoter) =>
        pipe(
          te.of(req),
          te.chain(toBody),
          te.chain(decodeVoteReq),
          te.map(toVote(voter)),
          te.chain(saveVote(voteTableName)(client))
        )
      ),
      te.fold(
        (err) =>
          task.of({
            statusCode: err.statusCode,
            body: JSON.stringify(err.message),
          }),
        (res) =>
          task.of({
            statusCode: StatusCodes.OK,
            body: JSON.stringify(res),
          })
      )
    )();

export const getVoterResp =
  (nodeUrl: string) =>
  (contractAddress: string) =>
  (googleClientId: string) =>
  (voterTableName: string) =>
  (voteTableName: string) =>
  (client: DynamoDBClient) =>
  async (req: HandlerEvent) =>
    await pipe(
      te.of(req),
      te.chain(authVoter(googleClientId)(voterTableName)(client)),
      te.chain(
        voterToVoterResp(nodeUrl)(contractAddress)(voteTableName)(client)
      ),
      te.fold(
        (err) =>
          task.of({
            statusCode: err.statusCode,
            body: JSON.stringify(err.message),
          }),
        (res) =>
          task.of({
            statusCode: StatusCodes.OK,
            body: JSON.stringify(res),
          })
      )
    )();

export const setAddressResp =
  (googleClientId: string) =>
  (voterTableName: string) =>
  (client: DynamoDBClient) =>
  async (req: HandlerEvent) =>
    await pipe(
      te.of(req),
      te.chain(authVoter(googleClientId)(voterTableName)(client)),
      te.chain((voter: IVoter) =>
        pipe(
          te.of(req),
          te.chain(toBody),
          te.chain(toAddress),
          te.chain(setAddressOnce(voterTableName)(client)(voter))
        )
      ),
      te.map((voter) => voter.address),
      te.fold(
        (err) =>
          task.of({
            statusCode: err.statusCode,
            body: JSON.stringify(err.message),
          }),
        (res) =>
          task.of({
            statusCode: StatusCodes.OK,
            body: JSON.stringify({ address: res }),
          })
      )
    )();

const toRedeemResp =
  (address: string) =>
  (from: number) =>
  (quantity: number): IRedeemResp => ({
    address,
    quantity,
    from,
  });

// @Todo `from` is sneaking in as a string when it should be a number
export const getRedeemResp =
  (voterTableName: string) =>
  (voteTableName: string) =>
  (client: DynamoDBClient) =>
  async (req: HandlerEvent) =>
    await pipe(
      toRedeemReq(req),
      te.chain(({ address, from }) =>
        pipe(
          te.of(address),
          te.chain(addressToRawVoters(voterTableName)(client)),
          te.chain(rawVotersToVoters),
          te.chain(votersToVoter),
          te.chain((voter) =>
            pipe(countVotesFrom(voteTableName)(client)(voter)(from))
          ),
          te.map(toRedeemResp(address)(from))
        )
      ),
      te.fold(
        (err) =>
          task.of({
            statusCode: err.statusCode,
            body: JSON.stringify(err.message),
          }),
        (res) =>
          task.of({
            statusCode: StatusCodes.OK,
            body: JSON.stringify(res),
          })
      )
    )();

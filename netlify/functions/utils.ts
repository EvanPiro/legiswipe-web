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
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import abi from "../../src/tokenAbi";
import { ethers } from "ethers";
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
          return await contract.lastRedeemed();
        }
      },
      () => ({
        statusCode: StatusCodes.BAD_GATEWAY,
        message: "Error loading last redeemed timestamp from chain",
      })
    );

const getVotesFrom =
  (tableName: string) =>
  (client: DynamoDBClient) =>
  (voter: IVoter) =>
  (from: number): TaskEither<AppError, any[]> =>
    te.tryCatch(
      async () => {
        const query = new QueryCommand({
          TableName: tableName,
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

const decodeVotes = (rawVotes: any[]): TaskEither<AppError, IVote[]> =>
  pipe(
    te.fromEither(Votes.decode(rawVotes)),
    te.mapLeft(() => ({
      statusCode: StatusCodes.BAD_GATEWAY,
      message: "Error decoding DDB votes response ",
    }))
  );

const countVoterVotes = (votes: IVote[]): number => votes.length;

const voterToVoterResp =
  (nodeUrl: string) =>
  (contractAddress: string) =>
  (tableName: string) =>
  (client: DynamoDBClient) =>
  (voter: IVoter): TaskEither<AppError, IVoterResp> =>
    pipe(
      te.of(voter),
      te.chain(voterToLastRedeemed(nodeUrl)(contractAddress)),
      te.chain(getVotesFrom(tableName)(client)(voter)),
      te.chain(decodeVotes),
      te.map(countVoterVotes),
      te.map((canRedeem) => ({
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
    timestamp: new Date().getTime(),
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

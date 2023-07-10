import {
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  billRespToActions,
  getRawResp,
  IAction,
  rawRespToBillsResp,
} from "./tweet-utils";
import { TaskEither } from "fp-ts/TaskEither";
import { task, taskEither as te } from "fp-ts";
import { marshall } from "@aws-sdk/util-dynamodb";
import { pipe } from "fp-ts/function";
import { StatusCodes } from "http-status-codes";

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const saveActions =
  (actionsTable: string) =>
  (ddb: DynamoDBClient) =>
  (actions: IAction[]): TaskEither<string, string[]> =>
    te.tryCatch(
      async () => {
        const params: BatchWriteItemCommandInput = {
          RequestItems: {
            [actionsTable]: actions.map((item) => ({
              PutRequest: {
                Item: marshall(item, { removeUndefinedValues: true }),
              },
            })),
          },
        };

        const command = new BatchWriteItemCommand(params);
        await ddb.send(command);

        await sleep(3000);
        console.log(`Sleep concluded at ${new Date().getTime()}`);

        return actions.map((item) => `${item.action}`);
      },
      (err) => {
        console.log(err);
        return "Bill save failed";
      }
    );

const indexActions =
  (congressApiKey: string) =>
  (actionsTable: string) =>
  (ddb: DynamoDBClient) =>
  (offset: number): TaskEither<string, string[]> =>
    pipe(
      getRawResp(offset)(25)(congressApiKey),
      te.chain(rawRespToBillsResp),
      te.map(billRespToActions),
      te.chain(saveActions(actionsTable)(ddb))
    );

interface IBatchConfig {
  numberOfBatches: number;
  batchSize: number;
}

const batches = ({ numberOfBatches, batchSize }: IBatchConfig) => {
  const res = [];
  for (let j = 0; j < numberOfBatches; j++) {
    res.push(batchSize * j);
  }
  console.log("batches res", res);
  return res;
};

const indexActionPages =
  (congressApiKey: string) =>
  (actionsTable: string) =>
  (ddb: DynamoDBClient) =>
  ({
    numberOfBatches,
    batchSize,
  }: IBatchConfig): TaskEither<string, readonly string[][]> =>
    te.traverseArray(indexActions(congressApiKey)(actionsTable)(ddb))(
      batches({ numberOfBatches, batchSize })
    );

export const indexActionsJob =
  (congressApiKey: string) =>
  (actionsTable: string) =>
  (ddb: DynamoDBClient) =>
  async (batchConfig: IBatchConfig) =>
    await pipe(
      indexActionPages(congressApiKey)(actionsTable)(ddb)(batchConfig),
      te.fold(
        (err) => {
          console.log(err);
          return task.of({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          });
        },
        (ids) => {
          // console.log("Succeeded saving", ids);

          return task.of({
            statusCode: StatusCodes.OK,
          });
        }
      )
    )();

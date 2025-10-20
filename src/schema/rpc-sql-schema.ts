import { boolean, enum_, InferOutput, null_, number, object, record, string, undefined_, union } from "valibot";

export enum SqlOperation {
  Update = 'Update',
  Delete = 'Delete',
  Insert = "Insert"
}

export const SqlValueSchema = union([
  string(),
  number(),
  boolean(),
  null_(),
  undefined_(),
]);

export const RecChngSchema = object({
  table: string(),
  id: number(),
  record: record(string(), SqlValueSchema),
  op: enum_(SqlOperation),
  issuer: string(),
});

export type RecChng = InferOutput<typeof RecChngSchema>;

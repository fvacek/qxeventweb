import { boolean, enum_, InferOutput, null_, nullable, number, object, optional, record, string, undefined_, undefinedable, union } from "valibot";

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
  issuer: optional(string()),
});

export type RecChng = InferOutput<typeof RecChngSchema>;

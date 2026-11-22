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

/** Record ID, integer for most tables, string for tables keyed by text (e.g. `config` keyed by `ckey`). */
export const RecIdSchema = union([number(), string()]);

export type RecId = InferOutput<typeof RecIdSchema>;

export const RecChngSchema = object({
  table: string(),
  id: RecIdSchema,
  record: optional(record(string(), SqlValueSchema)),
  op: enum_(SqlOperation),
  issuer: optional(string()),
});

export type RecChng = InferOutput<typeof RecChngSchema>;

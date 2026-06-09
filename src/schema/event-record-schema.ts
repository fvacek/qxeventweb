import * as v from "valibot";
import type { InferOutput } from "valibot";

// Accept numbers and booleans, transform into a boolean
export const BooleanFromSqlite = v.pipe(
  v.union([v.number(), v.boolean()]),
  v.transform((val) => val !== 0 && val !== false),
);

export const EventRecordSchema = v.object({
  id: v.number(),
  name: v.optional(v.string()),
  date: v.optional(v.string()),
  stage: v.number(),
  api_token: v.string(),
  owner: v.string(),
  is_local: BooleanFromSqlite,
});

export const EventRecordChangeSchema = v.object({
  name: v.optional(v.string()),
  date: v.optional(v.string()),
  stage: v.optional(v.number()),
  api_token: v.optional(v.string()),
  is_local: v.optional(v.boolean()),
});

export const EventTableRecordSchema = v.object({
  id: v.number(),
  name: v.optional(v.string()),
  date: v.optional(v.string()),
  owner: v.string(),
  is_local: BooleanFromSqlite,
});

export const EventRecordTableSchema = v.array(EventTableRecordSchema);

export type EventRecord = InferOutput<typeof EventRecordSchema>;
export type EventTableRecord = InferOutput<typeof EventTableRecordSchema>;

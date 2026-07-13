import * as v from "valibot";
import type { InferOutput } from "valibot";

// Accept numbers and booleans, transform into a boolean
export const BooleanFromSqlite = v.pipe(
  v.union([v.number(), v.boolean()]),
  v.transform((val) => val !== 0 && val !== false),
);

const EventMembersSchema = v.record(v.string(), v.string());
const EventConfigSchema = v.object({
  members: EventMembersSchema,
});

export const EventRecordSchema = v.object({
  id: v.number(),
  name: v.optional(v.string()),
  date: v.optional(v.string()),
  stage_count: v.number(),
  api_token: v.string(),
  owner: v.string(),
  is_local: BooleanFromSqlite,
  config: v.optional(EventConfigSchema),
});

export const EventTableRecordSchema = v.object({
  id: v.number(),
  name: v.optional(v.string()),
  date: v.optional(v.string()),
  stage_count: v.optional(v.number()),
  owner: v.string(),
  is_local: BooleanFromSqlite,
});

export const EventRecordTableSchema = v.array(EventTableRecordSchema);

export type EventMembers = InferOutput<typeof EventMembersSchema>;
export type EventRecord = InferOutput<typeof EventRecordSchema>;
export type EventTableRecord = InferOutput<typeof EventTableRecordSchema>;

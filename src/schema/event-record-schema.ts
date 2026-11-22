import * as v from "valibot";
import type { InferOutput } from "valibot";
import type { RpcValue } from "libshv-js";

const EventDbModeSchema = v.picklist(["Archived", "ReadOnly", "Master", "Replica"]);

const EventMembersSchema = v.record(v.string(), v.string());
const EventConfigSchema = v.object({
  members: EventMembersSchema,
});

export const EventRecordSchema = v.object({
  id: v.number(),
  name: v.optional(v.string()),
  /** Local date of the event start, `YYYY-MM-DD` */
  date: v.optional(v.string()),
  /** Local time of the event start, `HH:MM:SS` */
  time: v.optional(v.string()),
  stage_count: v.number(),
  api_token: v.string(),
  owner: v.string(),
  db_mode: EventDbModeSchema,
  config: v.optional(EventConfigSchema),
});

export const EventTableRecordSchema = v.object({
  id: v.number(),
  name: v.optional(v.string()),
  /** Local date of the event start, `YYYY-MM-DD` */
  date: v.optional(v.string()),
  /** Local time of the event start, `HH:MM:SS` */
  time: v.optional(v.string()),
  stage_count: v.optional(v.number()),
  owner: v.string(),
  db_mode: EventDbModeSchema,
});

export const EventRecordTableSchema = v.array(EventTableRecordSchema);

export const EventIdParamSchema = v.object({
  event_id: v.number(),
});

export const ApiTokenParamSchema = v.object({
  api_token: v.string(),
});

export const CreateEventParamSchema = v.object({
  owner: v.string(),
});

export const CreateEventResultSchema = v.object({
  event_id: v.number(),
  api_token: v.string(),
});

export const OpenEventResultSchema = v.object({
  event_id: v.number(),
  mount_point: v.string(),
});

export const UpdateEventRecordParamSchema = v.object({
  event_id: v.number(),
  change: v.record(v.string(), v.custom<RpcValue>(() => true)),
});

export type EventDbMode = InferOutput<typeof EventDbModeSchema>;
export type EventMembers = InferOutput<typeof EventMembersSchema>;
export type EventRecord = InferOutput<typeof EventRecordSchema>;
export type EventTableRecord = InferOutput<typeof EventTableRecordSchema>;

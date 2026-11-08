import { makeMap, type RpcValue } from "libshv-js";
import { object, number, string, parse, type InferOutput, optional, boolean, union, pipe, transform } from "valibot";

import { createSqlTable } from "~/lib/SqlTable";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";

const LateEntryKindSchema = object({
  Update: optional(object({ runId: number() })),
  NewEntry: optional(object({ classId: number() })),
  DeleteEntry: optional(object({ runId: number() })),
});
type LateEntryKind = InferOutput<typeof LateEntryKindSchema>;

export function lateEntryKind(runId: number | undefined, classId: number | undefined): LateEntryKind {
  if (runId) return { Update: { runId } };
  if (classId !== undefined) return { NewEntry: { classId } };
  return {};
}

export const LateEntrySchema = object({
  kind: LateEntryKindSchema,
  firstname: optional(string()),
  lastname: optional(string()),
  registration: optional(string()),
  siid: optional(number()),
  note: optional(string()),
  starttimems: optional(number()),
});
export type LateEntry = InferOutput<typeof LateEntrySchema>;

const QxChangeDataSchema = object({
  LateEntry: optional(LateEntrySchema),
});

const RunSchema = object({
  run_id: optional(number()),
  competitor_id: optional(number()),
  class_name: optional(string()),
  firstname: optional(string()),
  lastname: optional(string()),
  registration: optional(string()),
  siid: optional(number()),
  note: optional(string()),
  starttimems: optional(number()),
  qxchange_id: optional(number()),
  qxchange_created: optional(string()),
  qxchange_user_id: optional(string()),
  qxchange_status: optional(string()),
  qxchange_status_message: optional(string()),
  qxchange_paid: optional(pipe(union([boolean(), number()]), transform(v => Boolean(v)))),
  qxchange_data: optional(QxChangeDataSchema),
});
export type Run = InferOutput<typeof RunSchema>;

export function sqlQuotedString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizeRunRecord(record: Record<string, unknown>): Record<string, unknown> {
  const rawChange = record.qxchange_data;
  if (typeof rawChange !== "string") return record;
  return { ...record, qxchange_data: JSON.parse(rawChange) };
}

export function parseRunsQueryResult(result: RpcValue): Run[] {
  const table = createSqlTable(result);
  const transformedRuns: Run[] = [];
  for (let i = 0; i < table.rowCount(); i++) {
    try {
      transformedRuns.push(parse(RunSchema, normalizeRunRecord(table.recordAt(i))));
    } catch (error) {
      console.warn(`Skipping invalid row ${i}:`, error);
    }
  }
  return transformedRuns;
}

export const str = (value: unknown, fallback?: string): string | undefined =>
  typeof value === "string" ? value : fallback;

export function paidValue(value: unknown, fallback?: boolean): boolean | undefined {
  return typeof value === "boolean" || typeof value === "number" ? Boolean(value) : fallback;
}

type RecChngRecord = RecChng["record"];

/** Lowercases record keys, so DB column casing (e.g. QuickEvent's `startTimeMs`) matches `Run` keys. */
export function normalizedRecChngRecord(recchng: RecChng): RecChngRecord {
  const record = recchng.record;
  return record && Object.fromEntries(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]));
}

export function parseLateEntryFromRecChng(record: RecChngRecord): LateEntry | undefined {
  if (!record || typeof record.data !== "string") return undefined;

  try {
    return parse(QxChangeDataSchema, JSON.parse(record.data)).LateEntry;
  } catch (error) {
    console.warn("Invalid qxchange LateEntry data:", error, record.data);
    return undefined;
  }
}

/**
 * Applies `runs` / `competitors` record changes, shared by every Run based view.
 * Returns `undefined` when the change is not one of those, so the caller handles it.
 */
export function applyRunRecChng(runs: Run[], recchng: RecChng, record: RecChngRecord): Run[] | undefined {
  const { table, id, op } = recchng;

  if (table === "runs") {
    if (op === SqlOperation.Update) return runs.map(r => r.run_id === id ? { ...r, ...record } : r);
    if (op === SqlOperation.Delete) return runs.filter(r => r.run_id !== id);
    return runs;
  }
  if (table === "competitors") {
    if (op === SqlOperation.Update) return runs.map(r => r.competitor_id === id ? { ...r, ...record } : r);
    return runs;
  }
  return undefined;
}

export function lateEntryRpcParams(stageId: number, changeId: number | undefined, lateEntry: LateEntry) {
  return makeMap({
    stage_id: stageId,
    change_id: changeId,
    late_entry: makeMap({
      ...lateEntry,
      kind: makeMap(Object.fromEntries(
        Object.entries(lateEntry.kind).map(([variant, fields]) => [variant, makeMap(fields)]),
      )),
    }),
  });
}

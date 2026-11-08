import { makeMap, type RpcValue } from "libshv-js";
import { object, number, string, parse, safeParse, type InferOutput, optional, boolean, union, pipe, transform, unknown } from "valibot";

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

/** Run and competitor data of a row. */
export type RunInfo = {
  run_id: number;
  competitor_id: number;
  firstname?: string;
  lastname?: string;
  registration?: string;
  siid?: number;
  note?: string;
  starttimems?: number;
};

/** A `qxchanges` record holding a LateEntry. */
export type QxChange = {
  id: number;
  created?: string;
  user_id?: string;
  status: string;
  status_message?: string;
  paid: boolean;
  lateEntry: LateEntry;
};

/** Shape shared by every late-entry based row, the dialog works with it. */
export type LateEntryRowBase = {
  run?: RunInfo;
  class_name?: string;
  change?: QxChange;
};

/** Flat row as returned by the runs / late entries SQL queries. */
const SqlRowSchema = object({
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
  qxchange_data: optional(unknown()),
});
export type SqlRow = InferOutput<typeof SqlRowSchema>;

export function sqlQuotedString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function parseLateEntryData(data: unknown): LateEntry | undefined {
  try {
    const json = typeof data === "string" ? JSON.parse(data) : data;
    const result = safeParse(QxChangeDataSchema, json);
    if (result.success) return result.output.LateEntry;
    console.warn("Invalid qxchange LateEntry data:", result.issues, data);
  } catch (error) {
    console.warn("Invalid qxchange LateEntry data:", error, data);
  }
  return undefined;
}

export function runInfoFromSqlRow(row: SqlRow): RunInfo | undefined {
  if (row.run_id === undefined || row.competitor_id === undefined) return undefined;
  const { run_id, competitor_id, firstname, lastname, registration, siid, note, starttimems } = row;
  return { run_id, competitor_id, firstname, lastname, registration, siid, note, starttimems };
}

export function changeFromSqlRow(row: SqlRow): QxChange | undefined {
  if (row.qxchange_id === undefined) return undefined;
  const lateEntry = parseLateEntryData(row.qxchange_data);
  if (!lateEntry || row.qxchange_status === undefined) {
    console.warn(`Skipping invalid qxchange ${row.qxchange_id}`, row);
    return undefined;
  }
  return {
    id: row.qxchange_id,
    created: row.qxchange_created,
    user_id: row.qxchange_user_id,
    status: row.qxchange_status,
    status_message: row.qxchange_status_message,
    paid: row.qxchange_paid ?? false,
    lateEntry,
  };
}

export function parseSqlRows(result: RpcValue): SqlRow[] {
  const table = createSqlTable(result);
  const rows: SqlRow[] = [];
  for (let i = 0; i < table.rowCount(); i++) {
    try {
      rows.push(parse(SqlRowSchema, table.recordAt(i)));
    } catch (error) {
      console.warn(`Skipping invalid row ${i}:`, error);
    }
  }
  return rows;
}

export const str = (value: unknown, fallback?: string): string | undefined =>
  typeof value === "string" ? value : fallback;

const num = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

export function paidValue(value: unknown, fallback?: boolean): boolean | undefined {
  return typeof value === "boolean" || typeof value === "number" ? Boolean(value) : fallback;
}

/** Start time shown for a row, the changed one if the change sets it. */
export function effectiveStartTime(row: LateEntryRowBase): number | undefined {
  return row.change?.lateEntry.starttimems ?? row.run?.starttimems;
}

/**
 * A row without a change (a run not changed yet, or a new entry) can be edited by anyone,
 * a pending change only by its owner or an organizer.
 */
export function canEditLateEntry(row: LateEntryRowBase | undefined, userId: string | undefined, isOrganizer: boolean): boolean {
  if (!userId || !row) return false;
  const change = row.change;
  if (!change) return true;
  if (change.status !== "Pending") return false;
  return isOrganizer || change.user_id === userId;
}

type RecChngRecord = RecChng["record"];

/** Lowercases record keys, so DB column casing (e.g. QuickEvent's `startTimeMs`) matches `RunInfo` keys. */
export function normalizedRecChngRecord(recchng: RecChng): RecChngRecord {
  const record = recchng.record;
  return record && Object.fromEntries(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]));
}

export function parseLateEntryFromRecChng(record: RecChngRecord): LateEntry | undefined {
  if (!record || typeof record.data !== "string") return undefined;
  return parseLateEntryData(record.data);
}

/** Builds a change from a `qxchanges` Insert record. */
export function changeFromRecChng(id: number, record: RecChngRecord): QxChange | undefined {
  const lateEntry = parseLateEntryFromRecChng(record);
  const userId = str(record?.user_id);
  if (!lateEntry || !userId) {
    console.warn("processRecChng: [Insert] Skipping — lateEntry or user_id missing", { lateEntry, user_id: userId });
    return undefined;
  }
  return {
    id,
    created: str(record?.created),
    user_id: userId,
    status: str(record?.status) ?? "Pending",
    status_message: str(record?.status_message),
    paid: paidValue(record?.paid) ?? false,
    lateEntry,
  };
}

/** Applies a `qxchanges` Update record, update signals are partial. */
export function patchChange(change: QxChange, record: RecChngRecord): QxChange {
  return {
    ...change,
    status: str(record?.status) ?? change.status,
    status_message: str(record?.status_message, change.status_message),
    paid: paidValue(record?.paid) ?? change.paid,
    lateEntry: parseLateEntryFromRecChng(record) ?? change.lateEntry,
  };
}

/** Run id the change refers to, a new entry has none. */
export function changeRunId(lateEntry: LateEntry): number | undefined {
  return lateEntry.kind.Update?.runId ?? lateEntry.kind.DeleteEntry?.runId;
}

const RUN_INFO_STRING_KEYS = ["firstname", "lastname", "registration", "note"] as const;
const RUN_INFO_NUMBER_KEYS = ["siid", "starttimems"] as const;

/** Copies only the known `RunInfo` columns of a `runs` / `competitors` record. */
function patchRunInfo(run: RunInfo, record: RecChngRecord): RunInfo {
  if (!record) return run;
  const patched = { ...run };
  for (const key of RUN_INFO_STRING_KEYS) if (key in record) patched[key] = str(record[key]);
  for (const key of RUN_INFO_NUMBER_KEYS) if (key in record) patched[key] = num(record[key]);
  return patched;
}

/**
 * Applies `runs` / `competitors` record changes, shared by every row type.
 * A deleted run is passed to `onRunDeleted`, which returns the row to keep, or `undefined` to drop it.
 * Returns `undefined` when the change is not one of those tables, so the caller handles it.
 */
export function applyRunRecChng<T extends LateEntryRowBase>(
  rows: T[],
  recchng: RecChng,
  record: RecChngRecord,
  onRunDeleted: (row: T) => T | undefined,
): T[] | undefined {
  const { table, id, op } = recchng;
  const patchRows = (matches: (run: RunInfo) => boolean): T[] =>
    rows.map(r => r.run && matches(r.run) ? { ...r, run: patchRunInfo(r.run, record) } : r);

  if (table === "runs") {
    if (op === SqlOperation.Update) return patchRows(run => run.run_id === id);
    if (op === SqlOperation.Delete) return rows.flatMap(r => r.run?.run_id === id ? (onRunDeleted(r) ?? []) : [r]);
    return rows;
  }
  if (table === "competitors") {
    if (op === SqlOperation.Update) return patchRows(run => run.competitor_id === id);
    return rows;
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

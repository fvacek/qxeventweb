import { makeMap, type RpcValue } from "libshv-js";
import { object, number, string, parse, safeParse, type InferOutput, optional, boolean, union, pipe, transform, unknown } from "valibot";

import { createSqlTable } from "~/lib/SqlTable";
import { normalizedRecChngRecord, num, str, type RecChngRecord } from "~/lib/recChng";
import { type RecChng, SqlOperation } from "~/schema/rpc-sql-schema";

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

const LateEntrySchema = object({
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

/**
 * A run and/or its late-entry change, used by the runs and late entries tables and the dialog.
 * A new entry has no run, an unchanged run has no change.
 */
export type RunnerEntryRow = {
  class_name: string;
  run?: RunInfo;
  change?: QxChange;
};

/** Flat row as returned by the runs / late entries SQL queries, see `LATE_ENTRY_ROW_COLUMNS`. */
const SqlRunnerRowSchema = object({
  run_id: optional(number()),
  competitor_id: optional(number()),
  class_name: optional(string()),
  firstname: optional(string()),
  lastname: optional(string()),
  registration: optional(string()),
  siid: optional(number()),
  starttimems: optional(number()),
  qxchange_id: optional(number()),
  qxchange_created: optional(string()),
  qxchange_user_id: optional(string()),
  qxchange_status: optional(string()),
  qxchange_status_message: optional(string()),
  qxchange_paid: optional(pipe(union([boolean(), number()]), transform(v => Boolean(v)))),
  qxchange_data: optional(unknown()),
});
type SqlRunnerRow = InferOutput<typeof SqlRunnerRowSchema>;

/** SELECT list of the runs / late entries queries, it has to match `SqlRowSchema`. */
export const RUNNER_ROW_COLUMNS = `runs.id AS run_id, runs.siid, runs.starttimems,
  competitors.id AS competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
  qxchanges.id AS qxchange_id, qxchanges.created AS qxchange_created,
  qxchanges.status AS qxchange_status, qxchanges.status_message AS qxchange_status_message,
  qxchanges.paid AS qxchange_paid,
  qxchanges.data AS qxchange_data, qxchanges.user_id AS qxchange_user_id`;

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

export function runInfoFromSqlRow(row: SqlRunnerRow): RunInfo | undefined {
  if (row.run_id === undefined || row.competitor_id === undefined) return undefined;
  const { run_id, competitor_id, firstname, lastname, registration, siid, starttimems } = row;
  return { run_id, competitor_id, firstname, lastname, registration, siid, starttimems };
}

export function changeFromSqlRow(row: SqlRunnerRow): QxChange | undefined {
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

export function parseSqlRows(result: RpcValue): SqlRunnerRow[] {
  const table = createSqlTable(result);
  const rows: SqlRunnerRow[] = [];
  for (let i = 0; i < table.rowCount(); i++) {
    try {
      rows.push(parse(SqlRunnerRowSchema, table.recordAt(i)));
    } catch (error) {
      console.warn(`Skipping invalid row ${i}:`, error);
    }
  }
  return rows;
}

function paidValue(value: unknown, fallback?: boolean): boolean | undefined {
  return typeof value === "boolean" || typeof value === "number" ? Boolean(value) : fallback;
}

/** Start time shown for a row, the changed one if the change sets it. */
export function effectiveStartTime(row: RunnerEntryRow): number | undefined {
  return row.change?.lateEntry.starttimems ?? row.run?.starttimems;
}

/**
 * A row without a change (a run not changed yet, or a new entry) can be edited by anyone,
 * a pending change only by its owner or an organizer.
 */
export function canEditLateEntry(row: RunnerEntryRow | undefined, userId: string | undefined, isOrganizer: boolean): boolean {
  if (!userId || !row) return false;
  const change = row.change;
  if (!change) return true;
  if (change.status !== "Pending") return false;
  return isOrganizer || change.user_id === userId;
}

function parseLateEntryFromRecChng(record: RecChngRecord): LateEntry | undefined {
  if (!record || typeof record.data !== "string") return undefined;
  return parseLateEntryData(record.data);
}

/** Builds a change from a `qxchanges` Insert record. */
export function changeFromRecChng(id: number, record: RecChngRecord): QxChange | undefined {
  const lateEntry = parseLateEntryFromRecChng(record);
  const userId = str(record?.user_id);
  if (!lateEntry || !userId) {
    console.warn("changeFromRecChng: Skipping — lateEntry or user_id missing", { lateEntry, user_id: userId });
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

const RUN_INFO_STRING_KEYS = ["firstname", "lastname", "registration"] as const;
const RUN_INFO_NUMBER_KEYS = ["siid", "starttimems"] as const;

/** Copies only the known `RunInfo` columns of a `runs` / `competitors` record. */
export function patchRunInfo(run: RunInfo, record: RecChngRecord): RunInfo {
  if (!record) return run;
  const patched = { ...run };
  for (const key of RUN_INFO_STRING_KEYS) if (key in record) patched[key] = str(record[key]);
  for (const key of RUN_INFO_NUMBER_KEYS) if (key in record) patched[key] = num(record[key]);
  return patched;
}

/** Run id the change refers to, a new entry has none. */
export function changeRunId(lateEntry: LateEntry): number | undefined {
  return lateEntry.kind.Update?.runId ?? lateEntry.kind.DeleteEntry?.runId;
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

export function fullName(lastname?: string, firstname?: string): string {
  return [lastname, firstname].filter(n => n?.trim()).join(" ");
}

export function formatStartTime(msec: number | undefined, start: Date | undefined): string {
  if (msec === undefined || !start) return "";
  const date = new Date(start.getTime() + msec);
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Compares possibly missing values, missing ones sort last. */
export function compareOptional<V extends string | number>(a: V | undefined, b: V | undefined): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return typeof a === "string" ? a.localeCompare(b as string) : (a as number) - (b as number);
}

export function parseRunnerRows(result: RpcValue): RunnerEntryRow[] {
  return parseSqlRows(result).flatMap(row => {
    const run = runInfoFromSqlRow(row);
    if (!run || row.class_name === undefined) {
      console.warn("Skipping run row without run_id, competitor_id or class_name", row);
      return [];
    }
    return [{ run, class_name: row.class_name, change: changeFromSqlRow(row) }];
  });
}

/** Patches the run data of rows whose run has the given run or competitor id. */
function patchRunRows(rows: RunnerEntryRow[], key: "run_id" | "competitor_id", id: number, record: RecChngRecord): RunnerEntryRow[] {
  return rows.map(r => r.run?.[key] === id ? { ...r, run: patchRunInfo(r.run, record) } : r);
}

function clearChange(rows: RunnerEntryRow[], changeId: number): RunnerEntryRow[] {
  return rows.map(r => r.change?.id === changeId ? { ...r, change: undefined } : r);
}

/**
 * Applies a record change to the runs table rows.
 * An inserted run carries neither class nor names, so it is ignored; `onCompetitorInserted` lets the caller
 * reload once the new competitor's runs are written.
 */
export function applyRecChngToRuns(rows: RunnerEntryRow[], recchng: RecChng, onCompetitorInserted?: (record: RecChngRecord) => void): RunnerEntryRow[] {
  const { table, id, op } = recchng;
  const record = normalizedRecChngRecord(recchng);

  switch (table) {
    case "runs":
      if (op === SqlOperation.Update) return patchRunRows(rows, "run_id", id, record);
      if (op === SqlOperation.Delete) return rows.filter(r => r.run?.run_id !== id);
      return rows;

    case "competitors":
      if (op === SqlOperation.Update) return patchRunRows(rows, "competitor_id", id, record);
      if (op === SqlOperation.Insert) onCompetitorInserted?.(record);
      return rows;

    case "qxchanges":
      switch (op) {
        case SqlOperation.Delete:
          return clearChange(rows, id);

        case SqlOperation.Insert: {
          const change = changeFromRecChng(id, record);
          const runId = change && changeRunId(change.lateEntry);
          if (!change || runId === undefined) return rows;
          return rows.map(r => r.run?.run_id === runId ? { ...r, change } : r);
        }

        case SqlOperation.Update: {
          // Update signals are partial: a data-only change carries no `status`.
          // Only a status that left Pending means the change is resolved.
          const status = str(record?.status);
          if (status !== undefined && status !== "Pending") {
            return clearChange(rows, id);
          }
          return rows.map(r => r.change?.id === id ? { ...r, change: patchChange(r.change, record) } : r);
        }
      }
      return rows;

    default:
      return rows;
  }
}

export function parseRunnerEntryRows(result: RpcValue): RunnerEntryRow[] {
  return parseSqlRows(result).flatMap(row => {
    const change = changeFromSqlRow(row);
    if (!change) return [];
    if (row.class_name === undefined) {
      console.warn("Skipping late entry row without class_name", row);
      return [];
    }
    return [{ run: runInfoFromSqlRow(row), class_name: row.class_name, change }];
  });
}

/**
 * Applies a record change to the late entries table rows.
 * @param ownerId when set, inserted changes of other users are ignored, the same way the query filters them.
 */
export function applyRecChngToLateEntries(rows: RunnerEntryRow[], recchng: RecChng, ownerId: string | undefined): RunnerEntryRow[] {
  const { table, id, op } = recchng;
  const record = normalizedRecChngRecord(recchng);

  switch (table) {
    case "runs":
      if (op === SqlOperation.Update) return patchRunRows(rows, "run_id", id, record);
      // A deleted run keeps its changes, e.g. an accepted DeleteEntry, only the run data is gone.
      if (op === SqlOperation.Delete) return rows.map(r => r.run?.run_id === id ? { ...r, run: undefined } : r);
      return rows;

    case "competitors":
      if (op === SqlOperation.Update) return patchRunRows(rows, "competitor_id", id, record);
      return rows;

    case "qxchanges":
      switch (op) {
        case SqlOperation.Delete:
          return rows.filter(r => r.change?.id !== id);

        case SqlOperation.Insert: {
          const change = changeFromRecChng(id, record);
          if (!change) return rows;
          if (ownerId !== undefined && change.user_id !== ownerId) return rows;

          // Take the original run data from another change of the same run, a new entry
          // has no run, only the class name from another new entry in the same class.
          // Without such a row the class name stays empty until the next reload.
          const runId = changeRunId(change.lateEntry);
          const classId = change.lateEntry.kind.NewEntry?.classId;
          const base = runId !== undefined
            ? rows.find(r => r.run?.run_id === runId)
            : rows.find(r => classId !== undefined && r.change?.lateEntry.kind.NewEntry?.classId === classId);
          const inserted: RunnerEntryRow = {
            run: runId !== undefined ? base?.run : undefined,
            class_name: base?.class_name ?? "",
            change,
          };
          // The query orders by qxchanges.id DESC.
          return [inserted, ...rows];
        }

        case SqlOperation.Update:
          return rows.map(r => r.change?.id === id ? { ...r, change: patchChange(r.change, record) } : r);
      }
      return rows;

    default:
      return rows;
  }
}

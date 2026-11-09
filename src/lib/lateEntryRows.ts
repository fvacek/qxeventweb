import type { RpcValue } from "libshv-js";

import { normalizedRecChngRecord, str, type RecChngRecord } from "~/lib/recChng";
import {
  changeFromRecChng,
  changeFromSqlRow,
  changeRunId,
  parseSqlRows,
  patchChange,
  patchRunInfo,
  runInfoFromSqlRow,
  type QxChange,
  type RunInfo,
} from "~/lib/lateEntry";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";

/** Runs table row: a run, optionally with its pending change. */
export type RunRow = {
  run: RunInfo;
  class_name: string;
  change?: QxChange;
};

export function parseRunRows(result: RpcValue): RunRow[] {
  return parseSqlRows(result).flatMap(row => {
    const run = runInfoFromSqlRow(row);
    if (!run || row.class_name === undefined) {
      console.warn("Skipping run row without run_id, competitor_id or class_name", row);
      return [];
    }
    return [{ run, class_name: row.class_name, change: changeFromSqlRow(row) }];
  });
}

function clearChange(rows: RunRow[], changeId: number): RunRow[] {
  return rows.map(r => r.change?.id === changeId ? { ...r, change: undefined } : r);
}

/**
 * Applies a record change to the runs table rows.
 * An inserted run carries neither class nor names, so it is ignored; `onCompetitorInserted` lets the caller
 * reload once the new competitor's runs are written.
 */
export function applyRecChngToRuns(rows: RunRow[], recchng: RecChng, onCompetitorInserted?: (record: RecChngRecord) => void): RunRow[] {
  const { table, id, op } = recchng;
  const record = normalizedRecChngRecord(recchng);

  switch (table) {
    case "runs":
      if (op === SqlOperation.Update) return rows.map(r => r.run.run_id === id ? { ...r, run: patchRunInfo(r.run, record) } : r);
      if (op === SqlOperation.Delete) return rows.filter(r => r.run.run_id !== id);
      return rows;

    case "competitors":
      if (op === SqlOperation.Update) return rows.map(r => r.run.competitor_id === id ? { ...r, run: patchRunInfo(r.run, record) } : r);
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
          return rows.map(r => r.run.run_id === runId ? { ...r, change } : r);
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

/** Late entries table row: a change, with the run it applies to, if any (a new entry has none). */
export type LateEntryRow = {
  run?: RunInfo;
  class_name?: string;
  change: QxChange;
};

export function parseLateEntryRows(result: RpcValue): LateEntryRow[] {
  return parseSqlRows(result).flatMap(row => {
    const change = changeFromSqlRow(row);
    if (!change) return [];
    return [{ run: runInfoFromSqlRow(row), class_name: row.class_name, change }];
  });
}

/**
 * Applies a record change to the late entries table rows.
 * @param ownerId when set, inserted changes of other users are ignored, the same way the query filters them.
 */
export function applyRecChngToLateEntries(rows: LateEntryRow[], recchng: RecChng, ownerId: string | undefined): LateEntryRow[] {
  const { table, id, op } = recchng;
  const record = normalizedRecChngRecord(recchng);

  switch (table) {
    case "runs":
      if (op === SqlOperation.Update) return rows.map(r => r.run?.run_id === id ? { ...r, run: patchRunInfo(r.run, record) } : r);
      // A deleted run keeps its changes, e.g. an accepted DeleteEntry, only the run data is gone.
      if (op === SqlOperation.Delete) return rows.map(r => r.run?.run_id === id ? { ...r, run: undefined } : r);
      return rows;

    case "competitors":
      if (op === SqlOperation.Update) return rows.map(r => r.run?.competitor_id === id ? { ...r, run: patchRunInfo(r.run, record) } : r);
      return rows;

    case "qxchanges":
      switch (op) {
        case SqlOperation.Delete:
          return rows.filter(r => r.change.id !== id);

        case SqlOperation.Insert: {
          const change = changeFromRecChng(id, record);
          if (!change) return rows;
          if (ownerId !== undefined && change.user_id !== ownerId) return rows;

          // Take the original run data from another change of the same run, a new entry
          // has no run, only the class name from another new entry in the same class.
          const runId = changeRunId(change.lateEntry);
          const classId = change.lateEntry.kind.NewEntry?.classId;
          const base = runId !== undefined
            ? rows.find(r => r.run?.run_id === runId)
            : rows.find(r => classId !== undefined && r.change.lateEntry.kind.NewEntry?.classId === classId);
          const inserted: LateEntryRow = {
            run: runId !== undefined ? base?.run : undefined,
            class_name: base?.class_name,
            change,
          };
          // The query orders by qxchanges.id DESC.
          return [inserted, ...rows];
        }

        case SqlOperation.Update:
          return rows.map(r => r.change.id === id ? { ...r, change: patchChange(r.change, record) } : r);
      }
      return rows;

    default:
      return rows;
  }
}

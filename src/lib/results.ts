import { normalizedRecChngRecord, num, str, type RecChngRecord } from "~/lib/recChng";
import { type RecChng, SqlOperation } from "~/schema/rpc-sql-schema";

export type ResultRow = {
  id: number;
  order?: number;
  timems: number;
  disqualified: boolean;
  competitor_id: number;
  firstname?: string;
  lastname?: string;
  registration?: string;
};

export function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

/** Sorts rows by run time, disqualified ones last, and numbers the non-disqualified ones. */
export function rankResults(rows: ResultRow[]): ResultRow[] {
  let order = 0;
  return [...rows]
    .sort((a, b) => Number(a.disqualified) - Number(b.disqualified) || a.timems - b.timems)
    .map(row => {
      const rowOrder = row.disqualified ? undefined : ++order;
      return row.order === rowOrder ? row : { ...row, order: rowOrder };
    });
}

const RUN_RESULT_KEYS = ["timems", "disqualified", "isrunning", "stageid"] as const;

function touchesRunResult(record: RecChngRecord): boolean {
  return !!record && RUN_RESULT_KEYS.some(key => key in record);
}

function patchRun(row: ResultRow, record: RecChngRecord, stageId: number | undefined): ResultRow | undefined {
  if (!record) return row;
  if ("stageid" in record && num(record.stageid) !== stageId) return undefined;
  if ("isrunning" in record && !toBoolean(record.isrunning)) return undefined;
  const patched = { ...row };
  if ("timems" in record) patched.timems = num(record.timems) ?? 0;
  if ("disqualified" in record) patched.disqualified = toBoolean(record.disqualified);
  return patched.timems > 0 ? patched : undefined;
}

function patchCompetitor(row: ResultRow, record: RecChngRecord): ResultRow {
  if (!record) return row;
  const patched = { ...row };
  if ("firstname" in record) patched.firstname = str(record.firstname);
  if ("lastname" in record) patched.lastname = str(record.lastname);
  if ("registration" in record) patched.registration = str(record.registration);
  return patched;
}

export type ResultsChange = {
  rows: ResultRow[];
  /** The change may add rows that are not loaded, and it carries too little data to add them locally. */
  reload: boolean;
};

/**
 * Applies a record change to the results rows, keeping them ranked.
 * A run that is not listed yet (e.g. a runner who just finished) carries neither class nor names,
 * so it only requests a reload.
 */
export function applyRecChngToResults(rows: ResultRow[], recchng: RecChng, stageId: number | undefined): ResultsChange {
  const { table, id, op } = recchng;
  const unchanged = { rows, reload: false };
  if (typeof id !== "number") return unchanged;
  const record = normalizedRecChngRecord(recchng);

  switch (table) {
    case "runs": {
      if (op === SqlOperation.Delete) {
        return rows.some(r => r.id === id) ? { rows: rankResults(rows.filter(r => r.id !== id)), reload: false } : unchanged;
      }
      if (op === SqlOperation.Insert) return { rows, reload: touchesRunResult(record) };
      const row = rows.find(r => r.id === id);
      if (!row) return { rows, reload: touchesRunResult(record) };
      if (!touchesRunResult(record)) return unchanged;
      const patched = patchRun(row, record, stageId);
      const next = patched ? rows.map(r => r.id === id ? patched : r) : rows.filter(r => r.id !== id);
      return { rows: rankResults(next), reload: false };
    }

    case "competitors": {
      if (op === SqlOperation.Delete) {
        return rows.some(r => r.competitor_id === id)
          ? { rows: rankResults(rows.filter(r => r.competitor_id !== id)), reload: false }
          : unchanged;
      }
      if (op !== SqlOperation.Update) return unchanged;
      // A class change can move the competitor into or out of the shown class.
      if (record && "classid" in record) return { rows, reload: true };
      if (!rows.some(r => r.competitor_id === id)) return unchanged;
      return { rows: rows.map(r => r.competitor_id === id ? patchCompetitor(r, record) : r), reload: false };
    }

    default:
      return unchanged;
  }
}

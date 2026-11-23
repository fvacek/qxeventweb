import { normalizedRecChngRecord, num, str, type RecChngRecord } from "~/lib/recChng";
import { compareOptional } from "~/lib/runnerEntry";
import { type RecChng, SqlOperation } from "~/schema/rpc-sql-schema";

export type ResultRow = {
  id: number;
  order?: number;
  starttimems?: number;
  timems: number;
  disqualified: boolean;
  mispunch?: boolean;
  notcompeting?: boolean;
  competitor_id: number;
  firstname?: string;
  lastname?: string;
  registration?: string;
};

export function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function isFinished(row: ResultRow): boolean {
  return row.timems > 0;
}

export type ResultStatus = "OK" | "MP" | "NC" | "DIS";

/** Status of the run, undefined while the runner is on course. */
export function resultStatus(row: ResultRow): ResultStatus | undefined {
  if (row.mispunch) return "MP";
  if (row.disqualified) return "DIS";
  if (!isFinished(row)) return undefined;
  return row.notcompeting ? "NC" : "OK";
}

export function isOnCourse(row: ResultRow): boolean {
  return resultStatus(row) === undefined;
}

/** Ranked runners first, then runners still on course, then the not ranked ones (MP, NC, DIS). */
function resultGroup(row: ResultRow): number {
  const status = resultStatus(row);
  if (status === "OK") return 0;
  return status === undefined ? 1 : 2;
}

function compareResults(a: ResultRow, b: ResultRow): number {
  const group = resultGroup(a) - resultGroup(b);
  if (group !== 0) return group;
  if (resultGroup(a) === 1) return compareOptional(a.starttimems, b.starttimems);
  return a.timems - b.timems || compareOptional(a.starttimems, b.starttimems);
}

/**
 * Sorts finished runners by run time, then the not finished ones by start time, then the not ranked ones (MP, NC, DIS),
 * and numbers the runners with status OK.
 */
export function rankResults(rows: ResultRow[]): ResultRow[] {
  let order = 0;
  return [...rows].sort(compareResults).map(row => {
    const rowOrder = resultGroup(row) === 0 ? ++order : undefined;
    return row.order === rowOrder ? row : { ...row, order: rowOrder };
  });
}

function patchRun(row: ResultRow, record: RecChngRecord, stageId: number | undefined): ResultRow | undefined {
  if (!record) return row;
  if ("stageid" in record && num(record.stageid) !== stageId) return undefined;
  if ("isrunning" in record && !toBoolean(record.isrunning)) return undefined;
  const patched = { ...row };
  if ("timems" in record) patched.timems = num(record.timems) ?? 0;
  if ("starttimems" in record) patched.starttimems = num(record.starttimems);
  if ("disqualified" in record) patched.disqualified = toBoolean(record.disqualified);
  if ("mispunch" in record) patched.mispunch = toBoolean(record.mispunch);
  if ("notcompeting" in record) patched.notcompeting = toBoolean(record.notcompeting);
  return patched;
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
 * Applies a record change to the class results rows, keeping them ranked.
 * All runs of the class are loaded, so only a run entering the stage / race, or a competitor
 * entering the class, needs a reload.
 */
export function applyRecChngToResults(
  rows: ResultRow[],
  recchng: RecChng,
  stageId: number | undefined,
  classId: number | undefined,
): ResultsChange {
  const { table, id, op } = recchng;
  const unchanged = { rows, reload: false };
  if (typeof id !== "number") return unchanged;
  const record = normalizedRecChngRecord(recchng);
  const removeRows = (keep: (r: ResultRow) => boolean): ResultsChange =>
    rows.every(keep) ? unchanged : { rows: rankResults(rows.filter(keep)), reload: false };

  switch (table) {
    case "runs": {
      if (op === SqlOperation.Delete) return removeRows(r => r.id !== id);
      if (op !== SqlOperation.Update) return unchanged;
      const row = rows.find(r => r.id === id);
      if (!row) {
        const entersResults = !!record && (toBoolean(record.isrunning) || num(record.stageid) === stageId);
        return { rows, reload: entersResults };
      }
      const patched = patchRun(row, record, stageId);
      if (!patched) return removeRows(r => r.id !== id);
      return { rows: rankResults(rows.map(r => r.id === id ? patched : r)), reload: false };
    }

    case "competitors": {
      if (op === SqlOperation.Delete) return removeRows(r => r.competitor_id !== id);
      const recordClassId = record && "classid" in record ? num(record.classid) : undefined;
      // A new competitor's runs are written after the competitor, the debounced reload waits for them.
      if (op === SqlOperation.Insert) return { rows, reload: classId !== undefined && recordClassId === classId };
      if (op !== SqlOperation.Update) return unchanged;
      const listed = rows.some(r => r.competitor_id === id);
      if (record && "classid" in record && recordClassId !== classId) {
        return listed ? removeRows(r => r.competitor_id !== id) : unchanged;
      }
      if (!listed) return { rows, reload: recordClassId !== undefined && recordClassId === classId };
      return { rows: rows.map(r => r.competitor_id === id ? patchCompetitor(r, record) : r), reload: false };
    }

    default:
      return unchanged;
  }
}

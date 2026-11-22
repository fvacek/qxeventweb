import { parse } from "valibot";
import { RecChngSchema, SqlOperation } from "~/schema/rpc-sql-schema";
import {
  applyRecChngToLateEntries,
  applyRecChngToRuns,
  canEditLateEntry,
  changeFromSqlRow,
  parseSqlRows,
  patchRunInfo,
  runInfoFromSqlRow,
  type QxChange,
  type RunnerEntryRow,
} from "./runnerEntry";

const FIELDS = [
  "run_id", "siid", "starttimems", "competitor_id", "firstname", "lastname", "registration",
  "qxchange_id", "qxchange_created", "qxchange_status", "qxchange_status_message", "qxchange_paid",
  "qxchange_data", "qxchange_user_id", "class_name",
].map(name => ({ name }));

const lateEntryData = (kind: object, extra: object = {}) => JSON.stringify({ LateEntry: { kind, ...extra } });

const sqlResult = (rows: unknown[][]) => ({ fields: FIELDS, rows }) as never;

const change = (overrides: Partial<QxChange> = {}): QxChange => ({
  id: 10, user_id: "a@b.cz", status: "Pending", paid: false, lateEntry: { kind: { Update: { runId: 1 } } }, ...overrides,
});

describe("SQL row parsing", () => {
  it("parses a run with a change", () => {
    const [row] = parseSqlRows(sqlResult([
      [1, 100, 60000, 11, "Jan", "Novak", "ABC1234", 10, "2026-01-01", "Pending", undefined, 1, lateEntryData({ Update: { runId: 1 } }, { siid: 200 }), "a@b.cz", "H21"],
    ]));
    expect(runInfoFromSqlRow(row)).toMatchObject({ run_id: 1, competitor_id: 11, siid: 100 });
    expect(changeFromSqlRow(row)).toMatchObject({ id: 10, paid: true, lateEntry: { siid: 200 } });
  });

  it("parses a run without a change", () => {
    const [row] = parseSqlRows(sqlResult([
      [2, 101, 120000, 12, "Eva", "Nova", "ABC1235", undefined, undefined, undefined, undefined, undefined, undefined, undefined, "H21"],
    ]));
    expect(runInfoFromSqlRow(row)?.run_id).toBe(2);
    expect(changeFromSqlRow(row)).toBeUndefined();
  });

  it("keeps the row but drops a change with invalid data", () => {
    const rows = parseSqlRows(sqlResult([
      [1, 100, 60000, 11, "Jan", "Novak", "ABC1234", 10, undefined, "Pending", undefined, 0, "{bad json", "a@b.cz", "H21"],
    ]));
    expect(rows).toHaveLength(1);
    expect(runInfoFromSqlRow(rows[0])?.run_id).toBe(1);
    expect(changeFromSqlRow(rows[0])).toBeUndefined();
  });

  it("parses a new entry change without a run", () => {
    const [row] = parseSqlRows(sqlResult([
      [undefined, undefined, undefined, undefined, undefined, undefined, undefined, 10, undefined, "Pending", undefined, 0, lateEntryData({ NewEntry: { classId: 5 } }), "a@b.cz", "D21"],
    ]));
    expect(runInfoFromSqlRow(row)).toBeUndefined();
    expect(changeFromSqlRow(row)?.lateEntry.kind.NewEntry?.classId).toBe(5);
  });
});

describe("patchRunInfo", () => {
  const run = { run_id: 1, competitor_id: 11, firstname: "Jan", siid: 100 };

  it("copies only known run columns", () => {
    expect(patchRunInfo(run, { id: 1, siid: 300, stageid: 2, firstname: "Petr" })).toEqual({ ...run, siid: 300, firstname: "Petr" });
  });

  it("keeps the run without a record", () => {
    expect(patchRunInfo(run, undefined)).toBe(run);
  });
});

describe("canEditLateEntry", () => {
  it("allows a row without a change to any user", () => {
    expect(canEditLateEntry({ class_name: "H21" }, "x@y.cz", false)).toBe(true);
    expect(canEditLateEntry({ class_name: "H21" }, undefined, false)).toBe(false);
  });

  it("allows a pending change to its owner or an organizer only", () => {
    expect(canEditLateEntry({ class_name: "H21", change: change() }, "a@b.cz", false)).toBe(true);
    expect(canEditLateEntry({ class_name: "H21", change: change() }, "x@y.cz", false)).toBe(false);
    expect(canEditLateEntry({ class_name: "H21", change: change() }, "x@y.cz", true)).toBe(true);
  });

  it("forbids editing a resolved change", () => {
    expect(canEditLateEntry({ class_name: "H21", change: change({ status: "Accepted" }) }, "a@b.cz", true)).toBe(false);
  });
});

describe("applyRecChngToRuns", () => {
  const run = { run_id: 1, competitor_id: 11, firstname: "Jan", siid: 100 };
  const change = (overrides: Partial<QxChange> = {}): QxChange => ({
    id: 10, user_id: "a@b.cz", status: "Pending", paid: false, lateEntry: { kind: { Update: { runId: 1 } } }, ...overrides,
  });
  const rows = (): RunnerEntryRow[] => [{ run, class_name: "H21" }];

  it("patches a run, including QuickEvent column casing", () => {
    const result = applyRecChngToRuns(rows(), { table: "runs", id: 1, op: SqlOperation.Update, record: { siId: 300, stageid: 2 } });
    expect(result[0].run).toEqual({ ...run, siid: 300 });
  });

  it("patches competitors by competitor id", () => {
    const result = applyRecChngToRuns(rows(), { table: "competitors", id: 11, op: SqlOperation.Update, record: { firstname: "Petr" } });
    expect(result[0].run?.firstname).toBe("Petr");
  });

  it("drops the row of a deleted run", () => {
    expect(applyRecChngToRuns(rows(), { table: "runs", id: 1, op: SqlOperation.Delete })).toHaveLength(0);
  });

  it("ignores a string record id", () => {
    const before = rows();
    expect(applyRecChngToRuns(before, { table: "runs", id: "1", op: SqlOperation.Delete })).toBe(before);
  });

  it("ignores an inserted run", () => {
    const before = rows();
    expect(applyRecChngToRuns(before, { table: "runs", id: 2, op: SqlOperation.Insert, record: { id: 2, competitorid: 12 } })).toBe(before);
  });

  it("reports an inserted competitor and keeps the rows", () => {
    const before = rows();
    const inserted: unknown[] = [];
    const result = applyRecChngToRuns(before, { table: "competitors", id: 12, op: SqlOperation.Insert, record: { id: 12, classId: 5 } }, r => inserted.push(r));
    expect(result).toBe(before);
    expect(inserted).toEqual([{ id: 12, classid: 5 }]);
  });

  it("clears a change once it is no longer pending", () => {
    const result = applyRecChngToRuns([{ ...rows()[0], change: change() }], { table: "qxchanges", id: 10, op: SqlOperation.Update, record: { status: "Accepted" } });
    expect(result[0].change).toBeUndefined();
  });
});

describe("applyRecChngToLateEntries", () => {
  const run = { run_id: 1, competitor_id: 11, firstname: "Jan", siid: 100 };
  const change: QxChange = { id: 10, user_id: "a@b.cz", status: "Pending", paid: false, lateEntry: { kind: { DeleteEntry: { runId: 1 } } } };
  const newEntry: QxChange = { ...change, id: 11, lateEntry: { kind: { NewEntry: { classId: 5 } } } };
  const rows = (): RunnerEntryRow[] => [{ run, class_name: "H21", change }, { class_name: "D21", change: newEntry }];

  it("patches the run of a change", () => {
    const result = applyRecChngToLateEntries(rows(), { table: "runs", id: 1, op: SqlOperation.Update, record: { siid: 300 } }, undefined);
    expect(result[0].run).toEqual({ ...run, siid: 300 });
    expect(result[1].run).toBeUndefined();
  });

  it("patches competitors by competitor id", () => {
    const result = applyRecChngToLateEntries(rows(), { table: "competitors", id: 11, op: SqlOperation.Update, record: { firstname: "Petr" } }, undefined);
    expect(result[0].run?.firstname).toBe("Petr");
  });

  it("keeps the change of a deleted run, without the run", () => {
    const result = applyRecChngToLateEntries(rows(), { table: "runs", id: 1, op: SqlOperation.Delete }, undefined);
    expect(result).toHaveLength(2);
    expect(result[0].run).toBeUndefined();
    expect(result[0].change?.id).toBe(10);
  });

  it("ignores inserted runs and competitors", () => {
    const before = rows();
    expect(applyRecChngToLateEntries(before, { table: "runs", id: 2, op: SqlOperation.Insert, record: { id: 2 } }, undefined)).toBe(before);
    expect(applyRecChngToLateEntries(before, { table: "competitors", id: 12, op: SqlOperation.Insert, record: { id: 12 } }, undefined)).toBe(before);
  });

  it("removes a deleted change", () => {
    const result = applyRecChngToLateEntries(rows(), { table: "qxchanges", id: 10, op: SqlOperation.Delete }, undefined);
    expect(result.map(r => r.change?.id)).toEqual([11]);
  });
});

describe("RecChngSchema", () => {
  it("accepts integer and string record ids", () => {
    expect(parse(RecChngSchema, { table: "runs", id: 1, op: "Update" }).id).toBe(1);
    const recchng = { table: "config", id: "event.currentStageId", op: "Update", record: { cvalue: "2" } };
    expect(parse(RecChngSchema, recchng).id).toBe("event.currentStageId");
  });
});

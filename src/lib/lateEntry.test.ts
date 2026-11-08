import { SqlOperation } from "~/schema/rpc-sql-schema";
import {
  applyRunRecChng,
  canEditLateEntry,
  changeFromSqlRow,
  parseSqlRows,
  runInfoFromSqlRow,
  type LateEntryRowBase,
  type QxChange,
  type RunInfo,
} from "./lateEntry";

type RunRow = { run: RunInfo; change?: QxChange };
type LateEntryRow = LateEntryRowBase & { change: QxChange };

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

describe("applyRunRecChng", () => {
  const run = { run_id: 1, competitor_id: 11, firstname: "Jan", siid: 100 };

  it("patches only known run columns", () => {
    const rows: RunRow[] = [{ run }];
    const record = { id: 1, siid: 300, stageid: 2 };
    const result = applyRunRecChng(rows, { table: "runs", id: 1, op: SqlOperation.Update, record }, record, () => undefined);
    expect(result?.[0].run).toEqual({ ...run, siid: 300 });
  });

  it("patches competitors by competitor id", () => {
    const rows: RunRow[] = [{ run }];
    const record = { firstname: "Petr" };
    const result = applyRunRecChng(rows, { table: "competitors", id: 11, op: SqlOperation.Update, record }, record, () => undefined);
    expect(result?.[0].run.firstname).toBe("Petr");
  });

  it("lets the caller keep a row of a deleted run", () => {
    const rows: LateEntryRow[] = [{ run, change: change({ lateEntry: { kind: { DeleteEntry: { runId: 1 } } } }) }];
    const result = applyRunRecChng(rows, { table: "runs", id: 1, op: SqlOperation.Delete }, undefined, row => ({ ...row, run: undefined }));
    expect(result).toHaveLength(1);
    expect(result?.[0].run).toBeUndefined();
    expect(result?.[0].change.id).toBe(10);
  });

  it("drops a deleted run row when the caller returns undefined", () => {
    const rows: RunRow[] = [{ run }];
    const result = applyRunRecChng(rows, { table: "runs", id: 1, op: SqlOperation.Delete }, undefined, () => undefined);
    expect(result).toHaveLength(0);
  });

  it("returns undefined for other tables", () => {
    expect(applyRunRecChng([], { table: "qxchanges", id: 1, op: SqlOperation.Delete }, undefined, () => undefined)).toBeUndefined();
  });
});

describe("canEditLateEntry", () => {
  it("allows a row without a change to any user", () => {
    expect(canEditLateEntry({}, "x@y.cz", false)).toBe(true);
    expect(canEditLateEntry({}, undefined, false)).toBe(false);
  });

  it("allows a pending change to its owner or an organizer only", () => {
    expect(canEditLateEntry({ change: change() }, "a@b.cz", false)).toBe(true);
    expect(canEditLateEntry({ change: change() }, "x@y.cz", false)).toBe(false);
    expect(canEditLateEntry({ change: change() }, "x@y.cz", true)).toBe(true);
  });

  it("forbids editing a resolved change", () => {
    expect(canEditLateEntry({ change: change({ status: "Accepted" }) }, "a@b.cz", true)).toBe(false);
  });
});

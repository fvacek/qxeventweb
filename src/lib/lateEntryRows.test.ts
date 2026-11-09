import { SqlOperation } from "~/schema/rpc-sql-schema";
import type { RunnerEntryRow, QxChange } from "~/lib/runnerEntry";
import { applyRecChngToLateEntries, applyRecChngToRuns } from "./lateEntryRows";

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

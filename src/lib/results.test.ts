import { describe, expect, it } from "vitest";
import { SqlOperation } from "~/schema/rpc-sql-schema";
import { applyRecChngToResults, rankResults, type ResultRow } from "./results";

const row = (id: number, timems: number, disqualified = false): ResultRow => ({ id, timems, disqualified, competitor_id: id + 100 });
const rows = () => rankResults([row(1, 60000), row(2, 70000), row(3, 50000, true)]);
const ids = (rs: ResultRow[]) => rs.map(r => r.id);

describe("rankResults", () => {
  it("sorts by time, disqualified last, and numbers non-disqualified", () => {
    const result = rankResults([row(3, 50000, true), row(2, 70000), row(1, 60000)]);
    expect(ids(result)).toEqual([1, 2, 3]);
    expect(result.map(r => r.order)).toEqual([1, 2, undefined]);
  });
});

describe("applyRecChngToResults", () => {
  it("re-sorts on time update", () => {
    const { rows: result, reload } = applyRecChngToResults(rows(), { table: "runs", id: 2, op: SqlOperation.Update, record: { timeMs: 55000 } }, 1);
    expect(ids(result)).toEqual([2, 1, 3]);
    expect(result[0].order).toBe(1);
    expect(reload).toBe(false);
  });

  it("moves disqualified run last", () => {
    const { rows: result } = applyRecChngToResults(rows(), { table: "runs", id: 1, op: SqlOperation.Update, record: { disqualified: true } }, 1);
    expect(ids(result)).toEqual([2, 3, 1]);
    expect(result.map(r => r.order)).toEqual([1, undefined, undefined]);
  });

  it("removes run whose time is cleared or moved to another stage", () => {
    expect(ids(applyRecChngToResults(rows(), { table: "runs", id: 1, op: SqlOperation.Update, record: { timeMs: 0 } }, 1).rows)).toEqual([2, 3]);
    expect(ids(applyRecChngToResults(rows(), { table: "runs", id: 1, op: SqlOperation.Update, record: { stageId: 2 } }, 1).rows)).toEqual([2, 3]);
    expect(ids(applyRecChngToResults(rows(), { table: "runs", id: 1, op: SqlOperation.Update, record: { isRunning: false } }, 1).rows)).toEqual([2, 3]);
  });

  it("removes deleted run", () => {
    expect(ids(applyRecChngToResults(rows(), { table: "runs", id: 2, op: SqlOperation.Delete }, 1).rows)).toEqual([1, 3]);
  });

  it("requests reload when an unlisted run gets a time", () => {
    const before = rows();
    const result = applyRecChngToResults(before, { table: "runs", id: 9, op: SqlOperation.Update, record: { timeMs: 40000 } }, 1);
    expect(result).toEqual({ rows: before, reload: true });
  });

  it("ignores unrelated run updates", () => {
    const before = rows();
    expect(applyRecChngToResults(before, { table: "runs", id: 1, op: SqlOperation.Update, record: { siId: 5 } }, 1)).toEqual({ rows: before, reload: false });
  });

  it("patches competitor names and reloads on class change", () => {
    const { rows: result } = applyRecChngToResults(rows(), { table: "competitors", id: 101, op: SqlOperation.Update, record: { firstName: "Petr" } }, 1);
    expect(result[0].firstname).toBe("Petr");
    expect(applyRecChngToResults(rows(), { table: "competitors", id: 999, op: SqlOperation.Update, record: { classId: 3 } }, 1).reload).toBe(true);
  });
});

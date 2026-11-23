import { describe, expect, it } from "vitest";
import { SqlOperation } from "~/schema/rpc-sql-schema";
import { applyRecChngToResults, rankResults, resultStatus, type ResultRow } from "./results";

const row = (id: number, timems: number, starttimems: number, disqualified = false): ResultRow =>
  ({ id, timems, starttimems, disqualified, competitor_id: id + 100 });
// 1, 2 finished; 3 disqualified; 4, 5 on course
const rows = () => rankResults([row(5, 0, 1000), row(4, 0, 2000), row(3, 50000, 0, true), row(2, 70000, 0), row(1, 60000, 0)]);
const ids = (rs: ResultRow[]) => rs.map(r => r.id);
const STAGE = 1;
const CLASS = 7;

describe("rankResults", () => {
  it("orders finished by time, then not finished by start time, then disqualified", () => {
    const result = rows();
    expect(ids(result)).toEqual([1, 2, 5, 4, 3]);
    expect(result.map(r => r.order)).toEqual([1, 2, undefined, undefined, undefined]);
  });
});

describe("applyRecChngToResults", () => {
  const apply = (recchng: Parameters<typeof applyRecChngToResults>[1], before = rows()) =>
    applyRecChngToResults(before, recchng, STAGE, CLASS);

  it("ranks a runner who finished", () => {
    const { rows: result, reload } = apply({ table: "runs", id: 4, op: SqlOperation.Update, record: { timeMs: 55000 } });
    expect(ids(result)).toEqual([4, 1, 2, 5, 3]);
    expect(result[0].order).toBe(1);
    expect(reload).toBe(false);
  });

  it("moves disqualified run to the end", () => {
    const { rows: result } = apply({ table: "runs", id: 1, op: SqlOperation.Update, record: { disqualified: true } });
    expect(ids(result)).toEqual([2, 5, 4, 3, 1]);
  });

  it("moves a run with cleared time to not finished, sorted by start time", () => {
    expect(ids(apply({ table: "runs", id: 1, op: SqlOperation.Update, record: { timeMs: 0 } }).rows)).toEqual([2, 1, 5, 4, 3]);
  });

  it("re-sorts not finished runners on start time change", () => {
    expect(ids(apply({ table: "runs", id: 4, op: SqlOperation.Update, record: { startTimeMs: 500 } }).rows)).toEqual([1, 2, 4, 5, 3]);
  });

  it("removes run moved to another stage or not running, or deleted", () => {
    expect(ids(apply({ table: "runs", id: 1, op: SqlOperation.Update, record: { stageId: 2 } }).rows)).toEqual([2, 5, 4, 3]);
    expect(ids(apply({ table: "runs", id: 1, op: SqlOperation.Update, record: { isRunning: false } }).rows)).toEqual([2, 5, 4, 3]);
    expect(ids(apply({ table: "runs", id: 2, op: SqlOperation.Delete }).rows)).toEqual([1, 5, 4, 3]);
  });

  it("reloads only when an unlisted run starts running", () => {
    const before = rows();
    expect(apply({ table: "runs", id: 9, op: SqlOperation.Update, record: { isRunning: true } }, before)).toEqual({ rows: before, reload: true });
    expect(apply({ table: "runs", id: 9, op: SqlOperation.Update, record: { timeMs: 40000 } }, before)).toEqual({ rows: before, reload: false });
  });

  it("reloads on competitor inserted into the shown class", () => {
    expect(apply({ table: "competitors", id: 200, op: SqlOperation.Insert, record: { classId: CLASS } }).reload).toBe(true);
    expect(apply({ table: "competitors", id: 200, op: SqlOperation.Insert, record: { classId: 3 } }).reload).toBe(false);
  });

  it("patches competitor names", () => {
    const { rows: result } = apply({ table: "competitors", id: 101, op: SqlOperation.Update, record: { firstName: "Petr" } });
    expect(result[0].firstname).toBe("Petr");
  });

  it("handles competitor class changes", () => {
    expect(ids(apply({ table: "competitors", id: 101, op: SqlOperation.Update, record: { classId: 3 } }).rows)).toEqual([2, 5, 4, 3]);
    expect(apply({ table: "competitors", id: 999, op: SqlOperation.Update, record: { classId: CLASS } }).reload).toBe(true);
  });
});

describe("resultStatus", () => {
  it("derives status from run flags", () => {
    expect(resultStatus(row(1, 60000, 0))).toBe("OK");
    expect(resultStatus(row(1, 0, 0))).toBeUndefined();
    expect(resultStatus({ ...row(1, 60000, 0, true), mispunch: true })).toBe("MP");
    expect(resultStatus(row(1, 60000, 0, true))).toBe("DIS");
    expect(resultStatus({ ...row(1, 60000, 0), notcompeting: true })).toBe("NC");
  });

  it("does not rank mispunched or not competing runners", () => {
    const result = rankResults([{ ...row(1, 50000, 0), notcompeting: true }, { ...row(2, 55000, 0), mispunch: true }, row(3, 60000, 0), row(4, 0, 1000)]);
    expect(ids(result)).toEqual([3, 4, 1, 2]);
    expect(result.map(r => r.order)).toEqual([1, undefined, undefined, undefined]);
  });
});

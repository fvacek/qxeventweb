import { describe, expect, it } from "vitest";
import type { RpcValue } from "libshv-js";
import { isEventOrganizer, parseEventConfig, unquote } from "./eventConfig";
import type { EventRecord } from "~/schema/event-record-schema";

const eventRecord: EventRecord = {
  id: 7,
  name: "Record name",
  date: "2026-05-01T00:00:00.000Z",
  stage_count: 1,
  api_token: "token",
  owner: "owner@example.com",
  db_mode: "Master",
  config: { members: { "org@example.com": "Organizer", "user@example.com": "Member" } },
};

// Mirrors QuickEvent's config table: ckey, cname, cvalue, ctype.
const configTable = (rows: unknown[][]) => ({
  fields: [{ name: "ckey" }, { name: "cname" }, { name: "cvalue" }, { name: "ctype" }],
  rows,
}) as unknown as RpcValue;

describe("unquote", () => {
  it("strips only matching surrounding quotes", () => {
    expect(unquote('"Spring Cup"')).toBe("Spring Cup");
    expect(unquote("'Spring Cup'")).toBe("Spring Cup");
    expect(unquote("O'Brien Cup")).toBe("O'Brien Cup");
    expect(unquote('"mixed\'')).toBe('"mixed\'');
    expect(unquote('"')).toBe('"');
  });
});

describe("parseEventConfig", () => {
  it("reads values by column name", () => {
    const config = parseEventConfig(configTable([
      ["event.name", null, '"O\'Brien Cup"', "QString"],
      ["event.place", null, "Brno", "QString"],
      ["event.date", null, "2026-06-01", "QDate"],
      ["event.stageCount", null, "3", "int"],
      ["event.currentStageId", null, "2", "int"],
      ["stage.2.startDateTime", null, "2026-06-02T10:00:00Z", "QDateTime"],
    ]), eventRecord);
    expect(config.name).toBe("O'Brien Cup");
    expect(config.place).toBe("Brno");
    expect(config.date?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(config.stageCount).toBe(3);
    expect(config.currentStage).toBe(2);
    expect(config.stages.map(s => s.stageStart?.toISOString())).toEqual([undefined, "2026-06-02T10:00:00.000Z", undefined]);
    expect(config.owner).toBe("owner@example.com");
  });

  it("falls back to the event record and defaults", () => {
    const config = parseEventConfig(configTable([["event.name", null, "", "QString"]]), eventRecord);
    expect(config.name).toBe("Record name");
    expect(config.date?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(config.stageCount).toBe(1);
    expect(config.currentStage).toBe(1);
    expect(config.stages).toHaveLength(1);
  });

  it("clamps the current stage to the stage count", () => {
    const config = parseEventConfig(configTable([
      ["event.stageCount", null, 2, "int"],
      ["event.currentStageId", null, 5, "int"],
    ]), eventRecord);
    expect(config.currentStage).toBe(2);
  });

  it("accepts Date cells", () => {
    const config = parseEventConfig(configTable([["event.date", null, new Date("2026-07-01T00:00:00Z"), "QDate"]]), eventRecord);
    expect(config.date?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("throws when the expected columns are missing", () => {
    const table = { fields: [{ name: "key" }, { name: "value" }], rows: [] } as unknown as RpcValue;
    expect(() => parseEventConfig(table, eventRecord)).toThrow(/ckey/);
  });
});

describe("isEventOrganizer", () => {
  const config = parseEventConfig(configTable([]), eventRecord);
  it("accepts the owner and organizer members only", () => {
    expect(isEventOrganizer(config, "owner@example.com")).toBe(true);
    expect(isEventOrganizer(config, "org@example.com")).toBe(true);
    expect(isEventOrganizer(config, "user@example.com")).toBe(false);
    expect(isEventOrganizer(config, undefined)).toBe(false);
  });
});

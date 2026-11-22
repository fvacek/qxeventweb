import { describe, expect, it } from "vitest";
import type { RpcValue } from "libshv-js";
import { eventDate, eventName, isEventOrganizer, parseEventConfig, unquote } from "./eventConfig";
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

// Mirrors QuickEvent's config table: id, cname, cvalue, ctype.
const configTable = (rows: unknown[][]) => ({
  fields: [{ name: "id" }, { name: "cname" }, { name: "cvalue" }, { name: "ctype" }],
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
    ]));
    expect(config.name).toBe("O'Brien Cup");
    expect(config.place).toBe("Brno");
    expect(config.date?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(config.stageCount).toBe(3);
    expect(config.currentStage).toBe(2);
    expect(config.stages.map(s => s.stageStart?.toISOString())).toEqual([undefined, "2026-06-02T10:00:00.000Z", undefined]);
  });

  it("uses defaults for missing values", () => {
    const config = parseEventConfig(configTable([["event.name", null, "", "QString"]]));
    expect(config.name).toBeUndefined();
    expect(config.date).toBeUndefined();
    expect(config.stageCount).toBe(1);
    expect(config.currentStage).toBe(1);
    expect(config.stages).toHaveLength(1);
  });

  it("clamps the current stage to the stage count", () => {
    const config = parseEventConfig(configTable([
      ["event.stageCount", null, 2, "int"],
      ["event.currentStageId", null, 5, "int"],
    ]));
    expect(config.currentStage).toBe(2);
  });

  it("accepts Date cells", () => {
    const config = parseEventConfig(configTable([["event.date", null, new Date("2026-07-01T00:00:00Z"), "QDate"]]));
    expect(config.date?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("throws when the expected columns are missing", () => {
    const table = { fields: [{ name: "key" }, { name: "value" }], rows: [] } as unknown as RpcValue;
    expect(() => parseEventConfig(table)).toThrow(/"id"/);
  });
});

describe("eventName / eventDate", () => {
  it("prefer the config table and fall back to the event record", () => {
    const empty = parseEventConfig(configTable([]));
    expect(eventName(empty, eventRecord)).toBe("Record name");
    expect(eventDate(empty, eventRecord)?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(eventName(empty, undefined)).toBeUndefined();
    expect(eventDate(empty, undefined)).toBeUndefined();

    const config = parseEventConfig(configTable([
      ["event.name", null, "Config name", "QString"],
      ["event.date", null, "2026-06-01", "QDate"],
    ]));
    expect(eventName(config, eventRecord)).toBe("Config name");
    expect(eventDate(config, eventRecord)?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("isEventOrganizer", () => {
  it("accepts the owner and organizer members only", () => {
    expect(isEventOrganizer(eventRecord, "owner@example.com")).toBe(true);
    expect(isEventOrganizer(eventRecord, "org@example.com")).toBe(true);
    expect(isEventOrganizer(eventRecord, "user@example.com")).toBe(false);
    expect(isEventOrganizer(eventRecord, undefined)).toBe(false);
  });

  it("rejects everyone while the event record is not loaded or has no members", () => {
    expect(isEventOrganizer(undefined, "owner@example.com")).toBe(false);
    expect(isEventOrganizer({ owner: "owner@example.com" }, "org@example.com")).toBe(false);
  });
});

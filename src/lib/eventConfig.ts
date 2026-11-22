import type { RpcValue } from "libshv-js";
import { createSqlTable, type TableCell } from "~/lib/SqlTable";
import type { EventMembers, EventRecord } from "~/schema/event-record-schema";

export type StageConfig = {
  stageStart?: Date;
}

export class EventConfig {
  name?: string;
  place?: string;
  date?: Date;
  stageCount: number = 1;
  currentStage: number = 1;
  stages: StageConfig[] = [];
  owner?: string;
  members?: EventMembers;
}

export function isEventOrganizer(config: EventConfig, email: string | undefined): boolean {
  if (!email) return false;
  return config.owner === email || config.members?.[email] === "Organizer";
}

/** Strips one pair of matching surrounding quotes, e.g. `"Spring Cup"` -> `Spring Cup`; inner quotes are kept. */
export function unquote(value: string): string {
  const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0];
  return quoted ? value.slice(1, -1) : value;
}

function parseDate(value: TableCell | string | undefined): Date | undefined {
  if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value;
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(String(value));
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Builds the event config from QuickEvent's `config` table (`ckey`/`cvalue` columns, looked up by name)
 * and the qxeventd event record, which provides owner/members and fallbacks for name and date.
 */
export function parseEventConfig(configTable: RpcValue, eventRecord: EventRecord): EventConfig {
  const table = createSqlTable(configTable);
  const keyIx = table.fieldIndex("ckey");
  const valueIx = table.fieldIndex("cvalue");
  const values = new Map<string, TableCell>();
  for (const row of table.rows) {
    const key = row?.[keyIx];
    if (typeof key !== "string") continue;
    const value = row[valueIx];
    // Only null / empty mean "not set"; 0 and false are real values.
    if (value === null || value === undefined || value === "") continue;
    values.set(key, typeof value === "string" ? unquote(value) : value);
  }
  const text = (key: string): string | undefined => {
    const value = values.get(key);
    return value === undefined ? undefined : String(value);
  };
  const int = (key: string): number | undefined => {
    const value = parseInt(text(key) ?? "", 10);
    return isNaN(value) ? undefined : value;
  };

  const stageCount = Math.max(1, int("event.stageCount") ?? 1);
  const currentStage = Math.min(stageCount, Math.max(1, int("event.currentStageId") ?? 1));
  const stages: StageConfig[] = Array.from({ length: stageCount }, (_, i) => ({
    stageStart: parseDate(values.get(`stage.${i + 1}.startDateTime`)),
  }));

  return {
    name: text("event.name") || eventRecord.name,
    place: text("event.place"),
    date: parseDate(values.get("event.date") ?? eventRecord.date),
    stageCount,
    currentStage,
    stages,
    owner: eventRecord.owner,
    members: eventRecord.config?.members,
  };
}

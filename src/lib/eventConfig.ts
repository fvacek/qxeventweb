import type { RpcValue } from "libshv-js";
import { createSqlTable, type TableCell } from "~/lib/SqlTable";
import type { EventRecord } from "~/schema/event-record-schema";

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
}

/** Owner and members live in qxeventd's event record, not in the event's config table. */
export function isEventOrganizer(eventRecord: Pick<EventRecord, "owner" | "config"> | undefined, email: string | undefined): boolean {
  if (!eventRecord || !email) return false;
  return eventRecord.owner === email || eventRecord.config?.members[email] === "Organizer";
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

/** Event name shown in the UI: the config table's `event.name`, else the qxeventd event record's name. */
export function eventName(config: EventConfig, eventRecord: EventRecord | undefined): string | undefined {
  return config.name || eventRecord?.name;
}

/** Event date shown in the UI: the config table's `event.date`, else the qxeventd event record's date. */
export function eventDate(config: EventConfig, eventRecord: EventRecord | undefined): Date | undefined {
  return config.date ?? parseDate(eventRecord?.date);
}

/** Builds the event config from QuickEvent's `config` table (`id`/`cvalue` columns, looked up by name). */
export function parseEventConfig(configTable: RpcValue): EventConfig {
  const table = createSqlTable(configTable);
  const keyIx = table.fieldIndex("id");
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
    name: text("event.name"),
    place: text("event.place"),
    date: parseDate(values.get("event.date")),
    stageCount,
    currentStage,
    stages,
  };
}

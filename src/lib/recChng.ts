import { RecChng } from "~/schema/rpc-sql-schema";

export type RecChngRecord = RecChng["record"];

export const str = (value: unknown, fallback?: string): string | undefined =>
  typeof value === "string" ? value : fallback;

export const num = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

/** Lowercases record keys, so DB column casing (e.g. QuickEvent's `startTimeMs`) matches `RunInfo` keys. */
export function normalizedRecChngRecord(recchng: RecChng): RecChngRecord {
  const record = recchng.record;
  return record && Object.fromEntries(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]));
}

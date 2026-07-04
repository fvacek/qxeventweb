import { type ClassValue, clsx } from "clsx"
import { makeMap, RpcValue } from "libshv-js";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function toRpcValue(value: unknown): RpcValue {
  // Handle primitives & null
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value as RpcValue;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(item => toRpcValue(item)) as RpcValue[];
  }

  // Handle plain objects
  if (typeof value === "object") {
    const obj: Record<string, RpcValue> = {};
    for (const [k, v] of Object.entries(value)) {
      // Optionally skip undefined fields or throw
      if (v === undefined) {
        // Skip or set to null or throw
        continue;
      }
      obj[k] = toRpcValue(v);
    }
    return obj as RpcValue;
  }

  // For types not allowed (Date, Function, etc.), you must convert or throw
  if (value instanceof Date) {
    // e.g. convert to ISO string, or timestamp
    return value.toISOString();
  }

  // If it's something else (a class instance, function, symbol, etc.), throw or convert
  throw new Error(`Cannot convert value to RpcValue: ${String(value)}`);
}

export function makeMapRecursive(value: Record<string, RpcValue>): RpcValue {
  const mapped: Record<string, RpcValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      mapped[key] = makeMapRecursive(item as Record<string, RpcValue>);
    } else if (Array.isArray(item)) {
      mapped[key] = item.map(entry =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? makeMapRecursive(entry as Record<string, RpcValue>)
          : entry
      ) as RpcValue;
    } else {
      mapped[key] = item;
    }
  }
  return makeMap(mapped) as RpcValue;
}

export function rpcMapToObject(value: unknown): Record<string, unknown> {
  const map = value as Record<string, unknown>;
  const ret: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(map)) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      ret[key] = rpcMapToObject(item);
    } else if (Array.isArray(item)) {
      ret[key] = item.map(entry =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? rpcMapToObject(entry)
          : entry
      );
    } else {
      ret[key] = item;
    }
  }
  return ret;
}

export function copyRecordChanges(origValue: Record<string, any>, newValue: Record<string, any>, fields?: string[]): Record<string, RpcValue> {
  const obj: Record<string, RpcValue> = {};
  for (const [k, v] of Object.entries(newValue)) {
    // Optionally skip undefined fields or throw
    if (fields !== undefined && !fields.includes(k)) {
      continue;
    }
    if (v !== undefined && v != origValue[k]) {
      obj[k] = toRpcValue(v);
    }
  }
  return obj;
}

export function isRecordEmpty(val: Record<string, RpcValue>): val is Record<string, RpcValue> {
  return Object.keys(val).length === 0;
}

import {
  object,
  record,
  array,
  string,
  number,
  boolean,
  date,
  unknown,
  optional,
  union,
  instance,
  custom,
  lazy,
  pipe,
  type BaseSchema,
  type InferOutput,
  type BaseIssue,
} from "valibot";

import {
  Decimal,
  Double,
  isIMap,
  isMetaMap,
  isShvMap,
  MetaMap,
  RpcValue,
  RpcValueWithMetaData,
  shvMapType,
  UInt,
} from "libshv-js/rpcvalue";

export const map = <
  T extends Record<string, BaseSchema<unknown, unknown, BaseIssue<unknown>>>,
>(
  schema: T,
) =>
  custom<Record<string, unknown>>((input) => {
    if (!isShvMap(input)) return false;
    return true;
  }, "Invalid input: expected ShvMap");

export const imap = <
  T extends Record<number, BaseSchema<unknown, unknown, BaseIssue<unknown>>>,
>(
  schema: T,
) =>
  custom<Record<number, unknown>>((input) => {
    if (!isIMap(input)) return false;
    return true;
  }, "Invalid input: expected IMap");

export const metamap = <
  T extends Record<
    string | number,
    BaseSchema<unknown, unknown, BaseIssue<unknown>>
  >,
>(
  schema: T,
) =>
  custom<Record<string | number, unknown>>((input) => {
    if (!isMetaMap(input)) return false;
    return true;
  }, "Invalid input: expected MetaMap");

export const recmap = <
  T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(
  schema: T,
) => record(string(), schema);

export const uint = () => instance(UInt);
export const double = () => instance(Double);
export const decimal = () => instance(Decimal);
export const blob = () => instance(ArrayBuffer);

export const list = () => array(lazy(() => rpcvalue()));

export const rpcvalue = (): BaseSchema<unknown, unknown, BaseIssue<unknown>> =>
  lazy(() =>
    union([
      optional(unknown()), // represents undefined
      boolean(),
      number(),
      uint(),
      double(),
      decimal(),
      blob(),
      string(),
      date(),
      list(),
      recmap(rpcvalue()),
      instance(RpcValueWithMetaData),
    ]),
  );

export const withMeta = <
  MetaSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
  ValueSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(
  metaParser: MetaSchema,
  valueParser: ValueSchema,
) =>
  custom<RpcValueWithMetaData>((input) => {
    if (!(input instanceof RpcValueWithMetaData)) return false;
    return true;
  }, "Invalid input: expected RpcValueWithMetaData");

export // UInt,
// Double,
// Decimal,
// RpcValue,
// RpcValueWithMetaData,
 {};

// export type { MetaMap };

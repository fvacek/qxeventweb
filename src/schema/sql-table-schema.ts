import {
  object,
  array,
  string,
  number,
  boolean,
  date,
  union,
  null_,
  undefined_,
  pipe,
  minLength,
  maxLength,
  check,
  type InferOutput,
} from "valibot";

/** Single table cell as returned by the SQL RPC API. */
export const TableCellSchema = union([
  null_(),
  undefined_(),
  string(),
  number(),
  date(),
  boolean(),
]);
export type TableCell = InferOutput<typeof TableCellSchema>;

export const TableFieldSchema = object({
  name: pipe(string(), minLength(1), maxLength(255)),
});
export type TableField = InferOutput<typeof TableFieldSchema>;

export const TableRowSchema = array(TableCellSchema);
export type TableRow = InferOutput<typeof TableRowSchema>;

export const TableJsonSchema = object({
  fields: array(TableFieldSchema),
  rows: array(TableRowSchema),
});
export type TableJson = InferOutput<typeof TableJsonSchema>;

/** {@link TableJsonSchema} plus consistency checks: row width matches the field count, field names are unique. */
export const ValidatedTableJsonSchema = pipe(
  TableJsonSchema,
  check(
    data => data.rows.every(row => row.length === data.fields.length),
    "All rows must have the same number of columns as fields",
  ),
  check(
    data => new Set(data.fields.map(field => field.name)).size === data.fields.length,
    "Field names must be unique",
  ),
);

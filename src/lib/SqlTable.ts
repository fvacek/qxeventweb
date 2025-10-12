import { RpcValue } from "libshv-js";

export type TableField = {
  name: string;
};

export type TableCell = null | string | number | Date;

export type TableRow = TableCell[];

export interface TableJson {
  fields: TableField[];
  rows: TableRow[];
}

function isValidCell(cell: any): cell is TableCell {
  return (
    cell === undefined ||
    cell === null ||
    typeof cell === "string" ||
    typeof cell === "number" ||
    cell instanceof Date
  );
}

function isTableJson(obj: unknown): obj is TableJson {
  if (typeof obj !== "object" || obj == null) {
    throw new Error("Not object");
  }
  // console.log("Checking obj:", obj);

  // Type guard to ensure we have an object with the expected properties
  const candidate = obj as any;
  // console.log("Checking candidate:", candidate);

  // Check fields
  if (!Array.isArray(candidate.fields)) {
    throw new Error("Invalid fields");
  }
  if (
    !candidate.fields.every(
      (f: any) => typeof f === "object" && typeof f.name === "string",
    )
  ) {
    throw new Error("Invalid field type");
  }

  // Check rows
  if (!Array.isArray(candidate.rows)) {
    throw new Error("Invalid rows array");
  }
  if (
    !candidate.rows.every((row: any) => {
      if (!Array.isArray(row)) {
        throw new Error("Invalid row:", row);
      }
      return true;
    })
  ) {
    throw new Error("Invalid row array");
  }
  if (
    !candidate.rows.every(
      (row: any) =>
        Array.isArray(row) &&
        row.every((cell: any) => {
          // console.log("Checking cell:", cell);
          if (!isValidCell(cell)) {
            throw new Error("Invalid cell type:", cell);
          }

          return true;
        }),
    )
  ) {
    throw new Error("Invalid rows array");
  }

  return true;
}

export class SqlTable {
  fields: TableField[];
  rows: TableRow[];
  private fieldIndexMap: Map<string, number>;

  constructor(data: TableJson) {
    this.fields = data.fields;
    this.rows = data.rows;
    this.fieldIndexMap = new Map(
      this.fields.map((field, index) => [field.name, index]),
    );
  }

  // Get value from a row by index or field name
  get(row_ix: number, field: number | string): TableCell {
    if (row_ix < 0 || row_ix >= this.rows.length) {
      throw new Error(`Row index ${row_ix} out of range`);
    }
    const row = this.rows[row_ix];
    if (typeof field === "number") {
      return row[field];
    }
    const index = this.fieldIndexMap.get(field);
    if (index === undefined) {
      throw new Error(`Field "${field}" not found`);
    }
    return row[index];
  }

  // Number of columns
  fieldCount(): number {
    return this.fields.length;
  }

  // Field object at index
  fieldAt(index: number): TableField {
    if (index < 0 || index >= this.fields.length) {
      throw new Error(`Field index ${index} out of range`);
    }
    return this.fields[index];
  }

  // Number of rows
  rowCount(): number {
    return this.rows.length;
  }

  // Row at index
  rowAt(index: number): TableRow {
    if (index < 0 || index >= this.rows.length) {
      throw new Error(`Row index ${index} out of range`);
    }
    return this.rows[index];
  }
}

export function createSqlTable(input: RpcValue): SqlTable {
  if (!isTableJson(input)) {
    throw new Error("Invalid TableJson structure");
  }

  // After validation, TypeScript knows input is TableJson
  return new SqlTable(input);
}

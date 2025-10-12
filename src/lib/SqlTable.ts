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
    cell === null ||
    typeof cell === "string" ||
    typeof cell === "number" ||
    cell instanceof Date
  );
}

function isTableJson(obj: any): obj is TableJson {
  if (typeof obj !== "object" || obj == null) return false;

  // Check fields
  if (!Array.isArray(obj.fields)) return false;
  if (
    !obj.fields.every(
      (f: any) => typeof f === "object" && typeof f.name === "string",
    )
  )
    return false;

  // Check rows
  if (!Array.isArray(obj.rows)) return false;
  if (
    !obj.rows.every(
      (row: any) => Array.isArray(row) && row.every((cell: any) => isValidCell(cell)),
    )
  )
    return false;

  return true;
}

export class SqlTable {
  private fields: TableField[];
  private rows: TableRow[];
  private fieldIndexMap: Map<string, number>;

  constructor(data: TableJson) {
    this.fields = data.fields;
    this.rows = data.rows;
    this.fieldIndexMap = new Map(
      this.fields.map((field, index) => [field.name, index]),
    );
  }

  // Get value from a row by index or field name
  get(row: TableRow, field: number | string): any {
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

export function createSqlTable(input: unknown): SqlTable {
  if (!isTableJson(input)) {
    throw new Error("Invalid TableJson structure");
  }

  return new SqlTable(input);
}

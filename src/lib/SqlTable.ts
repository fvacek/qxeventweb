import { RpcValue } from "libshv-js";
import { parse, safeParse, ValiError } from "valibot";
import {
  ValidatedTableJsonSchema,
  type TableJson as ValibotTableJson
} from "../schema/sql-table-schema";

export type TableField = {
  name: string;
};

export type TableCell = null | string | number | Date;

export type TableRow = TableCell[];

export interface TableJson {
  fields: TableField[];
  rows: TableRow[];
}

// Type alias for compatibility with valibot schema
export type { ValibotTableJson };

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

  const candidate = obj as any;

  // Check fields
  if (!Array.isArray(candidate.fields)) {
    throw new Error("Invalid fields");
  }

  for (let i = 0; i < candidate.fields.length; i++) {
    const field = candidate.fields[i];
    if (typeof field !== "object" || field == null || typeof field.name !== "string") {
      throw new Error("Invalid field type");
    }
  }

  // Check rows
  if (!Array.isArray(candidate.rows)) {
    throw new Error("Invalid rows array");
  }

  // Single loop to validate both row structure and cell content
  for (let i = 0; i < candidate.rows.length; i++) {
    const row = candidate.rows[i];
    if (!Array.isArray(row)) {
      throw new Error("Invalid row: not an array");
    }

    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (!isValidCell(cell)) {
        throw new Error("Invalid cell type");
      }
    }
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
  try {
    // Use valibot schema validation instead of custom validation
    const validatedData = parse(ValidatedTableJsonSchema, input);
    return new SqlTable(validatedData as TableJson);
  } catch (error) {
    if (error instanceof ValiError) {
      // Create a more informative error message from valibot validation issues
      const issues = error.issues.map(issue => {
        const path = issue.path?.map((p: any) => p.key).join('.') || 'root';
        return `${path}: ${issue.message}`;
      }).join('; ');

      throw new Error(`Invalid TableJson structure: ${issues}`);
    }

    // Re-throw other errors
    throw new Error(`Failed to create SqlTable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Safely creates a SqlTable from RpcValue with detailed error information
 * @param input - RpcValue containing table data
 * @returns Result object with success flag and either data or error details
 */
export function safeCreateSqlTable(input: RpcValue): {
  success: true;
  data: SqlTable;
  issues?: undefined;
} | {
  success: false;
  data?: undefined;
  issues: Array<{
    path: string;
    message: string;
    input: unknown;
  }>;
} {
  const result = safeParse(ValidatedTableJsonSchema, input);

  if (result.success) {
    return {
      success: true,
      data: new SqlTable(result.output as TableJson),
    };
  } else {
    return {
      success: false,
      issues: result.issues.map(issue => ({
        path: issue.path?.map((p: any) => p.key).join('.') || 'root',
        message: issue.message,
        input: issue.input,
      })),
    };
  }
}

/**
 * Validates if input looks like table data without creating SqlTable instance
 * @param input - Data to validate
 * @returns true if valid, false otherwise
 */
export function isValidTableData(input: unknown): input is TableJson {
  const result = safeParse(ValidatedTableJsonSchema, input);
  return result.success;
}

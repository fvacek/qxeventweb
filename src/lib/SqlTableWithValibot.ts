import { RpcValue } from "libshv-js";
import { parse, safeParse, ValiError } from "valibot";
import {
  ValidatedTableJsonSchema,
  type TableJson,
  type TableField,
  type TableRow,
  type TableCell
} from "../schema/sql-table-schema";

export type { TableField, TableCell, TableRow, TableJson };

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
      if (field < 0 || field >= row.length) {
        throw new Error(`Field index ${field} out of range`);
      }
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

  // Get field index by name
  getFieldIndex(fieldName: string): number {
    const index = this.fieldIndexMap.get(fieldName);
    if (index === undefined) {
      throw new Error(`Field "${fieldName}" not found`);
    }
    return index;
  }

  // Check if field exists
  hasField(fieldName: string): boolean {
    return this.fieldIndexMap.has(fieldName);
  }

  // Get all field names
  getFieldNames(): string[] {
    return this.fields.map(field => field.name);
  }

  // Get column data by field name
  getColumn(fieldName: string): TableCell[] {
    const index = this.getFieldIndex(fieldName);
    return this.rows.map(row => row[index]);
  }

  // Find rows that match a condition
  findRows(predicate: (row: TableRow, index: number) => boolean): TableRow[] {
    return this.rows.filter(predicate);
  }

  // Find rows where a specific field matches a value
  findRowsByFieldValue(fieldName: string, value: TableCell): TableRow[] {
    const fieldIndex = this.getFieldIndex(fieldName);
    return this.rows.filter(row => row[fieldIndex] === value);
  }

  // Convert back to plain object
  toJSON(): TableJson {
    return {
      fields: this.fields,
      rows: this.rows,
    };
  }

  // Create a new table with filtered rows
  filter(predicate: (row: TableRow, index: number) => boolean): SqlTable {
    const filteredRows = this.rows.filter(predicate);
    return new SqlTable({
      fields: this.fields,
      rows: filteredRows,
    });
  }

  // Create a new table with transformed rows
  map<T extends TableCell>(transformer: (cell: TableCell, fieldIndex: number, rowIndex: number) => T): SqlTable {
    const transformedRows = this.rows.map((row, rowIndex) =>
      row.map((cell, fieldIndex) => transformer(cell, fieldIndex, rowIndex))
    );
    return new SqlTable({
      fields: this.fields,
      rows: transformedRows,
    });
  }

  // Get summary information about the table
  getSummary(): {
    fieldCount: number;
    rowCount: number;
    fields: string[];
    isEmpty: boolean;
  } {
    return {
      fieldCount: this.fieldCount(),
      rowCount: this.rowCount(),
      fields: this.getFieldNames(),
      isEmpty: this.rowCount() === 0,
    };
  }
}

/**
 * Creates a validated SqlTable from RpcValue using valibot schema validation
 * @param input - RpcValue containing table data
 * @returns SqlTable instance
 * @throws Error if validation fails
 */
export function createSqlTable(input: RpcValue): SqlTable {
  try {
    // Use valibot to validate and parse the input
    const validatedData = parse(ValidatedTableJsonSchema, input);
    return new SqlTable(validatedData);
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
      data: new SqlTable(result.output),
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

/**
 * Creates SqlTable with custom validation error handling
 * @param input - RpcValue containing table data
 * @param options - Configuration options
 * @returns SqlTable instance
 */
export function createSqlTableWithOptions(
  input: RpcValue,
  options: {
    // Allow empty tables (no rows)
    allowEmpty?: boolean;
    // Custom field name validation
    fieldNameValidator?: (name: string) => boolean;
    // Custom error message formatter
    errorFormatter?: (issues: Array<{ path: string; message: string }>) => string;
  } = {}
): SqlTable {
  const result = safeCreateSqlTable(input);

  if (!result.success) {
    const errorMessage = options.errorFormatter
      ? options.errorFormatter(result.issues.map(i => ({ path: i.path, message: i.message })))
      : `Validation failed: ${result.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`;

    throw new Error(errorMessage);
  }

  const table = result.data;

  // Additional custom validations
  if (!options.allowEmpty && table.rowCount() === 0) {
    throw new Error("Empty tables are not allowed");
  }

  if (options.fieldNameValidator) {
    const invalidFields = table.getFieldNames().filter(name => !options.fieldNameValidator!(name));
    if (invalidFields.length > 0) {
      throw new Error(`Invalid field names: ${invalidFields.join(', ')}`);
    }
  }

  return table;
}

/**
 * Creates SqlTable from RpcValue with automatic data cleaning
 * @param input - RpcValue containing potentially messy table data
 * @returns SqlTable instance with cleaned data
 */
export function createCleanSqlTable(input: RpcValue): SqlTable {
  const result = safeCreateSqlTable(input);

  if (!result.success) {
    throw new Error(`Cannot create clean table: ${result.issues.map(i => i.message).join('; ')}`);
  }

  // Clean the data
  const cleanedData: TableJson = {
    fields: result.data.fields.map(field => ({
      name: field.name.trim().toLowerCase().replace(/\s+/g, '_')
    })),
    rows: result.data.rows.map(row =>
      row.map(cell => {
        if (typeof cell === 'string') {
          return cell.trim();
        }
        return cell;
      })
    )
  };

  return new SqlTable(cleanedData);
}

/**
 * Utility function to merge multiple tables with the same structure
 * @param tables - Array of SqlTable instances to merge
 * @returns New SqlTable with combined rows
 */
export function mergeSqlTables(tables: SqlTable[]): SqlTable {
  if (tables.length === 0) {
    throw new Error("Cannot merge empty array of tables");
  }

  const firstTable = tables[0];
  const referenceFields = firstTable.getFieldNames();

  // Validate all tables have the same structure
  for (let i = 1; i < tables.length; i++) {
    const currentFields = tables[i].getFieldNames();
    if (JSON.stringify(referenceFields) !== JSON.stringify(currentFields)) {
      throw new Error(`Table ${i} has different field structure than first table`);
    }
  }

  // Combine all rows
  const combinedRows: TableRow[] = [];
  for (const table of tables) {
    combinedRows.push(...table.rows);
  }

  return new SqlTable({
    fields: firstTable.fields,
    rows: combinedRows,
  });
}

// Legacy compatibility - keep the old function name as an alias
export { createSqlTable as createSqlTableLegacy };

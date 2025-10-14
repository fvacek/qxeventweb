import { RpcValue } from "libshv-js";
import { parse, safeParse, ValiError } from "valibot";
import {
  ValidatedTableJsonSchema,
  type TableJson as ValibotTableJson
} from "../schema/sql-table-schema";

export type TableField = {
  name: string;
};

export type TableCell = null | string | number | Date | boolean;

export type TableRow = TableCell[];

export interface TableJson {
  fields: TableField[];
  rows: TableRow[];
}

// Type alias for compatibility with valibot schema
export type { ValibotTableJson };

export class SqlTable {
  fields: TableField[];
  rows: TableRow[];
  private fieldIndexMap: Map<string, number>;
  private camelCaseFieldNames?: string[];

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
    return row[this.fieldIndex(field)];
  }

  // Number of columns
  fieldCount(): number {
    return this.fields.length;
  }

  fieldIndex(fieldName: string): number {
    const index = this.fieldIndexMap.get(fieldName);
    if (index === undefined) {
      throw new Error(`Field "${fieldName}" not found`);
    }
    return index;
  }

  // Field object at index
  fieldAt(index: number | string): TableField {
    if (typeof index === "number") {
      if (index < 0 || index >= this.fields.length) {
        throw new Error(`Field index ${index} out of range`);
      }
      return this.fields[index];
    }
    return this.fieldAt(this.fieldIndex(index));
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

  recordAt(index: number): Record<string, TableCell> {
    const row = this.rowAt(index);
    const record: Record<string, TableCell> = {};

    // Cache camelCase field names on first use
    if (!this.camelCaseFieldNames) {
      this.camelCaseFieldNames = this.fields.map(field => snakeCaseToCamelCase(field.name));
    }

    this.fields.forEach((_field, fieldIndex) => {
      let key = this.camelCaseFieldNames![fieldIndex];
      record[key] = row[fieldIndex];
    });

    return record;
  }
}

function snakeCaseToCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Tests for snakeCaseToCamelCase function
function testSnakeCaseToCamelCase(): void {
  // Test basic snake_case conversion
  console.assert(snakeCaseToCamelCase("user_name") === "userName", "Failed: user_name -> userName");
  console.assert(snakeCaseToCamelCase("first_name") === "firstName", "Failed: first_name -> firstName");

  // Test multiple underscores
  console.assert(snakeCaseToCamelCase("user_profile_id") === "userProfileId", "Failed: user_profile_id -> userProfileId");

  // Test no underscores (should remain unchanged)
  console.assert(snakeCaseToCamelCase("username") === "username", "Failed: username -> username");

  // Test single character after underscore
  console.assert(snakeCaseToCamelCase("user_a") === "userA", "Failed: user_a -> userA");

  // Test empty string
  console.assert(snakeCaseToCamelCase("") === "", "Failed: empty string");

  // Test string starting with underscore (only lowercase letters after _ are converted)
  console.assert(snakeCaseToCamelCase("_user") === "_user", "Failed: _user -> _user");

  // Test uppercase letters after underscore (should not be converted)
  console.assert(snakeCaseToCamelCase("user_Name") === "user_Name", "Failed: user_Name -> user_Name");

  console.log("All snakeCaseToCamelCase tests passed!");
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

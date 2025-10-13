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
  parse,
  safeParse,
  pipe,
  minLength,
  maxLength,
  transform,
  custom,
  type InferOutput,
  type BaseSchema,
  type BaseIssue,
} from "valibot";

import { rpcvalue } from "./rpcvalue-schema";

// =============================================================================
// SQL TABLE SCHEMAS
// =============================================================================

// Schema for individual table cells (null | string | number | Date)
const TableCellSchema = union([
  null_(),
  undefined_(),
  string(),
  number(),
  date(),
]);

export { TableCellSchema };
export type TableCell = InferOutput<typeof TableCellSchema>;

// Schema for table field definition
const TableFieldSchema = object({
  name: pipe(string(), minLength(1), maxLength(255)),
});

export { TableFieldSchema };
export type TableField = InferOutput<typeof TableFieldSchema>;

// Schema for table row (array of cells)
const TableRowSchema = array(TableCellSchema);

export { TableRowSchema };
export type TableRow = InferOutput<typeof TableRowSchema>;

// Schema for the base TableJson structure
const TableJsonSchema = object({
  fields: array(TableFieldSchema),
  rows: array(TableRowSchema),
});

export { TableJsonSchema };
export type TableJson = InferOutput<typeof TableJsonSchema>;

// Enhanced schema with validation rules
const ValidatedTableJsonSchema = pipe(
  TableJsonSchema,
  custom((data: unknown) => {
    const typedData = data as TableJson;
    // Validate that all rows have the same number of columns as fields
    const expectedColumns = typedData.fields.length;
    for (let i = 0; i < typedData.rows.length; i++) {
      if (typedData.rows[i].length !== expectedColumns) {
        return false;
      }
    }
    return true;
  }, "All rows must have the same number of columns as fields"),
  custom((data: unknown) => {
    const typedData = data as TableJson;
    // Validate that field names are unique
    const names = typedData.fields.map((field: TableField) => field.name);
    const uniqueNames = new Set(names);
    return names.length === uniqueNames.size;
  }, "Field names must be unique")
);

export { ValidatedTableJsonSchema };

// Schema for SqlTable class validation
const SqlTableSchema = custom<any>((input) => {
  // Check if it's an instance of SqlTable or has the expected structure
  if (typeof input !== "object" || input === null) return false;

  const typedInput = input as Record<string, any>;

  // Check for required properties
  if (!Array.isArray(typedInput.fields)) return false;
  if (!Array.isArray(typedInput.rows)) return false;

  // Validate fields array
  for (const field of typedInput.fields) {
    if (typeof field !== "object" || field === null) return false;
    if (typeof field.name !== "string" || field.name.length === 0) return false;
  }

  // Validate rows array
  for (const row of typedInput.rows) {
    if (!Array.isArray(row)) return false;
    for (const cell of row) {
      if (cell !== null &&
          cell !== undefined &&
          typeof cell !== "string" &&
          typeof cell !== "number" &&
          !(cell instanceof Date)) {
        return false;
      }
    }
  }

  return true;
}, "Invalid SqlTable structure");

export { SqlTableSchema };

// =============================================================================
// SPECIALIZED SCHEMAS FOR DIFFERENT TABLE TYPES
// =============================================================================

// Schema for event configuration table
const EventConfigTableSchema = object({
  fields: array(object({
    name: union([
      string("key"),
      string("value"),
      string("description"),
    ]),
  })),
  rows: array(array(union([
    string(),
    number(),
    null_(),
  ]))),
});

export { EventConfigTableSchema };

// Schema for competitor/results table
const CompetitorTableSchema = object({
  fields: array(object({
    name: union([
      string("id"),
      string("name"),
      string("class"),
      string("startTime"),
      string("finishTime"),
      string("time"),
    ]),
  })),
  rows: array(array(union([
    number(), // for IDs and times
    string(), // for names and classes
    date(),   // for timestamps
    null_(),  // for empty values
  ]))),
});

export { CompetitorTableSchema };

// Schema for stage configuration
const StageTableSchema = object({
  fields: array(object({
    name: union([
      string("id"),
      string("name"),
      string("startDateTime"),
      string("state"),
    ]),
  })),
  rows: array(array(union([
    number(),
    string(),
    date(),
    null_(),
  ]))),
});

export { StageTableSchema };

// =============================================================================
// TRANSFORMATION SCHEMAS
// =============================================================================

// Transform RpcValue to TableJson
const RpcValueToTableJsonSchema = pipe(
  rpcvalue(),
  transform((data: any): TableJson => {
    // Validate the structure first
    const result = safeParse(TableJsonSchema, data);
    if (!result.success) {
      throw new Error("Invalid table structure from RPC value");
    }
    return result.output;
  })
);

export { RpcValueToTableJsonSchema };

// Transform with data normalization
const NormalizedTableSchema = pipe(
  TableJsonSchema,
  transform((data: TableJson): TableJson => {
    return {
      fields: data.fields.map((field: TableField) => ({
        name: field.name.trim().toLowerCase(),
      })),
      rows: data.rows.map(row =>
        row.map(cell => {
          if (typeof cell === "string") {
            return cell.trim();
          }
          return cell;
        })
      ),
    };
  })
);

export { NormalizedTableSchema };

// =============================================================================
// VALIDATION EXAMPLES
// =============================================================================

// Example valid table data
export const sampleTableData: TableJson = {
  fields: [
    { name: "id" },
    { name: "name" },
    { name: "age" },
    { name: "email" },
    { name: "created_at" },
  ],
  rows: [
    [1, "John Doe", 30, "john@example.com", new Date("2024-01-01")],
    [2, "Jane Smith", 25, "jane@example.com", new Date("2024-01-02")],
    [3, "Bob Johnson", null, "bob@example.com", new Date("2024-01-03")],
  ],
};

// Example event config table
export const sampleEventConfig: TableJson = {
  fields: [
    { name: "key" },
    { name: "value" },
    { name: "description" },
  ],
  rows: [
    ["event_name", "Spring Championship", "Name of the event"],
    ["max_competitors", 100, "Maximum number of competitors"],
    ["start_date", "2024-04-15", "Event start date"],
    ["registration_open", "true", "Is registration currently open"],
  ],
};

// Example competitor results table
export const sampleCompetitorResults: TableJson = {
  fields: [
    { name: "id" },
    { name: "name" },
    { name: "class" },
    { name: "start_time" },
    { name: "finish_time" },
    { name: "total_time" },
  ],
  rows: [
    [1, "Alice Runner", "Elite", new Date("2024-04-15T09:00:00Z"), new Date("2024-04-15T10:30:00Z"), 5400],
    [2, "Bob Speedster", "Amateur", new Date("2024-04-15T09:05:00Z"), null, null],
    [3, "Carol Champion", "Elite", new Date("2024-04-15T09:10:00Z"), new Date("2024-04-15T11:15:00Z"), 7500],
  ],
};

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateTableJson(data: unknown): TableJson {
  return parse(ValidatedTableJsonSchema, data);
}

export function safeValidateTableJson(data: unknown) {
  return safeParse(ValidatedTableJsonSchema, data);
}

export function validateEventConfigTable(data: unknown) {
  return safeParse(EventConfigTableSchema, data);
}

export function validateCompetitorTable(data: unknown) {
  return safeParse(CompetitorTableSchema, data);
}

export function validateStageTable(data: unknown) {
  return safeParse(StageTableSchema, data);
}

// Transform RPC value to validated table
export function rpcValueToTable(rpcData: unknown): TableJson {
  return parse(RpcValueToTableJsonSchema, rpcData);
}

// Normalize table data
export function normalizeTable(data: TableJson): TableJson {
  return parse(NormalizedTableSchema, data);
}

// =============================================================================
// UTILITY FUNCTIONS FOR SQL TABLE OPERATIONS
// =============================================================================

// Validate that a table has expected columns
export function createTableWithRequiredColumns(requiredColumns: string[]) {
  return pipe(
    TableJsonSchema,
    custom((data: unknown) => {
      const typedData = data as TableJson;
      const fieldNames = typedData.fields.map((f: TableField) => f.name.toLowerCase());
      return requiredColumns.every(col =>
        fieldNames.includes(col.toLowerCase())
      );
    }, `Table must contain columns: ${requiredColumns.join(", ")}`)
  );
}

// Create schema for table with specific field types
export function createTypedTableSchema<T extends Record<string, BaseSchema<unknown, unknown, BaseIssue<unknown>>>>(
  fieldSchemas: T
) {
  const fieldNames = Object.keys(fieldSchemas);

  return pipe(
    object({
      fields: array(object({
        name: string(),
      })),
      rows: array(array(union([
        string(),
        number(),
        date(),
        null_(),
        undefined_(),
      ]))),
    }),
    custom((data: unknown) => {
      // Check that all required fields are present
      const typedData = data as TableJson;
      const tableFieldNames = typedData.fields.map((f: TableField) => f.name);
      return fieldNames.every(name => tableFieldNames.includes(name));
    }, `Table must contain all required fields: ${fieldNames.join(", ")}`)
  );
}

// =============================================================================
// INTEGRATION WITH EXISTING SQLTTABLE CLASS
// =============================================================================

export class ValidatedSqlTable {
  private table: TableJson;
  private fieldIndexMap: Map<string, number>;

  constructor(data: unknown) {
    // Validate input data
    this.table = validateTableJson(data);
    this.fieldIndexMap = new Map(
      this.table.fields.map((field, index) => [field.name, index])
    );
  }

  get fields(): TableField[] {
    return this.table.fields;
  }

  get rows(): TableRow[] {
    return this.table.rows;
  }

  get(rowIndex: number, field: number | string): TableCell {
    if (rowIndex < 0 || rowIndex >= this.table.rows.length) {
      throw new Error(`Row index ${rowIndex} out of range`);
    }

    const row = this.table.rows[rowIndex];

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

  fieldCount(): number {
    return this.table.fields.length;
  }

  fieldAt(index: number): TableField {
    if (index < 0 || index >= this.table.fields.length) {
      throw new Error(`Field index ${index} out of range`);
    }
    return this.table.fields[index];
  }

  rowCount(): number {
    return this.table.rows.length;
  }

  rowAt(index: number): TableRow {
    if (index < 0 || index >= this.table.rows.length) {
      throw new Error(`Row index ${index} out of range`);
    }
    return this.table.rows[index];
  }

  // Additional utility methods
  findRowsByField(fieldName: string, value: TableCell): TableRow[] {
    const fieldIndex = this.fieldIndexMap.get(fieldName);
    if (fieldIndex === undefined) {
      throw new Error(`Field "${fieldName}" not found`);
    }

    return this.table.rows.filter(row => row[fieldIndex] === value);
  }

  getColumn(fieldName: string): TableCell[] {
    const fieldIndex = this.fieldIndexMap.get(fieldName);
    if (fieldIndex === undefined) {
      throw new Error(`Field "${fieldName}" not found`);
    }

    return this.table.rows.map(row => row[fieldIndex]);
  }

  toJSON(): TableJson {
    return this.table;
  }
}

// =============================================================================
// TEST EXAMPLES
// =============================================================================

export function runSqlTableValidationTests() {
  console.log("=== SQL Table Validation Tests ===");

  // Test 1: Valid table data
  console.log("\n1. Testing valid table data:");
  const validResult = safeValidateTableJson(sampleTableData);
  if (validResult.success) {
    console.log("✅ Valid table structure");
    console.log(`   Fields: ${validResult.output.fields.map(f => f.name).join(", ")}`);
    console.log(`   Rows: ${validResult.output.rows.length}`);
  } else {
    console.log("❌ Unexpected validation failure");
  }

  // Test 2: Invalid table data (mismatched columns)
  console.log("\n2. Testing invalid table data (mismatched columns):");
  const invalidData = {
    fields: [{ name: "id" }, { name: "name" }],
    rows: [
      [1, "John", "extra"], // Too many columns
      [2], // Too few columns
    ],
  };

  const invalidResult = safeValidateTableJson(invalidData);
  if (!invalidResult.success) {
    console.log("✅ Correctly rejected invalid table structure");
  } else {
    console.log("❌ Should have failed validation");
  }

  // Test 3: Event config table
  console.log("\n3. Testing event config table:");
  const eventResult = validateEventConfigTable(sampleEventConfig);
  if (eventResult.success) {
    console.log("✅ Valid event config table");
  } else {
    console.log("❌ Event config validation failed");
  }

  // Test 4: Using ValidatedSqlTable class
  console.log("\n4. Testing ValidatedSqlTable class:");
  try {
    const validatedTable = new ValidatedSqlTable(sampleTableData);
    console.log("✅ ValidatedSqlTable created successfully");
    console.log(`   Field count: ${validatedTable.fieldCount()}`);
    console.log(`   Row count: ${validatedTable.rowCount()}`);
    console.log(`   First row, name field: ${validatedTable.get(0, "name")}`);

    // Test column extraction
    const names = validatedTable.getColumn("name");
    console.log(`   All names: ${names.join(", ")}`);

  } catch (error) {
    console.log("❌ ValidatedSqlTable creation failed:", error);
  }

  // Test 5: RPC value transformation
  console.log("\n5. Testing RPC value transformation:");
  try {
    const transformedTable = rpcValueToTable(sampleTableData);
    console.log("✅ RPC value transformed successfully");
    console.log(`   Transformed fields: ${transformedTable.fields.map(f => f.name).join(", ")}`);
  } catch (error) {
    console.log("❌ RPC transformation failed:", error);
  }

  console.log("\n✅ All SQL Table validation tests completed!");
}

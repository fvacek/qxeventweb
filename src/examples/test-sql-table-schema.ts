import { safeParse, parse, flatten } from "valibot";
import {
  TableCellSchema,
  TableFieldSchema,
  TableRowSchema,
  TableJsonSchema,
  ValidatedTableJsonSchema,
  SqlTableSchema,
  EventConfigTableSchema,
  CompetitorTableSchema,
  StageTableSchema,
  RpcValueToTableJsonSchema,
  NormalizedTableSchema,
  ValidatedSqlTable,
  validateTableJson,
  safeValidateTableJson,
  validateEventConfigTable,
  validateCompetitorTable,
  validateStageTable,
  rpcValueToTable,
  normalizeTable,
  createTableWithRequiredColumns,
  createTypedTableSchema,
  runSqlTableValidationTests,
  sampleTableData,
  sampleEventConfig,
  sampleCompetitorResults,
  type TableJson,
  type TableField,
  type TableRow,
  type TableCell,
} from "./sql-table-schema";

// =============================================================================
// TEST DATA
// =============================================================================

const validBasicTable: TableJson = {
  fields: [
    { name: "id" },
    { name: "name" },
    { name: "status" },
  ],
  rows: [
    [1, "Test Item 1", "active"],
    [2, "Test Item 2", "inactive"],
    [3, "Test Item 3", null],
  ],
};

const invalidTableMismatchedColumns = {
  fields: [
    { name: "id" },
    { name: "name" },
  ],
  rows: [
    [1, "John", "extra_column"], // 3 columns when expecting 2
    [2], // 1 column when expecting 2
  ],
};

const invalidTableDuplicateFields = {
  fields: [
    { name: "id" },
    { name: "name" },
    { name: "id" }, // Duplicate field name
  ],
  rows: [
    [1, "John", 100],
    [2, "Jane", 200],
  ],
};

const invalidTableInvalidCells = {
  fields: [
    { name: "id" },
    { name: "data" },
  ],
  rows: [
    [1, { invalid: "object" }], // Objects are not valid cells
    [2, ["invalid", "array"]], // Arrays are not valid cells
  ],
};

const competitorResultsData = {
  fields: [
    { name: "id" },
    { name: "name" },
    { name: "class" },
    { name: "startTime" },
    { name: "finishTime" },
    { name: "time" },
  ],
  rows: [
    [1, "Alice Smith", "Elite", new Date("2024-01-15T09:00:00Z"), new Date("2024-01-15T10:23:45Z"), 5025],
    [2, "Bob Johnson", "Amateur", new Date("2024-01-15T09:15:00Z"), null, null],
    [3, "Carol Davis", "Elite", new Date("2024-01-15T09:30:00Z"), new Date("2024-01-15T11:02:30Z"), 5550],
  ],
};

const stageConfigData = {
  fields: [
    { name: "id" },
    { name: "name" },
    { name: "startDateTime" },
    { name: "state" },
  ],
  rows: [
    [1, "Qualification", new Date("2024-01-15T09:00:00Z"), "completed"],
    [2, "Semi-final", new Date("2024-01-15T14:00:00Z"), "running"],
    [3, "Final", new Date("2024-01-15T16:00:00Z"), "waiting"],
  ],
};

const rpcTableData = {
  fields: [
    { name: "key" },
    { name: "value" },
  ],
  rows: [
    ["setting1", "value1"],
    ["setting2", 42],
    ["setting3", null],
  ],
};

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

function testBasicSchemas() {
  console.log("=== Testing Basic Schemas ===");

  // Test TableCellSchema
  console.log("\n1. Testing TableCellSchema:");
  const validCells = [null, undefined, "string", 123, new Date()];
  const invalidCells = [{}, [], () => {}, Symbol("test")];

  validCells.forEach(cell => {
    const result = safeParse(TableCellSchema, cell);
    if (result.success) {
      console.log(`✅ Valid cell: ${cell}`);
    } else {
      console.log(`❌ Unexpected failure for: ${cell}`);
    }
  });

  invalidCells.forEach(cell => {
    const result = safeParse(TableCellSchema, cell);
    if (!result.success) {
      console.log(`✅ Correctly rejected invalid cell: ${typeof cell}`);
    } else {
      console.log(`❌ Should have rejected: ${typeof cell}`);
    }
  });

  // Test TableFieldSchema
  console.log("\n2. Testing TableFieldSchema:");
  const validFields = [
    { name: "id" },
    { name: "user_name" },
    { name: "a" }, // single character
  ];
  const invalidFields = [
    { name: "" }, // empty string
    { name: null },
    { invalidProp: "test" },
    {},
  ];

  validFields.forEach(field => {
    const result = safeParse(TableFieldSchema, field);
    if (result.success) {
      console.log(`✅ Valid field: ${field.name}`);
    } else {
      console.log(`❌ Unexpected failure for field: ${JSON.stringify(field)}`);
    }
  });

  invalidFields.forEach(field => {
    const result = safeParse(TableFieldSchema, field);
    if (!result.success) {
      console.log(`✅ Correctly rejected invalid field: ${JSON.stringify(field)}`);
    } else {
      console.log(`❌ Should have rejected field: ${JSON.stringify(field)}`);
    }
  });

  // Test TableRowSchema
  console.log("\n3. Testing TableRowSchema:");
  const validRows = [
    [],
    [1, "test", null],
    [new Date(), 42, "string", null, undefined],
  ];
  const invalidRows = [
    [1, 2, {}], // object in row
    ["test", []], // array in row
    "not an array",
  ];

  validRows.forEach((row, index) => {
    const result = safeParse(TableRowSchema, row);
    if (result.success) {
      console.log(`✅ Valid row ${index}: ${row.length} cells`);
    } else {
      console.log(`❌ Unexpected failure for row ${index}`);
    }
  });

  invalidRows.forEach((row, index) => {
    const result = safeParse(TableRowSchema, row);
    if (!result.success) {
      console.log(`✅ Correctly rejected invalid row ${index}`);
    } else {
      console.log(`❌ Should have rejected row ${index}`);
    }
  });
}

function testTableJsonSchema() {
  console.log("\n=== Testing TableJsonSchema ===");

  // Test basic valid table
  console.log("\n1. Testing valid basic table:");
  const result = safeParse(TableJsonSchema, validBasicTable);
  if (result.success) {
    console.log("✅ Basic table validation passed");
    console.log(`   Fields: ${result.output.fields.map(f => f.name).join(", ")}`);
    console.log(`   Rows: ${result.output.rows.length}`);
  } else {
    console.log("❌ Basic table validation failed");
    console.log("   Errors:", flatten(result.issues));
  }

  // Test validated table schema (with additional constraints)
  console.log("\n2. Testing ValidatedTableJsonSchema:");
  const validatedResult = safeParse(ValidatedTableJsonSchema, validBasicTable);
  if (validatedResult.success) {
    console.log("✅ Validated table schema passed");
  } else {
    console.log("❌ Validated table schema failed");
    console.log("   Errors:", flatten(validatedResult.issues));
  }

  // Test mismatched columns
  console.log("\n3. Testing table with mismatched columns:");
  const mismatchResult = safeParse(ValidatedTableJsonSchema, invalidTableMismatchedColumns);
  if (!mismatchResult.success) {
    console.log("✅ Correctly rejected table with mismatched columns");
  } else {
    console.log("❌ Should have rejected mismatched columns");
  }

  // Test duplicate field names
  console.log("\n4. Testing table with duplicate field names:");
  const duplicateResult = safeParse(ValidatedTableJsonSchema, invalidTableDuplicateFields);
  if (!duplicateResult.success) {
    console.log("✅ Correctly rejected table with duplicate field names");
  } else {
    console.log("❌ Should have rejected duplicate field names");
  }

  // Test invalid cell types
  console.log("\n5. Testing table with invalid cell types:");
  const invalidCellResult = safeParse(TableJsonSchema, invalidTableInvalidCells);
  if (!invalidCellResult.success) {
    console.log("✅ Correctly rejected table with invalid cell types");
  } else {
    console.log("❌ Should have rejected invalid cell types");
  }
}

function testSpecializedSchemas() {
  console.log("\n=== Testing Specialized Schemas ===");

  // Test EventConfigTableSchema
  console.log("\n1. Testing EventConfigTableSchema:");
  const eventResult = validateEventConfigTable(sampleEventConfig);
  if (eventResult.success) {
    console.log("✅ Event config table validation passed");
    console.log(`   Config items: ${eventResult.output.rows.length}`);
  } else {
    console.log("❌ Event config table validation failed");
    console.log("   Errors:", flatten(eventResult.issues));
  }

  // Test CompetitorTableSchema
  console.log("\n2. Testing CompetitorTableSchema:");
  const competitorResult = validateCompetitorTable(competitorResultsData);
  if (competitorResult.success) {
    console.log("✅ Competitor table validation passed");
    console.log(`   Competitors: ${competitorResult.output.rows.length}`);
  } else {
    console.log("❌ Competitor table validation failed");
    console.log("   Errors:", flatten(competitorResult.issues));
  }

  // Test StageTableSchema
  console.log("\n3. Testing StageTableSchema:");
  const stageResult = validateStageTable(stageConfigData);
  if (stageResult.success) {
    console.log("✅ Stage table validation passed");
    console.log(`   Stages: ${stageResult.output.rows.length}`);
  } else {
    console.log("❌ Stage table validation failed");
    console.log("   Errors:", flatten(stageResult.issues));
  }
}

function testTransformationSchemas() {
  console.log("\n=== Testing Transformation Schemas ===");

  // Test RPC value transformation
  console.log("\n1. Testing RPC value transformation:");
  try {
    const transformedTable = rpcValueToTable(rpcTableData);
    console.log("✅ RPC value transformation successful");
    console.log(`   Fields: ${transformedTable.fields.map(f => f.name).join(", ")}`);
    console.log(`   Rows: ${transformedTable.rows.length}`);
  } catch (error) {
    console.log("❌ RPC value transformation failed:", error);
  }

  // Test normalization
  console.log("\n2. Testing table normalization:");
  const unnormalizedTable = {
    fields: [
      { name: "  ID  " },
      { name: "NAME" },
    ],
    rows: [
      [1, "  John Doe  "],
      [2, "Jane Smith   "],
    ],
  };

  try {
    const normalizedTable = normalizeTable(unnormalizedTable);
    console.log("✅ Table normalization successful");
    console.log(`   Normalized fields: ${normalizedTable.fields.map(f => f.name).join(", ")}`);
    console.log(`   Normalized first name: "${normalizedTable.rows[0][1]}"`);
  } catch (error) {
    console.log("❌ Table normalization failed:", error);
  }
}

function testValidatedSqlTableClass() {
  console.log("\n=== Testing ValidatedSqlTable Class ===");

  try {
    const table = new ValidatedSqlTable(sampleTableData);
    console.log("✅ ValidatedSqlTable created successfully");

    // Test basic properties
    console.log(`   Field count: ${table.fieldCount()}`);
    console.log(`   Row count: ${table.rowCount()}`);

    // Test field access
    console.log(`   First field: ${table.fieldAt(0).name}`);
    console.log(`   Fields: ${table.fields.map(f => f.name).join(", ")}`);

    // Test data access
    console.log(`   First row, first column: ${table.get(0, 0)}`);
    console.log(`   First row, 'name' column: ${table.get(0, "name")}`);

    // Test utility methods
    const nameColumn = table.getColumn("name");
    console.log(`   All names: ${nameColumn.join(", ")}`);

    const activeRows = table.findRowsByField("name", "Jane Smith");
    console.log(`   Rows with 'Jane Smith': ${activeRows.length}`);

    // Test JSON export
    const json = table.toJSON();
    console.log(`   JSON export has ${json.fields.length} fields and ${json.rows.length} rows`);

  } catch (error) {
    console.log("❌ ValidatedSqlTable test failed:", error);
  }

  // Test with invalid data
  console.log("\n2. Testing ValidatedSqlTable with invalid data:");
  try {
    new ValidatedSqlTable(invalidTableMismatchedColumns);
    console.log("❌ Should have thrown error for invalid data");
  } catch (error) {
    console.log("✅ Correctly rejected invalid table data");
  }
}

function testUtilityFunctions() {
  console.log("\n=== Testing Utility Functions ===");

  // Test createTableWithRequiredColumns
  console.log("\n1. Testing createTableWithRequiredColumns:");
  const requiredColumnsSchema = createTableWithRequiredColumns(["id", "name"]);
  
  const tableWithRequiredColumns = {
    fields: [{ name: "id" }, { name: "name" }, { name: "extra" }],
    rows: [[1, "test", "value"]],
  };
  
  const tableWithoutRequiredColumns = {
    fields: [{ name: "other" }, { name: "fields" }],
    rows: [["a", "b"]],
  };

  const requiredResult1 = safeParse(requiredColumnsSchema, tableWithRequiredColumns);
  if (requiredResult1.success) {
    console.log("✅ Table with required columns validated successfully");
  } else {
    console.log("❌ Should have validated table with required columns");
  }

  const requiredResult2 = safeParse(requiredColumnsSchema, tableWithoutRequiredColumns);
  if (!requiredResult2.success) {
    console.log("✅ Correctly rejected table without required columns");
  } else {
    console.log("❌ Should have rejected table without required columns");
  }

  // Test validation helper functions
  console.log("\n2. Testing validation helper functions:");
  
  // Test safeValidateTableJson
  const safeResult = safeValidateTableJson(validBasicTable);
  if (safeResult.success) {
    console.log("✅ safeValidateTableJson works correctly");
  }

  // Test validateTableJson (throws on error)
  try {
    const strictResult = validateTableJson(validBasicTable);
    console.log("✅ validateTableJson works correctly");
  } catch (error) {
    console.log("❌ validateTableJson failed unexpectedly:", error);
  }

  // Test validateTableJson with invalid data (should throw)
  try {
    validateTableJson(invalidTableMismatchedColumns);
    console.log("❌ validateTableJson should have thrown error");
  } catch (error) {
    console.log("✅ validateTableJson correctly threw error for invalid data");
  }
}

function testErrorHandling() {
  console.log("\n=== Testing Error Handling ===");

  // Test various invalid inputs
  const invalidInputs = [
    null,
    undefined,
    "not an object",
    123,
    [],
    { fields: "not an array" },
    { rows: "not an array" },
    { fields: [], rows: [] }, // Empty but valid
    { fields: [{ name: "test" }], rows: [[1, 2]] }, // Wrong number of columns
  ];

  invalidInputs.forEach((input, index) => {
    const result = safeValidateTableJson(input);
    if (!result.success) {
      console.log(`✅ Correctly rejected invalid input ${index}: ${typeof input}`);
    } else {
      console.log(`❌ Should have rejected invalid input ${index}: ${typeof input}`);
    }
  });

  // Test ValidatedSqlTable error handling
  console.log("\n2. Testing ValidatedSqlTable error handling:");
  try {
    const table = new ValidatedSqlTable(validBasicTable);
    
    // Test invalid row access
    try {
      table.get(999, 0);
      console.log("❌ Should have thrown error for invalid row index");
    } catch (error) {
      console.log("✅ Correctly threw error for invalid row index");
    }

    // Test invalid field access
    try {
      table.get(0, "nonexistent_field");
      console.log("❌ Should have thrown error for nonexistent field");
    } catch (error) {
      console.log("✅ Correctly threw error for nonexistent field");
    }

    // Test invalid field index
    try {
      table.fieldAt(999);
      console.log("❌ Should have thrown error for invalid field index");
    } catch (error) {
      console.log("✅ Correctly threw error for invalid field index");
    }

  } catch (error) {
    console.log("❌ Unexpected error in error handling test:", error);
  }
}

function performanceTest() {
  console.log("\n=== Performance Test ===");

  // Create a large table for performance testing
  const largeTable = {
    fields: Array.from({ length: 20 }, (_, i) => ({ name: `field_${i}` })),
    rows: Array.from({ length: 1000 }, (_, i) => 
      Array.from({ length: 20 }, (_, j) => `value_${i}_${j}`)
    ),
  };

  const iterations = 100;
  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    const result = safeParse(ValidatedTableJsonSchema, largeTable);
    if (!result.success) {
      console.log("❌ Performance test validation failed");
      break;
    }
  }

  const endTime = performance.now();
  const avgTime = (endTime - startTime) / iterations;

  console.log(`✅ Validated large table (20 fields, 1000 rows) ${iterations} times`);
  console.log(`   Total time: ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`   Average time per validation: ${avgTime.toFixed(4)}ms`);
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

export function runAllSqlTableTests() {
  console.log("🚀 Starting SQL Table Schema Tests\n");

  try {
    testBasicSchemas();
    testTableJsonSchema();
    testSpecializedSchemas();
    testTransformationSchemas();
    testValidatedSqlTableClass();
    testUtilityFunctions();
    testErrorHandling();
    performanceTest();
    
    console.log("\n=== Running Built-in Tests ===");
    runSqlTableValidationTests();
    
    console.log("\n✅ All SQL Table schema tests completed successfully!");
  } catch (error) {
    console.error("\n❌ Test suite failed:", error);
  }
}

// Export test functions for individual use
export {
  testBasicSchemas,
  testTableJsonSchema,
  testSpecializedSchemas,
  testTransformationSchemas,
  testValidatedSqlTableClass,
  testUtilityFunctions,
  testErrorHandling,
  performanceTest,
};

// Auto-run tests if this file is executed directly
if (import.meta.main) {
  runAllSqlTableTests();
}
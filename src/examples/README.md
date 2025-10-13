# Valibot Schema Examples

This directory contains comprehensive examples of how to use the `schema-rpcvalue.ts` file in the QXEvent project.

## Overview

The `schema-rpcvalue.ts` file provides custom schema definitions for working with SHV (Simple Hierarchical Values) and RPC values, extending the base valibot validation library with project-specific types.

## Files

- `valibot-schema-examples.ts` - Complete examples demonstrating all schema usage patterns
- `sql-table-schema.ts` - Comprehensive schemas for SqlTable validation and manipulation
- `test-sql-table-schema.ts` - Test suite demonstrating SqlTable schema usage
- `README.md` - This documentation file

## Key Custom Schema Types

### Basic Custom Types

```typescript
import { uint, double, decimal, blob } from "../schema-rpcvalue";

// Specialized numeric types from libshv-js
const schema = object({
  id: uint(),           // UInt type
  temperature: double(), // Double type
  precision: decimal(),  // Decimal type
  data: blob(),         // ArrayBuffer type
});
```

### Map Types

```typescript
import { map, imap, metamap, recmap } from "../schema-rpcvalue";

// ShvMap validation
const deviceConfig = map({
  deviceName: string(),
  settings: object({ enabled: boolean() })
});

// IMap (indexed map) validation
const indexedData = imap({
  0: string(),  // index-based access
  1: number(),
});

// MetaMap validation
const metaData = metamap({
  version: string(),
  0: number(),  // mixed string/number keys
});

// Record map (dynamic keys)
const dynamicConfig = recmap(string());
```

### RPC Values

```typescript
import { rpcvalue, withMeta } from "../schema-rpcvalue";

// Generic RPC value (recursive union type)
const anyRpcValue = rpcvalue();

// RPC value with metadata
const metaValue = withMeta(
  object({ version: string() }), // meta schema
  UserSchema                     // value schema
);
```

## Usage Patterns

### 1. Basic Validation

```typescript
import { parse, safeParse } from "valibot";
import { UserSchema } from "./schema-rpcvalue-examples";

// Throws on validation failure
const user = parse(UserSchema, userData);

// Returns result object
const result = safeParse(UserSchema, userData);
if (result.success) {
  console.log("Valid user:", result.output);
} else {
  console.log("Validation errors:", result.issues);
}
```

### 2. Form Validation

```typescript
export class UserFormValidator {
  static validate(formData: FormData) {
    const data = {
      name: formData.get("name"),
      email: formData.get("email"),
      age: formData.get("age") ? Number(formData.get("age")) : undefined,
      isActive: formData.get("isActive") === "true",
    };

    return safeParse(UserSchema, data);
  }
}
```

### 3. API Validation

```typescript
export class ApiValidator {
  static validateCreateEvent(body: unknown) {
    const result = safeParse(EventSchema, body);
    if (!result.success) {
      const errors = flatten(result.issues);
      throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
    }
    return result.output;
  }
}
```

### 4. Type-Safe Transformations

```typescript
const UserRegistrationSchema = pipe(
  object({
    name: pipe(string(), minLength(2), transform((name) => name.trim())),
    email: pipe(string(), email(), transform((email) => email.toLowerCase())),
    password: pipe(string(), minLength(8)),
  }),
  transform((data) => ({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  }))
);
```

## Real-World Examples

### Event Management Schema

```typescript
const EventSchema = object({
  id: string(),
  title: pipe(string(), minLength(1), maxLength(200)),
  startDate: pipe(string(), transform((val) => new Date(val))),
  location: object({
    name: string(),
    address: AddressSchema,
  }),
  organizer: UserSchema,
  attendees: array(UserSchema),
  metadata: rpcvalue(), // Custom RPC value
});
```

### Configuration Schema

```typescript
const AppConfigSchema = object({
  database: object({
    host: string(),
    port: uint(),
    poolSize: uint(),
  }),
  features: map({
    authentication: boolean(),
    notifications: boolean(),
  }),
  customData: recmap(rpcvalue()),
});
```

## Error Handling

```typescript
import { flatten } from "valibot";

const result = safeParse(UserSchema, data);
if (!result.success) {
  const errorDetails = flatten(result.issues);
  // errorDetails contains structured error information
  console.error("Validation errors:", errorDetails);
}
```

## Testing

```typescript
// Run the included test examples
import { runValidationTests } from "./schema-rpcvalue-examples";
runValidationTests();
```

## Integration with SolidJS

The schemas work seamlessly with SolidJS components:

```typescript
import { createSignal } from "solid-js";
import { safeParse } from "valibot";

function UserForm() {
  const [errors, setErrors] = createSignal<any>(null);

  const handleSubmit = (formData: FormData) => {
    const result = UserFormValidator.validate(formData);
    if (result.success) {
      // Handle valid data
      console.log("User data:", result.output);
      setErrors(null);
    } else {
      // Show validation errors
      setErrors(flatten(result.issues));
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      {errors() && <div>Validation errors: {JSON.stringify(errors())}</div>}
    </form>
  );
}
```

## Best Practices

1. **Always use `safeParse`** for user input validation
2. **Use `parse`** only when you're certain the data is valid
3. **Combine schemas** using object spread for composition
4. **Use transformations** for data normalization
5. **Flatten error objects** for user-friendly error messages
6. **Type your schemas** with `InferOutput<typeof Schema>`

## Dependencies

This examples file requires:
- `valibot` - Core validation library
- `libshv-js/rpcvalue` - For SHV/RPC value types
- The custom `schema-rpcvalue.ts` file in the parent directory

## SqlTable Schemas

The `sql-table-schema.ts` file provides comprehensive validation schemas for working with SQL-like table structures, which are commonly used in the SHV RPC system for data exchange.

### Basic Table Schemas

```typescript
import {
  TableCellSchema,
  TableFieldSchema,
  TableRowSchema,
  TableJsonSchema,
  ValidatedTableJsonSchema,
} from "./sql-table-schema";

// Individual cell validation (null | string | number | Date)
const cell = safeParse(TableCellSchema, "test value");

// Field definition validation
const field = safeParse(TableFieldSchema, { name: "user_id" });

// Row validation (array of cells)
const row = safeParse(TableRowSchema, [1, "John", new Date()]);

// Complete table validation
const table = safeParse(TableJsonSchema, {
  fields: [{ name: "id" }, { name: "name" }],
  rows: [[1, "John"], [2, "Jane"]]
});
```

### Specialized Table Schemas

```typescript
import {
  EventConfigTableSchema,
  CompetitorTableSchema,
  StageTableSchema,
} from "./sql-table-schema";

// Event configuration table
const eventConfig = validateEventConfigTable(configData);

// Competitor results table
const competitors = validateCompetitorTable(resultsData);

// Stage configuration table  
const stages = validateStageTable(stageData);
```

### Enhanced SqlTable Class

```typescript
import { ValidatedSqlTable } from "./sql-table-schema";

// Create validated table (throws on invalid data)
const table = new ValidatedSqlTable(tableData);

// Access data with validation
const value = table.get(0, "name");
const column = table.getColumn("status");
const matchingRows = table.findRowsByField("category", "active");

// Export back to JSON
const json = table.toJSON();
```

### Data Transformations

```typescript
import {
  rpcValueToTable,
  normalizeTable,
  createTableWithRequiredColumns,
} from "./sql-table-schema";

// Transform RPC value to table
const table = rpcValueToTable(rpcData);

// Normalize field names and cell values
const normalized = normalizeTable(rawTable);

// Create schema requiring specific columns
const userTableSchema = createTableWithRequiredColumns(["id", "name", "email"]);
```

### Error Handling

```typescript
import { safeValidateTableJson } from "./sql-table-schema";

const result = safeValidateTableJson(suspiciousData);
if (result.success) {
  console.log("Valid table:", result.output);
} else {
  console.error("Validation errors:", flatten(result.issues));
}
```

## Running Examples

```bash
# In your TypeScript/Node environment
npm install

# Run general valibot examples
npx tsx src/examples/valibot-schema-examples.ts

# Run SqlTable schema tests
npx tsx src/examples/test-sql-table-schema.ts
```

Or import individual examples into your application code as needed.

import {
  object,
  string,
  number,
  boolean,
  array,
  optional,
  parse,
  safeParse,
  flatten,
  pipe,
  minLength,
  maxLength,
  email,
  url,
  regex,
  transform,
  union,
  literal,
  type InferOutput,
} from "valibot";

import {
  map,
  imap,
  metamap,
  recmap,
  uint,
  double,
  decimal,
  blob,
  list,
  rpcvalue,
  withMeta,
} from "../schema-rpcvalue";

// =============================================================================
// BASIC SCHEMA EXAMPLES
// =============================================================================

// Simple object schema
export const UserSchema = object({
  id: number(),
  name: pipe(string(), minLength(1), maxLength(100)),
  email: pipe(string(), email()),
  age: optional(number()),
  isActive: boolean(),
});

export type User = InferOutput<typeof UserSchema>;

// Nested object schema
export const AddressSchema = object({
  street: string(),
  city: string(),
  zipCode: pipe(string(), regex(/^\d{5}(-\d{4})?$/)),
  country: string(),
});

export const UserWithAddressSchema = object({
  ...UserSchema.entries,
  address: AddressSchema,
  socialLinks: optional(array(pipe(string(), url()))),
});

export type UserWithAddress = InferOutput<typeof UserWithAddressSchema>;

// Union schemas for different user types
export const AdminUserSchema = object({
  ...UserSchema.entries,
  role: literal("admin"),
  permissions: array(string()),
});

export const RegularUserSchema = object({
  ...UserSchema.entries,
  role: literal("user"),
  subscriptionTier: union([literal("free"), literal("premium")]),
});

export const AnyUserSchema = union([AdminUserSchema, RegularUserSchema]);

// =============================================================================
// SHV/RPC VALUE SCHEMA EXAMPLES (using custom schemas from schema-rpcvalue.ts)
// =============================================================================

// Example using custom uint, double, decimal types
export const MetricsSchema = object({
  timestamp: uint(),
  temperature: double(),
  pressure: decimal(),
  sensorId: string(),
});

// Example using map (ShvMap) schema
export const DeviceConfigSchema = map({
  deviceName: string(),
  serialNumber: string(),
  firmware: string(),
  settings: object({
    enabled: boolean(),
    interval: uint(),
  }),
});

// Example using imap (IMap) schema
export const IndexedDataSchema = imap({
  0: string(), // device name
  1: uint(),   // device id
  2: boolean(), // status
});

// Example using metamap (MetaMap) schema
export const MetaDataSchema = metamap({
  version: string(),
  author: string(),
  0: uint(), // some indexed metadata
  1: string(),
});

// Example using recmap (record map) schema
export const DynamicConfigSchema = recmap(rpcvalue());

// Example using withMeta for RpcValueWithMetaData
export const MetaValueSchema = withMeta(
  object({ version: string() }),
  UserSchema
);

// =============================================================================
// COMPLEX REAL-WORLD EXAMPLES
// =============================================================================

// Event data schema (typical for an event management system)
export const EventSchema = object({
  id: string(),
  title: pipe(string(), minLength(1), maxLength(200)),
  description: optional(string()),
  startDate: pipe(string(), transform((val) => new Date(val))),
  endDate: pipe(string(), transform((val) => new Date(val))),
  location: object({
    name: string(),
    address: AddressSchema,
    coordinates: optional(object({
      lat: number(),
      lng: number(),
    })),
  }),
  organizer: UserSchema,
  attendees: array(UserSchema),
  categories: array(string()),
  maxCapacity: optional(number()),
  price: object({
    amount: decimal(),
    currency: pipe(string(), regex(/^[A-Z]{3}$/)), // ISO currency code
  }),
  metadata: rpcvalue(), // Using our custom RPC value schema
});

export type Event = InferOutput<typeof EventSchema>;

// API Response schema
export const ApiResponseSchema = object({
  success: boolean(),
  data: optional(rpcvalue()),
  error: optional(object({
    code: string(),
    message: string(),
    details: optional(rpcvalue()),
  })),
  meta: object({
    timestamp: uint(),
    requestId: string(),
    version: string(),
  }),
});

export type ApiResponse = InferOutput<typeof ApiResponseSchema>;

// Configuration schema using various custom types
export const AppConfigSchema = object({
  database: object({
    host: string(),
    port: uint(),
    name: string(),
    ssl: boolean(),
    poolSize: uint(),
  }),
  server: object({
    port: uint(),
    host: string(),
    timeout: uint(),
  }),
  features: map({
    authentication: boolean(),
    notifications: boolean(),
    analytics: boolean(),
  }),
  limits: imap({
    0: uint(), // max users
    1: uint(), // max events
    2: uint(), // max file size
  }),
  customData: recmap(rpcvalue()),
});

export type AppConfig = InferOutput<typeof AppConfigSchema>;

// =============================================================================
// VALIDATION EXAMPLES AND USAGE PATTERNS
// =============================================================================

// Example validation functions
export function validateUser(data: unknown): User {
  return parse(UserSchema, data);
}

export function safeValidateUser(data: unknown): { success: true; output: User } | { success: false; issues: any } {
  const result = safeParse(UserSchema, data);
  if (result.success) {
    return { success: true, output: result.output };
  } else {
    return { success: false, issues: flatten(result.issues) };
  }
}

// Example usage with error handling
export function processUserData(rawData: unknown) {
  try {
    const user = validateUser(rawData);
    console.log("Valid user:", user);
    return user;
  } catch (error) {
    console.error("Validation failed:", error);
    throw new Error("Invalid user data");
  }
}

// Example with safe parsing
export function processEventData(rawData: unknown) {
  const result = safeParse(EventSchema, rawData);

  if (result.success) {
    console.log("Valid event:", result.output);
    return result.output;
  } else {
    const errorDetails = flatten(result.issues);
    console.error("Validation errors:", errorDetails);
    return null;
  }
}

// =============================================================================
// TRANSFORMATION EXAMPLES
// =============================================================================

// Schema with transformations
export const UserRegistrationSchema = pipe(
  object({
    name: pipe(string(), minLength(2), transform((name) => name.trim())),
    email: pipe(string(), email(), transform((email) => email.toLowerCase())),
    password: pipe(string(), minLength(8)),
    birthDate: pipe(string(), transform((date) => new Date(date))),
    preferences: optional(object({
      newsletter: boolean(),
      notifications: boolean(),
    })),
  }),
  transform((data) => ({
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    isActive: true,
  }))
);

export type UserRegistration = InferOutput<typeof UserRegistrationSchema>;

// =============================================================================
// PRACTICAL USAGE EXAMPLES
// =============================================================================

// Example: Form validation
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

// Example: API endpoint validation
export class ApiValidator {
  static validateCreateEvent(body: unknown) {
    const result = safeParse(EventSchema, body);
    if (!result.success) {
      const errors = flatten(result.issues);
      throw new Error(`Validation failed: ${JSON.stringify(errors)}`);
    }
    return result.output;
  }

  static validateConfig(config: unknown): AppConfig {
    return parse(AppConfigSchema, config);
  }
}

// Example: Data migration with validation
export class DataMigrator {
  static migrateUserData(oldUserData: unknown[]): User[] {
    const validUsers: User[] = [];
    const errors: any[] = [];

    for (const [index, userData] of oldUserData.entries()) {
      const result = safeParse(UserSchema, userData);
      if (result.success) {
        validUsers.push(result.output);
      } else {
        errors.push({
          index,
          data: userData,
          errors: flatten(result.issues),
        });
      }
    }

    if (errors.length > 0) {
      console.warn("Migration warnings:", errors);
    }

    return validUsers;
  }
}

// =============================================================================
// TESTING EXAMPLES
// =============================================================================

// Example test data
export const validUserData = {
  id: 1,
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  isActive: true,
};

export const invalidUserData = {
  id: "not-a-number",
  name: "",
  email: "invalid-email",
  isActive: "not-boolean",
};

// Example test function
export function runValidationTests() {
  console.log("Testing valid data:");
  const validResult = safeValidateUser(validUserData);
  console.log(validResult);

  console.log("\nTesting invalid data:");
  const invalidResult = safeValidateUser(invalidUserData);
  console.log(invalidResult);

  // Test RPC value schema
  console.log("\nTesting RPC value schema:");
  const rpcData = { someKey: "someValue", nested: { data: 123 } };
  const rpcResult = safeParse(rpcvalue(), rpcData);
  console.log(rpcResult);
}

// Export all schemas for external use
export {
  map,
  imap,
  metamap,
  recmap,
  uint,
  double,
  decimal,
  blob,
  list,
  rpcvalue,
  withMeta,
};

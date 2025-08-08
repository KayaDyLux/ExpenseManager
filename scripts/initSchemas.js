// scripts/initSchemas.js
// Run this in mongosh: `mongosh $MONGODB_URI scripts/initSchemas.js`
// Ensures collections exist with JSON Schema validation + indexes

const dbName = "ExpenseManager";
const dbRef = db.getSiblingDB(dbName);

// Helper to create collection with validation only if it doesn't exist
function ensureCollection(name, schema, indexes = []) {
  if (!dbRef.getCollectionNames().includes(name)) {
    dbRef.createCollection(name, { validator: { $jsonSchema: schema } });
    print(`Created collection: ${name}`);
  } else {
    // Optionally update schema (Mongo doesn't allow strict replace)
    dbRef.runCommand({
      collMod: name,
      validator: { $jsonSchema: schema }
    });
    print(`Updated schema for: ${name}`);
  }

  indexes.forEach(idx => {
    dbRef[name].createIndex(idx.keys, idx.options || {});
  });
}

// Common fields schema fragment
const commonFields = {
  bsonType: "object",
  required: ["workspaceId", "createdAt", "createdBy", "updatedAt"],
  properties: {
    _id: {},
    workspaceId: { bsonType: "objectId" },
    createdAt: { bsonType: "date" },
    createdBy: { bsonType: "objectId" },
    updatedAt: { bsonType: "date" }
  }
};

// Workspaces
ensureCollection("workspaces", {
  ...commonFields,
  properties: {
    ...commonFields.properties,
    name: { bsonType: "string" },
    type: { enum: ["personal", "business"] },
    vatNumber: { bsonType: ["string", "null"] }
  }
}, [
  { keys: { name: 1, type: 1 }, options: { unique: false } }
]);

// Memberships
ensureCollection("memberships", {
  ...commonFields,
  properties: {
    ...commonFields.properties,
    userId: { bsonType: "objectId" },
    role: { enum: ["owner", "admin", "member"] }
  }
}, [
  { keys: { workspaceId: 1, userId: 1 }, options: { unique: true } }
]);

// Categories
ensureCollection("categories", {
  ...commonFields,
  properties: {
    ...commonFields.properties,
    name: { bsonType: "string" },
    type: { enum: ["personal", "business"] },
    isDefault: { bsonType: "bool" }
  }
}, [
  { keys: { workspaceId: 1, name: 1 }, options: { unique: false } }
]);

// Buckets
ensureCollection("buckets", {
  ...commonFields,
  properties: {
    ...commonFields.properties,
    type: { enum: ["expense", "savings", "reserve"] },
    name: { bsonType: "string" },
    currency: { bsonType: "string" },
    targetAmount: { bsonType: ["double", "null"] },
    rules: { bsonType: "object" },
    linkedCategoryIds: {
      bsonType: "array",
      items: { bsonType: "objectId" }
    }
  }
}, [
  { keys: { workspaceId: 1, name: 1 }, options: { unique: false } }
]);

// Bucket Transactions
ensureCollection("bucket_transactions", {
  bsonType: "object",
  required: ["workspaceId", "bucketId", "type", "amount", "currency", "createdAt", "createdBy"],
  properties: {
    workspaceId: { bsonType: "objectId" },
    bucketId: { bsonType: "objectId" },
    type: { enum: ["FUND", "SPEND", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT", "ROLLOVER"] },
    amount: { bsonType: "double" },
    currency: { bsonType: "string" },
    ref: { bsonType: ["objectId", "null"] },
    note: { bsonType: ["string", "null"] },
    createdAt: { bsonType: "date" },
    createdBy: { bsonType: "objectId" }
  }
}, [
  { keys: { bucketId: 1, createdAt: -1 } },
  { keys: { workspaceId: 1, createdAt: -1 } }
]);

// Expenses
ensureCollection("expenses", {
  ...commonFields,
  properties: {
    ...commonFields.properties,
    userId: { bsonType: "objectId" },
    date: { bsonType: "date" },
    amount: { bsonType: "double" },
    currency: { bsonType: "string" },
    categoryId: { bsonType: "objectId" },
    bucketId: { bsonType: ["objectId", "null"] },
    merchant: { bsonType: ["string", "null"] },
    vatRate: { bsonType: ["double", "null"] },
    vatAmount: { bsonType: ["double", "null"] },
    notes: { bsonType: ["string", "null"] }
  }
}, [
  { keys: { workspaceId: 1, date: -1 } },
  { keys: { workspaceId: 1, categoryId: 1, date: -1 } }
]);

// Incomes
ensureCollection("incomes", {
  ...commonFields,
  properties: {
    ...commonFields.properties,
    amount: { bsonType: "double" },
    currency: { bsonType: "string" },
    source: { bsonType: "string" },
    date: { bsonType: "date" }
  }
}, [
  { keys: { workspaceId: 1, date: -1 } }
]);

print("Schema + index setup complete.");

// scripts/seedDefaults.js
// Run: `node scripts/seedDefaults.js`

const { MongoClient, ObjectId } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ExpenseManager";

async function run() {
  if (!uri) throw new Error("MONGODB_URI not set");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // Helper upsert
  async function upsert(collection, filter, doc) {
    await db.collection(collection).updateOne(filter, { $setOnInsert: doc }, { upsert: true });
  }

  const now = new Date();

  // Categories
  const personalCategories = ["Groceries", "Utilities", "Rent", "Subscriptions", "Dining Out", "Transport", "Health", "Leisure"];
  const businessCategories = ["Office Supplies", "Travel", "Meals/Entertainment", "Rent", "Utilities", "Professional Fees", "Salaries", "Marketing", "Miscellaneous"];

  for (const name of personalCategories) {
    await upsert("categories", { name, type: "personal" }, {
      name,
      type: "personal",
      isDefault: true,
      createdAt: now,
      updatedAt: now
    });
  }

  for (const name of businessCategories) {
    await upsert("categories", { name, type: "business" }, {
      name,
      type: "business",
      isDefault: true,
      createdAt: now,
      updatedAt: now
    });
  }

  // Buckets
  const buckets = [
    { name: "Groceries", type: "expense", currency: "EUR", rules: { lockWhenEmpty: true } },
    { name: "Dining Out", type: "expense", currency: "EUR", rules: { lockWhenEmpty: true } },
    { name: "Transport", type: "expense", currency: "EUR", rules: { lockWhenEmpty: true } },
    { name: "Emergency Fund", type: "savings", currency: "EUR", rules: { savingsFundedFirst: true } },
    { name: "Operating", type: "expense", currency: "EUR" },
    { name: "VAT Reserve", type: "reserve", currency: "EUR", rules: { lockWhenEmpty: true } },
    { name: "Business Travel", type: "expense", currency: "EUR", rules: { lockWhenEmpty: true } },
    { name: "Meals", type: "expense", currency: "EUR", rules: { lockWhenEmpty: true } }
  ];

  for (const b of buckets) {
    await upsert("buckets", { name: b.name, type: b.type }, {
      ...b,
      createdAt: now,
      updatedAt: now
    });
  }

  console.log("Defaults seeded.");
  await client.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

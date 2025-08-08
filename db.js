const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'expense_manager';
if (!uri) throw new Error('MONGODB_URI not set');

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
});

let db;
async function initDb() {
  if (db) return db;
  await client.connect();
  db = client.db(dbName);
  return db;
}

module.exports = { initDb };

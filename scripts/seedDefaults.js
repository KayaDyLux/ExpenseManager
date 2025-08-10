// scripts/seedDefaults.js
// Purpose: Seed a demo user with default workspaces, categories, budgets, income, and expenses.
// Usage: node scripts/seedDefaults.js

require('dotenv').config();
const mongoose = require('mongoose');

// Import models (from your existing routes or dedicated models dir)
require('../routes/workspaces');
require('../routes/categories');
require('../routes/budgets');
require('../routes/income');
require('../routes/expenses');

const Workspace = mongoose.models.Workspace;
const Category = mongoose.models.Category;
const Budget = mongoose.models.Budget;
const Income = mongoose.models.Income;
const Expense = mongoose.models.Expense;

async function main() {
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGO_URI) throw new Error('Missing MONGODB_URI/MONGO_URI in env');

  await mongoose.connect(MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  console.log('✅ Mongo connected');

  // TODO: Replace with a real userId from your DB if running in production
  const userId = new mongoose.Types.ObjectId();
  console.log(`Using demo userId: ${userId}`);

  // Workspaces
  const personalWs = await Workspace.create({ userId, type: 'personal', name: 'Personal', isDefault: true });
  const businessWs = await Workspace.create({ userId, type: 'business', name: 'Business', isDefault: true });

  // Categories
  const categories = await Category.insertMany([
    { userId, workspaceId: personalWs._id, name: 'Groceries', color: '#4caf50', icon: 'shopping-cart' },
    { userId, workspaceId: personalWs._id, name: 'Entertainment', color: '#ff9800', icon: 'film' },
    { userId, workspaceId: businessWs._id, name: 'Office Supplies', color: '#2196f3', icon: 'briefcase' },
    { userId, workspaceId: businessWs._id, name: 'Travel', color: '#9c27b0', icon: 'plane' },
  ]);

  // Budgets
  await Budget.insertMany([
    { userId, workspaceId: personalWs._id, name: 'Monthly Essentials', limit: 1000 },
    { userId, workspaceId: personalWs._id, name: 'Fun & Leisure', limit: 300 },
    { userId, workspaceId: businessWs._id, name: 'Operational Expenses', limit: 2000 },
  ]);

  // Income
  await Income.insertMany([
    { userId, workspaceId: personalWs._id, amount: 2500, currency: 'EUR', date: new Date(), source: 'Salary' },
    { userId, workspaceId: businessWs._id, amount: 5000, currency: 'EUR', date: new Date(), source: 'Consulting Invoice' },
  ]);

  // Expenses
  await Expense.insertMany([
    { userId, workspaceId: personalWs._id, amount: 50, currency: 'EUR', date: new Date(), categoryId: categories[0]._id, notes: 'Weekly groceries' },
    { userId, workspaceId: personalWs._id, amount: 20, currency: 'EUR', date: new Date(), categoryId: categories[1]._id, notes: 'Movie night' },
    { userId, workspaceId: businessWs._id, amount: 200, currency: 'EUR', date: new Date(), categoryId: categories[2]._id, notes: 'Printer ink' },
  ]);

  console.log('🌱 Seed complete');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});

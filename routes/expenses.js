// routes/expenses.js

const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// Create a new expense
router.post("/", async (req, res) => {
  const expense = req.body;
  const db = req.app.locals.db;
  const now = new Date();

  expense.workspaceId = new ObjectId(req.user.workspaceId);
  expense.userId = new ObjectId(req.user.userId);
  expense.createdAt = now;
  expense.updatedAt = now;

  // Check if category is linked to a bucket
  const category = await db.collection("categories").findOne({ _id: new ObjectId(expense.categoryId) });

  if (category && category.linkedBucketId) {
    // Create a SPEND transaction for the linked bucket
    await db.collection("bucket_transactions").insertOne({
      workspaceId: expense.workspaceId,
      bucketId: new ObjectId(category.linkedBucketId),
      type: "SPEND",
      amount: expense.amount,
      currency: expense.currency,
      createdAt: now,
      createdBy: expense.userId
    });
  }

  // Insert the expense record
  const result = await db.collection("expenses").insertOne(expense);

  res.json({ insertedId: result.insertedId });
});

module.exports = router;

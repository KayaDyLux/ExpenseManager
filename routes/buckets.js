// routes/buckets.js

const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// Create a new bucket
router.post("/", async (req, res) => {
  const bucket = req.body;
  bucket.createdAt = new Date();
  bucket.updatedAt = new Date();
  bucket.workspaceId = new ObjectId(req.user.workspaceId);

  const db = req.app.locals.db;
  const result = await db.collection("buckets").insertOne(bucket);
  res.json({ insertedId: result.insertedId });
});

// Fund an existing bucket
router.post("/:id/fund", async (req, res) => {
  const bucketId = new ObjectId(req.params.id);
  const { amount, currency } = req.body;

  const db = req.app.locals.db;
  await db.collection("bucket_transactions").insertOne({
    workspaceId: new ObjectId(req.user.workspaceId),
    bucketId,
    type: "FUND",
    amount,
    currency,
    createdAt: new Date(),
    createdBy: new ObjectId(req.user.userId)
  });

  res.json({ status: "funded" });
});

// Transfer between buckets
router.post("/transfer", async (req, res) => {
  const { fromId, toId, amount, currency } = req.body;
  const db = req.app.locals.db;
  const now = new Date();

  const session = db.client.startSession();
  await session.withTransaction(async () => {
    await db.collection("bucket_transactions").insertOne({
      workspaceId: new ObjectId(req.user.workspaceId),
      bucketId: new ObjectId(fromId),
      type: "TRANSFER_OUT",
      amount,
      currency,
      createdAt: now,
      createdBy: new ObjectId(req.user.userId)
    });
    await db.collection("bucket_transactions").insertOne({
      workspaceId: new ObjectId(req.user.workspaceId),
      bucketId: new ObjectId(toId),
      type: "TRANSFER_IN",
      amount,
      currency,
      createdAt: now,
      createdBy: new ObjectId(req.user.userId)
    });
  });

  res.json({ status: "transferred" });
});

module.exports = router;

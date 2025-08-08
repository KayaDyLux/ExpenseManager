const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

/**
 * Create a new bucket
 */
router.post("/", async (req, res) => {
  try {
    const db = req.app.locals.db; // or req.db if using helper middleware
    const bucket = req.body;
    bucket.createdAt = new Date();
    bucket.updatedAt = new Date();
    bucket.workspaceId = new ObjectId(req.user.workspaceId);

    const result = await db.collection("buckets").insertOne(bucket);
    res.json({ insertedId: result.insertedId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * Fund an existing bucket
 */
router.post("/:id/fund", async (req, res) => {
  try {
    const db = req.app.locals.db; // or req.db
    const bucketId = new ObjectId(req.params.id);
    const { amount, currency } = req.body;

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
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * Transfer between buckets
 */
router.post("/transfer", async (req, res) => {
  try {
    const db = req.app.locals.db; // or req.db
    const client = req.app.locals.client; // or req.client if using helper middleware
    const { fromId, toId, amount, currency } = req.body;
    const now = new Date();

    const session = client.startSession(); // ✅ fixed to use the MongoClient
    await session.withTransaction(async () => {
      await db.collection("bucket_transactions").insertOne({
        workspaceId: new ObjectId(req.user.workspaceId),
        bucketId: new ObjectId(fromId),
        type: "TRANSFER_OUT",
        amount,
        currency,
        createdAt: now,
        createdBy: new ObjectId(req.user.userId)
      }, { session });

      await db.collection("bucket_transactions").insertOne({
        workspaceId: new ObjectId(req.user.workspaceId),
        bucketId: new ObjectId(toId),
        type: "TRANSFER_IN",
        amount,
        currency,
        createdAt: now,
        createdBy: new ObjectId(req.user.userId)
      }, { session });
    });

    res.json({ status: "transferred" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;

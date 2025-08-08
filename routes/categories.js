// routes/categories.js
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  const db = req.app.locals.db;
  const list = await db
    .collection("categories")
    .find({})
    .project({ name: 1 })
    .toArray();
  res.json(list);
});

module.exports = router;

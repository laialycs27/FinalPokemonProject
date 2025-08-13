const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const filePath = path.join(__dirname, "..", "data", "info.json");
    const rawData = fs.readFileSync(filePath, "utf-8");
    const info = JSON.parse(rawData);

    res.status(200).json(info);
  } catch (err) {
    console.error("Failed to load info.json:", err);
    res.status(500).json({ error: "Could not load info data" });
  }
});

module.exports = router;

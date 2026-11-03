const express = require("express");
const mongoose = require("mongoose");
const Vendor = require("../models/vendor");

const router = express.Router();

router.get("/vendors", async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ _id: -1 });
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.post("/vendors", async (req, res) => {
  try {
    const { vendorName, material, expectedDate } = req.body;
    const vendor = await Vendor.create({ vendorName, material, expectedDate });
    res.status(201).json(vendor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/vendors/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid vendor ID" });
    }

    const { status, actualDate } = req.body;
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { status, actualDate },
      { new: true, runValidators: true }
    );

    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json(vendor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
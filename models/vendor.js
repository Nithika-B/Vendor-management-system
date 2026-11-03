const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
  vendorName: {
    type: String,
    required: true,
    trim: true
  },
  material: {
    type: String,
    required: true,
    trim: true
  },
  expectedDate: {
    type: Date,
    required: true
  },
  actualDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ["Pending", "Delivered"],
    default: "Pending"
  }
});

module.exports = mongoose.model("Vendor", vendorSchema);
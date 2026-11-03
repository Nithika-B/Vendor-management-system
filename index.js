require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const vendorRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).send("Server is running");
});

app.get("/api/db-check", (req, res) => {
  res.json({ mongooseState: mongoose.connection.readyState });
});

app.use("/api", vendorRoutes);

// Unknown API routes return JSON instead of the React page
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// Serve the built React app
const clientDist = path.join(__dirname, "client", "dist");
app.use(express.static(clientDist));

app.get("*", (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from environment variables");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
const express = require("express");
const { Pool } = require("pg");
const { createClient } = require("redis");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Database Configuration
const pool = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "DB-VAR",
  user: process.env.DB_USER || "USER-VAR",
  password: process.env.DB_PASSWORD || "DB-PASS",
});

// Auto-create table if it doesn't exist
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        course VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized: 'students' table ready.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}

// Redis Configuration
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
});

redisClient.on("error", (err) => console.log("Redis error:", err));
redisClient.on("connect", () => console.log("Connected to Redis"));

// Initialize Redis and Start Server
async function startServer() {
  try {
    await redisClient.connect();
    await initDb();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

// ------------------- ROUTES -------------------

// Root Route (Fixed Cannot GET /)
app.get("/", (req, res) => {
  res.json({ message: "Backend API running successfully!" });
});

// Base API Route (Fixed Cannot GET /api/)
app.get(["/api", "/api/"], (req, res) => {
  res.json({ message: "API endpoint accessible", status: "ok" });
});

// Health Probe Route (For Application Gateway Probe)
app.get("/health", async (req, res) => {
  res.json({
    status: "healthy",
    database: "connected",
    redis: redisClient.isOpen ? "connected" : "disconnected",
  });
});

// Students Route (Handles /students and /api/students)
app.get(["/students", "/api/students"], async (req, res) => {
  try {
    // Check Redis cache first
    const cachedStudents = await redisClient.get("students");
    if (cachedStudents) {
      return res.json(JSON.parse(cachedStudents));
    }

    // Query Postgres if cache miss
    const result = await pool.query(
      "SELECT * FROM students ORDER BY id DESC"
    );

    // Save result to Redis cache for 60 seconds
    await redisClient.setEx("students", 60, JSON.stringify(result.rows));

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

// Add Student Route (Handles /students and /api/students)
app.post(["/students", "/api/students"], async (req, res) => {
  try {
    const { name, email, course } = req.body;

    if (!name || !email || !course) {
      return res.status(400).json({ error: "Name, email, and course are required" });
    }

    await pool.query(
      "INSERT INTO students (name, email, course) VALUES ($1, $2, $3)",
      [name, email, course]
    );

    // Invalidate Redis cache
    if (redisClient.isOpen) {
      await redisClient.del("students");
    }

    res.status(201).json({ message: "Student added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add student" });
  }
});

startServer();

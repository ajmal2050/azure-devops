const express = require("express");
const { Pool } = require("pg");
const { createClient } = require("redis");

const app = express();

app.use(express.json());

const PORT = 5000;

const pool = new Pool({
    host: process.env.DB_HOST || "postgres",
    port: 5432,
    database: process.env.DB_NAME || "studentdb",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres"
});

const redisClient = createClient({
    url: process.env.REDIS_URL || "redis://redis:6379"
});

redisClient.on("error", err => {
    console.log("Redis error:", err);
});

async function startRedis() {

    if (!redisClient.isOpen) {
        await redisClient.connect();
    }

}

app.get("/health", async (req, res) => {

    res.json({
        status: "healthy"
    });

});

app.get("/students", async (req, res) => {

    try {

        const result = await pool.query(
            "SELECT * FROM students ORDER BY id DESC"
        );

        res.json(result.rows);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Database error"
        });

    }

});

app.post("/students", async (req, res) => {

    try {

        const { name, email, course } = req.body;

        await pool.query(
            "INSERT INTO students (name, email, course) VALUES ($1, $2, $3)",
            [name, email, course]
        );

        await startRedis();

        await redisClient.del("students");

        res.json({
            message: "Student added successfully"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Failed to add student"
        });

    }

});

app.listen(PORT, "0.0.0.0", () => {

    console.log(`Backend running on port ${PORT}`);

});

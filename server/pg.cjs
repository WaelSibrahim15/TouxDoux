const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL not set. Postgres disabled.");
}

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    })
    : null;

async function pgQuery(text, params) {
    if (!pool) throw new Error("Postgres not configured");
    return pool.query(text, params);
}

module.exports = { pool, pgQuery };

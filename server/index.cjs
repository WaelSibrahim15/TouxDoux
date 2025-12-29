const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");

// If you installed dotenv, uncomment:
// require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Paths ----------
const UPLOADS_DIR = path.resolve(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_PATH = path.resolve(__dirname, "touxdoux.db");

// ---------- DB ----------
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
`);

// ---------- Security / Middleware ----------
app.use(helmet());

// ✅ CORS (for dev). If you use Vite proxy, you can disable this entirely.
// When using cookie sessions + cross-origin requests, credentials must be true.
const ALLOWED_ORIGINS = [
    "http://localhost:5173", // Vite dev
    // "https://yourdomain.com",
];

app.use(
    cors({
        origin(origin, cb) {
            if (!origin) return cb(null, true); // curl/postman
            if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
            return cb(new Error("Not allowed by CORS"));
        },
        credentials: true, // IMPORTANT for cookies
    })
);

app.use(express.json());

// ✅ Sessions
app.use(
    session({
        name: "touxdoux.sid",
        secret: process.env.SESSION_SECRET || "dev-secret-change-me",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false, // set true in production behind HTTPS
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        },
    })
);

// ---------- Auth helpers ----------
function requireAuth(req, res, next) {
    if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
    next();
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

// ---------- Upload config ----------
const ALLOWED_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = ext.replace(/[^a-z0-9.]/g, "");
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${safeExt}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error("Invalid file type"));
        cb(null, true);
    },
});

// ❌ IMPORTANT: DO NOT serve uploads statically for private uploads
// app.use("/uploads", express.static(UPLOADS_DIR));

// ---------- Auth routes ----------
app.post("/api/auth/register", async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || "");

        if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
        if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

        const hash = await bcrypt.hash(password, 12);

        const stmt = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
        const info = stmt.run(email, hash);

        req.session.userId = info.lastInsertRowid;
        res.status(201).json({ user: { id: info.lastInsertRowid, email } });
    } catch (err) {
        // Handle unique email
        if (String(err?.message || "").includes("UNIQUE")) {
            return res.status(409).json({ error: "Email already registered" });
        }
        next(err);
    }
});

app.post("/api/auth/login", async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || "");

        if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

        const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ error: "Invalid credentials" });

        req.session.userId = user.id;
        res.json({ user: { id: user.id, email: user.email } });
    } catch (err) {
        next(err);
    }
});

app.post("/api/auth/logout", (req, res) => {
    req.session?.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", (req, res) => {
    if (!req.session?.userId) return res.json({ user: null });
    const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.session.userId);
    res.json({ user: user || null });
});

// ---------- Upload (private + owned) ----------
app.post("/api/upload", requireAuth, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const insert = db.prepare(`
    INSERT INTO files (user_id, stored_name, original_name, mime, size)
    VALUES (?, ?, ?, ?, ?)
  `);

    const info = insert.run(
        req.session.userId,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
    );

    // ✅ Return file id + originalName (matches your updated App.jsx expectations)
    res.json({
        id: String(info.lastInsertRowid),
        originalName: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
    });
});

// ---------- Download (private + ownership enforced) ----------
app.get("/api/files/:id", requireAuth, (req, res) => {
    const id = req.params.id;

    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(id);
    if (!file) return res.status(404).json({ error: "Not found" });

    if (file.user_id !== req.session.userId) {
        return res.status(403).json({ error: "Forbidden" });
    }

    const fullPath = path.join(UPLOADS_DIR, file.stored_name);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File missing on disk" });

    res.setHeader("Content-Type", file.mime);
    // inline opens in browser when possible; change to attachment to force download
    res.setHeader("Content-Disposition", `inline; filename="${file.original_name.replace(/"/g, "")}"`);
    res.sendFile(fullPath);
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
    const msg = err?.message || "Server error";
    const status = msg.includes("CORS") ? 403 : 400;
    res.status(status).json({ error: msg });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

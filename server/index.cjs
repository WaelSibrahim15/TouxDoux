// Log startup immediately
console.log("🚀 Starting TouxDoux server...");
console.log("📦 Node version:", process.version);
console.log("📂 Working directory:", process.cwd());
console.log("🌍 Environment:", process.env.NODE_ENV || "development");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");

console.log("✅ All modules loaded successfully");

// If you installed dotenv, uncomment:
// require("dotenv").config();

const app = express();
// ❌ Force Port 3000 to match Railway Dashboard "Public Networking" setting
// Railway configured this service to forward to port 3000 based on old Dockerfile
const PORT = 3000;

// 🔍 LOGGING - ABSOLUTE TOP (Removed for production)
// app.use((req, res, next) => { ... });

// ✅ Railway/HTTPS proxy support (needed for secure cookies behind Railway)
// ✅ Railway/HTTPS proxy support
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", true); // Trust all hops (Railway)
}

// ---------- Platform-specific user data directory helper ----------
function getUserDataDir() {
    // On Railway or production, use a simple data directory
    if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production") {
        return path.join(__dirname, "data");
    }

    const os = require("os");
    const platform = os.platform();
    const homeDir = os.homedir();

    if (platform === "darwin") {
        // macOS
        return path.join(homeDir, "Library", "Application Support", "touxdoux");
    } else if (platform === "win32") {
        // Windows
        return path.join(process.env.APPDATA || homeDir, "touxdoux");
    } else {
        // Linux and others
        return path.join(homeDir, ".local", "share", "touxdoux");
    }
}

// ---------- Paths with environment variable support ----------
// Priority: 1. Environment variable, 2. Existing database in server dir (migration), 3. User data directory
const OLD_DB_PATH = path.resolve(__dirname, "touxdoux.db");
const OLD_UPLOADS_DIR = path.resolve(__dirname, "uploads");

const DEFAULT_UPLOADS_DIR = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : fs.existsSync(OLD_UPLOADS_DIR) && fs.readdirSync(OLD_UPLOADS_DIR).length > 0
        ? OLD_UPLOADS_DIR // Use old location if it has files (migration)
        : path.join(getUserDataDir(), "uploads");

const DEFAULT_DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : fs.existsSync(OLD_DB_PATH)
        ? OLD_DB_PATH // Use old location if it exists (migration)
        : path.join(getUserDataDir(), "touxdoux.db");

const UPLOADS_DIR = DEFAULT_UPLOADS_DIR;
const DB_PATH = DEFAULT_DB_PATH;

// Ensure directories exist
try {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        console.log(`✅ Created uploads directory: ${UPLOADS_DIR}`);
    }
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`✅ Created database directory: ${dbDir}`);
    }
    console.log(`📁 Uploads directory: ${UPLOADS_DIR}`);
    console.log(`💾 Database path: ${DB_PATH}`);
} catch (err) {
    console.error("❌ Failed to create directories:", err);
    process.exit(1);
}

// ---------- DB ----------
let db;
try {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
} catch (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1);
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  download_location TEXT,
  export_location TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Migrate files table to allow NULL user_id (for anonymous uploads)
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS files_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          stored_name TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime TEXT NOT NULL,
          size INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        INSERT INTO files_new SELECT * FROM files;
        DROP TABLE files;
        ALTER TABLE files_new RENAME TO files;
        CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
    `);
} catch (err) {
    // Migration already done or table doesn't exist yet, ignore
    if (!String(err.message).includes("no such table")) {
        console.log("Migration note:", err.message);
    }
}

// ---------- Security / Middleware ----------
app.use(helmet());

// ✅ CORS ONLY for API routes (don't apply to static assets)
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    process.env.VITE_APP_URL,                 // should include scheme
    process.env.APP_URL,                      // optional
    process.env.PUBLIC_URL,                   // optional
].filter(Boolean);

// helper: normalize Railway domain if it exists
function isAllowedOrigin(origin) {
    if (!origin) return true;

    // allow exact matches
    if (ALLOWED_ORIGINS.includes(origin)) return true;

    // allow Railway public domain even if env var is just the hostname
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (railwayDomain) {
        if (origin === `https://${railwayDomain}`) return true;
        if (origin === `http://${railwayDomain}`) return true;
    }

    return false;
}

app.use(
    "/api",
    cors({
        origin(origin, cb) {
            if (isAllowedOrigin(origin)) return cb(null, true);
            return cb(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);

app.use(express.json());

// ✅ Sessions
// ✅ Sessions
const PgSession = require("connect-pg-simple")(session);
const { pool } = require("./pg.cjs"); // Ensure this is imported if not already globally available

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

app.use(
    session({
        name: "touxdoux.sid",
        store: pool
            ? new PgSession({
                pool,
                tableName: "session",
                createTableIfMissing: true,
            })
            : undefined, // fallback to MemoryStore if Postgres not configured
        secret: process.env.SESSION_SECRET || "dev-secret-change-me",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
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

// ---------- Settings routes ----------
app.get("/api/settings", requireAuth, (req, res) => {
    const settings = db.prepare("SELECT download_location, export_location FROM user_settings WHERE user_id = ?").get(req.session.userId);
    res.json({
        downloadLocation: settings?.download_location || null,
        exportLocation: settings?.export_location || null,
    });
});

app.put("/api/settings", requireAuth, (req, res) => {
    const { downloadLocation, exportLocation } = req.body || {};

    const stmt = db.prepare(`
        INSERT INTO user_settings (user_id, download_location, export_location, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
            download_location = excluded.download_location,
            export_location = excluded.export_location,
            updated_at = datetime('now')
    `);

    stmt.run(
        req.session.userId,
        downloadLocation || null,
        exportLocation || null
    );

    res.json({ ok: true });
});

// ---------- Upload (private + owned) ----------
// Allow uploads with or without authentication
app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Use session userId if authenticated, otherwise use NULL (anonymous)
    const userId = req.session?.userId || null;

    const insert = db.prepare(`
    INSERT INTO files (user_id, stored_name, original_name, mime, size)
    VALUES (?, ?, ?, ?, ?)
  `);

    const info = insert.run(
        userId,
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
app.get("/api/files/:id", (req, res) => {
    const id = req.params.id;

    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(id);
    if (!file) return res.status(404).json({ error: "Not found" });

    // If authenticated, check ownership. If not authenticated, allow access to anonymous files (user_id = NULL)
    if (req.session?.userId) {
        if (file.user_id !== req.session.userId && file.user_id !== null) {
            return res.status(403).json({ error: "Forbidden" });
        }
    } else {
        // Not authenticated - only allow access to anonymous files
        if (file.user_id !== null) {
            return res.status(403).json({ error: "Forbidden" });
        }
    }

    const fullPath = path.join(UPLOADS_DIR, file.stored_name);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File missing on disk" });

    res.setHeader("Content-Type", file.mime);

    // Check user's download preference if authenticated
    let forceDownload = false;
    if (req.session?.userId) {
        const settings = db.prepare("SELECT download_location FROM user_settings WHERE user_id = ?").get(req.session.userId);
        forceDownload = settings?.download_location !== null;
    }

    // inline opens in browser when possible; attachment forces download
    const disposition = forceDownload ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${file.original_name.replace(/"/g, "")}"`);
    res.sendFile(fullPath);
});

// Log all requests for debugging (BEFORE all routes)


// Health check endpoint (always available)
app.get("/health", (req, res) => {
    console.log("🏥 Health check requested");
    res.status(200).json({ status: "ok" });
});

// ---------- Serve static files from Vite build in production ----------
if (process.env.NODE_ENV === "production") {
    const distPath = path.join(__dirname, "..", "dist");
    console.log(`🔍 Checking for dist folder at: ${distPath}`);
    if (fs.existsSync(distPath)) {
        console.log(`✅ Found dist folder, serving static files`);



        // Serve assets (JS/CSS) before any other static middleware
        app.use("/assets", express.static(path.join(distPath, "assets")));
        // Serve remaining static files (including index.html)
        app.use(express.static(distPath));

        // Serve index.html for all non-API routes (SPA routing)
        // This must be before the error handler
        app.get("*", (req, res, next) => {
            if (!req.path.startsWith("/api")) {
                const indexPath = path.join(distPath, "index.html");
                res.sendFile(indexPath, (err) => {
                    if (err) {
                        console.error(`❌ Error serving index.html:`, err);
                        next(err);
                    }
                });
            } else {
                next();
            }
        });
    } else {
        console.warn(`⚠️  Dist folder not found at ${distPath} - static files will not be served`);
    }
}

// ---------- Error handler ----------
app.use((err, req, res, next) => {
    const msg = err?.message || "Server error";
    const status = msg.includes("CORS") ? 403 : 400;
    res.status(status).json({ error: msg });
});

// Postgres Helper
const { pool } = require("./pg.cjs");

async function ensurePostgresSchema() {
    if (!pool) {
        console.log("ℹ️ Postgres not configured, skipping schema init");
        return;
    }

    const schemaPath = path.join(__dirname, "sql", "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf8");
    await pool.query(sql);
    console.log("✅ Postgres schema ensured");
}

ensurePostgresSchema()
    .then(() => {
        const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`📁 Uploads: ${UPLOADS_DIR}`);
            console.log(`💾 Database: ${DB_PATH}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
        });

        // ✅ Fix 502 Errors: Keep-Alive Timeout > Railway Load Balancer Timeout (60s)
        server.keepAliveTimeout = 120 * 1000;
        server.headersTimeout = 120 * 1000;
    })
    .catch((err) => {
        console.error("❌ Failed to init Postgres schema:", err);
        process.exit(1);
    });

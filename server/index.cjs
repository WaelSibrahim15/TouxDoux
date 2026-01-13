// Log startup immediately
console.log("🚀 Starting TouxDoux server...");
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err);
    // process.exit(1); // Don't exit immediately, let logger flush
});
process.on('unhandledRejection', (reason, p) => {
    console.error('❌ UNHANDLED REJECTION:', reason);
});

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
const { pool, pgQuery } = require("./pg.cjs"); // ✅ Single source of truth for Postgres
const { makeObjectKey, putBuffer, presignGet } = require("./r2.cjs");

console.log("✅ All modules loaded successfully");

// If you installed dotenv, uncomment:
// require("dotenv").config();

const app = express();
// ✅ Use system port (required for Railway), fallback to 3000
const PORT = process.env.PORT || 3000;

// 🔍 LOGGING - ABSOLUTE TOP (Removed for production)
// app.use((req, res, next) => { ... });

// ✅ Railway/HTTPS proxy support (needed for secure cookies behind Railway)
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", true); // Trust all hops (Railway)
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
// const { pool } = require("./pg.cjs"); // REMOVED (imported globally at top)

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

// Use MemoryStorage for R2 upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error("Invalid file type"));
        cb(null, true);
    },
});

/*
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = ext.replace(/[^a-z0-9.]/g, "");
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${safeExt}`);
    },
});
*/

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

        const r = await pgQuery(
            `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
            [email, hash]
        );

        req.session.userId = r.rows[0].id;
        res.status(201).json({ user: { id: r.rows[0].id, email: r.rows[0].email } });
    } catch (err) {
        if (String(err?.message || "").toLowerCase().includes("duplicate") || String(err?.message || "").includes("unique")) {
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

        const r = await pgQuery(
            `SELECT id, email, password_hash FROM users WHERE email = $1`,
            [email]
        );

        const user = r.rows[0];
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

app.get("/api/auth/me", async (req, res, next) => {
    try {
        if (!req.session?.userId) return res.json({ user: null });

        const r = await pgQuery(
            `SELECT id, email FROM users WHERE id = $1`,
            [req.session.userId]
        );

        res.json({ user: r.rows[0] || null });
    } catch (err) {
        next(err);
    }
});

// ---------- Settings routes ----------
app.get("/api/settings", requireAuth, async (req, res, next) => {
    try {
        const r = await pgQuery(
            "SELECT download_location, export_location FROM user_settings WHERE user_id = $1",
            [req.session.userId]
        );
        const settings = r.rows[0];
        res.json({
            downloadLocation: settings?.download_location || null,
            exportLocation: settings?.export_location || null,
        });
    } catch (err) {
        next(err);
    }
});

app.put("/api/settings", requireAuth, async (req, res, next) => {
    try {
        const { downloadLocation, exportLocation } = req.body || {};

        await pgQuery(
            `INSERT INTO user_settings (user_id, download_location, export_location, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT(user_id) DO UPDATE SET
                download_location = EXCLUDED.download_location,
                export_location = EXCLUDED.export_location,
                updated_at = now()`,
            [req.session.userId, downloadLocation || null, exportLocation || null]
        );

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ---------- Upload (private + owned) ----------
// Allow uploads with or without authentication
// Allow uploads with or without authentication
app.post("/api/upload", upload.single("file"), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const userId = req.session?.userId || null;
        const objectKey = makeObjectKey({ userId, originalName: req.file.originalname });

        // Upload to R2
        await putBuffer({
            key: objectKey,
            buffer: req.file.buffer,
            contentType: req.file.mimetype,
        });

        const r = await pgQuery(
            `INSERT INTO files (user_id, object_key, original_name, mime, size)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, original_name, mime, size`,
            [userId, objectKey, req.file.originalname, req.file.mimetype, req.file.size]
        );

        // ✅ Return file id + originalName
        res.json({
            id: String(r.rows[0].id),
            originalName: r.rows[0].original_name,
            mime: r.rows[0].mime,
            size: r.rows[0].size,
        });
    } catch (err) {
        next(err);
    }
});

// ---------- Download (private + ownership enforced) ----------
app.get("/api/files/:id", async (req, res, next) => {
    try {
        const id = req.params.id;

        const r = await pgQuery(`SELECT * FROM files WHERE id = $1`, [id]);
        const file = r.rows[0];

        if (!file) return res.status(404).json({ error: "Not found" });

        // If authenticated, check ownership. If not authenticated, only allow anonymous files
        if (req.session?.userId) {
            // Postgres BIGINT comes as string, double equals handles string/number mismatch
            if (file.user_id != req.session.userId && file.user_id !== null) {
                return res.status(403).json({ error: "Forbidden" });
            }
        } else {
            if (file.user_id !== null) {
                return res.status(403).json({ error: "Forbidden" });
            }
        }

        // R2 Redirect Logic
        // download preference (if you implemented it)
        let forceDownload = false;
        if (req.session?.userId) {
            const s = await pgQuery(`SELECT download_location FROM user_settings WHERE user_id = $1`, [req.session.userId]);
            forceDownload = s.rows[0]?.download_location != null;
        }

        const url = await presignGet({
            key: file.object_key,          // or file.stored_name if you kept that column name in DB for legacy
            filename: file.original_name,
            contentType: file.mime,
            expiresIn: 60,
            forceDownload,
        });

        res.redirect(url);
    } catch (err) {
        next(err);
    }
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
// const { pool, pgQuery } = require("./pg.cjs"); // REMOVED (imported globally at top)

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

// Start server immediately to satisfy health checks
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);

    // Init DB in background
    ensurePostgresSchema()
        .then(() => console.log("✅ Postgres schema initialized"))
        .catch((err) => console.error("❌ Postgres schema init failed:", err));
});

// ✅ Fix 502 Errors: Keep-Alive Timeout > Railway Load Balancer Timeout (60s)
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

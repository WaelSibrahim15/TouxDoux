const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'touxdoux-secret-key-change-in-prod'; // Simple secret for dev

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// Multer Config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());
// Serve uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

// Database Setup
const dbPath = path.resolve(__dirname, 'touxdoux.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeTables();
    }
});

function initializeTables() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

        // Tasks Table
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      title TEXT,
      notes TEXT,
      priority INTEGER,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      due_date TEXT,
      project TEXT,
      attachment_path TEXT,
      attachment_name TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

        // Add columns if they don't exist (migrations for existing DB)
        db.run("ALTER TABLE tasks ADD COLUMN attachment_path TEXT", (err) => {
            // Ignore error if column exists
        });
        db.run("ALTER TABLE tasks ADD COLUMN attachment_name TEXT", (err) => {
            // Ignore error if column exists
        });
    });
}

// --- Auth Routes ---

// Register
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const hashedPassword = bcrypt.hashSync(password, 8);

    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, hashedPassword], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }

        // Auto login after register
        const token = jwt.sign({ id: this.lastID, email }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, user: { id: this.lastID, email } });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).json({ token: null, error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    });
});

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) return res.status(403).json({ error: 'Malformed token' });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized' });
        req.userId = decoded.id;
        next();
    });
};

// --- Upload Route ---
app.post('/api/upload', verifyToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Return relative path for frontend use
    const relativePath = '/uploads/' + req.file.filename;
    res.json({
        path: relativePath,
        originalName: req.file.originalname,
        filename: req.file.filename
    });
});

// --- Task Routes ---

// Get all tasks
app.get('/api/tasks', verifyToken, (req, res) => {
    db.all(`SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC`, [req.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create task
app.post('/api/tasks', verifyToken, (req, res) => {
    const task = req.body;
    const { id, title, notes, priority, status, created_at, dueDate, project, attachment_path, attachment_name } = task;

    db.run(
        `INSERT INTO tasks (id, user_id, title, notes, priority, status, created_at, due_date, project, attachment_path, attachment_name) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.userId, title, notes, priority, status, created_at, dueDate, project, attachment_path, attachment_name],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Task created', data: task });
        }
    );
});

// Update task
app.put('/api/tasks/:id', verifyToken, (req, res) => {
    const { title, notes, priority, status, dueDate, project, attachment_path, attachment_name } = req.body;

    // We only update attachment if it is provided (not null/undefined) to avoid clearing it accidentally if partial update
    // But here we usually send full object. Let's assume full object or handle dynamic query

    // Simple dynamic update approach or just update all fields
    db.run(
        `UPDATE tasks SET title=?, notes=?, priority=?, status=?, due_date=?, project=?, attachment_path=?, attachment_name=? WHERE id=? AND user_id=?`,
        [title, notes, priority, status, dueDate, project, attachment_path || null, attachment_name || null, req.params.id, req.userId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Task updated' });
        }
    );
});

// Delete task
app.delete('/api/tasks/:id', verifyToken, (req, res) => {
    db.run(`DELETE FROM tasks WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Task deleted' });
    });
});

// Bulk Create
app.post('/api/tasks/bulk', verifyToken, (req, res) => {
    const tasks = req.body; // Array of tasks
    if (!Array.isArray(tasks)) return res.status(400).json({ error: 'Expected array of tasks' });

    const stmt = db.prepare(`INSERT INTO tasks (id, user_id, title, notes, priority, status, created_at, due_date, project, attachment_path, attachment_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        tasks.forEach(task => {
            stmt.run([task.id, req.userId, task.title, task.notes, task.priority, task.status, task.created_at, task.dueDate, task.project, task.attachment_path, task.attachment_name]);
        });
        db.run("COMMIT", (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Bulk import successful', count: tasks.length });
        });
        stmt.finalize();
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

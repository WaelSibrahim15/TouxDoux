# New Local Architecture

I have replaced the Supabase requirement with a **Local SQLite Database**.

## Architecture
- **Frontend**: React + Vite (running on port 5173)
- **Backend**: Express + SQLite (running on port 3000)
- **Communication**: `src/services/taskService.js` talks to `http://localhost:3000/api`

## Security
- **Passwords**: Hashed with `bcrypt` before storage.
- **Tokens**: JWT (JSON Web Tokens) used for session management.
- **Data**: Stored in `server/touxdoux.db` (SQLite file).

## Files
- `server/index.cjs`: The backend server code.
- `server/touxdoux.db`: The database file (will be created automatically).

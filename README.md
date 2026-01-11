# TOUXDOUX

A beautiful, minimalist task management application built with React and Vite. TOUXDOUX helps you organize your tasks with a clean, week-based calendar view and persistent cloud storage.

## ✨ Features

- 📅 **Week-Based View**: Organize tasks across a 7-day week view (Monday to Sunday)
- ✅ **Task Management**: Create, edit, delete, and complete tasks
- 📊 **Priority System**: Assign and reorder tasks by priority
- 🏷️ **Project Categories**: Organize tasks into Work or Personal projects
- 🔍 **Smart Filtering**: Filter by active, completed, or all tasks
- 📝 **Bulk Task Entry**: Add multiple tasks at once
- 📄 **Task Reports**: Generate and export task reports to PDF
- 🔐 **User Authentication**: Secure email/password authentication
- 👥 **Multi-User Support**: Each user has their own private task list
- ☁️ **Cloud Database**: Persistent storage with Supabase PostgreSQL
- 🔄 **Real-time Sync**: Changes sync across devices instantly
- 🔒 **Secure Data**: Row-Level Security ensures data privacy
- 🎨 **Clean UI**: Beautiful, responsive interface with premium design

## Prerequisites

Before running the app, make sure you have the following installed:

- **Node.js** (version 14.0 or higher recommended)
- **npm** (comes with Node.js) or **yarn**

## Getting Started

### 1. Install Dependencies

First, navigate to the project directory and install the required dependencies:

```bash
npm install
```

Or if you prefer yarn:

```bash
yarn install
```

### 2. Run the Development Server

Start the development server:

```bash
npm run dev
```

Or with yarn:

```bash
yarn dev
```

The application will start running on `http://localhost:5173` (or another port if 5173 is already in use). The terminal will show you the exact URL.

### 3. Open in Browser

Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`).

## Available Scripts

- **`npm run dev`** - Start the development server with hot module replacement (HMR)
- **`npm run build`** - Build the app for production to the `dist` folder
- **`npm run preview`** - Preview the production build locally
- **`npm run lint`** - Run ESLint to check for code quality issues

## Usage

### Adding Tasks

1. Click the **"+ Add Task"** button in the top navigation
2. Fill in the task details:
   - **Title** (required)
   - **Notes** (optional)
   - **Due Date** (optional, defaults to today)
   - **Priority** (number, lower = higher priority)
   - **Project** (Work/Personal/None)
   - **Status** (Incomplete/Complete)
3. Click **"Save"**

### Bulk Task Entry

1. Click the **"⚡ Bulk Add"** button
2. Enter one task per line
3. Click **"Export Tasks"**

### Managing Tasks

- **Edit**: Click on any task card to edit it
- **Complete**: Click the checkbox on a task to mark it complete/incomplete
- **Reorder**: Use the ↑ / ↓ arrows to change task priority
- **Delete**: Open the task editor and click "Delete"

### Navigating Weeks

Use the **← Previous Week** and **Next Week →** buttons to navigate between weeks.

### Generating Reports

1. Click the **"📋 Print Tasks"** button
2. Select a date range
3. Click **"Generate Preview"**
4. Review the report and click **"Export to PDF"**

## Technology Stack

- **React 19.2.0** - UI framework
- **Vite 7.2.4** - Build tool and development server
- **Supabase** - _(Replaced with Local SQLite)_
- **SQLite** - Local database
- **Express** - Backend server
- **ESLint** - Code quality and linting

## Data Storage & Security

All tasks are stored securely in a local database on your computer:
- ✅ **User Authentication** - Secure email/password login required
- ✅ **Private Data** - Each user has their own task list
- ✅ **Offline Ready** - No internet connection needed for database
- ✅ **Persistent Storage** - Tasks survive resets
- 🔒 **Local Privacy** - Data never leaves your machine

## Storage Configuration

### Default Storage Locations

The app uses platform-specific user data directories by default:

- **macOS**: `~/Library/Application Support/touxdoux/`
- **Windows**: `%APPDATA%/touxdoux/`
- **Linux**: `~/.local/share/touxdoux/`

Files are stored in:
- **Uploads**: `{user_data_dir}/uploads/`
- **Database**: `{user_data_dir}/touxdoux.db`

### Environment Variables

You can customize storage paths using environment variables:

```bash
# Custom upload directory
export UPLOADS_DIR=/path/to/custom/uploads

# Custom database location
export DB_PATH=/path/to/custom/database.db

# Server port (default: 3000)
export PORT=3000

# Session secret (change in production!)
export SESSION_SECRET=your-secret-key
```

### User Settings

Users can configure preferences through the Settings UI (⚙️ button in the top bar):
- **Download Location**: Choose whether files open in browser or force download
- **Export Location**: Set preferred location for task reports (stored as preference)

**Note**: Due to browser security restrictions, you cannot directly set the download folder path. The setting controls whether files open in the browser or are forced to download to your browser's default download location.

## 🚀 Setup Instructions

**Simpler than ever:**

1. Run `npm run dev`
2. Open `http://localhost:5173`
3. Sign up and start working!

No API keys or external accounts required.

## Building for Production

To create a production build:

```bash
npm run build
```

The optimized files will be in the `dist` folder. You can preview the production build with:

```bash
npm run preview
```

## Browser Support

TOUXDOUX works best on modern browsers that support:
- ES6+ JavaScript
- LocalStorage API
- Modern CSS (Flexbox, Grid)

Recommended browsers: Chrome, Firefox, Safari, Edge (latest versions)

## License

© Wael Ibrahim 2026

---

**Happy Task Managing! 🎯**

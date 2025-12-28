---
description: Refactor TOUXDOUX for Multi-User Support with Persistent Database
---

# TOUXDOUX Refactoring Plan: Multi-User with Persistent Database

## Overview
Migrate from localStorage-based single-user app to a multi-user application with:
- **Backend Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password)
- **Data Persistence**: Cloud-based storage
- **User Isolation**: Tasks linked to User IDs

## Phase 1: Setup Supabase Backend

### Step 1.1: Create Supabase Project
1. Sign up at https://supabase.com
2. Create a new project
3. Note down:
   - Project URL
   - Anon/Public API Key
   - (Optional) Service Role Key for admin operations

### Step 1.2: Install Supabase Client
```bash
npm install @supabase/supabase-js
```

### Step 1.3: Create Supabase Client Configuration
Create `src/lib/supabase.js` with Supabase client initialization

### Step 1.4: Set up Environment Variables
Create `.env.local` with:
```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Phase 2: Database Schema Setup

### Step 2.1: Create Users Table (if using custom fields)
Supabase Auth already provides `auth.users` table. We can extend with a `profiles` table if needed:

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
```

### Step 2.2: Create Tasks Table
```sql
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'incomplete',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  due_date DATE,
  project TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own tasks
CREATE POLICY "Users can view own tasks" ON tasks
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own tasks
CREATE POLICY "Users can insert own tasks" ON tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own tasks
CREATE POLICY "Users can update own tasks" ON tasks
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own tasks
CREATE POLICY "Users can delete own tasks" ON tasks
  FOR DELETE USING (auth.uid() = user_id);
```

### Step 2.3: Create Updated_at Trigger
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## Phase 3: Authentication Implementation

### Step 3.1: Create Auth Context
Create `src/contexts/AuthContext.jsx` to manage authentication state globally

### Step 3.2: Create Authentication UI Components
- `src/components/Login.jsx` - Login form
- `src/components/SignUp.jsx` - Sign up form
- `src/components/AuthGuard.jsx` - Protected route wrapper

### Step 3.3: Create Auth Page/Flow
Modify `App.jsx` or create dedicated auth views for:
- Login
- Sign Up
- Password Reset (optional)
- Logout

## Phase 4: Database Integration

### Step 4.1: Create Database Service Layer
Create `src/services/taskService.js` with CRUD operations:
- `fetchTasks(userId)` - Get all tasks for a user
- `createTask(task)` - Create new task
- `updateTask(taskId, updates)` - Update task
- `deleteTask(taskId)` - Delete task
- `toggleTaskComplete(taskId, status)` - Toggle completion

### Step 4.2: Replace LocalStorage with Supabase
Refactor `App.jsx`:
- Remove `loadTasks()` and `saveTasks()` localStorage functions
- Replace with async Supabase calls
- Add loading states
- Add error handling

### Step 4.3: Implement Real-time Updates (Optional but Recommended)
Use Supabase real-time subscriptions to sync tasks across devices

## Phase 5: Migration & Data Handling

### Step 5.1: Create Migration Utility (Optional)
Create a one-time migration script to move existing localStorage tasks to Supabase for first-time users:
- Read from localStorage
- Prompt user to sign up/login
- Upload tasks to their account
- Clear localStorage after successful migration

### Step 5.2: Handle Offline Mode (Optional Enhancement)
Consider implementing:
- Optimistic UI updates
- Retry logic for failed requests
- Queue system for offline operations

## Phase 6: Testing & Verification

### Step 6.1: Test Authentication Flow
- Sign up new user
- Log in existing user
- Log out
- Password reset

### Step 6.2: Test Task Operations
- Create tasks
- Edit tasks
- Delete tasks
- Toggle completion
- Reorder priority
- Bulk add

### Step 6.3: Test Data Persistence
- Clear browser cache
- Close and reopen browser
- Test on different devices
- Verify RLS policies

### Step 6.4: Test Multi-User Isolation
- Create two test accounts
- Verify tasks are isolated per user
- Ensure no cross-user data leakage

## Phase 7: UI/UX Enhancements

### Step 7.1: Add Loading States
- Skeleton loaders for tasks
- Loading indicators for auth operations

### Step 7.2: Add Error Handling UI
- Toast notifications for errors
- User-friendly error messages

### Step 7.3: Add User Profile Section
- Display logged-in user email
- Add logout button
- (Optional) Profile settings

## Phase 8: Documentation & Deployment

### Step 8.1: Update README
Document:
- New authentication flow
- Setup instructions with Supabase
- Environment variables needed

### Step 8.2: Deploy to Production
- Set up environment variables in hosting platform
- Test production build
- Verify Supabase connection

## Technical Architecture Summary

```
TOUXDOUX App
│
├── Frontend (React + Vite)
│   ├── Auth Context (manages session)
│   ├── Auth Components (Login/SignUp)
│   ├── Task UI (existing components)
│   └── Services (API calls to Supabase)
│
└── Backend (Supabase)
    ├── PostgreSQL Database
    │   ├── auth.users (built-in)
    │   ├── profiles (optional custom fields)
    │   └── tasks (user tasks)
    │
    ├── Row Level Security (RLS)
    │   └── Policies (user can only access own data)
    │
    └── Authentication
        ├── Email/Password
        └── Session Management
```

## Security Considerations
- ✅ Row Level Security (RLS) enabled
- ✅ User data isolated by user_id
- ✅ API keys stored in environment variables
- ✅ HTTPS for all communication
- ✅ Supabase handles password hashing and secure storage

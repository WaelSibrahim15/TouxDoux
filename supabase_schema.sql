-- Database Schema for TOUXDOUX (Run this in Supabase SQL Editor)

-- 1. Create Tasks Table
create table tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  notes text,
  priority integer default 0,
  status text default 'incomplete',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  due_date text, -- storing as YYYY-MM-DD string to match current app usage
  project text,
  attachment_path text,
  attachment_name text
);

-- 2. Enable Row Level Security (RLS)
alter table tasks enable row level security;

-- 3. Create Policies (Secure Data Access)
create policy "Users can view their own tasks" on tasks
  for select using (auth.uid() = user_id);

create policy "Users can insert their own tasks" on tasks
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own tasks" on tasks
  for update using (auth.uid() = user_id);

create policy "Users can delete their own tasks" on tasks
  for delete using (auth.uid() = user_id);

-- 4. Storage Bucket Setup (Manually create a bucket named 'task-attachments' in Storage dashboard)
-- Policy for Storage:
-- INSERT: bucket_id = 'task-attachments', auth.role() = 'authenticated'
-- SELECT: bucket_id = 'task-attachments' (public or authenticated)

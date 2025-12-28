const API_URL = 'http://localhost:3000/api';

const getAuthHeader = () => {
    const token = localStorage.getItem('touxdoux_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const taskService = {
    async fetchTasks(userId) {
        try {
            const response = await fetch(`${API_URL}/tasks`, {
                headers: getAuthHeader()
            });
            if (!response.ok) throw new Error('Failed to fetch tasks');
            const data = await response.json();

            // Transform SQLite columns (snake_case) to app format (camelCase)
            const tasks = data.map(t => ({
                id: t.id,
                title: t.title,
                notes: t.notes,
                priority: t.priority,
                status: t.status,
                created_at: t.created_at,
                due_date: t.due_date, // mapping back from DB
                project: t.project,
                attachmentPath: t.attachment_path,
                attachmentName: t.attachment_name
            }));

            return { data: tasks, error: null };
        } catch (error) {
            console.error(error);
            return { data: null, error };
        }
    },

    async uploadFile(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                headers: getAuthHeader(), // Do not set Content-Type, fetch sets it for FormData
                body: formData
            });

            if (!response.ok) throw new Error('File upload failed');
            return await response.json(); // { path, originalName, filename }
        } catch (error) {
            console.error("Upload error:", error);
            throw error;
        }
    },

    async createTask(task) {
        try {
            // Backend expects: id, title, notes, priority, status, created_at, dueDate, project
            // And now attachment_path, attachment_name
            const payload = {
                ...task,
                id: task.id || crypto.randomUUID(), // Ensure ID generation if missing
                created_at: new Date().toISOString(),
                attachment_path: task.attachmentPath,
                attachment_name: task.attachmentName
            };

            const response = await fetch(`${API_URL}/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Failed to create task');
            const resData = await response.json();

            // Return format compatible with AppWrapper
            // resData.data is the task object we sent + saved
            const savedTask = resData.data;
            return {
                data: {
                    ...savedTask,
                    due_date: savedTask.dueDate, // standardize for wrapper
                    created_at: savedTask.created_at,
                    attachmentPath: savedTask.attachment_path,
                    attachmentName: savedTask.attachment_name
                },
                error: null
            };
        } catch (error) {
            return { data: null, error };
        }
    },

    async updateTask(taskId, updates) {
        try {
            // Map camelCase to snake_case for DB if needed, but our backend handles `attachment_path` in req.body
            const payload = {
                ...updates,
                attachment_path: updates.attachmentPath,
                attachment_name: updates.attachmentName
            };

            const response = await fetch(`${API_URL}/tasks/${taskId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Failed to update task');
            // Wrapper expects { data: ... }
            return { data: { ...updates, due_date: updates.dueDate }, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async deleteTask(taskId) {
        try {
            const response = await fetch(`${API_URL}/tasks/${taskId}`, {
                method: 'DELETE',
                headers: getAuthHeader()
            });
            if (!response.ok) throw new Error('Failed to delete task');
            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    async toggleTaskComplete(taskId, currentStatus) {
        const newStatus = currentStatus === 'complete' ? 'incomplete' : 'complete';
        return this.updateTask(taskId, { status: newStatus });
    },

    async bulkCreateTasks(tasksArray) {
        try {
            // Ensure IDs
            const tasksWithIds = tasksArray.map(t => ({
                ...t,
                id: t.id || crypto.randomUUID(),
                created_at: new Date().toISOString()
            }));

            const response = await fetch(`${API_URL}/tasks/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify(tasksWithIds)
            });

            if (!response.ok) throw new Error('Failed to bulk create');

            // Return format roughly matching DB results
            const data = tasksWithIds.map(t => ({
                ...t,
                due_date: t.dueDate
            }));

            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    subscribeToTasks(userId, callback) {
        // Simple polling for "real-time" in this local version
        // Or just no-op since it's single-instance local usually
        // We'll return a dummy subscription object
        return { unsubscribe: () => { } };
    },

    unsubscribeFromTasks(subscription) {
        // No-op
    }
};

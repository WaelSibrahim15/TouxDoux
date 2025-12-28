import { supabase } from '../lib/supabase';

export const taskService = {
    async fetchTasks(userId) {
        try {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const tasks = data.map(t => ({
                id: t.id,
                title: t.title,
                notes: t.notes,
                priority: t.priority,
                status: t.status,
                created_at: t.created_at,
                due_date: t.due_date,
                project: t.project,
                attachmentPath: t.attachment_path,
                attachmentName: t.attachment_name
            }));

            return { data: tasks, error: null };
        } catch (error) {
            console.error('Error fetching tasks:', error);
            return { data: null, error };
        }
    },

    async uploadFile(file) {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { data, error } = await supabase.storage
                .from('task-attachments')
                .upload(filePath, file);

            if (error) throw error;

            console.log('Upload successful:', data);

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('task-attachments')
                .getPublicUrl(filePath);

            return {
                path: publicUrl,
                originalName: file.name,
                filename: fileName
            };
        } catch (error) {
            console.error("Upload error:", error);
            throw error;
        }
    },

    async createTask(task) {
        try {
            const { data, error } = await supabase
                .from('tasks')
                .insert([{
                    title: task.title,
                    notes: task.notes,
                    priority: task.priority,
                    status: task.status,
                    due_date: task.dueDate,
                    project: task.project,
                    attachment_path: task.attachmentPath,
                    attachment_name: task.attachmentName,
                    user_id: (await supabase.auth.getUser()).data.user.id
                }])
                .select()
                .single();

            if (error) throw error;

            return {
                data: {
                    ...data,
                    due_date: data.due_date,
                    created_at: data.created_at,
                    attachmentPath: data.attachment_path,
                    attachmentName: data.attachment_name
                },
                error: null
            };
        } catch (error) {
            return { data: null, error };
        }
    },

    async updateTask(taskId, updates) {
        try {
            const { data, error } = await supabase
                .from('tasks')
                .update({
                    title: updates.title,
                    notes: updates.notes,
                    priority: updates.priority,
                    status: updates.status,
                    due_date: updates.dueDate,
                    project: updates.project,
                    attachment_path: updates.attachmentPath,
                    attachment_name: updates.attachmentName
                })
                .eq('id', taskId)
                .select()
                .single();

            if (error) throw error;

            return { data: { ...data, due_date: data.due_date }, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    async deleteTask(taskId) {
        try {
            const { error } = await supabase
                .from('tasks')
                .delete()
                .eq('id', taskId);

            if (error) throw error;
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
            const userId = (await supabase.auth.getUser()).data.user.id;
            const tasksToInsert = tasksArray.map(t => ({
                title: t.title,
                notes: t.notes,
                priority: t.priority,
                status: t.status,
                due_date: t.dueDate,
                project: t.project,
                user_id: userId
            }));

            const { data, error } = await supabase
                .from('tasks')
                .insert(tasksToInsert)
                .select();

            if (error) throw error;

            const transformed = data.map(t => ({
                ...t,
                due_date: t.due_date
            }));

            return { data: transformed, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    subscribeToTasks(userId, callback) {
        const subscription = supabase
            .channel('tasks-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` }, payload => {
                callback(payload);
            })
            .subscribe();

        return subscription;
    },

    unsubscribeFromTasks(subscription) {
        if (subscription) supabase.removeChannel(subscription);
    }
};

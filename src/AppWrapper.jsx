import React, { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { taskService } from './services/taskService';
import AuthPage from './components/AuthPage';
import AppContent from './App';

/**
 * AppWrapper handles authentication and data loading
 * It shows the auth page if not logged in, otherwise shows the main app
 */
export default function AppWrapper() {
    const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    const [tasksError, setTasksError] = useState(null);

    // Load tasks when user is authenticated
    useEffect(() => {
        if (!user) {
            setTasks([]);
            return;
        }

        loadUserTasks();

        // Subscribe to real-time updates
        const subscription = taskService.subscribeToTasks(user.id, (payload) => {
            console.log('Real-time update:', payload);
            // Reload tasks on any change
            loadUserTasks();
        });

        return () => {
            taskService.unsubscribeFromTasks(subscription);
        };
    }, [user]);

    const loadUserTasks = async () => {
        setTasksLoading(true);
        setTasksError(null);

        const { data, error } = await taskService.fetchTasks(user.id);

        if (error) {
            console.error('Error loading tasks:', error);
            setTasksError(error.message || 'Failed to load tasks');
            setTasksLoading(false);
            return;
        }

        // Transform database tasks to app format
        const transformedTasks = (data || []).map(dbTask => ({
            id: dbTask.id,
            title: dbTask.title,
            notes: dbTask.notes || '',
            priority: dbTask.priority || 0,
            status: dbTask.status || 'incomplete',
            createdAt: dbTask.created_at,
            dueDate: dbTask.due_date || '',
            project: dbTask.project || '',
            attachmentPath: dbTask.attachmentPath || dbTask.attachment_path || null,
            attachmentName: dbTask.attachmentName || dbTask.attachment_name || null,
        }));

        setTasks(transformedTasks);
        setTasksLoading(false);
    };

    const handleCreateTask = async (taskData) => {
        const { data, error } = await taskService.createTask(taskData);

        if (error) {
            console.error('Error creating task:', error);
            alert('Failed to create task: ' + (error.message || 'Unknown error'));
            return null;
        }

        // Transform and add to local state
        const newTask = {
            id: data.id,
            title: data.title,
            notes: data.notes || '',
            priority: data.priority || 0,
            status: data.status || 'incomplete',
            createdAt: data.created_at,
            dueDate: data.due_date || '',
            project: data.project || '',
            attachmentPath: data.attachmentPath || data.attachment_path || null,
            attachmentName: data.attachmentName || data.attachment_name || null,
        };

        setTasks(prev => [newTask, ...prev]);
        return newTask;
    };

    const handleUpdateTask = async (taskId, updates) => {
        const { data, error } = await taskService.updateTask(taskId, updates);

        if (error) {
            console.error('Error updating task:', error);
            alert('Failed to update task: ' + (error.message || 'Unknown error'));
            return false;
        }

        // Update local state
        setTasks(prev => prev.map(t => {
            if (t.id === taskId) {
                return {
                    ...t,
                    title: data.title,
                    notes: data.notes || '',
                    priority: data.priority || 0,
                    status: data.status || 'incomplete',
                    dueDate: data.due_date || '',
                    project: data.project || '',
                    attachmentPath: data.attachmentPath || data.attachment_path || t.attachmentPath,
                    attachmentName: data.attachmentName || data.attachment_name || t.attachmentName,
                };
            }
            return t;
        }));

        return true;
    };

    const handleDeleteTask = async (taskId) => {
        const { error } = await taskService.deleteTask(taskId);

        if (error) {
            console.error('Error deleting task:', error);
            alert('Failed to delete task: ' + (error.message || 'Unknown error'));
            return false;
        }

        // Remove from local state
        setTasks(prev => prev.filter(t => t.id !== taskId));
        return true;
    };

    const handleBulkCreateTasks = async (tasksArray) => {
        const { data, error } = await taskService.bulkCreateTasks(tasksArray);

        if (error) {
            console.error('Error bulk creating tasks:', error);
            alert('Failed to create tasks: ' + (error.message || 'Unknown error'));
            return [];
        }

        // Transform and add to local state
        const newTasks = (data || []).map(dbTask => ({
            id: dbTask.id,
            title: dbTask.title,
            notes: dbTask.notes || '',
            priority: dbTask.priority || 0,
            status: dbTask.status || 'incomplete',
            createdAt: dbTask.created_at,
            dueDate: dbTask.due_date || '',
            project: dbTask.project || '',
            attachmentPath: dbTask.attachmentPath || dbTask.attachment_path || null,
            attachmentName: dbTask.attachmentName || dbTask.attachment_name || null,
        }));

        setTasks(prev => [...newTasks, ...prev]);
        return newTasks;
    };

    // Show loading state while checking authentication
    if (authLoading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                fontSize: '20px',
                fontWeight: '600'
            }}>
                Loading TOUXDOUX...
            </div>
        );
    }

    // Show authentication page if not logged in
    if (!user) {
        return <AuthPage onSignIn={signIn} onSignUp={signUp} />;
    }

    // Show main app with tasks
    return (
        <AppContent
            initialTasks={tasks}
            tasksLoading={tasksLoading}
            tasksError={tasksError}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onBulkCreateTasks={handleBulkCreateTasks}
            onLogout={signOut}
            userEmail={user.email}
            onUploadFile={taskService.uploadFile}
        />
    );
}

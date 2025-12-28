import React, { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext({});
const API_URL = 'http://localhost:3000/api';

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for stored token
        const token = localStorage.getItem('touxdoux_token');
        const storedUser = localStorage.getItem('touxdoux_user');

        if (token && storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const signUp = async (email, password) => {
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Signup failed');

            // Auto login on signup (optional, but API does it)
            if (data.token) {
                localStorage.setItem('touxdoux_token', data.token);
                localStorage.setItem('touxdoux_user', JSON.stringify(data.user));
                setUser(data.user);
            }
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    };

    const signIn = async (email, password) => {
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Login failed');

            localStorage.setItem('touxdoux_token', data.token);
            localStorage.setItem('touxdoux_user', JSON.stringify(data.user));
            setUser(data.user);

            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    };

    const signOut = async () => {
        localStorage.removeItem('touxdoux_token');
        localStorage.removeItem('touxdoux_user');
        setUser(null);
        return { error: null };
    };

    const value = {
        user,
        loading,
        signUp,
        signIn,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

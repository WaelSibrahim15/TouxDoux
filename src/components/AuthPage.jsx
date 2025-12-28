import React, { useState } from 'react';
import './Auth.css';

const AuthPage = ({ onSignIn, onSignUp }) => {
    const [mode, setMode] = useState('login'); // 'login' or 'signup'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        // Validation
        if (!email || !password) {
            setError('Email and password are required');
            return;
        }

        if (mode === 'signup' && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            if (mode === 'login') {
                const { error: signInError } = await onSignIn(email, password);
                if (signInError) {
                    setError(signInError.message || 'Failed to sign in');
                }
            } else {
                const { error: signUpError } = await onSignUp(email, password);
                if (signUpError) {
                    setError(signUpError.message || 'Failed to sign up');
                } else {
                    setMessage('Account created successfully! Please check your email for verification (if required) and sign in.');
                    setMode('login');
                    setPassword('');
                    setConfirmPassword('');
                }
            }
        } catch (err) {
            setError('An unexpected error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setMode(mode === 'login' ? 'signup' : 'login');
        setError('');
        setMessage('');
        setPassword('');
        setConfirmPassword('');
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1 className="auth-logo">TOUXDOUX</h1>
                    <p className="auth-tagline">Your Beautiful Task Manager</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <h2 className="auth-title">
                        {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                    </h2>

                    {error && (
                        <div className="auth-message auth-error">
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="auth-message auth-success">
                            {message}
                        </div>
                    )}

                    <div className="auth-field">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="auth-field">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            disabled={loading}
                            minLength={6}
                        />
                    </div>

                    {mode === 'signup' && (
                        <div className="auth-field">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                disabled={loading}
                                minLength={6}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        className="auth-submit"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="auth-loading">
                                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                            </span>
                        ) : (
                            <span>{mode === 'login' ? 'Sign In' : 'Sign Up'}</span>
                        )}
                    </button>

                    <div className="auth-toggle">
                        {mode === 'login' ? (
                            <p>
                                Don't have an account?{' '}
                                <button
                                    type="button"
                                    onClick={toggleMode}
                                    className="auth-link"
                                    disabled={loading}
                                >
                                    Sign Up
                                </button>
                            </p>
                        ) : (
                            <p>
                                Already have an account?{' '}
                                <button
                                    type="button"
                                    onClick={toggleMode}
                                    className="auth-link"
                                    disabled={loading}
                                >
                                    Sign In
                                </button>
                            </p>
                        )}
                    </div>
                </form>

                <div className="auth-footer">
                    <p>🔒 Secure authentication powered by Supabase</p>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;

import React, { createContext, useState, useContext, useEffect } from 'react';
import { login as loginAPI, getCurrentUser } from '../services/api';

const AuthContext = createContext();

// EXPORT THIS FUNCTION
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check both storages - localStorage for "remember me", sessionStorage for session-only
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const savedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    
    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        
        // Verify token is still valid
        getCurrentUser()
          .then(response => {
            setUser(response.data.user);
            // Update in the same storage where it was found
            if (localStorage.getItem('token')) {
              localStorage.setItem('user', JSON.stringify(response.data.user));
            } else {
              sessionStorage.setItem('user', JSON.stringify(response.data.user));
            }
          })
          .catch(() => {
            logout();
          })
          .finally(() => {
            setLoading(false);
          });
      } catch (error) {
        logout();
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password, rememberMe = false) => {
    const response = await loginAPI(email, password);
    const { token, user } = response.data;
    
    // Clear both storages first to avoid conflicts
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    
    // Use localStorage if rememberMe, otherwise sessionStorage
    const storage = rememberMe ? localStorage : sessionStorage;
    
    storage.setItem('token', token);
    storage.setItem('user', JSON.stringify(user));
    
    setUser(user);
    
    return user;
  };

  const logout = () => {
    // Clear both storages
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
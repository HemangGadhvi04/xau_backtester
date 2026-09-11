import { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { AuthContext } from './authContextValue';

const API_BASE = "/api";

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('access_token') || null);
  const user = useMemo(() => token ? { authenticated: true } : null, [token]);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('access_token', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('access_token');
    }
  }, [token]);

  // Auto-logout on 401 responses (expired/invalid token)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401 && token) {
          setToken(null);
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [token]);

  const login = async (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    const res = await axios.post(`${API_BASE}/auth/token`, formData);
    setToken(res.data.access_token);
  };

  const register = async (username, password) => {
    const res = await axios.post(`${API_BASE}/auth/register`, { username, password });
    setToken(res.data.access_token);
  };

  const logout = () => {
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  );
};

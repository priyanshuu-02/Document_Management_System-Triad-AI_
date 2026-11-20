import axios from 'axios';

// Same-origin by default: nginx (Docker/Render) and the Vite dev server both
// proxy /api to the Flask backend.  VITE_API_URL can override it at build time.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Request interceptor to attach JWT token
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('triad_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If unauthorized, clear token if expired
      const isAuthRoute = window.location.pathname === '/login' || window.location.pathname === '/register';
      if (!isAuthRoute && localStorage.getItem('triad_token')) {
        console.warn('Session expired or unauthorized. Redirecting to login.');
      }
    }
    return Promise.reject(error);
  }
);

export default client;

import axios from 'axios';

// Same-origin by default: nginx (Docker/Render) and the Vite dev server both
// proxy /api to the Flask backend.  VITE_API_URL can override it at build time.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  // Generous: free-tier hosts can take ~40 s to wake, and OCR on big scans takes time.
  timeout: 90000,
});

// --- Cold-start handling -----------------------------------------------------
// On free hosting the API sleeps when idle; while it wakes, the platform answers
// 502/503 without the request ever reaching Flask.  Those are safe to retry for
// any method.  504 and network errors are retried only for GET, because the
// request may already have been processed (e.g. an upload).
const MAX_RETRIES = 10;          // ~50 s total, longer than a typical wake-up
const RETRY_DELAY_MS = 5000;

const shouldRetry = (error) => {
  const config = error.config;
  if (!config) return false;
  const status = error.response?.status;
  const isGet = (config.method || 'get').toLowerCase() === 'get';
  if (status === 502 || status === 503) return true;
  if (isGet && (status === 504 || (!error.response && error.code !== 'ECONNABORTED'))) return true;
  return false;
};

/** Wake the API as soon as the app loads so the user's first action is fast. */
export const warmUpApi = () => client.get('/health').catch(() => {});

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
  async (error) => {
    if (shouldRetry(error)) {
      const config = error.config;
      config.__retryCount = (config.__retryCount || 0) + 1;
      if (config.__retryCount <= MAX_RETRIES) {
        if (config.__retryCount === 1) {
          console.info('API is starting up (free hosting wakes from sleep); retrying...');
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return client(config);
      }
    }

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

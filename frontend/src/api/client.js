// The one place the app talks to the backend. Adds the login token to every
// request, and quietly retries while a sleeping free server wakes up.
import axios from 'axios';

// Calls go to /api on the same address as the page. nginx (Docker, Render)
// and the Vite dev server pass them on to the Flask backend.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  // Long wait: a sleeping free server takes ~40 s to wake, and OCR on big scans is slow.
  timeout: 90000,
});

// --- Waking up a sleeping server ---------------------------------------------
// On free hosting the backend sleeps when nobody uses it. While it wakes up,
// the host answers 502 or 503 and our server never even sees the request, so
// it's safe to send it again. For 504 and network errors we only retry GET
// requests, because something like an upload may already have gone through.
const MAX_RETRIES = 10;          // about 50 s in total
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

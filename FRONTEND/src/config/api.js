// In dev, use relative URLs so Vite proxies API calls to the backend (same-origin cookies).
// In production, set VITE_API_URL to your backend URL.
const rawApiUrl = import.meta.env.VITE_API_URL;
export const API_BASE = rawApiUrl
  ? rawApiUrl.replace(/\/+$/, "")
  : (import.meta.env.DEV ? "" : "http://localhost:3000");

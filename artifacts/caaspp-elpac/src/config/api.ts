/**
 * Backend API origin (scheme + host, optional port, no path, no trailing slash).
 *
 * The generated client calls paths like `/api/auth/login`; this value is prefixed
 * so those requests go to your real server.
 *
 * - Local dev over http://localhost:5173: `http` backend is OK.
 * - Deployed UI over HTTPS: use an **https** URL (ngrok, Render API URL, etc.)
 *   or the browser will block requests (mixed content).
 */
// export const API_BASE_URL = "https://reissuable-nisha-pastiest.ngrok-free.dev";
export const API_BASE_URL = "http://localhost:3010";

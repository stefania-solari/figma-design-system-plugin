// Backend URL — Render.com microservice
export const BACKEND_URL = "https://figma-design-system-plugin.onrender.com"

// Keep-alive interval in ms (10 minutes)
// Prevents Render free tier cold starts while the plugin is open
export const KEEPALIVE_INTERVAL = 10 * 60 * 1000

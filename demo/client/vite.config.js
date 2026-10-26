import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// same-origin in dev so the session cookie just works (no CORS credentials dance)
const proxy = {
  // xfwd passes each browser's address on, so rate limits count per device, not per proxy
  '/api': { target: 'http://localhost:4000', xfwd: true },
  '/socket.io': { target: 'http://localhost:4000', ws: true, xfwd: true },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  // vite preview serves the production build (npm run demo:offline) with the same API
  preview: { proxy },
})

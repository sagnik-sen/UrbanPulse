import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// same-origin in dev so the session cookie just works (no CORS credentials dance)
const proxy = {
  '/api': 'http://localhost:4000',
  '/socket.io': { target: 'http://localhost:4000', ws: true },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  // vite preview serves the production build (npm run demo:offline) with the same API
  preview: { proxy },
})

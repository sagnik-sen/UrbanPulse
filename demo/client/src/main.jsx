import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)

// production builds only, so the dev server and hot reload are not affected
if (import.meta.env.PROD) {
  try {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  } catch {}
}

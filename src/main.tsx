import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled locally (no CDN) so the font works offline in the Android app.
import '@fontsource-variable/inter'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

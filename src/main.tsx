import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installGlobalErrorReporting } from './lib/hq/reportError'

// App errors go to Magnus HQ (grouped, capped, no personal data).
installGlobalErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

document.getElementById('initial-splash')?.remove()

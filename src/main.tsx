import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installGlobalErrorReporting } from './lib/hq/reportError'

// App errors go to Magnus HQ (grouped, capped, no personal data).
installGlobalErrorReporting()

// The public website (front page, pricing, legal pages, status, feedback) is a small separate bundle, so a visitor on a
// cheap phone doesn't download the whole app. Signed-in people at "/" still get the app (and land on their dashboard).
const PUBLIC_ALWAYS = /^\/(pricing|privacy|terms|status|feedback)\/?$/

function hasSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? ''
      if (k.startsWith('sb-') && k.endsWith('-auth-token') && localStorage.getItem(k)) return true
    }
  } catch { /* storage blocked: treat as signed out */ }
  return false
}

const path = window.location.pathname
const showPublic = PUBLIC_ALWAYS.test(path) || (path === '/' && !hasSession())

function start({ default: Root }: { default: ComponentType }) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
  document.getElementById('initial-splash')?.remove()
}

// Two separate imports on purpose: written as one "a ? import(x) : import(y)", the build preloads BOTH bundles,
// and visitors would download the whole app anyway.
if (showPublic) {
  void import('./public/PublicSite').then(start)
} else {
  void import('./App.tsx').then(start)
}

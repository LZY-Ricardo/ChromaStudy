import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd-mobile/es/global'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  const cleanupKey = '__chromastudy_sw_cleanup_done__'

  const cleanup = async () => {
    let didCleanup = false

    const registrations = await navigator.serviceWorker.getRegistrations()
    if (registrations.length) {
      didCleanup = true
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }

    if ('caches' in window) {
      const keys = await window.caches.keys()
      if (keys.length) {
        didCleanup = true
        await Promise.all(keys.map((key) => window.caches.delete(key)))
      }
    }

    if (didCleanup && !sessionStorage.getItem(cleanupKey)) {
      sessionStorage.setItem(cleanupKey, '1')
      window.location.reload()
    }
  }

  cleanup().catch(() => {
    // ignore
  })
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // ignore
    })
  })
}

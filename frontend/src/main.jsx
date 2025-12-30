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

  navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      if (!registrations.length) {
        return
      }
      await Promise.all(registrations.map((registration) => registration.unregister()))

      if (navigator.serviceWorker.controller && !sessionStorage.getItem(cleanupKey)) {
        sessionStorage.setItem(cleanupKey, '1')
        window.location.reload()
      }
    })
    .catch(() => {
      // ignore
    })

  if ('caches' in window) {
    window.caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
      .catch(() => {
        // ignore
      })
  }
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // ignore
    })
  })
}

import { getPushPublicKey, subscribePush } from '../services/api.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function ensurePushSubscription(userId) {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'no_window' }
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' }
  }

  const getServiceWorkerRegistration = async (timeoutMs = 4000) => {
    if (!navigator.serviceWorker?.getRegistration) return null
    const existing = await navigator.serviceWorker.getRegistration()
    if (existing) return existing
    if (!navigator.serviceWorker.ready) return null
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ])
    } catch {
      return null
    }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) {
    return { ok: false, reason: 'no_registration' }
  }
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    const publicKey = await getPushPublicKey()
    if (!publicKey) {
      return { ok: false, reason: 'missing_key' }
    }
    const applicationServerKey = urlBase64ToUint8Array(publicKey)
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  }

  await subscribePush(userId, subscription)
  return { ok: true }
}

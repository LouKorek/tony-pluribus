import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Web Push: the phone or desktop gets a notification even when the app is closed.
// The browser subscription is stored in push_subscriptions; the notify-dispatch function sends to it.
export const VAPID_PUBLIC_KEY = 'BGTs2nHwzqyhSbIZsvmaAg3psDGagUmK08LAfoTy7yQaiJZ3txV7kVBwG3btsEV20xMlB7sb9PwUu-RzduQAQU8'

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext

function toKey(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function registration() {
  if (!pushSupported()) return null
  return (await navigator.serviceWorker.getRegistration()) ?? (import.meta.env.PROD ? await navigator.serviceWorker.register('/sw.js') : null)
}

export function usePush() {
  const supported = pushSupported()
  const [permission, setPermission] = useState<NotificationPermission>(supported ? Notification.permission : 'denied')
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supported) { setSubscribed(false); return }
    registration().then(async r => { const s = await r?.pushManager.getSubscription(); setSubscribed(!!s) }).catch(() => setSubscribed(false))
  }, [supported])

  const subscribe = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const r = await registration()
      if (!r) throw new Error('Push is not available in this browser')
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') throw new Error('Notifications are blocked for this site')
      const sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) })
      const j = sub.toJSON()
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('push_subscriptions').upsert({ user_id: u.user?.id, endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', ua: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' })
      if (error) throw error
      setSubscribed(true)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }, [])

  const unsubscribe = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const r = await registration()
      const sub = await r?.pushManager.getSubscription()
      if (sub) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
      setSubscribed(false)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }, [])

  return { supported, permission, subscribed, busy, error, subscribe, unsubscribe }
}

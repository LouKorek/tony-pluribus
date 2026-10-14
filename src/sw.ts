/// <reference lib="webworker" />
// Tony Next service worker: the whole app is stored on the device, so it opens without network;
// data comes from the local copy kept by the app itself (see lib/offline.ts). Also Web Push.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0] }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))
self.skipWaiting()
clientsClaim()

interface PushPayload { id?: string; title?: string; body?: string; link?: string }
self.addEventListener('push', e => {
  let d: PushPayload = {}
  try { d = e.data ? (e.data.json() as PushPayload) : {} } catch { d = { title: 'Tony Next', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Tony Next', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.id || undefined, data: { link: d.link || '/' },
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const link = (e.notification.data && e.notification.data.link) || '/'
  const url = new URL(link.startsWith('/') ? link : '/', self.location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus() } }
    return self.clients.openWindow(url)
  }))
})

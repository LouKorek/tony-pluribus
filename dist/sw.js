// Tony Next service worker: makes the app installable and shows a clear page when the device is offline.
// It never caches the app itself, so every deploy reaches users at once.
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tony Next · offline</title>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center">
<div><img src="/brand/tony-wordmark-neon.svg" alt="Tony" style="width:220px;display:block;margin:0 auto 18px"><p style="color:#e1ff00;margin:8px 0 18px">No internet connection</p>
<p style="color:rgba(255,255,255,.6);max-width:320px">Tony Next needs the internet. Check the connection and try again.</p>
<button onclick="location.reload()" style="margin-top:14px;padding:10px 18px;border:0;border-radius:8px;background:#e1ff00;font-weight:700">Try again</button></div></body>`
const BRAND = '/brand/tony-wordmark-neon.svg'
self.addEventListener('install', e => { e.waitUntil(caches.open('tn-brand-v1').then(c => c.add(BRAND)).catch(() => {})); self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  if (new URL(e.request.url).pathname === BRAND) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); return }
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })))
})

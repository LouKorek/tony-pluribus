// Pluribus service worker: makes the app installable and shows a clear page when the device is offline.
// It never caches the app itself, so every deploy reaches users at once.
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pluribus · offline</title>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0e1311;color:#fff;font-family:system-ui,sans-serif;text-align:center">
<div><div style="font-size:44px;font-weight:800;letter-spacing:.02em">PLURIBUS</div><p style="color:#e0fd02;margin:8px 0 18px">No internet connection</p>
<p style="color:rgba(255,255,255,.6);max-width:320px">Pluribus needs the internet. Check the connection and try again.</p>
<button onclick="location.reload()" style="margin-top:14px;padding:10px 18px;border:0;border-radius:8px;background:#e0fd02;font-weight:700">Try again</button></div></body>`
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })))
})

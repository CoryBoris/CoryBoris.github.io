// Service worker: when the CV overlay is open, intercepts cross-origin
// navigations (PDF link clicks) and opens them in a new tab instead.
var cvActive = false;

self.addEventListener('message', function(event) {
  if (event.data === 'cv-open') cvActive = true;
  if (event.data === 'cv-closed') cvActive = false;
});

self.addEventListener('fetch', function(event) {
  if (!cvActive) return;
  if (event.request.mode !== 'navigate') return;

  var targetUrl = new URL(event.request.url);
  if (targetUrl.origin === self.location.origin) return;
  if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') return;

  // Encode URL safely for embedding in the generated page
  var encoded = encodeURIComponent(targetUrl.href);

  event.respondWith(new Response(
    '<!DOCTYPE html><html><body>' +
    '<script>' +
    'var u=decodeURIComponent("' + encoded + '");' +
    'var w=window.open(u,"_blank","noopener,noreferrer");' +
    'if(w){history.back();}' +
    'else{var a=document.createElement("a");a.href=u;a.target="_blank";' +
    'a.rel="noopener noreferrer";a.textContent="Tap to open link";' +
    'a.style.cssText="color:#667eea;font-family:system-ui;position:fixed;' +
    'top:50%;left:50%;transform:translate(-50%,-50%)";document.body.appendChild(a);}' +
    '</' + 'script></body></html>',
    { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  ));
});

self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

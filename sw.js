/* RMT Dispatch — service worker (push notifications) */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = { title: 'RMT Dispatch', body: 'You have a new notification.' };
  try { if (e.data) d = e.data.json(); } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || 'RMT Dispatch', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'rmt-' + Date.now(),
    data: { url: '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow('/');
  }));
});

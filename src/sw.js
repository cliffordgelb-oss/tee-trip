/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ request }) => request.destination === 'document',
  new StaleWhileRevalidate({ cacheName: 'pages' })
)

self.addEventListener('push', (event) => {
  if (!event.data) return
  const payload = (() => {
    try { return event.data.json() } catch { return { title: 'Tee Trip', body: event.data.text() } }
  })()
  const { title = 'Tee Trip', body = '', tag, url = '/' } = payload
  event.waitUntil(
    self.registration.showNotification(title, {
      body, tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification?.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.navigate(target).then(() => c.focus())
      }
      return self.clients.openWindow(target)
    })
  )
})

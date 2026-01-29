// Service Worker for Web Push Notifications
// 독서실 학습관리 시스템

const CACHE_NAME = 'studycafe-v1';

// Service Worker 설치
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');
  self.skipWaiting();
});

// Service Worker 활성화
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(clients.claim());
});

// 푸시 알림 수신
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let data = {
    title: '독서실 알림',
    body: '새로운 알림이 있습니다.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'studycafe-notification',
    data: {
      url: '/student/notifications',
    },
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        ...data,
        ...payload,
        data: {
          ...data.data,
          ...payload.data,
        },
      };
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-72.png',
    tag: data.tag || 'studycafe-notification',
    vibrate: [100, 50, 100],
    data: data.data,
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/student/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 이미 열린 창이 있으면 포커스
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // 없으면 새 창 열기
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// 알림 닫기 처리
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
});

// 백그라운드 동기화 (선택적)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    console.log('[SW] Background sync triggered');
  }
});

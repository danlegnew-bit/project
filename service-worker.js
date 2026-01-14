// Версия кэша - меняйте при обновлении приложения
const CACHE_NAME = 'fitness-calendar-v4';
const APP_VERSION = '4.0.0';

// Файлы для кэширования при установке
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-72x72.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap'
];

// ========== УСТАНОВКА ==========
self.addEventListener('install', event => {
  console.log('[Service Worker] Установка версии', APP_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Кэшируем основные ресурсы');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        // Активируем сразу после установки
        return self.skipWaiting();
      })
  );
});

// ========== АКТИВАЦИЯ ==========
self.addEventListener('activate', event => {
  console.log('[Service Worker] Активация версии', APP_VERSION);
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Удаляем старые кэши
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Удаляем старый кэш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Берём контроль над всеми клиентами
      return self.clients.claim();
    })
  );
});

// ========== ПЕРЕХВАТ ЗАПРОСОВ ==========
self.addEventListener('fetch', event => {
  // Пропускаем не-GET запросы и chrome-extension
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // 1. Пытаемся вернуть из кэша
        if (cachedResponse) {
          console.log('[Service Worker] Из кэша:', event.request.url);
          return cachedResponse;
        }
        
        // 2. Делаем сетевой запрос
        return fetch(event.request)
          .then(networkResponse => {
            // Проверяем валидность ответа
            if (!networkResponse || 
                networkResponse.status !== 200 || 
                networkResponse.type !== 'basic') {
              return networkResponse;
            }
            
            // Клонируем ответ для кэширования
            const responseToCache = networkResponse.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                // Кэшируем только наши ресурсы и небольшие файлы
                if (event.request.url.startsWith(self.location.origin) &&
                    !event.request.url.includes('/api/') &&
                    networkResponse.headers.get('content-length') < 1048576) { // < 1MB
                  cache.put(event.request, responseToCache);
                }
              });
            
            return networkResponse;
          })
          .catch(error => {
            console.log('[Service Worker] Ошибка загрузки:', error);
            
            // Для HTML страниц возвращаем главную
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            
            // Для иконок возвращаем дефолтную
            if (event.request.url.includes('/icons/')) {
              return caches.match('./icons/icon-192x192.png');
            }
            
            // Для CSS возвращаем fallback
            if (event.request.url.includes('.css')) {
              return new Response(
                'body { background: #121212; color: white; }',
                { headers: { 'Content-Type': 'text/css' } }
              );
            }
            
            throw error;
          });
      })
  );
});

// ========== ФОНОВЫЕ ЗАДАЧИ ==========
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[Service Worker] Синхронизация данных');
    // Здесь можно добавить синхронизацию с сервером
  }
});

self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-check') {
    console.log('[Service Worker] Проверка обновлений');
    // Проверка обновлений приложения
  }
});

// ========== PUSH УВЕДОМЛЕНИЯ ==========
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  
  const options = {
    body: data.body || 'Напоминание о тренировке',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'open',
        title: 'Открыть'
      },
      {
        action: 'close',
        title: 'Закрыть'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Фитнес-календарь', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});
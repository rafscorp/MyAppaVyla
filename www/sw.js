const CACHE_NAME = 'hyperengine-cache-v3'; // Incrementado para nova estrutura de build
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './app.html',
    './onboard.html',
    
    // Bundles Gerados pelo Vite
    './js/bootstrap.js',
    './js/vendor.bundle.js',
    './css/vendor.bundle.css',
    './css/engine.css',

    // Assets (Vite move imagens para assets/)
    './assets/home.svg',
    './assets/location.svg',
    './assets/notifications.svg',
    './assets/settings.svg',
    './assets/camera.svg',
    './assets/crop.svg',
    './assets/edit.svg',
    './assets/trash.svg',
    './assets/car.svg',
    './assets/profile.svg',
    './assets/more.svg',
    './assets/brasil_flag.svg',

    // External Libraries (Agora locais ou mantidas se necessário fallback)
    'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
    'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css',
    'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js',
    // Fonts
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching app shell');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Removing old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignora requisições que não sejam http ou https (ex: chrome-extension, file, cdvfile)
    if (!url.protocol.startsWith('http')) return;

    // Estratégia Stale-While-Revalidate para arquivos do próprio app (JS, CSS, HTML)
    // Garante carregamento instantâneo e atualização em background
    if (url.origin === location.origin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname === '/')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(response => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        // Atualiza o cache com a nova versão
                        if (networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Se falhar (offline), não faz nada, o cache já foi retornado
                    });

                    // Retorna o cache se existir, senão espera a rede
                    return response || fetchPromise;
                });
            })
        );
    } else {
        // Estratégia Cache-First para assets estáticos (Imagens, Libs externas)
        event.respondWith(
            caches.match(event.request).then(response => response || fetch(event.request))
        );
    }
});
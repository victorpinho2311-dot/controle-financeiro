const VERSION = 'v5'
const APP_CACHE = `controle-financeiro-app-${VERSION}`
const DATA_CACHE = `controle-financeiro-data-${VERSION}`
const IS_LOCAL_DEVELOPMENT = ['localhost', '127.0.0.1'].includes(self.location.hostname)

const appShellUrl = () => new URL('./', self.registration.scope).href
const appShellAssets = () => [
  appShellUrl(),
  new URL('favicon.ico', self.registration.scope).href,
  new URL('favicon-16x16.png', self.registration.scope).href,
  new URL('favicon-32x32.png', self.registration.scope).href,
  new URL('manifest.webmanifest', self.registration.scope).href,
  new URL('icons/app-icon-44.png', self.registration.scope).href,
  new URL('icons/app-icon-150.png', self.registration.scope).href,
  new URL('icons/app-icon-192.png', self.registration.scope).href,
  new URL('icons/app-icon-512.png', self.registration.scope).href,
  new URL('icons/app-icon-1024.png', self.registration.scope).href,
  new URL('icons/apple-touch-icon.png', self.registration.scope).href,
  new URL('icons/mstile-150x150.png', self.registration.scope).href,
]

const cacheAppShell = async () => {
  const cache = await caches.open(APP_CACHE)
  await cache.addAll(appShellAssets())

  const shellResponse = await fetch(appShellUrl())
  const shellHtml = await shellResponse.clone().text()
  const assetUrls = [...shellHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(([, path]) => new URL(path, self.registration.scope))
    .filter(
      (url) =>
        url.origin === self.location.origin &&
        /\.(?:css|js|png|svg|webp|woff2?)(?:\?.*)?$/i.test(url.pathname),
    )
    .map((url) => url.href)

  await cache.put(appShellUrl(), shellResponse)

  if (assetUrls.length > 0) {
    await cache.addAll([...new Set(assetUrls)])
  }
}

const networkFirst = async (request, cacheName, fallback) => {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)

    if (response.ok) {
      cache.put(request, response.clone())
    }

    return response
  } catch {
    const cachedResponse = await cache.match(request)

    if (cachedResponse) {
      return cachedResponse
    }

    if (fallback) {
      return caches.match(fallback)
    }

    throw new Error('Nenhuma resposta em cache para esta requisição.')
  }
}

self.addEventListener('install', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    event.waitUntil(self.skipWaiting())
    return
  }

  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()))
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('controle-financeiro-')).map((key) => caches.delete(key))))
        .then(() => self.clients.claim())
        .then(() => self.registration.unregister()),
    )
    return
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('controle-financeiro-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    return
  }

  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  const isSupabaseData =
    url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')

  if (isSupabaseData) {
    event.respondWith(networkFirst(request, DATA_CACHE))
    return
  }

  if (url.origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_CACHE, appShellUrl()))
    return
  }

  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cachedResponse = await cache.match(request)

      if (cachedResponse) {
        return cachedResponse
      }

      const response = await fetch(request)

      if (response.ok) {
        cache.put(request, response.clone())
      }

      return response
    }),
  )
})

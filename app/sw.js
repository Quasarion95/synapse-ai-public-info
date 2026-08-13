/*
  Офлайн для приложения, которое и так живёт в браузере.

  Записи лежат в localStorage и никуда не уходят — без сети терялась только
  оболочка: три файла, которые не меняются между сборками. Их и кэшируем.

  Стратегия намеренно простая и разная для двух случаев:

  — оболочка (HTML, CSS, JS, иконки) отдаётся из кэша сразу, а обновление
    подтягивается в фоне. Открытие не зависит от сети вообще;
  — всё остальное идёт в сеть и не кэшируется.

  Версия в имени кэша — единственный переключатель. Поменялся любой из трёх
  файлов — поднимите число, и старый кэш снесётся в activate.
*/

var CACHE = 'synapse-shell-v5';

var SHELL = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      // addAll падает целиком, если хоть один файл не отдался. Оболочка
      // должна лечь в кэш полностью или никак — половина хуже, чем ничего.
      return cache.addAll(SHELL);
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.map(function(name){
        return name === CACHE ? null : caches.delete(name);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function(hit){
      // Обновление тянем всегда, но ответа от него не ждём: страница уже
      // открылась из кэша, свежее приедет к следующему запуску.
      var fresh = fetch(request).then(function(response){
        if (response && response.status === 200 && response.type === 'basic'){
          var copy = response.clone();
          caches.open(CACHE).then(function(cache){ cache.put(request, copy); });
        }
        return response;
      }).catch(function(){ return hit; });

      return hit || fresh;
    })
  );
});

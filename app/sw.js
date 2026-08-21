/*
  Офлайн для приложения, которое и так живёт в браузере.

  Записи лежат в localStorage и никуда не уходят — без сети терялась только
  оболочка: три файла, которые не меняются между сборками. Их и кэшируем.

  Стратегия разная для двух видов файлов, и это важно.

  — КОД (index.html, app.css, app.js) сначала спрашивается у сети, и только
    если её нет — берётся из кэша. Раньше он тоже отдавался из кэша, а свежее
    подтягивалось в фоне: человек видел новую версию лишь со ВТОРОГО захода.
    За один день это стоило нам дня разбирательств — на телефоне всё работало,
    а в браузере «то же самое» вело себя иначе, потому что там крутилась
    вчерашняя сборка. Задержка на запрос к сети того не стоит: код весит
    считанные сотни килобайт, а офлайн по-прежнему работает через кэш.

  — ШРИФТЫ И ЗНАЧКИ отдаются из кэша сразу: они не меняются между сборками, и
    ждать их по сети незачем.

  — всё остальное идёт в сеть и не кэшируется.

  Версию в имени кэша всё равно поднимайте при заметных правках оболочки —
  она разом сбрасывает старое у всех. Но теперь код доезжает и без неё.

  Забрав управление (skipWaiting + clients.claim), новый worker сообщает об
  этом открытым страницам событием controllerchange, и они перезагружаются
  один раз — иначе человек видел бы старую версию до следующего захода и решил,
  что выкладка не сработала. Обработчик — в app.js, registerServiceWorker.
*/

var CACHE = 'synapse-shell-v76';

var SHELL = [
  './',
  'index.html',
  'app.css',
  /* Словарь идёт в оболочку вместе с кодом: app.js обращается к SynI18n сразу
     при отрисовке шапки, и без словаря страница офлайн была бы белой. */
  'i18n.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  /* Начертания «Rounded» и «Clean» держатся на этих файлах там, где нет
     системных шрифтов Apple. Без них офлайн выбор снова перестал бы
     что-либо менять — ровно та поломка, которую мы чиним. */
  '../fonts/fonts.css',
  '../fonts/Manrope-cyrillic.woff2',
  '../fonts/Manrope-latin.woff2',
  '../fonts/Inter-cyrillic.woff2',
  '../fonts/Inter-latin.woff2'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      /* addAll падает целиком, если хоть один файл не отдался. Оболочка должна
         лечь в кэш полностью или никак — половина хуже, чем ничего.

         cache: 'reload' обязателен, и вот почему. Обычный addAll ходит за
         файлами через HTTP-кэш браузера, а там лежит прошлая версия — и новый
         worker бережно перекладывал в свой свежий кэш старый app.js. Со
         стороны это выглядело как «выкатка не сработала»: на сервере новое, в
         браузере прежнее, помогал только Cmd+Shift+R. Здесь мы требуем ходить
         в сеть. */
      return cache.addAll(SHELL.map(function(url){
        return new Request(url, { cache: 'reload' });
      }));
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

/// Код это или неизменный файл вроде шрифта.
function этоКод(url){
  return /(\.html|\.css|\.js)$/.test(url.pathname) || url.pathname.endsWith('/');
}

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  function положить(response){
    if (response && response.status === 200 && response.type === 'basic'){
      var copy = response.clone();
      caches.open(CACHE).then(function(cache){ cache.put(request, copy); });
    }
    return response;
  }

  if (этоКод(url)){
    /* Код: сначала сеть, кэш — запасной аэродром. Так выложенная правка
       доезжает сразу, а не через раз. Без сети открывается прежняя версия,
       то есть офлайн не теряется. */
    event.respondWith(
      fetch(request).then(положить).catch(function(){
        return caches.match(request, { ignoreSearch: true });
      })
    );
    return;
  }

  // Шрифты и значки: из кэша сразу, обновление в фоне.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function(hit){
      var fresh = fetch(request).then(положить).catch(function(){ return hit; });
      return hit || fresh;
    })
  );
});

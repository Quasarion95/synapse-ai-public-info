/* Сайт с телефона — в виде приложения. Только веб.

   В app.js оформление приложения на андроиде включается признаком inApp():
   компактное нижнее меню, подложка под нижними плашками, свёрнутые дни со
   значками, настройки оглавлением, без своей кнопки «Назад» (её заменяет
   системная), главные кнопки «+ Новая …» во всю ширину. Мобильный сайт всё
   это время оставался сайтом — с теми же экранами, но собранными для
   компьютера.

   Здесь признак того, что сайт открыт с телефона: палец вместо мыши и узкое
   окно — то самое, где меню уходит вниз (уже 1040 px). app.js спрашивает
   его через appLook() там, где речь о виде и поведении, и не спрашивает
   там, где нужна именно оболочка apk: уведомления, service worker, сверка
   подписки, ссылки в магазины приложений.

   Решается один раз при загрузке: от признака зависит и то, какие дни
   свёрнуты в новом профиле, и класс на корне — менять их на лету при
   повороте планшета незачем. Загружается до app.js. */

(function (global) {
  'use strict';
  var mq = global.matchMedia;

  /* Открыт мини-аппом из бота @syn_appbot (кнопка «Синапс» в Телеграме).
     Телеграм кладёт свои параметры в адрес после # только при первой
     загрузке, поэтому признак запоминаем на сеанс. Скрипт Телеграма
     (telegram-web-app.js) не подключаем: его не пускает политика сайта, да
     и нужны от него три команды — их шлём напрямую тем же способом. */
  var inTelegram = /[#&]tgWebApp(Data|Version|Platform)=/.test(global.location.hash || '');
  try {
    if (inTelegram) global.sessionStorage.setItem('synapse.tg', '1');
    else inTelegram = global.sessionStorage.getItem('synapse.tg') === '1';
  } catch (e) {}
  global.SynInTelegram = inTelegram;

  // Подписанная Телеграмом initData — ею мини-апп входит в аккаунт
  // (/telegram/webapp/login). Живёт сутки, на каждое открытие — новая.
  var initData = '';
  try {
    initData = new URLSearchParams(String(global.location.hash || '').slice(1)).get('tgWebAppData') || '';
    if (initData) global.sessionStorage.setItem('synapse.tg.init', initData);
    else initData = global.sessionStorage.getItem('synapse.tg.init') || '';
  } catch (e) {}
  global.SynTelegramInitData = inTelegram ? initData : '';

  // В Телеграме — всегда вид приложения, даже в Телеграме на компьютере.
  global.SynMobileApp = inTelegram || !!(mq &&
    mq('(hover: none) and (pointer: coarse)').matches &&
    mq('(max-width: 1039px)').matches);

  /* Своя кнопка «Назад» прячется, как в приложении, только когда у браузера
     есть своя. Сайт, добавленный на экран «Домой», открывается без адресной
     строки и кнопок браузера, а на айфоне и без жеста назад, — там без своей
     кнопки из подстраницы настроек не выйти иначе как через меню. */
  var standalone = global.navigator.standalone === true ||
    !!(mq && mq('(display-mode: standalone)').matches);
  // У мини-аппа нет ни адресной строки, ни кнопки «назад» браузера — своя нужна.
  global.SynMobileBack = global.SynMobileApp && !standalone && !inTelegram;

  if (!inTelegram) return;
  document.documentElement.classList.add('in-telegram');

  /* Масштаб окна — как у приложения, неизменный. Айфон приближает страницу,
     как только встаёшь в поле со шрифтом мельче 16px (строка задачи — 15px),
     и обратно сам не отдаляет: мини-апп оставался увеличенным. В браузере
     масштаб не трогаем — там пальцами увеличивать нужно для доступности. */
  var viewport = document.querySelector('meta[name="viewport"]');
  var FIXED = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  if (viewport) viewport.setAttribute('content', FIXED);

  /* Одного viewport мало: Телеграм на айфоне его ограничение пропускает и
     всё равно приближает поле мельче 16px. Поэтому поля в мини-аппе — 16px:
     тогда приближать нечего. Разница с 15px на глаз почти не видна. */
  /* Нижняя панель — по видимому низу окна Телеграма (--tg-gap ниже), и без
     «резинки»: оттянутая страница на айфоне утаскивала панель за край. */
  var style = document.createElement('style');
  style.textContent = '.in-telegram input, .in-telegram textarea, .in-telegram select,' +
    ' .in-telegram [contenteditable]{font-size:16px !important}' +
    ' html.in-telegram, html.in-telegram body{overscroll-behavior:none}' +
    ' html.in-telegram .tabbar{bottom:calc(var(--dock) + var(--vv-shift, 0px) + var(--tg-gap, 0px)) !important}';
  (document.head || document.documentElement).appendChild(style);

  // Если приближение всё же случилось — после ввода возвращаем масштаб 1.
  // И страницу на место: айфон после клавиатуры оставлял её сдвинутой, и
  // нижняя панель висела за краем окна до первой прокрутки.
  document.addEventListener('focusout', function () {
    if (viewport) {
      viewport.setAttribute('content', FIXED.replace('maximum-scale=1', 'maximum-scale=1.01'));
      setTimeout(function () { viewport.setAttribute('content', FIXED); }, 60);
    }
    setTimeout(function () { global.scrollTo(global.scrollX, global.scrollY); }, 250);
  });

  /* Окно Телеграма — шторка, и её можно опустить: страница тогда считает,
     что окно во весь экран, а нижняя её часть за краем — вместе с панелью.
     Сколько видно на самом деле, Телеграм сообщает событием viewport_changed
     (его же ловит telegram-web-app.js, которого у нас нет). По нему: шторку
     раскрываем обратно, а панель поднимаем на скрытую часть (--tg-gap). */
  function onTelegramEvent(type, data) {
    if (type !== 'viewport_changed' || !data) return;
    if (data.is_expanded === false) post('web_app_expand');
    var height = Number(data.height) || 0;
    if (height <= 0) return;
    var gap = Math.max(0, Math.round(global.innerHeight - height));
    // Клавиатура тоже уменьшает высоту — её учитывает --vv-shift, а панель
    // при вводе и так спрятана.
    if (document.documentElement.classList.contains('kbd')) gap = 0;
    // Высота — в экранных пикселях, а вёрстка живёт под html{zoom} (размер
    // шрифта в настройках): переводим, как app.js делает с --vv-shift.
    var zoom = parseFloat(global.getComputedStyle(document.documentElement).zoom) || 1;
    document.documentElement.style.setProperty('--tg-gap', Math.round(gap / zoom) + 'px');
  }
  var tgNS = global.Telegram = global.Telegram || {};
  var webView = tgNS.WebView = tgNS.WebView || {};
  var earlier = webView.receiveEvent;
  webView.receiveEvent = function (type, data) {
    try { onTelegramEvent(type, data); } catch (e) {}
    if (typeof earlier === 'function') { try { earlier(type, data); } catch (e) {} }
  };
  // web.telegram.org шлёт события сообщениями во фрейм.
  global.addEventListener('message', function (event) {
    try {
      var msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (msg && msg.eventType) onTelegramEvent(msg.eventType, msg.eventData);
    } catch (e) {}
  });

  function post(type, data) {
    var body = data === undefined ? '' : JSON.stringify(data);
    try {
      if (global.TelegramWebviewProxy && global.TelegramWebviewProxy.postEvent) {
        global.TelegramWebviewProxy.postEvent(type, body);   // айфон, андроид, компьютер
        return;
      }
    } catch (e) {}
    try {
      if (global.external && 'notify' in global.external) {
        global.external.notify(JSON.stringify({ eventType: type, eventData: data }));   // Windows
        return;
      }
    } catch (e) {}
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage(JSON.stringify({ eventType: type, eventData: data }), '*');   // web.telegram.org
      }
    } catch (e) {}
  }

  function hex(color) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color || '');
    if (!m) return null;
    return '#' + [m[1], m[2], m[3]].map(function (n) {
      return ('0' + Number(n).toString(16)).slice(-2);
    }).join('');
  }

  // Шапку и низ Телеграма красим в фон Синапса — чтобы окно было одним целым.
  function paint() {
    var bg = hex(global.getComputedStyle(document.body).backgroundColor);
    if (!bg) return;
    post('web_app_set_header_color', { color: bg });
    post('web_app_set_background_color', { color: bg });
    post('web_app_set_bottom_bar_color', { color: bg });
  }

  post('web_app_ready');
  // Во весь рост сразу, а не шторкой на полэкрана.
  post('web_app_expand');
  // Сразу узнать, сколько окна видно (ответ — viewport_changed).
  post('web_app_request_viewport');
  // Прокрутка списка вниз не должна сворачивать мини-апп.
  post('web_app_setup_swipe_behavior', { allow_vertical_swipe: false });
  global.addEventListener('load', paint);
  // Тема Синапса меняется на лету (светлая/тёмная) — перекрашиваем и Телеграм.
  if (global.MutationObserver) {
    var later = 0;
    new global.MutationObserver(function () { clearTimeout(later); later = setTimeout(paint, 80); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }
})(window);

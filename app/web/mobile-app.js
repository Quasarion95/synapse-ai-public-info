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
  if (viewport) {
    viewport.setAttribute('content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  }

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

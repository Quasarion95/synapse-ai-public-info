/* Новый вид веб-версии (21.10.2026) — заголовки страниц. Только веб, только
   широкое окно (пара к web/redesign.css).

   На айфоне у каждого раздела сверху крупное название, а над ним мелкой
   капителью цветом темы — что сейчас важно: дата, сколько целей, сколько
   записей. В вебе у части разделов заголовка не было вовсе: экран задач
   начинался сразу со «Сегодня», целей — с первой карточки. Глаз не понимал,
   где он, пока не находил подсвеченный пункт меню.

   Разметку разделов app.js собирает целиком при каждой отрисовке, поэтому
   заголовок ставится после неё — так же, как layout.js переносит кнопки в
   меню. Логика разделов не меняется. Где заголовок уже есть (финансы,
   корзина, подписка, экраны с «Назад»), второй не ставится. */

(function (global) {
  'use strict';

  var WIDE = '(min-width: 1040px)';
  function wide(){ return !!(global.matchMedia && global.matchMedia(WIDE).matches); }

  function lang(){ return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'ru'; }

  /// 1 цель, 2 цели, 5 целей.
  function plural(n, one, few, many){
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function today(){
    try {
      return new Date().toLocaleDateString(lang() === 'en' ? 'en-US' : 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch (e){ return ''; }
  }

  function count(arr){ return Array.isArray(arr) ? arr.length : 0; }

  /* Что показать над названием. Только то, что видно и так, — без новых
     подсчётов, которые могли бы разойтись с цифрами на самом экране. */
  var HEADS = {
    focus:      function(){ return { t: 'Мой фокус', e: today() }; },
    tasks:      function(){ return { t: 'Задачи', e: today() }; },
    goals:      function(){
      var all = (S.goals || []), done = all.filter(function(g){ return g && g.done; }).length, act = all.length - done;
      if (lang() === 'en') return { t: 'Цели', e: act + ' active' + (done ? ' · ' + done + ' achieved' : '') };
      return { t: 'Цели', e: act + ' ' + plural(act, 'активная', 'активные', 'активных') +
        (done ? ' · ' + done + ' ' + plural(done, 'достигнута', 'достигнуты', 'достигнуто') : '') };
    },
    analytics:  function(){
      var n = count(S.goals);
      return { t: 'Карта целей', e: lang() === 'en' ? n + ' goals' : n + ' ' + plural(n, 'цель', 'цели', 'целей') };
    },
    lists:      function(){
      var n = count(S.lists);
      return { t: 'Списки', e: lang() === 'en' ? n + ' lists' : n + ' ' + plural(n, 'список', 'списка', 'списков') };
    },
    notes:      function(){
      var n = count(S.notes);
      return { t: 'Заметки', e: lang() === 'en' ? n + ' notes' : n + ' ' + plural(n, 'запись', 'записи', 'записей') };
    },
    pomodoro:   function(){ return { t: 'Метод Помодоро', e: '' }; },
    meditation: function(){ return { t: 'Медитация', e: '' }; },
    settings:   function(){ return { t: 'Настройки', e: '' }; }
  };

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var busy = false;
  function ensure(){
    if (busy || typeof S === 'undefined') return;
    var app = document.getElementById('app');
    if (!app) return;
    var head = app.querySelector(':scope > .ph');
    var make = HEADS[S.view];
    var want = wide() && make && !(global.appLook && global.appLook()) && !app.querySelector(':scope > h1.page, :scope > .desk-wrap');
    if (!want){ if (head) head.remove(); return; }
    if (head && head.getAttribute('data-view') === S.view) return;
    var h = make();
    var html = '<header class="ph" data-view="' + esc(S.view) + '">' +
      (h.e ? '<div class="ph-eye">' + esc(h.e) + '</div>' : '') +
      '<h1 class="page">' + esc(h.t) + '</h1></header>';
    if (global.SynI18n && typeof SynI18n.tr === 'function') html = SynI18n.tr(html);
    busy = true;
    if (head) head.remove();
    app.insertAdjacentHTML('afterbegin', html);
    busy = false;
  }

  function install(){
    var app = document.getElementById('app');
    if (!app) return;
    if (global.MutationObserver) new global.MutationObserver(ensure).observe(app, { childList: true });
    ensure();
    var timer = null;
    global.addEventListener('resize', function(){ clearTimeout(timer); timer = setTimeout(ensure, 150); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

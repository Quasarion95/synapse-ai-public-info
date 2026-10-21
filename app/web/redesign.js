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

  /* ---- низ меню: одна карточка профиля, как на макете ----

     Было: внизу меню профиль, язык, тема, черта и четыре служебных пункта —
     подписка, настройки, поддержка, выход. Восемь элементов, которые
     открывают раз в неделю, занимали треть меню и спорили с разделами,
     которыми живут каждый день (закон Хика: чем меньше вариантов на виду,
     тем быстрее выбор).

     Стало: карточка профиля — аватар, имя и тариф — и шестерёнка рядом. По
     шестерёнке всплывает меню со всем остальным: подписка, настройки,
     поддержка, язык, тема, выход. Ничего не убрано, кнопки те же самые —
     их переносит сюда скрипт, обработчики общие (data-act), — просто они
     не на виду, пока не нужны.

     Меню app.js пересобирает целиком при каждой отрисовке, а layout.js
     следом переносит в него кнопки шапки. Этот перенос идёт третьим:
     наблюдатель поставлен после layout.js. */
  var popOpen = false;

  function plan(){
    try { return typeof isPro === 'function' && isPro() ? 'Synapse Pro' : 'Бесплатно'; }
    catch (e){ return ''; }
  }

  function setPop(on){
    popOpen = !!on;
    var pop = document.querySelector('#tabbar .rail-pop');
    var btn = document.querySelector('#tabbar .rail-more');
    if (pop) pop.hidden = !popOpen;
    if (btn) btn.setAttribute('aria-expanded', String(popOpen));
  }

  function foot(){
    var rest = document.querySelector('#tabbar .tabs-rest');
    if (!rest || rest.querySelector('.rail-foot')) return;
    var acts = rest.querySelector('.top-acts');
    if (!wide() || !acts || (global.appLook && global.appLook())) return;
    var who = acts.querySelector('.whoami');
    var sep = rest.querySelector('.tabs-sep');
    var service = [];
    for (var n = sep ? sep.nextElementSibling : null; n; n = n.nextElementSibling) service.push(n);

    var footEl = document.createElement('div');
    footEl.className = 'rail-foot';
    var me = document.createElement('div');
    me.className = 'rail-me';
    if (who){
      if (!who.querySelector('.rail-plan')){
        var p = document.createElement('span');
        p.className = 'rail-plan';
        p.textContent = global.SynI18n && SynI18n.tr ? SynI18n.tr(plan()) : plan();
        who.appendChild(p);
      }
      me.appendChild(who);
    }
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'rail-more';
    more.setAttribute('aria-haspopup', 'true');
    more.setAttribute('aria-expanded', 'false');
    var moreLabel = global.SynI18n && SynI18n.tr ? SynI18n.tr('Настройки и другое') : 'Настройки и другое';
    more.setAttribute('aria-label', moreLabel);
    more.title = moreLabel;
    more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
    me.appendChild(more);

    var pop = document.createElement('div');
    pop.className = 'rail-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'menu');
    service.forEach(function(el){ pop.appendChild(el); });
    var row = document.createElement('div');
    row.className = 'rail-pop-row';
    Array.prototype.slice.call(acts.querySelectorAll('.iconbtn')).forEach(function(b){ row.appendChild(b); });
    if (row.children.length) pop.insertBefore(row, pop.firstChild);

    footEl.appendChild(pop);
    footEl.appendChild(me);
    rest.appendChild(footEl);
    if (sep) sep.remove();
    acts.remove();
    document.documentElement.classList.add('rail-foot-on');

    more.addEventListener('click', function(e){ e.stopPropagation(); setPop(!popOpen); });
    // Переход в раздел — меню закрывается; язык и тема — остаётся открытым,
    // чтобы переключать, глядя на результат.
    pop.addEventListener('click', function(e){
      var t = e.target.closest('[data-act], a');
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act !== 'lang' && act !== 'theme') popOpen = false;
    });
    setPop(popOpen);
  }

  function install(){
    var app = document.getElementById('app');
    if (!app) return;
    if (global.MutationObserver) new global.MutationObserver(ensure).observe(app, { childList: true });
    ensure();
    var bar = document.getElementById('tabbar');
    if (bar && global.MutationObserver){
      new global.MutationObserver(foot).observe(bar, { childList: true });
      foot();
    }
    document.addEventListener('click', function(e){
      // Кнопка темы или языка перерисовывает меню, и к этому моменту её уже
      // нет в документе — такой клик не считаем «мимо меню».
      if (!e.target.isConnected) return;
      if (popOpen && !e.target.closest('#tabbar .rail-foot')) setPop(false);
    });
    document.addEventListener('keydown', function(e){
      if (popOpen && e.key === 'Escape'){
        setPop(false);
        var b = document.querySelector('#tabbar .rail-more');
        if (b) b.focus();
      }
    });
    var timer = null;
    global.addEventListener('resize', function(){ clearTimeout(timer); timer = setTimeout(function(){ ensure(); foot(); }, 150); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

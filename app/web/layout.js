/* Язык, тема и профиль — над служебной группой меню. Только веб, только
   широкое окно (пара к layout.css).

   В layout.css эти кнопки стояли отдельной полосой в самом низу боковой
   панели, под «Выйти»: от основных пунктов до них — вся служебная группа,
   и глаз находил их последними. Владелец попросил поставить их выше черты
   перед «Моей подпиской».

   Разметка кнопок живёт в шапке (vTop в app.js), меню — отдельно (vTabbar),
   и оба пересобираются целиком при каждой отрисовке. Поэтому после каждой
   пересборки меню полоса кнопок переносится в него — перед чертой, с
   которой начинается служебная группа. Кнопки работают через data-act и
   общий обработчик кликов, так что перенос ничего не ломает.

   Уже 1040 px кнопки остаются в шапке: там нижняя панель, и место им —
   наверху. При переходе через эту ширину страница перерисовывается, и
   кнопки встают туда, где им положено. */

(function (global) {
  'use strict';

  var WIDE = '(min-width: 1040px)';

  function wide(){ return !!(global.matchMedia && global.matchMedia(WIDE).matches); }

  function place(){
    var root = document.documentElement;
    var acts = document.querySelector('#top .top-acts');
    var rest = document.querySelector('#tabbar .tabs-rest');
    if (!wide() || !acts || !rest){ root.classList.remove('acts-in-rail'); return; }
    var sep = rest.querySelector('.tabs-sep');
    rest.insertBefore(acts, sep || rest.firstChild);
    root.classList.add('acts-in-rail');
  }

  /* ---- меню, свёрнутое до значков ----

     Выбор помнится в этом браузере: это удобство одного человека за одним
     экраном, а не настройка аккаунта. Хранилище может быть недоступно
     (приватное окно) — тогда меню просто развёрнуто. */
  var MINI_KEY = 'synapse.railMini';
  var CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

  function tr(text){ return global.SynI18n && global.SynI18n.tr ? global.SynI18n.tr(text) : text; }
  function mini(){ return document.documentElement.classList.contains('rail-mini'); }

  function labelToggle(btn){
    var text = tr(mini() ? 'Развернуть меню' : 'Свернуть меню');
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
    btn.setAttribute('aria-expanded', String(!mini()));
  }

  function setMini(on){
    document.documentElement.classList.toggle('rail-mini', on);
    try { global.localStorage.setItem(MINI_KEY, on ? '1' : '0'); } catch (e){}
    var btn = document.querySelector('.rail-toggle');
    if (btn) labelToggle(btn);
    hideTip();
    // Карта целей и дашборд меряют ширину сами — пусть пересчитают.
    try { global.dispatchEvent(new Event('resize')); } catch (e){}
  }

  function installMini(){
    try { if (global.localStorage.getItem(MINI_KEY) === '1') document.documentElement.classList.add('rail-mini'); } catch (e){}
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rail-toggle';
    btn.innerHTML = CHEVRON;
    labelToggle(btn);
    btn.addEventListener('click', function(){ setMini(!mini()); });
    document.body.appendChild(btn);

    // Подпись к значку. Отдельным элементом в body, а не внутри меню: у меню
    // своя прокрутка, и всплывающее за его край обрезалось бы.
    var tip = document.createElement('div');
    tip.className = 'rail-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);

    function show(event){
      if (!mini() || !wide()) return;
      var el = event.target.closest && event.target.closest('#tabbar .tab, #tabbar .iconbtn, #tabbar .whoami');
      if (!el) return;
      var tx = el.querySelector('.tx');
      var text = (tx && tx.textContent.trim()) || el.getAttribute('aria-label') || el.getAttribute('title') || '';
      if (!text) return;
      var box = el.getBoundingClientRect();
      tip.textContent = text;
      tip.style.left = (box.right + 10) + 'px';
      tip.style.top = (box.top + box.height / 2) + 'px';
      tip.classList.add('on');
    }
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('mouseout', function(event){
      var el = event.target.closest && event.target.closest('#tabbar');
      if (el) hideTip();
    });
    document.addEventListener('focusout', hideTip);
    document.addEventListener('click', hideTip, true);
    var bar = document.getElementById('tabbar');
    if (bar) bar.addEventListener('scroll', hideTip, { passive: true });
  }

  function hideTip(){
    var tip = document.querySelector('.rail-tip');
    if (tip) tip.classList.remove('on');
  }

  function install(){
    installMini();
    var bar = document.getElementById('tabbar');
    if (!bar) return;
    if (global.MutationObserver) new global.MutationObserver(place).observe(bar, { childList: true });
    place();
    // Через границу ширины — перерисовать, чтобы кнопки встали на своё
    // место. Слушаем обычный resize, а не событие медиазапроса: в части
    // окружений (эмуляция размера в инструментах разработчика) оно не
    // приходит. Пауза — чтобы не перерисовывать на каждом пикселе.
    // Не чаще раза в полторы секунды: если перерисовка сама поменяет ширину
    // (появилась или пропала полоса прокрутки), это не должно зациклиться.
    var timer = null, lastRedraw = 0;
    global.addEventListener('resize', function(){
      clearTimeout(timer);
      timer = setTimeout(function(){
        var inRail = !!document.querySelector('#tabbar .top-acts');
        if (inRail === wide() || typeof global.render !== 'function') return;
        if (Date.now() - lastRedraw < 1500) return;
        lastRedraw = Date.now();
        global.render();
      }, 150);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

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

  function install(){
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

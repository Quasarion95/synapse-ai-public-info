/* Карта целей на всю оставшуюся область — только для веб-версии.

   fitMindMap в app.js рассчитан на телефон и на ленту: масштаб не крупнее
   единицы, рамка по карте и не выше трёх четвертей окна. На мониторе от этого
   карта сидела маленькой полосой посередине, а ниже неё оставалась пустота —
   жалоба была ровно такая: «маленькая она».

   Здесь на широком окне (от 760 пикселей) рамка тянется от своего верха до
   низа окна, оставляя место только легенде и кнопке «Развернуть», а карта
   вписывается в эту рамку и по ширине, и по высоте — крупнее прежнего, но не
   мельче порога читаемости (см. MIN_SCALE ниже). Кнопки «+» и «−» работают поверх
   этого, как работали. На телефоне всё по-старому: там своя логика вписывания,
   и она уже обсуждена в комментариях fitMindMap.

   app.js не правится. Подгонка срабатывает после каждой отрисовки экрана
   (MutationObserver на #app): колбэк наблюдателя выполняется после того, как
   render() и fitMindMap отработали, поэтому последнее слово остаётся за ним.
   И ещё — при изменении размера окна. */

(function (global) {
  'use strict';

  var WIDE = 760;       // тот же порог «телефон / не телефон», что в fitMindMap
  var MAX_SCALE = 1.8;  // крупнее подписи становятся плакатными

  /* Нижний предел ниже, чем MM_MIN_SCALE в app.js (0.85), и это намеренно.

     При 0.85 карта из четырёх целей на ноутбуке не влезала в ширину рамки:
     крайние задачи резались, внизу появлялась полоса прокрутки. На мониторе
     человек открывает карту, чтобы увидеть всю структуру сразу, и 0.72 —
     подпись около 9,5 пикселя на экране — ещё читается с расстояния
     вытянутой руки. Мельче — уже прокрутка, как и было. */
  var MIN_SCALE = 0.72;

  function active(){
    return typeof S !== 'undefined' && S.view === 'analytics' &&
      !(S.mm && S.mm.full) && global.innerWidth >= WIDE;
  }

  function fit(){
    var on = active();
    document.body.classList.toggle('mappage', on);
    if (!on) return;

    var wrap = document.querySelector('#app .mmwrap');
    var svg = wrap && wrap.querySelector('svg');
    if (!svg) return;

    /* Высота рамки — до низа окна минус то, что стоит под ней: легенда и
       кнопка. Их высоту меряем, а не угадываем: размер шрифта меняют в
       настройках. */
    var below = 0;
    for (var n = wrap.nextElementSibling; n; n = n.nextElementSibling){
      var cs = getComputedStyle(n);
      below += n.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    }
    var top = wrap.getBoundingClientRect().top + (global.scrollY || 0);
    var height = Math.max(360, Math.round(global.innerHeight - top - below - 28));
    wrap.style.height = height + 'px';

    var box = (svg.getAttribute('viewBox') || '').split(' ');
    var vw = Number(box[2]) || 1, vh = Number(box[3]) || 1;
    var availW = wrap.clientWidth - 24, availH = wrap.clientHeight - 24;
    var zoom = (S.mm && S.mm.zoom) || 1;
    var scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, availW / vw, availH / vh)) * zoom;

    svg.setAttribute('width', Math.max(60, Math.round(vw * scale)));
    svg.setAttribute('height', Math.round(vh * scale));
    // Вид — из середины: там ствол, от него цели в обе стороны.
    wrap.scrollLeft = Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2);
    wrap.scrollTop = Math.max(0, (wrap.scrollHeight - wrap.clientHeight) / 2);
  }

  function install(){
    var app = document.getElementById('app');
    if (!app || !global.MutationObserver) return;
    new MutationObserver(fit).observe(app, { childList: true });
    var wait = null;
    global.addEventListener('resize', function(){
      clearTimeout(wait);
      wait = setTimeout(fit, 120);
    });
    fit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  global.SynGoalMap = { fit: fit };
})(window);

/* Списки и заметки — со строкой внизу, как задачи и цели. Только веб.

   В app.js эти экраны заводят новое кнопкой «+ Новый список» / «+ Новая
   запись», которая открывает окно с одним полем. Задачи и цели давно
   создаются строкой внизу экрана — туда пишут, а не нажимают. Здесь то же
   для списков и заметок:

     * Enter (стрелка) — создать список или заметку. Через двоеточие можно
       сразу дать содержимое: «Продукты: хлеб, молоко, яйца» — список с тремя
       пунктами, «Итоги встречи: сроки сдвинули» — заметка с текстом.
       Экран не уходит: новое появляется в общем поле, курсор остаётся в
       строке — так заводят пачкой;
     * искра — написанное уходит Syn как любой запрос, как в задачах. Syn
       сам умеет и списки, и заметки (create_list, create_note).

   Кнопки «+ Новый список» и «+ Новая запись» на этих экранах больше не
   нужны — их прячет lists-notes.css. Действия new-list / new-note в app.js
   остаются: ими пользуются андроид и пустые состояния в других местах. */

(function (global) {
  'use strict';

  var drafts = { lists: '', notes: '' };
  var PH = { lists: 'Продукты: хлеб, молоко, яйца', notes: 'Итоги встречи: сроки сдвинули на неделю' };
  var LABEL = { lists: 'Новый список', notes: 'Новая заметка' };
  var ASK = { lists: 'Создать список', notes: 'Создать заметку' };

  function composer(kind){
    return '<div class="composer ln-composer">' +
      '<form class="say" data-form="ln-add" data-kind="' + kind + '">' +
        '<label class="visually-hidden" for="lnfield">' + LABEL[kind] + '</label>' +
        '<input id="lnfield" type="text" autocomplete="off" enterkeyhint="done" data-kind="' + kind + '" ' +
          'placeholder="' + PH[kind] + '" value="' + esc(drafts[kind] || '') + '">' +
        (typeof barMicHTML === 'function' ? barMicHTML('lnfield') : '') +
        '<button class="ai" type="button" data-act="ln-ai" data-kind="' + kind + '" aria-label="Ассистент Syn" title="Ассистент Syn">' + ICON.ai + '</button>' +
        '<button class="send" type="submit" aria-label="' + ASK[kind] + '">' + NAV_ICONS.send + '</button>' +
      '</form>' +
    '</div>';
  }

  /* «Заголовок: остальное». Двоеточие в самом начале или в конце — не
     разделитель, а часть названия. */
  function split(text){
    var i = text.indexOf(':');
    if (i <= 0 || i === text.length - 1) return [text, ''];
    return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
  }

  function add(d){
    var kind = d.kind === 'notes' ? 'notes' : 'lists';
    var field = $('lnfield');
    var text = field ? field.value.trim() : '';
    if (!text) return;
    if (!canAdd(kind)) return openModal(modalPaywall(kind));
    var parts = split(text), title = parts[0] || text, rest = parts[1];
    drafts[kind] = '';
    keepFocus('#lnfield');
    if (kind === 'lists'){
      var items = rest ? rest.split(/[,;]+/).map(function(s){ return s.trim(); }).filter(Boolean) : [];
      S.lists.push({ id: uid(), title: title, note: '', items: items.map(function(t){
        return { id: uid(), title: t, done: false };
      }) });
      commit('Список «' + title + '»' + (items.length ? ' — ' + items.length + ' ' + plural(items.length, 'пункт', 'пункта', 'пунктов') : ''));
    } else {
      S.notes.push({ id: uid(), title: title, body: rest });
      commit('Заметка «' + title + '»');
    }
  }

  function ai(d){
    var field = $('lnfield');
    var draft = field ? field.value.trim() : '';
    S.synIntent = '';
    S.synGoalCreate = false;
    synRender(draft, '');
    if (draft){
      drafts[d.kind === 'notes' ? 'notes' : 'lists'] = '';
      synSend(draft);
    }
  }

  function wrap(kind){
    var view = VIEWS[kind];
    if (!view) return;
    var base = view.render;
    view.render = function(){
      return '<div class="ln-page ln-' + kind + '">' + base.apply(this, arguments) + '</div>' + composer(kind);
    };
  }

  function install(){
    if (typeof VIEWS === 'undefined' || typeof ACTS === 'undefined') return;
    wrap('lists');
    wrap('notes');
    ACTS['ln-add'] = add;
    ACTS['ln-ai'] = ai;
    document.addEventListener('input', function(e){
      var t = e.target;
      if (t && t.id === 'lnfield') drafts[t.getAttribute('data-kind') === 'notes' ? 'notes' : 'lists'] = t.value;
    });
    if (typeof S !== 'undefined' && (S.view === 'lists' || S.view === 'notes') && typeof global.render === 'function') global.render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

/* ============ СПИСКИ: перестановка блоков удержанием ============

   Просьба владельца 25.10.2026: «при зажатии блоки можно менять местами, и
   чтобы они перестраивались между собой как лего». Тот же приём, что у
   карточек заметок (web/notes-edit.js): блок едет за пальцем или мышью, а
   соседи расступаются — блок ставится в разметке на место того, над которым
   он сейчас, а сдвиг соседей проигрывается анимацией (FLIP).

   Работает во всех видах: доска, плитки, гармошка, столбик и левая колонка
   «Двух колонок». Пальцу — удержание (так перенос не путается с прокруткой
   и свайпом), мыши — удержание или движение с зажатой кнопкой. Поля ввода и
   кнопки внутри списка перенос не начинают: там пишут, отмечают и удаляют. */
(function (global) {
  'use strict';

  var HOLD = 320, MOVE_MOUSE = 6, MOVE_TOUCH = 9;
  var CARD = '.listcol[data-list], .listtile[data-list], .accitem[data-list], .ls-item[data-list], article.row-card[data-list]';
  var drag = null, raf = 0;

  function cardsOf(box){
    return Array.prototype.filter.call(box.children, function(c){ return c.matches && c.matches(CARD); });
  }
  function zoomOf(box, br){ return box.offsetWidth ? br.width / box.offsetWidth : 1; }
  // Место блока без учёта его сдвига: offset* transform не видят.
  function slot(c, br, z){
    return { l: br.left + c.offsetLeft * z, t: br.top + c.offsetTop * z, w: c.offsetWidth * z, h: c.offsetHeight * z };
  }
  // offsetLeft/Top считаются от ближайшего позиционированного предка —
  // контейнер списков им делаем мы (класс ld-box, position:relative).
  function boxOf(card){ return card.parentElement; }

  function lift(){
    if (!drag || drag.active) return;
    var box = boxOf(drag.card);
    if (!box || cardsOf(box).length < 2){ cancel(); return; }
    box.classList.add('ld-box');
    var br = box.getBoundingClientRect(), z = zoomOf(box, br), s = slot(drag.card, br, z);
    drag.active = true;
    drag.box = box;
    drag.gx = drag.x - s.l; drag.gy = drag.y - s.t;
    if (global.swipe){ if (global.swipe.лицо) global.swipe.лицо.style.left = ''; global.swipe.карточка.classList.remove('swiping'); global.swipe = null; }
    if (typeof swipeCloseAll === 'function') swipeCloseAll(null);
    drag.card.classList.add('ld-lifted');
    document.documentElement.classList.add('ld-dragging');
    if (navigator.vibrate && !drag.mouse){ try { navigator.vibrate(18); } catch (e) {} }
    follow();
    tick();
  }

  function follow(){
    var box = drag.box, br = box.getBoundingClientRect(), z = zoomOf(box, br), s = slot(drag.card, br, z);
    drag.card.style.transform = 'translate(' + ((drag.x - drag.gx - s.l) / z) + 'px,' + ((drag.y - drag.gy - s.t) / z) + 'px)';
  }

  function reorder(){
    var box = drag.box, br = box.getBoundingClientRect(), z = zoomOf(box, br);
    var cards = cardsOf(box), over = null;
    for (var i = 0; i < cards.length; i++){
      if (cards[i] === drag.card) continue;
      var s = slot(cards[i], br, z);
      if (drag.x >= s.l && drag.x <= s.l + s.w && drag.y >= s.t && drag.y <= s.t + s.h){ over = cards[i]; break; }
    }
    if (!over) return;
    var before = cards.map(function(c){ return { c: c, l: c.offsetLeft, t: c.offsetTop }; });
    var from = cards.indexOf(drag.card), to = cards.indexOf(over);
    box.insertBefore(drag.card, from < to ? over.nextSibling : over);
    before.forEach(function(b){
      if (b.c === drag.card) return;
      var dx = b.l - b.c.offsetLeft, dy = b.t - b.c.offsetTop;
      if (!dx && !dy) return;
      b.c.classList.remove('ld-shift');
      b.c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      void b.c.offsetWidth;
      b.c.classList.add('ld-shift');
      b.c.style.transform = '';
    });
    follow();
  }

  // Каждый кадр: у края окна — прокрутка, и блок с решением следом.
  function tick(){
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function step(){
      if (!drag || !drag.active) return;
      var edge = 70, h = global.innerHeight, v = 0;
      if (drag.y < edge) v = -Math.ceil((edge - drag.y) / 6);
      else if (drag.y > h - edge - 20) v = Math.ceil((drag.y - (h - edge - 20)) / 6);
      if (v){ global.scrollBy(0, v); follow(); reorder(); }
      raf = requestAnimationFrame(step);
    });
  }

  function cancel(){
    if (!drag) return;
    clearTimeout(drag.timer);
    drag = null;
  }

  function drop(){
    cancelAnimationFrame(raf);
    var d = drag;
    drag = null;
    document.documentElement.classList.remove('ld-dragging');
    if (!d) return;
    clearTimeout(d.timer);
    if (!d.active) return;
    var ids = cardsOf(d.box).map(function(c){ return c.getAttribute('data-list'); });
    d.card.classList.remove('ld-lifted');
    d.card.style.transform = '';
    cardsOf(d.box).forEach(function(c){ c.classList.remove('ld-shift'); });
    // Щелчок, которым кончается перенос, список не открывает и пункт не отмечает.
    global.перенёсВ = Date.now();
    var rank = {};
    ids.forEach(function(id, i){ rank[id] = i; });
    var прежний = S.lists.map(function(l){ return l.id; }).filter(function(id){ return id in rank; }).join();
    if (ids.join() === прежний) return;
    S.lists.sort(function(a, b){
      return (a.id in rank ? rank[a.id] : 1e9) - (b.id in rank ? rank[b.id] : 1e9);
    });
    commit();
  }

  function wire(){
    document.addEventListener('pointerdown', function(e){
      if (S.view !== 'lists') return;
      var t = e.target;
      if (!t || !t.closest) return;
      var card = t.closest(CARD);
      if (!card || !card.parentElement) return;
      // Где пишут, отмечают и удаляют — там не берём.
      if (t.closest('input, textarea, select, [contenteditable="true"], .side, .rowadd, .kill')) return;
      var mouse = e.pointerType === 'mouse';
      if (mouse && e.button !== 0) return;
      drag = { card: card, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, mouse: mouse,
               active: false, timer: setTimeout(lift, HOLD) };
    });
    document.addEventListener('pointermove', function(e){
      if (!drag) return;
      drag.x = e.clientX; drag.y = e.clientY;
      if (!drag.active){
        var dist = Math.max(Math.abs(drag.x - drag.x0), Math.abs(drag.y - drag.y0));
        if (drag.mouse){ if (dist > MOVE_MOUSE && (e.buttons & 1)){ clearTimeout(drag.timer); lift(); } }
        else if (dist > MOVE_TOUCH) cancel();   // это прокрутка или свайп
        return;
      }
      follow();
      reorder();
    });
    document.addEventListener('pointerup', drop);
    document.addEventListener('pointercancel', function(){ if (drag && drag.active) drop(); else cancel(); });
    // Пока блок несут, страница под пальцем не прокручивается.
    document.addEventListener('touchmove', function(e){ if (drag && drag.active) e.preventDefault(); }, { passive: false });
    // Удержание на телефоне вызывает меню и выделение текста — здесь оно значит «взять блок».
    document.addEventListener('contextmenu', function(e){
      if (S.view === 'lists' && e.target && e.target.closest && e.target.closest(CARD) && typeof touchUI === 'function' && touchUI()) e.preventDefault();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})(window);

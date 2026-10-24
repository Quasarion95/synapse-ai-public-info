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

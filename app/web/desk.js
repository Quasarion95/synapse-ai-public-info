/* Общая основа дашбордов веб-версии.

   Раздел, который на широком окне показывается одним экраном, а не
   вкладками, — сейчас это «Мои финансы» (finance-desk.js) — устроен так:
   шапка, ряд итогов, зоны в сетке. Здесь то, что не зависит от содержимого:
   порог ширины, перерисовка при его пересечении и разметка заголовка зоны,
   пустой зоны и плитки итогов. Новый дашборд берёт это отсюда же.

   Как и остальное в web/, это часть только веб-версии: внутри андроид-обёртки
   index.html эти файлы не подключает. Загружается раньше app.js, поэтому к
   S, esc и render обращаемся только изнутри функций. */

(function (global) {
  'use strict';

  /* Порог — 1240 пикселей, тот же, с которого app.css раскладывает экраны в
     две колонки. Уже — колонка текста меньше 900 пикселей, и в неё не
     помещаются даже три зоны в ряд. */
  var WIDE = global.matchMedia ? global.matchMedia('(min-width:1240px)') : null;

  /// Окно достаточно широкое, и это не андроид-обёртка.
  function fits(){
    return !!(WIDE && WIDE.matches) && !global.AndroidVoice;
  }

  /* Какие разделы умеют показываться дашбордом и включён ли он сейчас. У
     раздела свой переключатель («Вкладками»), поэтому решение — функция
     раздела, а не общий флаг. */
  var pages = {};

  function register(view, isOn){ pages[view] = isOn; }

  function active(view){
    return !!(pages[view] && pages[view]());
  }

  /* Окно растянули или сузили — раскладка меняется сразу, а не со следующим
     нажатием.

     Слушаем resize, а не change у matchMedia: при эмуляции размера и в части
     встроенных браузеров change не приходит, и дашборд оставался в окне, куда
     уже не помещался. Перерисовываем, только когда порог действительно
     пересекли, — иначе каждое движение края окна стоило бы полной отрисовки. */
  if (WIDE){
    var былоШироко = WIDE.matches;
    var ждём = false;
    global.addEventListener('resize', function(){
      if (ждём) return;
      ждём = true;
      // Таймер, а не requestAnimationFrame: кадров не бывает у окна, которое
      // сейчас не рисуется, и перерисовка ждала бы, пока на него посмотрят.
      global.setTimeout(function(){
        ждём = false;
        if (WIDE.matches === былоШироко) return;
        былоШироко = WIDE.matches;
        if (typeof S !== 'undefined' && pages[S.view] && typeof render === 'function') render();
      }, 120);
    });
  }

  /* Заголовок зоны: название, короткий итог справа и «+», если в зоне можно
     что-то завести. Плюс — значок, а не «+ Новый долг»: в шапке узкой зоны
     слова съедали место у итога, ради которого на неё и смотрят. */
  function zoneHead(title, note, addAct, addLabel, extra){
    return '<div class="dz-head">' +
      '<h3>' + esc(title) + '</h3>' +
      (note ? '<span class="dz-note">' + note + '</span>' : '') +
      (addAct
        ? '<button class="dz-add" data-act="' + addAct + '"' + (extra || '') +
            ' title="' + esc(addLabel) + '" aria-label="' + esc(addLabel) + '">+</button>'
        : '') +
    '</div>';
  }

  /// Пустая зона — одна строка пояснения и кнопка, а не большая заглушка с
  /// картинкой: рядом стоят шесть других зон, и пустая не должна их глушить.
  function zoneEmpty(text, act, label, extra){
    return '<div class="dz-empty"><p>' + esc(text) + '</p>' +
      (act ? '<button class="btn sm" data-act="' + act + '"' + (extra || '') + '>' + esc(label) + '</button>' : '') +
    '</div>';
  }

  /// Плитка итогов: подпись, число и строка, объясняющая число. С act плитка —
  /// кнопка: число меняют там же, где на него смотрят.
  function kpi(caption, value, tone, note, act, noteTone, extra){
    var tag = act ? 'button' : 'div';
    return '<' + tag + ' class="dk' + (tone ? ' ' + tone : '') + '"' +
        (act ? ' data-act="' + act + '"' + (extra || '') : '') + '>' +
      '<span class="dk-c">' + esc(caption) + '</span>' +
      '<b class="dk-v">' + esc(value) + '</b>' +
      '<span class="dk-n' + (noteTone ? ' ' + noteTone : '') + '">' + esc(note) + '</span>' +
    '</' + tag + '>';
  }

  global.SynDesk = {
    fits: fits, register: register, active: active,
    zoneHead: zoneHead, zoneEmpty: zoneEmpty, kpi: kpi
  };
})(window);

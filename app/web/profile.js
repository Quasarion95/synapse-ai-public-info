/* «Профиль» в новой стилистике — только веб.

   В app.js экран собран двумя серыми карточками: аватар с кнопкой и поле
   имени, ниже — текст «Где записи». Всё верно, но рядом с яркими разделами
   и страницей подписки он выглядел черновиком.

   Здесь та же информация в том же порядке, разложенная как у подписки:
     * сверху баннер фирменного цвета: крупный аватар, имя и короткая
       сводка — сколько задач закрыто, сколько целей, списков и заметок.
       Цифры берутся из тех же S.tasks / S.goals / S.lists / S.notes;
     * ниже две карточки — «Имя и фото» и «Где хранятся записи».

   Данные и действия — из app.js без изменений: поле имени с data-name
   (его сохраняет общий обработчик ввода), avatar-pick, avatar-clear,
   переход в «Данные». Имя в баннере меняется прямо по мере ввода. */

(function (global) {
  'use strict';

  function count(n, one, few, many){ return '<b>' + n + '</b>' + plural(n, one, few, many); }

  function stats(){
    var done = S.tasks.filter(function(t){ return t.done; }).length;
    return '<div class="pf-stats">' +
      '<span>' + count(done, 'задача сделана', 'задачи сделано', 'задач сделано') + '</span>' +
      '<span>' + count(S.goals.length, 'цель', 'цели', 'целей') + '</span>' +
      '<span>' + count(S.lists.length, 'список', 'списка', 'списков') + '</span>' +
      '<span>' + count(S.notes.length, 'заметка', 'заметки', 'заметок') + '</span>' +
    '</div>';
  }

  function displayName(){
    var name = (S.profile.name || '').trim();
    return name || 'Ваш профиль';
  }

  function hero(){
    return '<section class="pf-hero">' +
      '<button class="pf-ava" data-act="avatar-pick" title="' + (S.profile.avatar ? 'Сменить фото' : 'Загрузить фото') + '">' +
        avatarHTML('lg') + '<i class="pf-cam" aria-hidden="true">' + CAM + '</i></button>' +
      '<div class="pf-who">' +
        (isPro() ? '<span class="pf-badge">★ Synapse Pro</span>' : '') +
        '<h1 class="pf-name">' + esc(displayName()) + '</h1>' +
        '<p>Имя и фото видите только вы: они хранятся в этом браузере.</p>' +
        stats() +
      '</div>' +
      '<i class="pf-orb"></i>' +
    '</section>';
  }

  var CAM = '<svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.3-2h5l1.3 2h1.7A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>';
  var LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
  var USER = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg>';

  function cards(){
    var me = '<section class="card pf-card">' +
      '<div class="pf-h"><i class="pf-ic" style="--c:var(--accent)">' + USER + '</i><b>Имя и фото</b></div>' +
      '<div class="field">' +
        '<label for="pname">Как к вам обращаться</label>' +
        '<input class="inp" id="pname" data-name type="text" maxlength="40" placeholder="Например, Аня" ' +
          'value="' + esc(S.profile.name) + '" autocomplete="name">' +
      '</div>' +
      '<div class="pf-acts">' +
        '<button class="btn sm" data-act="avatar-pick">' + (S.profile.avatar ? 'Сменить фото' : 'Загрузить фото') + '</button>' +
        (S.profile.avatar ? '<button class="btn sm soft" data-act="avatar-clear">Убрать фото</button>' : '') +
      '</div>' +
    '</section>';

    var where = '<section class="card pf-card">' +
      '<div class="pf-h"><i class="pf-ic" style="--c:var(--c-lists)">' + LOCK + '</i><b>Где хранятся записи</b></div>' +
      '<p class="pf-txt">Только в этом браузере. Входа нет и не нужно: задачи, цели, списки и заметки лежат на этом устройстве и никуда не отправляются.</p>' +
      '<p class="pf-txt">Подписка включается кодом с сайта — он и опознаёт вас, если оплата есть.</p>' +
      '<div class="pf-acts">' +
        '<button class="btn sm soft" data-act="go" data-view="settings-data">Сохранить копию</button>' +
      '</div>' +
    '</section>';

    return '<div class="pf-grid">' + me + where + '</div>';
  }

  function render(){
    return pageHead('', '', 'settings') + '<div class="pf">' + hero() + cards() + '</div>';
  }

  /* Имя в баннере — вслед за полем. Сохраняет его app.js (data-name), а
     перерисовку он сознательно не делает, чтобы не увести курсор. */
  function onInput(e){
    var t = e.target;
    if (!t || t.id !== 'pname') return;
    var h = document.querySelector('.pf-name');
    if (h) h.textContent = (t.value || '').trim() || 'Ваш профиль';
    var big = document.querySelector('.pf-ava .avatar');
    if (big && !S.profile.avatar && typeof initials === 'function'){
      if ((t.value || '').trim()){ big.classList.remove('anon'); big.textContent = initials(); }
    }
  }

  function install(){
    if (typeof VIEWS === 'undefined' || !VIEWS.profile) return;
    VIEWS.profile.render = render;
    document.addEventListener('input', onInput);
    if (typeof S !== 'undefined' && S.view === 'profile' && typeof global.render === 'function') global.render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

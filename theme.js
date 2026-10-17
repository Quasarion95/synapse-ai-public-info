/*
  Переключатель темы для страниц сайта.

  Тема — светлая или тёмная, третьего состояния нет. «Как в системе» звучит
  разумно, но означает переключатель, который не отвечает на вопрос «какая
  сейчас тема»: нажал — и не знаешь, что получишь. Система спрашивается ровно
  один раз, до первого выбора, чтобы ночью страница не била по глазам.

  Выбор хранится в localStorage под тем же ключом, что и в веб-версии
  приложения, — человек, переключивший тему на лендинге, не должен переключать
  её заново, открыв планировщик.

  Скрипт подключается в <head> и до отрисовки ставит атрибут на <html>: иначе
  тёмная страница на мгновение мигнёт светлой.
*/
(function () {
  var KEY = 'synapse.site.theme';

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function current() {
    var saved = stored();
    if (saved === 'light' || saved === 'dark') return saved;
    return systemPrefersDark() ? 'dark' : 'light';
  }

  // Подписи кнопки — на языке страницы: на английской политике русская
  // подсказка «Включить тёмную тему» была бы непонятна.
  var EN = /^en/i.test(document.documentElement.lang || '');
  var LABELS = EN
    ? { toLight: 'Switch to light theme', toDark: 'Switch to dark theme', light: 'Light theme', dark: 'Dark theme' }
    : { toLight: 'Включить светлую тему', toDark: 'Включить тёмную тему', light: 'Светлая тема', dark: 'Тёмная тема' };

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#151a1e' : '#f4f6f5');
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-label', theme === 'dark' ? LABELS.toLight : LABELS.toDark);
      buttons[i].setAttribute('title', theme === 'dark' ? LABELS.light : LABELS.dark);
      buttons[i].textContent = theme === 'dark' ? '☀' : '☾';
    }
    swapShots(theme);
  }

  /* Скриншоты — в цвет темы страницы. У картинки со снимком приложения есть
     пара: data-dark-src. На тёмной странице светлый снимок горел самым ярким
     пятном экрана и выглядел чужим. Светлый адрес запоминаем в
     data-light-src, чтобы вернуть его при обратном переключении. */
  function swapShots(theme) {
    var shots = document.querySelectorAll('img[data-dark-src]');
    for (var i = 0; i < shots.length; i++) {
      var img = shots[i];
      if (!img.getAttribute('data-light-src')) img.setAttribute('data-light-src', img.getAttribute('src'));
      var want = theme === 'dark' ? img.getAttribute('data-dark-src') : img.getAttribute('data-light-src');
      if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    }
  }

  // До отрисовки: атрибут ставится сразу, кнопки подпишутся, когда появятся.
  apply(current());

  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(next);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('[data-theme-toggle]') : null;
    if (!button) return;
    event.preventDefault();
    toggle();
  });

  document.addEventListener('DOMContentLoaded', function () { apply(current()); });
})();

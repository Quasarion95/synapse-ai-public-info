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

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1d2420' : '#f5f1e8');
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
      buttons[i].setAttribute('title', theme === 'dark' ? 'Светлая тема' : 'Тёмная тема');
      buttons[i].textContent = theme === 'dark' ? '☀' : '☾';
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

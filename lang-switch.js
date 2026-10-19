/* Переключатель языка сайта (RU | EN в шапке главной).

   Русская главная — /, английская — /en/. Выбор запоминается в том же ключе,
   что и язык веб-версии (syn.lang, app/i18n.js): кто переключил сайт на
   английский и нажал «Open Synapse», попадает в приложение уже на английском.
   Запоминаем только по нажатию — человек, заглянувший на /en/ из любопытства,
   язык приложения не меняет. */
(function () {
  document.addEventListener('click', function (event) {
    var link = event.target.closest ? event.target.closest('[data-set-lang]') : null;
    if (!link) return;
    try { localStorage.setItem('syn.lang', link.getAttribute('data-set-lang') === 'en' ? 'en' : 'ru'); } catch (e) {}
  });
})();

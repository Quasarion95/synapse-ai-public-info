/* «Моя подписка» как страница тарифов — только веб.

   В app.js экран собран лентой карточек: строка тарифов, карточка состояния,
   таблица «Что входит» текстом. Всё верно по смыслу, но выглядит как
   справка, а не как предложение, — и в монотонной палитре терялось вовсе.

   Здесь та же информация, разложенная как у продуктовых компаний:
     * сверху яркий баннер: что даёт Pro, одной фразой, и где человек сейчас;
     * три тарифа карточками, месячный выделен («Популярный»), годовой
       помечен «Выгоднее всего» с ценой в месяц и экономией — посчитанными
       из тех же цен PLANS, а не вписанными руками;
     * сравнение «Бесплатно / Pro» с галочками;
     * «Уже оплатили?», способы оплаты и короткие ответы.

   Данные и действия — из app.js без изменений: цены PLANS, пределы
   FREE_LIMITS и норма Syn, ссылки на ../checkout/?plan=…, действия
   pro-code, pro-refresh, pro-copy, pro-forget и страница ../account/.
   Подписчику цены не показываем — как и прежний экран: он приходит
   посмотреть срок и код. */

(function (global) {
  'use strict';

  function num(price){ return Number(String(price).replace(/[^\d]/g, '')) || 0; }
  function money(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; }

  var PER = { 'pro.weekly': '/ неделя', 'pro.monthly': '/ месяц', 'pro.yearly': '/ год' };
  var NOTE = {
    'pro.weekly': 'Попробовать всё на своих задачах',
    'pro.monthly': 'Для тех, кто планирует каждый день'
  };

  function limits(){
    var syn = typeof PLAN_SYN_LIMITS === 'object' ? PLAN_SYN_LIMITS : {};
    return {
      synFree: typeof FREE_SYN_LIMIT === 'number' ? FREE_SYN_LIMIT : 20,
      synMonth: syn['pro.monthly'] || 180,
      synYear: syn['pro.yearly'] || 500,
      goals: FREE_LIMITS.goals, lists: FREE_LIMITS.lists, notes: FREE_LIMITS.notes,
      palettes: (typeof FREE_LOOKS === 'object' && FREE_LOOKS.palettes) || 2
    };
  }

  function hero(pro, expired){
    var L = limits();
    var now, title, text, acts = '';
    if (pro){
      title = 'Synapse Pro открыт';
      text = esc(planTitle(S.pro.plan)) + (S.pro.expiresAt ? ' · до ' + esc(humanDateTime(S.pro.expiresAt)) : '') +
        ' · открыты все разделы, Syn отвечает по норме тарифа.';
      now = 'Pro · ' + esc(planTitle(S.pro.plan));
      acts = '<button class="sx-hbtn" data-act="pro-refresh">Проверить</button>' +
        '<a class="sx-hbtn" href="../account/">Управление и отмена</a>' +
        '<button class="sx-hbtn ghost" data-act="pro-forget">Отвязать</button>';
    } else if (expired){
      title = 'Подписка закончилась — записи на месте';
      text = esc(planTitle(S.pro.plan)) + ' · закончилась ' + esc(humanDateTime(S.pro.expiresAt)) +
        '. Пока подписка не продлена, новые цели, списки и заметки заводить нельзя, а Syn отвечает по бесплатной норме.';
      now = 'Подписка закончилась';
      acts = '<button class="sx-hbtn" data-act="pro-refresh">Проверить продление</button>' +
        '<a class="sx-hbtn" href="../account/">Управление и оплата</a>' +
        '<button class="sx-hbtn ghost" data-act="pro-forget">Отвязать код</button>';
    } else {
      title = 'Всё, что держит жизнь в порядке, — без ограничений';
      text = 'Цели с этапами, списки, заметки, финансы, все режимы помодоро и звуки медитации. ' +
        'Syn отвечает до ' + L.synMonth + ' раз в день, на годовом — до ' + L.synYear + '. ' +
        'Один код — и в браузере, и на телефоне.';
      now = 'Бесплатный доступ';
    }
    var code = (pro || expired) && S.pro.code
      ? '<div class="sx-code"><span>Код подписки</span><b class="mono">' + esc(S.pro.code) + '</b>' +
        '<button data-act="pro-copy">Скопировать</button></div>'
      : '';
    return '<section class="sx-hero' + (pro ? ' on' : '') + '">' +
      '<span class="sx-badge">★ Synapse Pro</span>' +
      '<h1>' + esc(title) + '</h1>' +
      '<p>' + text + '</p>' +
      code +
      (acts ? '<div class="sx-hacts">' + acts + '</div>' : '') +
      '<div class="sx-now">Сейчас<b>' + now + '</b></div>' +
      '<i class="sx-orb"></i>' +
    '</section>';
  }

  function plans(){
    var L = limits();
    var month = 0;
    PLANS.forEach(function(p){ if (p.id === 'pro.monthly') month = num(p.price); });
    return '<div class="sx-plans">' + PLANS.map(function(p){
      var price = num(p.price);
      var per = PER[p.id] || '';
      var note = NOTE[p.id] || '';
      var tag = '';
      if (p.main) tag = '<span class="sx-tag">Популярный</span>';
      if (p.id === 'pro.yearly' && month){
        // Экономия рублями, а не процентами: для цен больше сотни «1 890 ₽»
        // ощущается весомее, чем «32%».
        var perMonth = price / 12, save = month * 12 - price;
        note = '≈ ' + money(perMonth) + ' в месяц · <span class="sx-save">экономия ' + money(save) + ' в год</span>';
        tag = '<span class="sx-tag best">Выгоднее всего</span>';
      }
      var feats = p.id === 'pro.yearly'
        ? ['Всё из месячного', 'Syn — до ' + L.synYear + ' запросов в день']
        : p.id === 'pro.monthly'
          ? ['Все разделы без ограничений', 'Syn — ' + L.synMonth + ' запросов в день', 'Все темы и звуки']
          : ['Все разделы без ограничений', 'Syn — ' + L.synMonth + ' запросов в день'];
      return '<a class="card sx-plan' + (p.main ? ' main' : '') + '" href="../checkout/?plan=' + p.id + '">' + tag +
        '<span class="sx-nm">' + esc(p.title) + '</span>' +
        '<span class="sx-pr">' + esc(money(price)) + ' <small>' + esc(per) + '</small></span>' +
        '<span class="sx-per">' + note + '</span>' +
        '<ul>' + feats.map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
        '<span class="btn' + (p.main ? '' : ' soft') + ' sx-buy">' + (p.main ? 'Оформить Pro' : 'Оформить') + '</span>' +
      '</a>';
    }).join('') + '</div>';
  }

  function compare(){
    var L = limits();
    var rows = [
      ['tasks', '✓', 'Задачи, блоки дня, повторы', 'без ограничений', 'без ограничений'],
      ['goals', '◎', 'Цели с этапами', L.goals + ' ' + plural(L.goals, 'цель', 'цели', 'целей'), 'без ограничений'],
      ['lists', '≡', 'Списки', L.lists + ' ' + plural(L.lists, 'список', 'списка', 'списков'), 'без ограничений'],
      ['notes', '✎', 'Заметки', L.notes + ' ' + plural(L.notes, 'заметка', 'заметки', 'заметок'), 'без ограничений'],
      ['focus', '✦', 'Ассистент Syn', L.synFree + ' запросов в день', L.synMonth + ' в день, на годовом ' + L.synYear],
      ['pomo', '◷', 'Метод Помодоро', 'самый короткий режим', 'все режимы'],
      ['med', '≈', 'Медитация', 'один звук', 'все звуки и своя длительность'],
      ['sub', '◐', 'Оформление', L.palettes + ' темы, одна форма отметки', 'все темы, формы и цвета'],
      ['fin', '₽', 'Мои финансы', 'по две записи каждого вида', 'без ограничений']
    ];
    return '<section class="card sx-compare">' +
      '<div class="sx-row sx-head"><span>Что входит</span><span>Бесплатно</span><span>Pro</span></div>' +
      rows.map(function(r){
        return '<div class="sx-row"><span class="sx-f"><i style="--c:var(--c-' + r[0] + ')">' + r[1] + '</i>' + esc(r[2]) + '</span>' +
          '<span class="sx-free">' + esc(r[3]) + '</span><span class="sx-pro">' + esc(r[4]) + '</span></div>';
      }).join('') +
    '</section>';
  }

  function bottom(pro){
    var codeCard = pro ? '' :
      '<section class="card sx-paid">' +
        '<b>Уже оплатили?</b>' +
        '<span>Код приходит после оплаты — он включает Pro и здесь, и на телефоне.</span>' +
        '<button class="btn sx-enter" data-act="pro-code">Ввести код</button>' +
        '<span class="sx-pays">Оплата на сайте: <i>Карта</i><i>СБП</i></span>' +
      '</section>';
    var faq = '<section class="card sx-faq">' +
      '<div><b>Как отменить?</b><span>На странице аккаунта — там же управление подпиской и оплатой.</span></div>' +
      '<div><b>Что будет с записями, если не продлить?</b><span>Ничего не пропадёт. Новые цели, списки и заметки — по бесплатной норме, Syn — по бесплатной норме.</span></div>' +
      '<div><b>Работает на телефоне?</b><span>Один код открывает Pro и в браузере, и в приложении. Записи при этом свои у каждого: перенести можно файлом в разделе «Данные».</span></div>' +
    '</section>';
    return '<div class="sx-bottom' + (pro ? ' solo' : '') + '">' + codeCard + faq + '</div>';
  }

  function render(){
    var pro = isPro();
    var expired = !pro && typeof подпискаИстекла === 'function' && подпискаИстекла();
    return '<div class="sx">' + hero(pro, expired) + (pro ? '' : plans()) + compare() + bottom(pro) + '</div>';
  }

  function install(){
    if (typeof VIEWS === 'undefined' || !VIEWS.subscription || typeof PLANS === 'undefined') return;
    VIEWS.subscription.render = render;
    if (typeof S !== 'undefined' && S.view === 'subscription' && typeof global.render === 'function') global.render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

/* Мои финансы одним экраном — только для веб-версии.

   Зачем отдельный файл, а не ещё одна функция в app.js.

   app.js общий у веба и андроида: апк собирается из той же папки. Телефону
   дашборд не нужен — на 400 пикселях семь зон превращаются в ленту длиной в
   пять экранов, и вкладки там честнее. А широкому окну браузера вкладки как
   раз мешают: человек открывает «Сводку», видит «Я должен 12 000», идёт во
   «Долги» узнать кому, потом в «Подписки» — сколько ещё уйдёт, и держит
   числа в голове, перескакивая между экранами.

   Поэтому дашборд живёт здесь, в web/:
     * index.html не подключает эту папку, если страница открыта внутри
       андроид-обёртки (признак — window.AndroidVoice);
     * айфон — нативное приложение, его это не касается вовсе;
     * считать здесь ничего нового не нужно: все суммы берутся теми же
       функциями app.js, что и во вкладках, — finMonthTotals, finByCat,
       finDebtSums и остальными. Две реализации одной арифметики разошлись бы
       на первой же правке (так уже было с разбором строки, см. stripMoneyWords).
       Действия — тоже те же: «Оплатить», «Платёж», «Отложить» открывают те же
       окна, что и во вкладках.

   Файл подключается ДО app.js: тогда первая же отрисовка уже знает про
   дашборд, и на широком экране не мелькают вкладки. Глобальные S,
   finMoney и прочие к этому моменту ещё не объявлены — поэтому здесь к ним
   обращаются только изнутри функций, которые вызываются после загрузки. */

(function (global) {
  'use strict';

  /* Порог ширины, перерисовка при его пересечении и разметка зон — общие с
     другими дашбордами и живут в desk.js. */
  var fits = SynDesk.fits;
  var zoneHead = SynDesk.zoneHead;
  var zoneEmpty = SynDesk.zoneEmpty;
  var kpi = SynDesk.kpi;

  /// Показывать ли дашборд сейчас. Вкладки остаются по желанию: кто привык к
  /// ним, переключается кнопкой «Вкладками», и выбор запоминается.
  function on(){
    return fits() && S.finLayout !== 'tabs';
  }
  SynDesk.register('finance', on);

  /* ============ ЭКРАН ============

     Зоны и что в каждой:

       шапка      — месяц (один на весь экран) и переключатель на вкладки;
       итоги      — шесть чисел, на которые смотрят первыми;
       разбор     — полгода столбиками и куда уходят деньги в этом месяце;
       траты      — лента месяца, справа во всю высоту (записывает Syn снизу);
       конверты   — сколько ещё можно потратить по категориям;
       платежи    — что уйдёт в этом месяце и что уже оплачено;
       долги      — открытые, просроченные первыми;
       копилки    — сколько собрано и сколько откладывать, чтобы успеть.

     Зоны связаны между собой: щелчок по месяцу в столбиках листает весь
     экран, щелчок по категории в разборе оставляет в ленте только её. */
  function vDesk(){
    var key = finShownMonth();
    // Обёртка нужна ради container query: раскладку зон меряем по ширине
    // дашборда, а контейнер не может запрашивать сам себя.
    // Пока остаток не назван — сначала рассказ Syn, а не нули в плитках.
    var start = !S.finance.opening && !S.finance.openingHidden;
    return '<div class="desk-wrap"><div class="desk fin' + (start ? ' has-start' : '') + '">' +
      deskHead(key) +
      (start ? '<section class="desk-zone z-start finhint">' + finStartHTML() + '</section>' : '') +
      zoneKpi(key) +
      zoneAnalytics(key) +
      zoneFeed(key) +
      zoneBudgets(key) +
      zonePayments(key) +
      zoneDebts() +
      zoneJars() +
    '</div></div>';
  }

  /* Шапка в три части: слева название и прямо под ним месяц — то, что
     решает, какие числа на экране; посередине курсы — справка, на которую
     бросают взгляд; справа переключатель вида. Подпись «Октябрь 2026 — всё
     на одном экране» ушла: месяц и так написан под названием, а «всё на
     одном экране» видно без слов. */
  function deskHead(key){
    return '<div class="desk-head">' +
      '<div class="desk-title">' +
        '<h1 class="page">Мои финансы</h1>' +
        finMonthBar() +
      '</div>' +
      ratesStrip() +
      // Валюта — слева от переключателя вида: обе кнопки про то, как
      // показан раздел, и обе живут здесь, а не в левом меню.
      '<div class="desk-acts">' + finCurButton() +
        '<button class="btn sm soft desk-switch" data-act="fin-layout" data-to="tabs" ' +
          'title="Показывать раздел вкладками, как на телефоне">Вкладками</button>' +
      '</div>' +
    '</div>';
  }

  /// Ссылка «подробнее» внизу зоны: уводит во вкладку с полной таблицей.
  function zoneMore(tab, label){
    return '<button class="dz-more" data-act="fin-desk-open" data-tab="' + tab + '">' +
      esc(label) + ' ' + ICON.right + '</button>';
  }

  /* ---- итоги ----

     Шесть чисел в ряд. Под каждым — строка, объясняющая число: «Ушло 48 000»
     само по себе ничего не говорит, «+12% к сентябрю» — говорит. */
  function zoneKpi(key){
    var now = finMonthTotals(key);
    var prev = finMonthTotals(finMonthShift(key, -1));
    var debts = finDebtSums();
    var free = finBalance() - finSaved();
    var open = S.finance.debts.filter(function(d){ return !d.closed; });
    var today = isoOf(todayDate());
    var late = open.filter(function(d){ return d.mine && d.due && d.due < today; }).length;
    var oweN = open.filter(function(d){ return d.mine; }).length;
    var owedN = open.length - oweN;
    var jars = S.finance.jars.length;

    var diff = now.spent - prev.spent;
    var vsPrev = prev.spent
      ? (diff > 0 ? '+' : diff < 0 ? '−' : '') + Math.round(Math.abs(diff) * 100 / prev.spent) + '% к ' + monthDative(finMonthShift(key, -1)).split(' ')[0]
      : 'прошлый месяц пуст';

    return '<section class="desk-zone z-kpi" aria-label="Итоги">' +
      '<div class="desk-kpi">' +
        kpi('Свободно', finMoney(free), free < 0 ? 'bad' : (free > 0 ? 'good' : ''),
          S.finance.opening ? 'на руках, без копилок' : 'впишите остаток', 'fin-opening') +
        kpi('Пришло', finMoney(now.earned), now.earned ? 'good' : '',
          'за ' + monthShort(key)) +
        kpi('Ушло', finMoney(now.spent), '',
          vsPrev, '', prev.spent && diff > 0 ? 'warn' : (prev.spent && diff < 0 ? 'good' : '')) +
        kpi('Отложено', finMoney(finSaved()), finSaved() > 0 ? 'good' : '',
          jars ? 'в ' + jars + ' ' + plural(jars, 'копилке', 'копилках', 'копилках') : 'копилок нет') +
        kpi('Я должен', finMoney(debts.owe), debts.owe ? 'warn' : '',
          late ? late + ' ' + plural(late, 'просрочен', 'просрочено', 'просрочено')
               : (oweN ? oweN + ' ' + plural(oweN, 'долг', 'долга', 'долгов') : 'никому'),
          '', late ? 'bad' : '') +
        kpi('Мне должны', finMoney(debts.owed), debts.owed ? 'good' : '',
          owedN ? owedN + ' ' + plural(owedN, 'человек', 'человека', 'человек') : 'никто') +
      '</div>' +
    '</section>';
  }

  /* ---- разбор месяца ----

     Слева полгода парными столбиками: доход и траты рядом, потому что «много
     ли я трачу» без «сколько пришло» — вопрос без ответа. Справа — куда
     уходит этот месяц, по всем категориям, с переменой к прошлому: во
     вкладках это были две разные карточки («Куда уходит» и «Что
     изменилось»), здесь одна таблица отвечает на оба вопроса. */
  function zoneAnalytics(key){
    var prevKey = finMonthShift(key, -1);
    var now = finMonthTotals(key);
    var net = now.earned - now.spent;
    var rate = now.earned ? Math.round(net * 100 / now.earned) : null;

    var note = S.finance.ops.length
      ? 'итог <b class="' + (net < 0 ? 'bad' : net > 0 ? 'good' : '') + '">' +
          esc(finMoney(net, { plus: net > 0 })) + '</b>' +
        (rate !== null && rate > 0 ? ' · остаётся ' + rate + '% дохода' : '')
      : '';

    var html = '<section class="desk-zone z-ana">' + zoneHead('Разбор месяца', note);

    if (!S.finance.ops.length){
      return html + zoneEmpty('Считать пока нечего. Скажите Syn внизу первую трату — разбор появится сразу.') + '</section>';
    }

    html += '<div class="dz-ana">' + anaColumns(key) + anaCats(key, prevKey, now.spent) + '</div>';
    html += anaPace(key, now.spent, finMonthTotals(prevKey).spent);
    return html + '</section>';
  }

  function anaColumns(key){
    var months = [], k = key;
    for (var i = 0; i < 6; i++){ months.unshift(k); k = finMonthShift(k, -1); }
    var peak = 1;
    var rows = months.map(function(mk){
      var t = finMonthTotals(mk);
      peak = Math.max(peak, t.spent, t.earned);
      return { key: mk, spent: t.spent, earned: t.earned };
    });

    return '<div class="dz-cols">' +
      '<div class="dz-sub">Полгода' +
        '<span class="dz-legend"><i class="in"></i>пришло <i class="out"></i>ушло</span></div>' +
      '<div class="dcols">' + rows.map(function(r){
        var hIn = r.earned ? Math.max(2, Math.round(r.earned * 100 / peak)) : 0;
        var hOut = r.spent ? Math.max(2, Math.round(r.spent * 100 / peak)) : 0;
        return '<button class="dcol' + (r.key === key ? ' on' : '') + '" data-act="fin-desk-month" data-key="' + r.key + '" ' +
            'title="' + esc(monthName(r.key) + ': пришло ' + finMoney(r.earned) + ', ушло ' + finMoney(r.spent)) + '">' +
          '<span class="dc-v">' + (r.spent ? esc(finShort(r.spent)) : '') + '</span>' +
          '<span class="dc-b">' +
            '<i class="in" style="height:' + hIn + '%"></i>' +
            '<i class="out" style="height:' + hOut + '%"></i>' +
          '</span>' +
          '<span class="dc-t">' + esc(monthShort(r.key)) + '</span>' +
        '</button>';
      }).join('') + '</div>' +
    '</div>';
  }

  /* Категории: все, а не три. Тридцати не бывает — восемь корзин и свои, —
     так что список помещается целиком, и «прочее» не прячет половину трат.
     Строка — кнопка: нажал «Еда» — в ленте справа остались только траты на
     еду; нажал ещё раз — фильтр снят. */
  function anaCats(key, prevKey, spent){
    var rows = finByCat(key);
    if (!rows.length){
      return '<div class="dz-cats"><div class="dz-sub">Куда уходит</div>' +
        '<p class="dz-quiet">В этом месяце трат нет.</p></div>';
    }
    var pick = S.finDeskCat || '';
    return '<div class="dz-cats">' +
      '<div class="dz-sub">Куда уходит<span>к ' + esc(monthDative(prevKey).split(' ')[0]) + '</span></div>' +
      rows.map(function(row){
        var share = spent ? Math.round(row.sum * 100 / spent) : 0;
        var was = finBudgetSpent(row.cat, prevKey);
        var diff = row.sum - was;
        var move = !was
          ? '<em class="new">впервые</em>'
          : diff === 0 ? '<em>—</em>'
          : '<em class="' + (diff > 0 ? 'up' : 'down') + '">' + (diff > 0 ? '+' : '−') +
              Math.round(Math.abs(diff) * 100 / was) + '%</em>';
        return '<button class="dcat' + (pick === row.cat ? ' on' : '') + '" data-act="fin-desk-cat" data-cat="' + esc(row.cat) + '" ' +
            'aria-pressed="' + (pick === row.cat) + '" title="Показать в ленте только «' + esc(row.title) + '»">' +
          '<span class="fr-dot" style="background:' + finTint(row.cat, .95) + '"></span>' +
          '<span class="dcat-t">' + esc(row.title) + '</span>' +
          '<span class="fb-r"><i style="width:' + share + '%;background:' + finTint(row.cat, .9) + '"></i></span>' +
          '<span class="dcat-p">' + share + '%</span>' +
          '<span class="dcat-v">' + esc(finMoney(row.sum)) + '</span>' +
          move +
        '</button>';
      }).join('') +
    '</div>';
  }

  /* Темп — только у текущего месяца: у прошедшего прогнозировать нечего.
     «В среднем 1 600 в день, к концу месяца выйдет 49 000» — это то, чего не
     скажет ни одна вкладка: там видно, сколько ушло, но не куда идёт.

     Делить на дни можно только повседневное. Аренда в 42 000, списанная
     третьего числа, иначе растягивалась на каждый день месяца, и прогноз
     выходил вдвое больше правды. Поэтому крупное и регулярное — жильё,
     кредиты, отмеченные платежи и автосписания — берётся как есть, к нему
     прибавляются ещё не оплаченные платежи месяца, а темп считается по
     остальному. */
  function anaPace(key, spent, prevSpent){
    if (key !== finMonthKey() || !spent) return '';
    var today = todayDate();
    var day = today.getDate();
    var total = daysInMonth(today.getFullYear(), today.getMonth());

    var daily = 0;
    finMonthOps(key).forEach(function(op){
      if (op.kind === 'income') return;
      if (op.fromSub || op.fromRule || op.cat === 'home' || op.cat === 'loans') return;
      daily += op.amount;
    });
    var perDay = Math.round(daily / day);

    var dueLeft = 0;
    finDueThisMonth(key).forEach(function(row){ if (!row.paid && row.known) dueLeft += row.expect; });

    var forecast = spent + perDay * (total - day) + dueLeft;

    var compare = prevSpent
      ? (forecast > prevSpent ? ' — больше' : ' — меньше') + ', чем в прошлом месяце (' + finMoney(prevSpent) + ')'
      : '';

    return '<p class="dz-pace">Повседневные траты — в среднем <b>' + esc(finMoney(perDay)) + '</b> в день. ' +
      'Если так пойдёт' + (dueLeft ? ' и оплатить оставшиеся платежи' : '') +
      ', к концу месяца уйдёт <b>' + esc(finMoney(forecast)) + '</b>' + esc(compare) + '.</p>';
  }

  /// «48 тыс» вместо «48 300 ₽» над столбиком: шесть полных сумм в узкой
  /// колонке налезали друг на друга.
  function finShort(kop){
    var rub = Math.round(kop / 100);
    if (rub >= 1000000) return (Math.round(rub / 100000) / 10).toString().replace('.', ',') + ' млн';
    if (rub >= 10000) return Math.round(rub / 1000) + ' тыс';
    if (rub >= 1000) return (Math.round(rub / 100) / 10).toString().replace('.', ',') + ' тыс';
    return String(rub);
  }

  /* ---- траты ----

     Своей строки записи у ленты больше нет: всё записывает Syn из полосы
     внизу экрана (vFinSyn в app.js), а лента только показывает. */
  function zoneFeed(key){
    var pick = S.finDeskCat || '';
    var ops = finMonthOps(key);
    if (pick) ops = ops.filter(function(op){ return op.cat === pick; });

    // Внутренняя обёртка — ради высокой зоны: лента вынута из потока и не
    // раздвигает ряды своей длиной (см. .dz-tall в desk.css).
    var html = '<section class="desk-zone z-feed dz-tall"><div class="dz-inner">' +
      zoneHead('Мои траты', ops.length ? ops.length + ' ' + plural(ops.length, 'запись', 'записи', 'записей') : '');

    if (pick){
      html += '<div class="dz-filter">Только «' + esc(finCat(pick).title) + '»' +
        '<button data-act="fin-desk-cat" data-cat="' + esc(pick) + '" aria-label="Снять фильтр" title="Снять фильтр">✕</button></div>';
    }

    if (!ops.length){
      return html + '<div class="dz-scroll"><p class="dz-quiet">' +
        (pick ? 'В «' + esc(finCat(pick).title) + '» за ' + esc(monthName(key).toLowerCase()) + ' ничего нет.'
              : 'За ' + esc(monthName(key).toLowerCase()) + ' записей нет. Скажите Syn внизу: «кофе 350».') +
        '</p></div></div></section>';
    }

    // По дням, свежие сверху — как во вкладке «Мои траты».
    var sorted = ops.slice().sort(function(a, b){
      return a.date === b.date ? b.at - a.at : (a.date < b.date ? 1 : -1);
    });
    var days = {}, order = [];
    sorted.forEach(function(op){
      if (!days[op.date]){ days[op.date] = []; order.push(op.date); }
      days[op.date].push(op);
    });

    html += '<div class="dz-scroll">' + order.map(function(date){
      var rows = days[date];
      var sum = rows.reduce(function(acc, op){ return acc + op.amount * finOpSign(op); }, 0);
      return '<div class="dday">' +
        '<div class="dday-h"><b>' + esc(humanDate(date)) + '</b><span>' + esc(finMoney(sum, { plus: sum > 0 })) + '</span></div>' +
        rows.map(function(op){
          var up = op.kind === 'income';
          return '<div class="drow">' +
            '<span class="fr-dot" style="background:' + finTint(op.cat, .95) + '"></span>' +
            '<button class="drow-t" data-act="fin-op-edit" data-op="' + op.id + '" title="Править">' + esc(op.title) +
              '<span>' + esc(finCat(op.cat).title) + '</span></button>' +
            '<span class="drow-v' + (up ? ' up' : '') + '">' + esc(finMoney(op.amount * (up ? 1 : -1), { plus: up })) + '</span>' +
            '<button class="fr-x" data-act="fin-op-kill" data-op="' + op.id + '" title="Удалить" aria-label="Удалить">' + ICON.kill + '</button>' +
          '</div>';
        }).join('') +
      '</div>';
    }).join('') + '</div>';

    return html + '</div></section>';
  }

  /* ---- конверты ---- */
  function zoneBudgets(key){
    var rows = finBudgetRows(key);
    var plan = 0, spent = 0;
    rows.forEach(function(r){ plan += r.plan; spent += r.spent; });
    var left = plan - spent;

    var html = '<section class="desk-zone z-env">' +
      zoneHead('Конверты',
        rows.length ? 'осталось <b class="' + (left < 0 ? 'bad' : '') + '">' + esc(finMoney(left)) + '</b> из ' + esc(finMoney(plan)) : '',
        'fin-budget-new', 'Новый конверт');

    if (!rows.length){
      return html + zoneEmpty('Конверт — сколько вы кладёте на категорию в месяц. Он говорит, сколько ещё можно потратить.',
        'fin-budget-new', '+ Конверт') + '</section>';
    }

    html += '<div class="dz-list">' + rows.map(function(row){
      return '<div class="denv' + (row.left < 0 ? ' over' : '') + '">' +
        '<div class="denv-h">' +
          '<button data-act="fin-budget-edit" data-cat="' + esc(row.cat) + '" title="Править конверт">' + esc(row.title) + '</button>' +
          '<span>' + esc(finMoney(row.spent)) + ' / ' + esc(finMoney(row.plan)) + '</span>' +
        '</div>' +
        '<div class="bar slim"><i style="width:' + row.share + '%' + (row.left < 0 ? ';background:var(--crit)' : '') + '"></i></div>' +
        '<div class="denv-f">' + (row.left < 0 ? 'перерасход ' + esc(finMoney(-row.left)) : 'осталось ' + esc(finMoney(row.left))) + '</div>' +
      '</div>';
    }).join('') + '</div>';

    return html + '</section>';
  }

  /* ---- платежи месяца ----

     Не вся таблица подписок, а то, что касается этого месяца: что ещё
     предстоит и что уже оплачено. Неоплаченные сверху и по дате — это
     список дел, а не справочник. Годовая сумма подписок стоит подписью
     внизу: это довод, ради которого их вообще записывают. */
  function zonePayments(key){
    var due = finDueThisMonth(key);
    var left = 0, blind = 0;
    due.forEach(function(row){
      if (row.paid) return;
      if (row.known) left += row.expect; else blind++;
    });

    var html = '<section class="desk-zone z-pay">' +
      zoneHead('Платежи месяца',
        due.length ? (left ? 'ещё <b>' + esc(finMoney(left)) + '</b>' : 'всё оплачено') +
          (blind ? ' · ' + blind + ' по счётчику' : '') : '',
        'fin-sub-new', 'Новая подписка');

    if (!S.finance.subs.length){
      return html + zoneEmpty('Квартплата, кредиты, подписки — то, что уходит каждый месяц.',
        'fin-sub-new', '+ Платёж', ' data-duty="1"') + '</section>';
    }

    due.sort(function(a, b){
      if (!!a.paid !== !!b.paid) return a.paid ? 1 : -1;
      var na = finSubNext(a.sub) || '9999', nb = finSubNext(b.sub) || '9999';
      return na < nb ? -1 : na > nb ? 1 : 0;
    });

    html += '<div class="dz-list">' + (due.length ? due.map(function(row){
      var sub = row.sub;
      var next = finSubNext(sub);
      var today = isoOf(todayDate());
      var note = row.paid ? 'оплачено'
        : next ? (next < today ? 'просрочен с ' : 'до ') + humanDate(next)
        : (FIN_EVERY[sub.every] || FIN_EVERY.month).title;
      var sum = row.paid ? row.paid : row.expect;
      return '<div class="dpay' + (row.paid ? ' paid' : '') + '">' +
        finSubLogo(sub) +
        '<button class="dpay-t" data-act="fin-sub-edit" data-sub="' + sub.id + '" title="Править">' + esc(sub.title) + '</button>' +
        '<span class="dpay-v">' + (sum ? (finSubVaries(sub) && !row.paid ? '≈ ' : '') + esc(finMoney(sum)) : '—') + '</span>' +
        '<span class="dpay-n' + (!row.paid && next && next < today ? ' late' : '') + '">' + esc(note) + '</span>' +
        '<button class="fr-pay' + (row.paid ? ' on' : '') + '" data-act="fin-sub-pay" data-sub="' + sub.id + '" ' +
          'title="' + (row.paid ? 'Отменить отметку' : 'Отметить оплату') + '">' + (row.paid ? ICON.check : 'Оплатить') + '</button>' +
      '</div>';
    }).join('') : '<p class="dz-quiet">В этом месяце платежей нет.</p>') + '</div>';

    var subsYear = 0;
    finSubsOf(false).forEach(function(sub){ if (!sub.off) subsYear += finPerYear(sub); });

    html += '<div class="dz-foot">' +
      (subsYear ? '<span>Подписки — <b>' + esc(finMoney(subsYear)) + '</b> в год</span>' : '<span></span>') +
      zoneMore('subs', 'Вся таблица') +
    '</div>';

    return html + '</section>';
  }

  /* ---- долги ----

     Открытые, просроченные первыми, дальше по сроку. Закрытые не показываем
     строками — только счётчиком со ссылкой: в дашборде место дороже, а
     закрытый долг уже ничего не требует. */
  function zoneDebts(){
    var sums = finDebtSums();
    var today = isoOf(todayDate());
    var open = S.finance.debts.filter(function(d){ return !d.closed; });
    var closed = S.finance.debts.length - open.length;

    open.sort(function(a, b){
      var la = a.due && a.due < today, lb = b.due && b.due < today;
      if (la !== lb) return la ? -1 : 1;
      return (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0;
    });

    var html = '<section class="desk-zone z-debt">' +
      zoneHead('Долги',
        open.length ? 'итог <b class="' + (sums.net < 0 ? 'bad' : sums.net > 0 ? 'good' : '') + '">' +
          esc(finMoney(sums.net, { plus: sums.net > 0 })) + '</b>' : '',
        'fin-debt-new', 'Новый долг');

    if (!open.length){
      return html + zoneEmpty(closed ? 'Открытых долгов нет.' : 'У кого взяли и кому дали — с суммой, сроком и возвратом по частям.',
        closed ? '' : 'fin-debt-new', '+ Долг') +
        (closed ? '<div class="dz-foot"><span></span>' + zoneMore('debts', 'Закрытые: ' + closed) + '</div>' : '') +
        '</section>';
    }

    html += '<div class="dz-list">' + open.map(function(d){
      var left = Math.max(0, d.amount - (d.paid || 0));
      var late = d.due && d.due < today;
      return '<div class="ddebt' + (late ? ' late' : '') + '">' +
        '<span class="ddebt-t">' + esc(d.who) + '</span>' +
        '<span class="ddebt-v ' + (d.mine ? 'mine' : 'owed') + '">' + esc(finMoney(left)) + '</span>' +
        '<span class="ddebt-n">' + (d.mine ? 'я должен' : 'мне должны') +
          (d.due ? (late ? ' · <b class="late">просрочен с ' + esc(humanDate(d.due)) + '</b>' : ' · до ' + esc(humanDate(d.due))) : '') +
          (d.paid ? ' · вернули ' + esc(finMoney(d.paid)) + ' из ' + esc(finMoney(d.amount)) : '') +
        '</span>' +
        '<span class="ddebt-a">' +
          '<button class="fr-pay" data-act="fin-debt-pay" data-debt="' + d.id + '">' + (d.mine ? 'Платёж' : 'Возврат') + '</button>' +
          '<button class="fr-x" data-act="fin-debt-close" data-debt="' + d.id + '" title="Закрыть долг" aria-label="Закрыть долг">' + ICON.check + '</button>' +
        '</span>' +
      '</div>';
    }).join('') + '</div>';

    if (closed) html += '<div class="dz-foot"><span></span>' + zoneMore('debts', 'Закрытые: ' + closed) + '</div>';
    return html + '</section>';
  }

  /* ---- копилки ----

     Карточками в ряд: у копилки главное — полоса и «сколько в месяц, чтобы
     успеть», и в карточке они видны одним взглядом, а в строке таблицы
     совет не помещался. */
  function zoneJars(){
    var jars = S.finance.jars;
    var saved = finSaved(), target = 0;
    jars.forEach(function(j){ target += j.target || 0; });

    var html = '<section class="desk-zone z-jars">' +
      zoneHead('Копилки',
        jars.length ? 'собрано <b>' + esc(finMoney(saved)) + '</b> из ' + esc(finMoney(target)) : '',
        'fin-jar-new', 'Новая копилка');

    if (!jars.length){
      return html + zoneEmpty('Цель в деньгах: «на отпуск 120 000 к июню». Synapse посчитает, сколько откладывать в месяц.',
        'fin-jar-new', '+ Копилка') + '</section>';
    }

    html += '<div class="djars">' + jars.map(function(jar){
      var got = jar.saved || 0;
      var share = jar.target ? Math.min(100, Math.round(got * 100 / jar.target)) : 0;
      var pace = finJarPace(jar);
      var line = pace && pace.late
        ? '<span class="late">Срок прошёл, не хватает ' + esc(finMoney(pace.left)) + '</span>'
        : pace && !pace.done
          ? esc(finMoney(pace.perMonth)) + ' в месяц, чтобы успеть'
          : got >= jar.target ? 'Собрано' : (jar.due ? '' : 'без срока');
      return '<article class="djar' + (got >= jar.target ? ' full' : '') + '">' +
        '<div class="djar-h">' +
          '<button data-act="fin-jar-edit" data-jar="' + jar.id + '" title="Править">' + esc(jar.title) + '</button>' +
          '<span>' + share + '%</span>' +
        '</div>' +
        '<div class="djar-s"><b>' + esc(finMoney(got)) + '</b> из ' + esc(finMoney(jar.target)) +
          (jar.due ? ' · к ' + esc(humanDate(jar.due)) : '') + '</div>' +
        '<div class="bar slim"><i style="width:' + share + '%"></i></div>' +
        '<div class="djar-n">' + line + '</div>' +
        '<div class="djar-a">' +
          '<button class="btn sm" data-act="fin-jar-put" data-jar="' + jar.id + '">Отложить</button>' +
          '<button class="btn sm soft" data-act="fin-jar-take" data-jar="' + jar.id + '">Снять</button>' +
        '</div>' +
      '</article>';
    }).join('') + '</div>';

    return html + '</section>';
  }

  /* ============ КУРСЫ ============

     Доллар, евро и биткоин — тонкой полосой в шапке, рядом с месяцем. Не
     зона: это справка, на которую бросают взгляд, а не то, с чем работают, и
     целая карточка отняла бы место у собственных денег человека.

     Откуда:
       * доллар и евро — официальный курс ЦБ через cbr-xml-daily.ru. Там же
         тенге, гривна, белорусский рубль и сом, поэтому курс показывается в
         той валюте, которую человек выбрал для раздела, а не всегда в рублях;
       * биткоин — CoinGecko, а если он не ответил — Binance. Его считают в
         долларах все, поэтому и здесь он в долларах.

     Запросы уходят прямо из браузера: ключей у этих адресов нет, данных
     человека в них ничего, только «дай цену». На боевом сайте их разрешает
     connect-src в deploy/nginx-site.conf.

     Ответ кладётся в localStorage вместе со временем и живёт полчаса: экран
     денег перерисовывается на каждое нажатие, и без этого каждое нажатие
     было бы тремя запросами. Без сети показывается последнее полученное, с
     подписью, на когда. Это удобство одного браузера, а не запись человека,
     поэтому в S (и в синхронизацию) курсы не попадают. */
  var RATES_KEY = 'synapse.rates';
  var RATES_TTL = 30 * 60 * 1000;
  var RATES_CODES = ['USD', 'EUR', 'KZT', 'UAH', 'BYN', 'KGS'];
  var rates = readRates();
  var ratesBusy = false;
  // Не чаще раза в две минуты, даже если ничего не пришло: без сети каждое
  // нажатие на экране иначе стало бы новой попыткой.
  var ratesTried = 0;

  function readRates(){
    try { return JSON.parse(localStorage.getItem(RATES_KEY) || 'null'); } catch (e){ return null; }
  }
  function keepRates(){
    try { localStorage.setItem(RATES_KEY, JSON.stringify(rates)); } catch (e){}
  }

  /// Запрос с пределом по времени: зависший адрес не должен держать полосу
  /// в «загружаются» до бесконечности.
  function getJSON(url){
    var ctrl = global.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, 8000) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
      .finally(function(){ if (timer) clearTimeout(timer); });
  }

  function fetchCbr(){
    return getJSON('https://www.cbr-xml-daily.ru/daily_json.js').then(function(d){
      var out = { date: String(d.Date || '').slice(0, 10), v: {} };
      RATES_CODES.forEach(function(code){
        var x = d.Valute && d.Valute[code];
        if (x) out.v[code] = [x.Value / x.Nominal, x.Previous / x.Nominal];
      });
      if (!out.v.USD) throw new Error('нет доллара');
      return out;
    });
  }

  function fetchBtc(){
    return getJSON('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true')
      .then(function(d){
        var b = d.bitcoin;
        if (!b || !b.usd) throw new Error('пусто');
        return { usd: b.usd, ch: b.usd_24h_change || 0, src: 'CoinGecko' };
      })
      .catch(function(){
        return getJSON('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT').then(function(d){
          if (!d.lastPrice) throw new Error('пусто');
          return { usd: Number(d.lastPrice), ch: Number(d.priceChangePercent) || 0, src: 'Binance' };
        });
      });
  }

  /* Освежить, если пора. Каждый источник отдельно: упал биткоин — доллар и
     евро всё равно обновляются, и наоборот. По готовности меняется только
     сама полоса, а не весь экран: перерисовка сбросила бы набранную трату. */
  function refreshRates(){
    if (ratesBusy || (rates && Date.now() - rates.at < RATES_TTL)) return;
    if (!global.fetch || Date.now() - ratesTried < 2 * 60 * 1000) return;
    ratesTried = Date.now();
    ratesBusy = true;
    var next = { at: Date.now(), cbr: rates && rates.cbr, btc: rates && rates.btc };
    var a = fetchCbr().then(function(x){ next.cbr = x; }, function(){});
    var b = fetchBtc().then(function(x){ next.btc = x; next.btcAt = Date.now(); }, function(){});
    Promise.all([a, b]).then(function(){
      ratesBusy = false;
      // Ничего не пришло — время не ставим, иначе полчаса не пробовали бы снова.
      if (next.cbr === (rates && rates.cbr) && next.btc === (rates && rates.btc)) next.at = rates ? rates.at : 0;
      rates = next;
      keepRates();
      var node = document.getElementById('deskRates');
      if (node) node.innerHTML = SynI18n.tr(ratesInner());
    });
  }

  function ratesStrip(){
    setTimeout(refreshRates, 0);
    return '<div class="desk-rates" id="deskRates" aria-label="Курсы валют">' + ratesInner() + '</div>';
  }

  /// Курс одной валюты в валюте раздела: по ЦБ всё в рублях, поэтому делим
  /// рублёвую цену на рублёвую цену выбранной валюты.
  function cbrIn(code, base, which){
    var v = rates.cbr.v;
    var price = function(c){ return c === 'RUB' ? 1 : (v[c] ? v[c][which] : 0); };
    var b = price(base);
    return b ? price(code) / b : 0;
  }

  function ratesInner(){
    if (!rates || (!rates.cbr && !rates.btc)){
      return '<span class="dr-wait">' + (ratesBusy || !rates ? 'Курсы загружаются…' : 'Курсы недоступны') + '</span>';
    }
    var cur = S.currency || 'rub';
    var base = { rub: 'RUB', kzt: 'KZT', uah: 'UAH', byn: 'BYN', kgs: 'KGS', usd: 'USD', eur: 'EUR' }[cur] || 'RUB';
    // «Без значка» — значит, валюта неизвестна; показываем в рублях, с ₽.
    var sign = cur === 'none' ? '₽' : (валютаЗнак() || '₽');
    var html = '';

    if (rates.cbr && (base === 'RUB' || rates.cbr.v[base])){
      ['USD', 'EUR'].forEach(function(code){
        if (code === base) return;
        var now = cbrIn(code, base, 0), was = cbrIn(code, base, 1);
        if (!now) return;
        html += rateChip(code === 'USD' ? '$' : '€', fmtNum(now, now < 10 ? 3 : 2) + ' ' + sign,
          was ? (now / was - 1) * 100 : 0,
          (code === 'USD' ? 'Доллар' : 'Евро') + ' по курсу ЦБ на ' + dotDate(rates.cbr.date));
      });
    }
    if (rates.btc){
      html += rateChip('₿', '$' + fmtNum(rates.btc.usd, 0), rates.btc.ch,
        'Биткоин в долларах, ' + rates.btc.src + ', изменение за сутки');
    }
    var age = Date.now() - rates.at;
    var stale = age > 6 * 60 * 60 * 1000;
    html += '<span class="dr-src" title="Доллар и евро — ЦБ РФ (cbr-xml-daily.ru), биткоин — ' +
      esc(rates.btc ? rates.btc.src : 'CoinGecko') + '">' +
      (rates.cbr ? 'ЦБ на ' + esc(dotDate(rates.cbr.date)) : '') +
      (stale ? ' · без связи' : '') + '</span>';
    return html;
  }

  function rateChip(mark, value, change, title){
    var ch = Math.round(change * 100) / 100;
    return '<span class="dr" title="' + esc(title) + '">' +
      '<i>' + esc(mark) + '</i><b>' + esc(value) + '</b>' +
      (ch ? '<em class="' + (ch > 0 ? 'up' : 'down') + '">' + (ch > 0 ? '▲' : '▼') +
        esc(fmtNum(Math.abs(ch), 2)) + '%</em>' : '') +
    '</span>';
  }

  /// «83,95», «80 853» — как пишут числа по-русски: запятая и пробелы в тысячах.
  function fmtNum(n, digits){
    var parts = Number(n).toFixed(digits).split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009') + (parts[1] ? ',' + parts[1] : '');
  }

  function dotDate(iso){
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '.' + p[1] : '';
  }

  /* Кнопка обратно на дашборд — в конце полосы вкладок. Видна только там,
     где дашборд вообще помещается: на узком окне звать некуда. */
  function backButton(){
    if (!fits()) return '';
    return '<button class="fintab desk-back" data-act="fin-layout" data-to="desk" ' +
      'title="Все финансы на одном экране">Одним экраном</button>';
  }

  /* ============ ДЕЙСТВИЯ ============

     ACTS объявлен в app.js, который грузится после этого файла, — поэтому
     свои действия добавляем, когда разметка уже разобрана и app.js отработал. */
  function installActions(){
    if (typeof ACTS === 'undefined') return;

    ACTS['fin-layout'] = function(d){
      S.finLayout = d.to === 'tabs' ? 'tabs' : '';
      commit();
      global.scrollTo(0, 0);
    };

    // Месяц из столбиков листает весь экран — тот же S.finMonth, что у стрелок.
    ACTS['fin-desk-month'] = function(d){
      S.finMonth = d.key === finMonthKey() ? '' : d.key;
      commit();
    };

    // Фильтр ленты по категории. Повторное нажатие снимает.
    ACTS['fin-desk-cat'] = function(d){
      S.finDeskCat = S.finDeskCat === d.cat ? '' : d.cat;
      commit();
    };

    // «Вся таблица» и «Закрытые» — во вкладку с подробностями.
    ACTS['fin-desk-open'] = function(d){
      S.finLayout = 'tabs';
      S.finTab = d.tab;
      commit();
      global.scrollTo(0, 0);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installActions);
  else installActions();

  global.SynFinDesk = { fits: fits, on: on, render: vDesk, backButton: backButton };
})(window);

/* Английский для того, что есть только в веб-версии.

   Перевод интерфейса живёт в i18n.js: словарь «русская фраза → английская»,
   который применяется к уже собранной разметке. Словарь закрыт внутри
   модуля, и дописать в него снаружи нельзя, а сам файл общий с андроидом.
   Поэтому новые подписи из web/ — дашборд финансов, курсы — переводятся
   здесь: SynI18n.tr оборачивается, сначала работает общий словарь, потом
   этот — по тому, что осталось русским.

   Устроено так же, как в i18n.js: переводится только видимый текст между
   тегами и читаемые атрибуты (placeholder, title, aria-label, alt).
   Неизвестная фраза остаётся русской — интерфейс от этого не ломается.

   Загружается после i18n.js и до app.js. */

(function (global) {
  'use strict';
  if (!global.SynI18n) return;

  /* Целые фразы. */
  var EN = {
    'Мои финансы': 'My finances', 'Вкладками': 'As tabs', 'Одним экраном': 'One screen',
    'Свободно': 'Available', 'Пришло': 'Income', 'Ушло': 'Spent', 'Отложено': 'Saved',
    'Я должен': 'I owe', 'Мне должны': 'Owed to me', 'Итоги': 'Totals',
    'Разбор месяца': 'Month breakdown', 'Полгода': 'Six months', 'Куда уходит': 'Where it goes',
    'пришло': 'in', 'ушло': 'out', 'впервые': 'new',
    'Мои траты': 'My spending', 'Трата': 'Expense', 'Доход': 'Income', 'Дата': 'Date',
    'Новая трата': 'New expense', 'Новый доход': 'New income', 'Записать': 'Add',
    'Сказать трату голосом': 'Say the expense', 'Остановить': 'Stop',
    'кофе 350': 'coffee 350', 'зарплата 90000': 'salary 90000',
    'Снять фильтр': 'Clear filter',
    'Конверты': 'Envelopes', 'Новый конверт': 'New envelope', '+ Конверт': '+ Envelope',
    'Править конверт': 'Edit envelope',
    'Платежи месяца': 'Payments this month', 'Новая подписка': 'New subscription',
    '+ Платёж': '+ Payment', 'Оплатить': 'Pay', 'Отметить оплату': 'Mark as paid',
    'Отменить отметку': 'Undo', 'оплачено': 'paid', 'всё оплачено': 'all paid',
    'Вся таблица': 'Full table', 'В этом месяце платежей нет.': 'No payments this month.',
    'Долги': 'Debts', 'Новый долг': 'New debt', '+ Долг': '+ Debt', 'Платёж': 'Payment',
    'Возврат': 'Repayment', 'Закрыть долг': 'Close debt', 'Открытых долгов нет.': 'No open debts.',
    'я должен': 'I owe', 'мне должны': 'owed to me',
    'Копилки': 'Savings', 'Новая копилка': 'New jar', '+ Копилка': '+ Jar',
    'Отложить': 'Put aside', 'Снять': 'Withdraw', 'Собрано': 'Done', 'без срока': 'no deadline',
    'Править': 'Edit', 'Удалить': 'Delete',
    'на руках, без копилок': 'on hand, excl. savings', 'впишите остаток': 'enter your balance',
    'прошлый месяц пуст': 'last month empty', 'копилок нет': 'no jars', 'никому': 'nobody',
    'никто': 'nobody', 'итог': 'total', 'осталось': 'left', 'ещё': 'left to pay',
    'собрано': 'saved', 'Повседневные траты — в среднем': 'Everyday spending averages',
    'В этом месяце трат нет.': 'No spending this month.',
    'Считать пока нечего. Запишите первую трату справа — разбор появится сразу.':
      'Nothing to count yet. Add your first expense on the right — the breakdown appears right away.',
    'Конверт — сколько вы кладёте на категорию в месяц. Он говорит, сколько ещё можно потратить.':
      'An envelope is how much you set aside for a category each month. It tells you how much you can still spend.',
    'Квартплата, кредиты, подписки — то, что уходит каждый месяц.':
      'Rent, loans, subscriptions — what goes out every month.',
    'У кого взяли и кому дали — с суммой, сроком и возвратом по частям.':
      'Who you borrowed from and lent to — with amount, deadline and partial repayments.',
    'Цель в деньгах: «на отпуск 120 000 к июню». Synapse посчитает, сколько откладывать в месяц.':
      'A goal in money: “120,000 for a holiday by June”. Synapse works out how much to save each month.',
    'Курсы валют': 'Exchange rates', 'Курсы загружаются…': 'Loading rates…',
    'Курсы недоступны': 'Rates unavailable', 'Все финансы на одном экране': 'All finances on one screen',
    'Показывать раздел вкладками, как на телефоне': 'Show the section as tabs, like on the phone'
  };

  var MONTH_GEN = { 'января': 'January', 'февраля': 'February', 'марта': 'March', 'апреля': 'April',
    'мая': 'May', 'июня': 'June', 'июля': 'July', 'августа': 'August', 'сентября': 'September',
    'октября': 'October', 'ноября': 'November', 'декабря': 'December' };
  var MONTH_DAT = { 'январю': 'January', 'февралю': 'February', 'марту': 'March', 'апрелю': 'April',
    'маю': 'May', 'июню': 'June', 'июлю': 'July', 'августу': 'August', 'сентябрю': 'September',
    'октябрю': 'October', 'ноябрю': 'November', 'декабрю': 'December' };
  var MONTH_SHORT = { 'янв': 'Jan', 'фев': 'Feb', 'мар': 'Mar', 'апр': 'Apr', 'май': 'May', 'июн': 'Jun',
    'июл': 'Jul', 'авг': 'Aug', 'сен': 'Sep', 'окт': 'Oct', 'ноя': 'Nov', 'дек': 'Dec' };

  /* Фразы с числами и датами внутри — заменами по частям. Порядок важен:
     сначала длинные куски, потом короткие связки. */
  var PARTS = [
    [/^в день\. /, 'a day. '],
    [/Если так пойдёт и оплатить оставшиеся платежи/g, 'At this pace, with the remaining payments'],
    [/Если так пойдёт/g, 'At this pace'],
    [/, к концу месяца уйдёт$/, ', the month will cost'],
    [/^— больше, чем в прошлом месяце \(/, '— more than last month ('],
    [/^— меньше, чем в прошлом месяце \(/, '— less than last month ('],
    [/ в месяц, чтобы успеть/g, ' a month to make it'],
    [/Срок прошёл, не хватает/g, 'Deadline passed, short by'],
    [/^Подписки —$/, 'Subscriptions —'],
    [/^в год$/, 'a year'], [/ в год/g, ' a year'],
    [/остаётся (\d+)% дохода/g, '$1% of income kept'],
    [/по курсу ЦБ на /g, 'Central Bank rate on '],
    [/ЦБ на /g, 'CBR '],
    [/Доллар/g, 'Dollar'], [/Евро/g, 'Euro'],
    [/Биткоин в долларах, /g, 'Bitcoin in USD, '], [/, изменение за сутки/g, ', 24h change'],
    [/без связи/g, 'offline'],
    [/Показать в ленте только «/g, 'Show only “'], [/Только «/g, 'Only “'],
    [/» за /g, '” in '], [/»/g, '”'], [/В «/g, 'In “'], [/ ничего нет\./g, ': nothing.'],
    [/За (\S+ \d{4}) записей нет\. Скажите Syn внизу: «кофе 350»\./g,
      'No entries for $1. Tell Syn below: “coffee 350”.'],
    [/^Записано: /g, 'Saved: '], [/^Записать без Syn: /g, 'Save without Syn: '],
    [/, ближайшее списание /g, ', next charge '],
    [/^Отдаю долг: /g, 'Paying back: '], [/^Мне возвращают: /g, 'Paid back to me: '],
    [/(\d+) (записей|записи|запись)/g, '$1 entries'],
    [/(\d+) (долгов|долга|долг)/g, '$1 debts'],
    [/(\d+) (человека|человек)/g, '$1 people'],
    [/в (\d+) (копилках|копилке)/g, 'in $1 jars'],
    [/(\d+) (просрочено|просрочен)/g, '$1 overdue'],
    [/(\d+) по счётчику/g, '$1 metered'],
    [/Закрытые: /g, 'Closed: '],
    [/просрочен с /g, 'overdue since '], [/вернули /g, 'repaid '], [/перерасход /g, 'over by '],
    [/^я должен/, 'I owe'], [/^мне должны/, 'owed to me'],
    [/^осталось /, 'left '],
    [/ · до /g, ' · until '], [/^до /g, 'until '], [/ · к /g, ' · by '], [/^к /g, 'vs '],
    [/% к /g, '% vs '], [/^за /g, 'in '],
    [/ из /g, ' of '], [/^из /g, 'of '],
    [/: пришло /g, ': in '], [/, ушло /g, ', out '],
    [/ тыс/g, 'k'], [/ млн/g, 'M']
  ];

  function months(text){
    return text
      .replace(/(\d{1,2}) (января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/g,
        function(m, d, mon){ return MONTH_GEN[mon] + ' ' + d; })
      .replace(/(^|[^А-Яа-яЁё])(январю|февралю|марту|апрелю|маю|июню|июлю|августу|сентябрю|октябрю|ноябрю|декабрю)(?![А-Яа-яЁё])/g,
        function(m, sp, mon){ return sp + MONTH_DAT[mon]; })
      .replace(/(^|\s)(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)(?=$|\s)/g,
        function(m, sp, mon){ return sp + MONTH_SHORT[mon]; });
  }

  var CYR = /[А-Яа-яЁё]/;

  function phrase(text){
    if (!CYR.test(text)) return text;
    var lead = /^\s*/.exec(text)[0];
    var tail = /\s*$/.exec(text)[0];
    var core = text.slice(lead.length, text.length - tail.length);
    if (EN[core]) return lead + EN[core] + tail;
    var out = core;
    for (var i = 0; i < PARTS.length; i++) out = out.replace(PARTS[i][0], PARTS[i][1]);
    out = months(out);
    return lead + out + tail;
  }

  function trWeb(html){
    if (typeof html !== 'string' || !html) return html;
    if (html.indexOf('<') === -1) return phrase(html);
    html = html.replace(/(placeholder|title|aria-label|alt)="([^"]*)"/g, function(m, attr, value){
      return attr + '="' + phrase(value) + '"';
    });
    return html.replace(/>([^<]+)</g, function(m, text){ return '>' + phrase(text) + '<'; });
  }

  /* Только разметка веб-модулей: дашборд (desk-…), полоса курсов (dr…) и
     кнопка возврата на дашборд. Остальное приложение переводит общий
     словарь, и замены по частям — « из » → « of » — там не нужны: они
     смешали бы непереведённую фразу с английскими кусками. */
  var OURS = /desk-|class="dr|deskRates|fintab desk-back/;

  /* Сначала наш словарь, потом общий. Наоборот общий успевал перевести
     слово не в том смысле: «Отложено» у копилок — это saved, а не postponed,
     «записей» в ленте трат — entries, а не notes. Что наш словарь не знает
     (названия категорий, дни), доделывает общий. */
  var base = global.SynI18n.tr;
  global.SynI18n.tr = function(html){
    if (global.SynI18n.isEnglish() && typeof html === 'string' && OURS.test(html)) html = trWeb(html);
    return base(html);
  };
})(window);

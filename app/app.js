/*
  Synapse на вебе — кликабельный прототип внутрянки.

  Из «Дедлайна» взята только СТРУКТУРА и приёмы: без сборки, без зависимостей,
  «ES5-подобный» JS — var, функции-выражения, конкатенация строк. Каждый экран
  это функция vXxx(), возвращающая строку HTML; render() выбирает её по S.view;
  события ловит один делегированный обработчик на document по data-act. Не
  переписывай на современный синтаксис и не добавляй тулинг.

  ВНЕШНИЙ ВИД — синапсовский. Цвета и типографика взяты из приложения
  (App/AppTheme.swift): десять палитр, те же формулы panel / panelStrong /
  stroke, скруглённый системный шрифт. Приложение и веб сознательно сводят в
  один продукт.

  Отличие от «Дедлайна» ещё одно, намеренное: состояние не в памяти, а в
  localStorage — обновление страницы не должно стирать работу.

  Модель данных одна на все экраны. Задача цели и задача в блоке дня — это
  ОДИН объект в S.tasks со ссылками goalId/stageId. Отметил выполненной на
  экране «Цели» — она отмечена и на «Задачах», потому что это тот же объект.
*/

/* ============ ХРАНИЛИЩЕ ============ */

var KEY = 'synapse.web.v2';

/* Ключи черновика прошлой версии. Не читаем и не пишем — структура другая;
   старые данные остаются в браузере нетронутыми на случай разбора. */

function uid(){ return Math.random().toString(36).slice(2, 10); }

/// Примеры создаются относительно сегодняшнего дня: заготовка с зашитой датой
/// назавтра же оказывается просроченной.
function seedDay(offset){
  var now = new Date();
  var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  var m = day.getMonth() + 1, d = day.getDate();
  return day.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}

function seed(){
  var g1 = uid(), s11 = uid(), s12 = uid(), s13 = uid();
  var g2 = uid(), s21 = uid(), s22 = uid();
  return {
    version: 2,
    view: 'tasks',
    sub: null,
    auth: { stage: 'email', email: '', sent: '', error: '' },
    profile: { name: '', avatar: '' },
    openGoal: {},
    goalDraft: '',
    theme: 'system',
    palette: 'paper',
    font: 'rounded',
    fontSize: 'standard',
    box: 'square',
    hintSeen: false,
    more: false,
    draft: '',
    drag: null,
    closed: {},
    open: {},
    activeGoal: null,
    activeList: null,
    activeNote: null,
    tasks: [
      { id: uid(), title: 'Собрать материалы для презентации', bucket: 'today', date: seedDay(0), done: false,
        note: 'Черновик на десять слайдов, дизайн пока не нужен.', time: null, repeat: '', series: null,
        goalId: null, stageId: null,
        subtasks: [
          { id: uid(), title: 'Выбрать структуру', done: true },
          { id: uid(), title: 'Собрать цифры', done: false },
          { id: uid(), title: 'Сверить с прошлым кварталом', done: false }
        ] },
      { id: uid(), title: 'Позвонить в автосервис', bucket: 'today', date: seedDay(0), done: false, note: '',
        time: null, repeat: '', series: null, goalId: null, stageId: null, subtasks: [] },
      { id: uid(), title: 'Разговорный клуб', bucket: 'today', date: seedDay(0), done: true, note: '',
        time: '19:00', repeat: '', series: null, goalId: g1, stageId: s13, subtasks: [] },
      { id: uid(), title: 'Урок с преподавателем', bucket: 'tomorrow', date: seedDay(1), done: false, note: '',
        time: '08:00', repeat: 'weekly', series: null, goalId: g1, stageId: s12, subtasks: [] },
      { id: uid(), title: 'Тренировка 30 минут', bucket: 'tomorrow', date: seedDay(1), done: false, note: '',
        time: '08:00', repeat: 'weekdays', series: null, goalId: g2, stageId: s21, subtasks: [] },
      { id: uid(), title: 'Оплатить аренду', bucket: 'thisWeek', date: null, done: false,
        note: 'Каждый месяц по одному числу.', time: null, repeat: 'monthly', series: null,
        goalId: null, stageId: null, subtasks: [] }
    ],
    goals: [
      { id: g1, title: 'Выучить английский за год',
        purpose: 'Чтобы читать документацию и говорить на созвонах без страха',
        sphere: 'career', horizon: 'Год', pinned: true,
        stages: [
          { id: s11, title: 'Сдать пробный экзамен', detail: 'Понять уровень, от которого идём', status: 'done' },
          { id: s12, title: 'Заниматься трижды в неделю', detail: '', status: 'active' },
          { id: s13, title: 'Разговорный клуб раз в месяц', detail: '', status: 'planned' }
        ] },
      { id: g2, title: 'Вернуть форму',
        purpose: 'Чтобы хватало сил на вечер, а не только на работу',
        sphere: 'health', horizon: 'Полгода', pinned: false,
        stages: [
          { id: s21, title: 'Три тренировки в неделю', detail: '', status: 'active' },
          { id: s22, title: 'Сон до полуночи', detail: '', status: 'planned' }
        ] }
    ],
    lists: [
      { id: uid(), title: 'Собрать чемодан в Сочи', note: 'Вылет в субботу утром',
        items: [
          { id: uid(), title: 'Паспорт и билеты', done: true },
          { id: uid(), title: 'Крем от солнца', done: false },
          { id: uid(), title: 'Зарядка для телефона', done: false }
        ] }
    ],
    notes: [
      { id: uid(), title: 'Встреча с подрядчиком',
        body: 'Обсудили сроки: черновой этап к 20 числу, приём работ через неделю.' }
    ],
    pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, mode: 'focus', doneToday: 0 },
    meditation: { minutes: 10, sound: 'Дождь', doneTotal: 0, totalMinutes: 0, volume: 0.7 }
  };
}

function load(){
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    var parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2 || !parsed.tasks) return seed();
    // Поля, которых могло не быть в раньше сохранённом состоянии.
    parsed.drag = null;
    if (!parsed.auth) parsed.auth = { stage: 'email', email: '', sent: '', error: '' };
    if (!parsed.palette) parsed.palette = 'paper';
    if (!parsed.mm) parsed.mm = { zoom: 1 };
    if (!parsed.closed) parsed.closed = {};
    if (!parsed.open) parsed.open = {};
    if (!parsed.profile) parsed.profile = { name: '', avatar: '' };
    if (!parsed.openGoal) parsed.openGoal = {};
    if (typeof parsed.meditation.volume !== 'number') parsed.meditation.volume = 0.7;
    if (typeof parsed.meditation.totalMinutes !== 'number') parsed.meditation.totalMinutes = 0;
    if (typeof parsed.goalDraft !== 'string') parsed.goalDraft = '';
    if (!parsed.font) parsed.font = 'rounded';
    if (!parsed.fontSize) parsed.fontSize = 'standard';
    if (!parsed.box) parsed.box = 'square';
    parsed.more = false;
    // Раздела «Главная» больше нет: состояние, сохранённое на нём, никуда бы
    // не отрисовалось.
    if (parsed.view === 'home') parsed.view = 'tasks';
    return parsed;
  } catch (e) {
    return seed();
  }
}

/// Молчаливый отказ хранилища — худший из возможных: человек продолжает
/// работать, а ничего не сохраняется. Приватный режим и переполнение квоты
/// бросают исключение, поэтому про них надо сказать вслух.
var storageBroken = false;
function save(){
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    storageBroken = false;
  } catch (e) {
    if (!storageBroken){
      storageBroken = true;
      pendingToast = 'Не удалось сохранить: браузер не даёт записать данные';
    }
  }
}

var S = load();

/* Первое открытие в новый день. Порт archiveCompletedTasksIfNeeded и сдвига
   сроков: невыполненное вчерашнее переезжает в «Сегодня» и помечается
   перенесённым, выполненное вчерашнее уходит из блоков в архив. Иначе через
   неделю в «Сегодня» свалка из того, что никто не делал.

   Дата последнего открытия хранится рядом с данными, поэтому переезд
   случается ровно один раз в день, а не на каждую перерисовку. */
function rolloverIfNeeded(){
  var today = isoOf(todayDate());
  if (S.lastOpened === today) return;

  var moved = 0, archived = 0;
  for (var i = 0; i < S.tasks.length; i++){
    var t = S.tasks[i];
    if (!t.date || t.date >= today) continue;

    if (t.done){
      // Выполненное вчерашнее не мозолит глаза, но и не пропадает: экран
      // «Аналитика» продолжает его считать.
      if (!t.archived){ t.archived = true; archived += 1; }
      continue;
    }
    t.carriedFrom = t.carriedFrom || t.date;
    t.date = today;
    t.bucket = 'today';
    moved += 1;
  }

  S.lastOpened = today;
  if (moved || archived){
    pendingToast = (moved ? 'Перенесено на сегодня: ' + moved : '') +
      (moved && archived ? ' · ' : '') +
      (archived ? 'в архив: ' + archived : '');
  }
  save();
}

/// Задачи, которые видно на экранах. Архив показывается только в аналитике.
function liveTasks(){
  return S.tasks.filter(function(t){ return !t.archived; });
}

/* ============ МЕЛОЧИ ============ */

var $ = function(id){ return document.getElementById(id); };

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function plural(n, one, few, many){
  var t = n % 10, h = n % 100;
  if (h >= 11 && h <= 14) return many;
  if (t === 1) return one;
  if (t >= 2 && t <= 4) return few;
  return many;
}

function taskCount(n){ return n + ' ' + plural(n, 'задача', 'задачи', 'задач'); }

function pct(done, total){ return total ? Math.round(done / total * 100) : 0; }

function findTask(id){
  for (var i = 0; i < S.tasks.length; i++) if (S.tasks[i].id === id) return S.tasks[i];
  return null;
}
function findGoal(id){
  for (var i = 0; i < S.goals.length; i++) if (S.goals[i].id === id) return S.goals[i];
  return null;
}
function findStage(goal, id){
  if (!goal) return null;
  for (var i = 0; i < goal.stages.length; i++) if (goal.stages[i].id === id) return goal.stages[i];
  return null;
}
function findList(id){
  for (var i = 0; i < S.lists.length; i++) if (S.lists[i].id === id) return S.lists[i];
  return null;
}
function findNote(id){
  for (var i = 0; i < S.notes.length; i++) if (S.notes[i].id === id) return S.notes[i];
  return null;
}

function tasksOfGoal(goalId){
  return S.tasks.filter(function(t){ return t.goalId === goalId; });
}
function tasksOfStage(goalId, stageId){
  return S.tasks.filter(function(t){ return t.goalId === goalId && t.stageId === stageId; });
}

/* ============ БЛОКИ ДНЯ ============ */

/* Порядок, названия и подписи — из TaskBucket в Models.swift. День, в котором
   лежит задача, это единственное, в чём веб и приложение не имеют права
   расходиться. */
/* Подписей под названиями блоков нет: «Сегодня» не нуждается в пояснении
   «то, что важно не потерять сегодня». Пять таких строк съедали экран и
   ничего не сообщали. */
var BUCKETS = [
  { id: 'today',             title: 'Сегодня' },
  { id: 'tomorrow',          title: 'Завтра' },
  { id: 'dayAfterTomorrow',  title: 'Послезавтра' },
  { id: 'thisWeek',          title: 'На неделе' },
  { id: 'later',             title: 'Потом' }
];

function bucketTitle(id){
  for (var i = 0; i < BUCKETS.length; i++) if (BUCKETS[i].id === id) return BUCKETS[i].title;
  return id;
}

/* Блоки «на неделе» и «потом» не называют конкретный день, поэтому время в них
   не хранится — ровно как spansSeveralDays в приложении. */
function spansSeveralDays(bucket){ return bucket === 'thisWeek' || bucket === 'later'; }

/* ============ ДАТЫ ============ */

/* Дата хранится строкой YYYY-MM-DD: в localStorage всё равно едет текст, а так
   его не надо разбирать обратно в объект при каждом сравнении. */
function isoOf(date){
  var m = date.getMonth() + 1, d = date.getDate();
  return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}
function dateOf(iso){
  if (!iso) return null;
  var p = String(iso).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
function todayDate(){
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function addDays(date, days){
  var next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}
function dayDiff(fromISO, toISO){
  var a = dateOf(fromISO), b = dateOf(toISO);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

/* derivedBucket(for:) из TodayPlanView.swift: блок задачи выводится из даты,
   а не хранится отдельно, иначе они разъезжаются. */
function derivedBucket(iso){
  if (!iso) return 'later';
  var offset = dayDiff(isoOf(todayDate()), iso);
  if (offset < 1) return 'today';
  if (offset === 1) return 'tomorrow';
  if (offset === 2) return 'dayAfterTomorrow';
  if (offset <= 6) return 'thisWeek';
  return 'later';
}

/// Дата, на которую встаёт задача, если человек выбрал блок руками.
/// «На неделе» и «Потом» конкретного дня не называют — у них даты нет.
function dateForBucket(bucket){
  var today = todayDate();
  if (bucket === 'today') return isoOf(today);
  if (bucket === 'tomorrow') return isoOf(addDays(today, 1));
  if (bucket === 'dayAfterTomorrow') return isoOf(addDays(today, 2));
  return null;
}

function humanDate(iso){
  var d = dateOf(iso);
  if (!d) return '';
  var months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return d.getDate() + ' ' + months[d.getMonth()];
}

/* ============ РАЗБОР СТРОКИ ============ */

/* Порт TaskSchedulingParser.swift и cleanTaskTitle. Правила зафиксированы
   тестами TaskSchedulingParserTests и TaskTitleMarkerTests, оттуда же взяты
   и проверки на «завтрак» и «визу»:

   - «завтра», «послезавтра», «сегодня», «в выходные», день недели (с «следующий»
     — на неделю дальше), «25.08», «3 сентября» дают явную дату;
   - время понимается как «в 9:30», «в 8 вечера», «в восемь», «в полдень»;
   - вечер и день двигают час за полдень, утро и ночь — нет, 12 ночи это 0:00;
   - время без дня ставит задачу на день блока по умолчанию;
   - без дня и без времени даты нет вообще — задача просто ложится в блок;
   - слова вырезаются из названия только там, где стоят отдельным словом:
     «сделать завтрак» остаётся завтраком.
*/

var WORD_START = '(^|[^а-яa-z0-9])';
var WORD_END = '(?=[^а-яa-z0-9]|$)';

function wordRegex(body){
  return new RegExp(WORD_START + '(?:' + body + ')' + WORD_END, 'i');
}

function normalizeText(text){
  return String(text == null ? '' : text).toLowerCase().replace(/ё/g, 'е');
}

var WEEKDAY_PATTERNS = [
  [1, 'понедельник(?:а|у|ом)?|пн'],
  [2, 'вторник(?:а|у|ом)?|вт'],
  [3, 'сред(?:а|у|ы|е|ой)|ср'],
  [4, 'четверг(?:а|у|ом)?|чт'],
  [5, 'пятниц(?:а|у|ы|е|ей)|пт'],
  [6, 'суббот(?:а|у|ы|е|ой)|сб'],
  [0, 'воскресен(?:ье|ья|ью|ьем)|вск|вс']
];

var MONTHS = [
  'январ[ьяею]?|янв', 'феврал[ьяею]?|фев', 'март[аеу]?|мар', 'апрел[ьяею]?|апр',
  'ма[йяею]', 'июн[ьяею]?', 'июл[ьяею]?', 'август[аеу]?|авг',
  'сентябр[ьяею]?|сент|сен', 'октябр[ьяею]?|окт', 'ноябр[ьяею]?|ноя', 'декабр[ьяею]?|дек'
];

var HOUR_WORDS = {
  'час': 1, 'часа': 1, 'часов': 1, 'один': 1, 'одну': 1, 'два': 2, 'две': 2, 'три': 3,
  'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9,
  'десять': 10, 'одиннадцать': 11, 'двенадцать': 12
};

/// adjustHour из TaskSchedulingParser: «дня» и «вечера» переносят за полдень,
/// «утра» и «ночи» оставляют до, а двенадцать ночи — это ноль.
function adjustHour(hour, meridiem){
  if (!meridiem) return hour;
  if (meridiem === 'дня' || meridiem === 'вечера') return hour === 12 ? 12 : (hour < 12 ? hour + 12 : hour);
  if (meridiem === 'утра' || meridiem === 'ночи') return hour === 12 ? 0 : hour;
  return hour;
}

/// Возвращает { title, date, time, hasDate, hasTime, bucket }.
function parseSchedule(text, fallbackBucket){
  var original = String(text == null ? '' : text).trim();
  var work = normalizeText(original);
  var cuts = [];           // куски, которые уйдут из названия
  var today = todayDate();
  var date = null, time = null;

  var take = function(regex){
    var m = work.match(regex);
    if (!m) return null;
    // Первая группа — символ перед словом, его вырезать нельзя.
    var lead = m[1] || '';
    cuts.push(m[0].slice(lead.length));
    return m;
  };

  /* --- день --- */
  if (take(wordRegex('послезавтра'))) date = addDays(today, 2);
  else if (take(wordRegex('завтра'))) date = addDays(today, 1);
  else if (take(wordRegex('сегодня'))) date = today;
  else if (take(wordRegex('(?:в|на)\\s+выходны[хе]|выходны[хе]'))) {
    // Ближайшая суббота, как nextWeekendStart.
    var untilSaturday = (6 - today.getDay() + 7) % 7;
    date = addDays(today, untilSaturday === 0 ? 7 : untilSaturday);
  }

  if (!date){
    for (var w = 0; w < WEEKDAY_PATTERNS.length && !date; w++){
      var target = WEEKDAY_PATTERNS[w][0];
      var m = take(wordRegex('(?:(?:в|на|к|до)\\s+)?(?:(эту|этот|эта|этой|ближайш(?:ую|ий|ая|ей)|след(?:ующ(?:ую|ий|ая|ей))?)\\s+)?(?:' + WEEKDAY_PATTERNS[w][1] + ')'));
      if (!m) continue;
      var modifier = m[2] || '';
      var until = (target - today.getDay() + 7) % 7;
      if (/след/.test(modifier)) until += 7;
      if (until === 0) until = 7;
      date = addDays(today, until);
    }
  }

  if (!date){
    var numericProbe = work.match(new RegExp(WORD_START + '(\\d{1,2})[.\\/](\\d{1,2})(?:[.\\/](\\d{2,4}))?' + WORD_END));
    // «в 9.30» — это половина десятого, а не тридцатый месяц.
    var numeric = (numericProbe && Number(numericProbe[3]) >= 1 && Number(numericProbe[3]) <= 12 && Number(numericProbe[2]) <= 31)
      ? take(new RegExp(WORD_START + '(\\d{1,2})[.\\/](\\d{1,2})(?:[.\\/](\\d{2,4}))?' + WORD_END))
      : null;
    if (numeric){
      var year = numeric[4] ? Number(numeric[4]) : today.getFullYear();
      if (year < 100) year += 2000;
      var guess = new Date(year, Number(numeric[3]) - 1, Number(numeric[2]));
      // Дата без года, которая уже прошла, относится к следующему году.
      if (!numeric[4] && guess < today) guess = new Date(year + 1, Number(numeric[3]) - 1, Number(numeric[2]));
      date = guess;
    }
  }

  if (!date){
    for (var mo = 0; mo < MONTHS.length && !date; mo++){
      var named = take(new RegExp(WORD_START + '(\\d{1,2})\\s+(?:' + MONTHS[mo] + ')' + WORD_END));
      if (!named) continue;
      var candidate = new Date(today.getFullYear(), mo, Number(named[2]));
      if (candidate < today) candidate = new Date(today.getFullYear() + 1, mo, Number(named[2]));
      date = candidate;
    }
  }

  /* --- время --- */
  var withMinutes = take(new RegExp(WORD_START + '(?:(?:в|к|на)\\s*)?([01]?\\d|2[0-3])[:.]([0-5]\\d)' + WORD_END));
  if (withMinutes){
    time = clock(Number(withMinutes[2]), Number(withMinutes[3]));
  } else {
    var withPeriod = take(new RegExp(WORD_START + '(?:в|к|на)\\s*([01]?\\d|2[0-3])\\s+(утра|дня|вечера|ночи)' + WORD_END));
    if (withPeriod){
      time = clock(adjustHour(Number(withPeriod[2]), withPeriod[3]), 0);
    } else {
      var named2 = take(wordRegex('(?:в|к|на)\\s+(полдень|полночь|обед(?:а)?)'));
      if (named2){
        var keyword = named2[2];
        time = keyword === 'полдень' ? '12:00' : keyword === 'полночь' ? '00:00' : '13:00';
      } else {
        var wordHour = take(new RegExp(WORD_START + '(?:в|к|на)\\s+(час|часа|часов|одиннадцать|двенадцать|один|одну|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)(?:\\s+(утра|дня|вечера|ночи))?' + WORD_END));
        if (wordHour){
          time = clock(adjustHour(HOUR_WORDS[wordHour[2]], wordHour[3]), 0);
        } else {
          var hourOnly = take(new RegExp(WORD_START + '(?:в|к|на)\\s*([01]?\\d|2[0-3])' + WORD_END));
          if (hourOnly) time = clock(Number(hourOnly[2]), 0);
        }
      }
    }
  }

  /* --- блок словами, если даты так и нет --- */
  var bucket = null;
  if (!date){
    if (take(wordRegex('на\\s+неделе|до\\s+конца\\s+недели'))) bucket = 'thisWeek';
    else if (take(wordRegex('потом|когда-нибудь'))) bucket = 'later';
  }

  /* --- название --- */
  // Режем ровно те куски, что распознали, из исходной строки — с учётом
  // регистра и «ё». Куски искали в нормализованном тексте, поэтому ищем по
  // нормализованной копии и вырезаем по найденным позициям.
  var lowered = normalizeText(original);
  var keep = original.split('');
  for (var c = 0; c < cuts.length; c++){
    var at = lowered.indexOf(cuts[c]);
    if (at < 0) continue;
    for (var k = at; k < at + cuts[c].length; k++) keep[k] = ' ';
    lowered = lowered.slice(0, at) + new Array(cuts[c].length + 1).join(' ') + lowered.slice(at + cuts[c].length);
  }
  var title = keep.join('').replace(/\s+/g, ' ').trim();

  // Служебные слова в начале — «создай задачу», «добавь», — как в cleanTaskTitle.
  // cleanTaskTitle: режутся только команды, стоящие отдельным словом.
  // «Оформить визу» и «Сделать завтрак» остаются как есть — на этом ловил тест.
  title = title.replace(/^(?:создай|добавь|оформи|запиши|напомни)\s+(?:задачу\s+|мне\s+)?/i, '');
  title = title.charAt(0).toUpperCase() + title.slice(1);

  if (!date && time){
    // Время без дня ставит задачу на день блока по умолчанию.
    date = dateOf(dateForBucket(fallbackBucket || 'today')) || today;
  }

  var iso = date ? isoOf(date) : null;
  var finalBucket = iso ? derivedBucket(iso) : (bucket || fallbackBucket || 'today');
  if (!iso && (finalBucket === 'today' || finalBucket === 'tomorrow' || finalBucket === 'dayAfterTomorrow')){
    iso = dateForBucket(finalBucket);
  }
  // Блоки «На неделе» и «Потом» не называют конкретный день, поэтому времени
  // там нет (TaskBucket.spansSeveralDays). Но названную вслух дату не теряем:
  // «оплатить 25.08» обязано помнить 25 августа.
  if (spansSeveralDays(finalBucket)){
    time = null;
    if (!date) iso = null;
  }

  return { title: title, date: iso, time: time, bucket: finalBucket, hasDate: !!date, hasTime: !!time };
}

function clock(h, m){
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/* ============ ПОВТОРЫ ============ */

/* Порт TaskRepeatRule: правило хранится объектом, а не строкой, потому что
   «каждый месяц 31 числа» и «по будням» строкой не считаются. Поведение
   зафиксировано TaskRepeatRuleTests: интервал никогда не ноль, следующая дата
   всегда в будущем, «только будни» не приземляется на выходные, месячное
   правило переносится в следующий месяц и переживает короткий февраль. */

var REPEAT_PRESETS = [
  { id: '', title: 'Без повтора', rule: null },
  { id: 'daily', title: 'Каждый день', rule: { unit: 'day', interval: 1 } },
  { id: 'every2', title: 'Каждые 2 дня', rule: { unit: 'day', interval: 2 } },
  { id: 'weekdays', title: 'По будням', rule: { unit: 'day', interval: 1, weekdaysOnly: true } },
  { id: 'weekly', title: 'Каждую неделю', rule: { unit: 'week', interval: 1 } },
  { id: 'monthly', title: 'Каждый месяц', rule: { unit: 'month', interval: 1 } }
];

function repeatPreset(id){
  for (var i = 0; i < REPEAT_PRESETS.length; i++) if (REPEAT_PRESETS[i].id === id) return REPEAT_PRESETS[i];
  return REPEAT_PRESETS[0];
}

function repeatLabel(id){
  var preset = repeatPreset(id);
  return preset.rule ? preset.title.toLowerCase() : '';
}

function normalizedInterval(rule){
  return Math.max(1, Math.min(rule.interval || 1, 365));
}

/// Один шаг правила. Отдельная функция, потому что nextOccurrence шагает по ней
/// до тех пор, пока не перевалит за минимальную дату.
function advancedDate(date, rule){
  var next = new Date(date.getTime());
  var step = normalizedInterval(rule);

  if (rule.unit === 'day'){
    if (rule.weekdaysOnly){
      // С пятницы следующая — понедельник, а не суббота.
      for (var i = 0; i < step; i++){
        do { next = addDays(next, 1); } while (next.getDay() === 0 || next.getDay() === 6);
      }
      return next;
    }
    return addDays(next, step);
  }

  if (rule.unit === 'week'){
    var days = (rule.weeklyWeekdays && rule.weeklyWeekdays.length) ? rule.weeklyWeekdays.slice() : [date.getDay()];
    days.sort(function(a, b){ return a - b; });
    // Несколько дней в неделе — берётся ближайший следующий.
    for (var d = 0; d < days.length; d++){
      var delta = (days[d] - next.getDay() + 7) % 7;
      if (delta > 0) return addDays(next, delta);
    }
    return addDays(next, 7 * step - ((next.getDay() - days[0] + 7) % 7));
  }

  // Месяц. Число берётся из правила или из самой даты; в коротком месяце
  // прижимается к последнему дню, а не уезжает в следующий.
  var wanted = (rule.monthlyDays && rule.monthlyDays.length) ? rule.monthlyDays[0] : date.getDate();
  var year = next.getFullYear(), month = next.getMonth();
  var candidate = new Date(year, month, Math.min(wanted, daysInMonth(year, month)));
  var guard = 0;
  while (candidate <= date && guard < 64){
    month += step;
    year += Math.floor(month / 12);
    month = ((month % 12) + 12) % 12;
    candidate = new Date(year, month, Math.min(wanted, daysInMonth(year, month)));
    guard += 1;
  }
  return candidate;
}

function daysInMonth(year, month){
  return new Date(year, month + 1, 0).getDate();
}

/// nextOccurrence(after:onOrAfter:) — шагает, пока не уйдёт за минимум, и
/// прекращает, как только шаг перестал двигать дату (иначе вечный цикл).
function nextOccurrence(fromISO, ruleId, minISO){
  var rule = repeatPreset(ruleId).rule;
  if (!rule) return null;
  var candidate = dateOf(fromISO) || todayDate();
  var minimum = dateOf(minISO) || candidate;
  var steps = 512;
  do {
    var previous = candidate;
    candidate = advancedDate(candidate, rule);
    if (candidate <= previous) return isoOf(candidate);
    steps -= 1;
  } while (candidate < minimum && steps > 0);
  return isoOf(candidate);
}

/// Следующее повторение той же серии. Возвращает созданную задачу или null.
function spawnNextOccurrence(task){
  var base = task.date || isoOf(todayDate());
  var next = nextOccurrence(base, task.repeat, isoOf(addDays(dateOf(base) || todayDate(), 1)));
  if (!next) return null;

  var series = task.series || task.id;
  // Дубль той же серии на тот же день не создаём — hasRecurringOccurrence.
  for (var i = 0; i < S.tasks.length; i++){
    var other = S.tasks[i];
    if ((other.series || other.id) === series && other.date === next && !other.done) return null;
  }

  var copy = {
    id: uid(), title: task.title, bucket: derivedBucket(next), date: next, done: false,
    note: task.note, time: task.time, repeat: task.repeat, series: series,
    goalId: task.goalId, stageId: task.stageId,
    subtasks: task.subtasks.map(function(s){ return { id: uid(), title: s.title, done: false }; })
  };
  S.tasks.push(copy);
  return copy;
}

/* ============ ПРОСРОЧКА ============ */

/// Задача просрочена, если её день (а если задано — и время) уже прошёл.
function isOverdue(task){
  if (task.done || !task.date) return false;
  var now = new Date();
  var day = dateOf(task.date);
  if (!day) return false;
  if (task.time){
    var parts = task.time.split(':');
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(parts[0]), Number(parts[1]));
    return day < now;
  }
  return day < todayDate();
}

/* ============ РОУТИНГ ============ */

/* Порядок разделов задан владельцем: задачи, цели, мой фокус, аналитика,
   списки, заметки, помодоро, медитация, настройки, о сервисе. Отдельного
   раздела «Главная» больше нет — то, что в нём лежало, стало пунктами меню.

   Десять пунктов — это меню, а не таб-бар. На широком экране они умещаются
   колонкой слева целиком. На телефоне в нижнюю панель влезает четыре, поэтому
   там первые четыре и кнопка «Ещё», открывающая остальные списком: прятать
   половину разделов за горизонтальной прокруткой хуже, чем честно показать,
   что их больше. */
var TABS = [
  { id: 'tasks',      title: 'Задачи',    ic: '☑', primary: true },
  { id: 'goals',      title: 'Цели',      ic: '◎', primary: true },
  { id: 'focus',      title: 'Мой фокус', ic: '✦', primary: true },
  { id: 'analytics',  title: 'Аналитика', ic: '◔', primary: true },
  { id: 'lists',      title: 'Списки',    ic: '≡' },
  { id: 'notes',      title: 'Заметки',   ic: '✎' },
  { id: 'pomodoro',   title: 'Метод Помодоро', ic: '◔', short: 'Помодоро' },
  { id: 'meditation', title: 'Медитация', ic: '◐' },
  { id: 'settings',   title: 'Настройки', ic: '⚙' },
  { id: 'about',      title: 'О сервисе', ic: 'ⓘ' }
];

/* Какой пункт меню подсвечивать на экране, который сам пунктом не является. */
var TAB_OF_VIEW = {
  goal: 'goals',
  list: 'lists',
  note: 'notes',
  profile: 'settings',
  'settings-view': 'settings',
  'settings-data': 'settings'
};

var VIEWS = {
  analytics:  { title: 'Аналитика',  render: vAnalytics },
  focus:      { title: 'Мой фокус',  render: vFocus },
  goals:      { title: 'Цели',       render: vGoals },
  goal:       { title: 'Цель',       render: vGoal },
  tasks:      { title: 'Задачи',     render: vTasks },
  settings:   { title: 'Настройки',  render: vSettings },
  'settings-view': { title: 'Вид',   render: vSettingsView },
  'settings-data': { title: 'Данные', render: vSettingsData },
  about:      { title: 'О сервисе',  render: vAbout },
  profile:    { title: 'Профиль',    render: vProfile },
  lists:      { title: 'Списки',     render: vLists },
  list:       { title: 'Список',     render: vList },
  notes:      { title: 'Заметки',    render: vNotes },
  note:       { title: 'Заметка',    render: vNote },
  pomodoro:   { title: 'Метод Помодоро', render: vPomodoro },
  meditation: { title: 'Медитация',  render: vMeditation }
};

function go(view){
  // Прослушивание среды не должно продолжаться на другом экране: человек
  // ушёл из медитации, а из вкладки всё ещё шумит дождь.
  if (view !== 'meditation' && med.preview){
    med.preview = false;
    medAudioStop();
  }
  S.view = view;
  S.more = false;
  // Уход с аналитики закрывает развёрнутую карту: иначе она осталась бы
  // висеть поверх другого экрана.
  if (S.mm && S.mm.full){
    S.mm.full = false; S.mm.zoom = 1;
    document.body.classList.remove('mm-open');
  }
  save();
  rolloverIfNeeded();
render();
  window.scrollTo(0, 0);
}

/* ============ ОТРИСОВКА ============ */

function render(){
  applyTheme();

  if (S.auth.stage !== 'in'){
    $('top').innerHTML = '';
    $('tabbar').classList.add('hidden');
    $('app').innerHTML = vAuth();
    return;
  }

  var view = VIEWS[S.view] || VIEWS.tasks;
  $('top').innerHTML = vTop() + (storageBroken ? vStorageWarning() : '');
  $('tabbar').classList.remove('hidden');
  $('tabbar').innerHTML = vTabbar();
  $('app').innerHTML = view.render();

  restoreComposer();
  fitMindMap();
  showToast();
}

/* ============ ТЕМА ============ */

/* Палитры перенесены из AppTheme.swift — все десять, в том же порядке. Каждая
   строка v: восемнадцать чисел по три на цвет, в порядке PALETTE_KEYS.
   Внешний вид у веба и у приложения общий сознательно, поэтому цвета не
   выдуманы заново, а взяты оттуда. */
var PALETTE_KEYS = ['lightBackground','darkBackground','lightTextPrimary','darkTextPrimary','lightTextSecondary','darkTextSecondary','lightStroke','darkStroke','accent','accentDark','accentWarm','accentWarmDark','focusBlue','focusBlueDark','focusGreen','focusGreenDark','focusOrange','focusOrangeDark'];
var PALETTES = [
  { id: 'paper', title: 'Бумага', v: [246,242,231,28,31,26,33,31,26,244,240,230,97,92,80,184,181,166,220,213,196,58,63,53,37,80,59,143,194,166,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'graphite', title: 'Графит', v: [240,241,242,25,27,29,29,32,35,237,239,241,88,93,99,174,180,186,210,213,217,51,56,61,70,84,95,159,178,190,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'forest', title: 'Лес', v: [235,242,235,17,26,20,21,32,24,232,241,233,78,92,81,167,184,171,203,218,204,38,55,43,38,113,75,105,194,152,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'brass', title: 'Латунь', v: [249,241,220,33,28,17,36,30,18,246,238,219,102,91,65,190,177,142,226,213,180,65,55,35,126,96,35,219,184,106,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'burgundy', title: 'Бордо', v: [249,238,236,33,24,25,36,26,25,246,236,235,106,86,84,192,167,166,229,207,204,65,44,45,126,58,62,222,146,149,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'tobacco', title: 'Табак', v: [245,236,222,30,24,17,35,27,18,242,234,221,101,87,66,186,169,143,222,203,174,58,46,34,110,75,51,199,152,120,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'indigo', title: 'Индиго', v: [236,240,248,19,23,34,23,27,38,234,238,247,82,90,109,168,177,198,203,212,230,43,51,72,47,74,122,143,174,224,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'plum', title: 'Слива', v: [245,237,245,29,22,32,33,26,35,243,235,244,97,83,105,183,166,190,222,203,224,58,44,64,94,58,110,194,149,212,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'sea', title: 'Море', v: [231,242,242,12,27,28,15,33,34,228,241,241,70,93,94,158,182,183,194,219,218,30,55,57,11,112,120,95,195,198,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'charcoal', title: 'Уголь', v: [242,239,233,24,22,19,28,26,22,240,237,231,90,85,75,176,170,156,217,210,196,51,47,41,58,52,42,200,185,148,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] }
];

/* Значки на карточке задачи. Раньше здесь стояли символы шрифта — ⇅, ✎, ✕:
   они наследовали начертание, в разных браузерах выходили разной толщины, а
   «перенести в блок» из двойной стрелки не читалось. Рисунок свой и один на
   всех, подписи остаются в aria-label рядом. */
var ICON = {
  move: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M8 2.6v10.8M8 2.6 5.2 5.4M8 2.6l2.8 2.8M8 13.4l-2.8-2.8M8 13.4l2.8-2.8"/></svg>',
  edit: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M10.4 2.9 13.1 5.6M11.4 1.9a1.4 1.4 0 0 1 2 2l-8 8-2.7.7.7-2.7z"/></svg>',
  kill: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  ai: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z"/>' +
    '<path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>',
  full: '<svg viewBox="0 0 16 16" aria-hidden="true" style="width:14px;height:14px;fill:none;' +
    'stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;display:inline-block;vertical-align:-2px">' +
    '<path d="M6 2H2v4M10 2h4v4M10 14h4v-4M6 14H2v-4"/></svg>'
};

function paletteOf(id){
  for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i].id === id) return PALETTES[i];
  return PALETTES[0];
}

function paletteColor(pal, key){
  var idx = PALETTE_KEYS.indexOf(key) * 3;
  return [pal.v[idx], pal.v[idx + 1], pal.v[idx + 2]];
}

/* blendedThemeRGBA из AppTheme.swift — та же формула, чтобы panel, panelStrong
   и stroke получились ровно как в приложении, а не «на глаз». */
function blend(base, overlay, amount){
  var a = Math.min(Math.max(amount, 0), 1);
  return [
    base[0] + (overlay[0] - base[0]) * a,
    base[1] + (overlay[1] - base[1]) * a,
    base[2] + (overlay[2] - base[2]) * a
  ];
}

var WHITE = [255, 255, 255];
var BLACK = [0, 0, 0];

function rgb(c){
  return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
}
function rgba(c, alpha){
  return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + alpha + ')';
}

function isDarkNow(){
  if (S.theme === 'dark') return true;
  if (S.theme === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/// Цвета, которыми пользуется и CSS, и mind map. Считаются по тем же
/// правилам, что AppTheme.panel / .panelStrong / .stroke.
/* ---- разделение фона и карточек ---- */

/* Карточки почти сливались с фоном, и в части палитр их было не различить.
   Причина в том, как считались уровни: смешивание с чёрным или белым в долях
   даёт разный видимый шаг на светлом и тёмном, на сером и на цветном фоне —
   0.035 чёрного по бумаге заметно, а по графиту почти нет.

   Считаем в Lab: там L отвечает за воспринимаемую светлоту, и сдвиг на
   пять единиц выглядит одинаковым шагом на любом фоне. Тон и насыщенность
   при этом не трогаем — палитра остаётся собой, меняется только светлота.
   Шаги подобраны так, чтобы карточка отделялась от фона, а обводка от
   карточки, но ничего не выглядело чужой заплаткой. */

function _pivot(c){ return c > 0.008856 ? Math.pow(c, 1 / 3) : (7.787 * c) + 16 / 116; }
function _unpivot(c){ var c3 = c * c * c; return c3 > 0.008856 ? c3 : (c - 16 / 116) / 7.787; }
function _toLinear(v){ v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }
function _fromLinear(v){
  v = v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v;
  return Math.max(0, Math.min(255, v * 255));
}

var _WHITE_XYZ = [95.047, 100.0, 108.883];

function rgbToLab(c){
  var r = _toLinear(c[0]) * 100, g = _toLinear(c[1]) * 100, b = _toLinear(c[2]) * 100;
  var x = _pivot((r * 0.4124 + g * 0.3576 + b * 0.1805) / _WHITE_XYZ[0]);
  var y = _pivot((r * 0.2126 + g * 0.7152 + b * 0.0722) / _WHITE_XYZ[1]);
  var z = _pivot((r * 0.0193 + g * 0.1192 + b * 0.9505) / _WHITE_XYZ[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labToRgb(lab){
  var y = (lab[0] + 16) / 116, x = lab[1] / 500 + y, z = y - lab[2] / 200;
  x = _unpivot(x) * _WHITE_XYZ[0]; y = _unpivot(y) * _WHITE_XYZ[1]; z = _unpivot(z) * _WHITE_XYZ[2];
  x /= 100; y /= 100; z /= 100;
  return [
    _fromLinear(x * 3.2406 + y * -1.5372 + z * -0.4986),
    _fromLinear(x * -0.9689 + y * 1.8758 + z * 0.0415),
    _fromLinear(x * 0.0557 + y * -0.2040 + z * 1.0570)
  ];
}

/// Сдвинуть цвет по светлоте на `delta` единиц L*, сохранив тон.
/// У самых краёв шкалы места нет — там уходим в противоположную сторону,
/// иначе на почти чёрном фоне карточка получилась бы того же цвета.
function shiftL(color, delta){
  var lab = rgbToLab(color);
  var next = lab[0] + delta;
  if (next > 100) next = lab[0] - Math.abs(delta);
  if (next < 0) next = lab[0] + Math.abs(delta);
  return labToRgb([Math.max(0, Math.min(100, next)), lab[1], lab[2]]);
}

function themeColors(){
  var pal = paletteOf(S.palette);
  var dark = isDarkNow();
  var background = paletteColor(pal, dark ? 'darkBackground' : 'lightBackground');
  var accent = paletteColor(pal, dark ? 'accentDark' : 'accent');

  // На тёмном фоне светлота растёт, на светлом падает — карточка всегда
  // «ближе» к зрителю, чем фон под ней.
  var dir = dark ? 1 : -1;

  return {
    dark: dark,
    background: background,
    // Небольшая примесь акцента остаётся: без неё панели у всех десяти
    // палитр выглядели одинаково серыми.
    panel: blend(shiftL(background, dir * 5.5), accent, 0.03),
    panelStrong: blend(shiftL(background, dir * 11), accent, 0.04),
    stroke: blend(shiftL(background, dir * 20), accent, dark ? 0.07 : 0.09),
    text: paletteColor(pal, dark ? 'darkTextPrimary' : 'lightTextPrimary'),
    textSecondary: paletteColor(pal, dark ? 'darkTextSecondary' : 'lightTextSecondary'),
    accent: accent,
    accentWarm: paletteColor(pal, dark ? 'accentWarmDark' : 'accentWarm'),
    focusGreen: paletteColor(pal, dark ? 'focusGreenDark' : 'focusGreen'),
    focusBlue: paletteColor(pal, dark ? 'focusBlueDark' : 'focusBlue'),
    focusOrange: paletteColor(pal, dark ? 'focusOrangeDark' : 'focusOrange')
  };
}

function applyTheme(){
  var c = themeColors();
  var root = document.documentElement.style;
  root.setProperty('--background', rgb(c.background));
  root.setProperty('--panel', rgb(c.panel));
  root.setProperty('--panel-strong', rgb(c.panelStrong));
  root.setProperty('--stroke', rgb(c.stroke));
  root.setProperty('--text', rgb(c.text));
  root.setProperty('--text-2', rgb(c.textSecondary));
  root.setProperty('--accent', rgb(c.accent));
  root.setProperty('--accent-soft', rgba(c.accent, c.dark ? 0.2 : 0.12));
  root.setProperty('--accent-warm', rgb(c.accentWarm));
  root.setProperty('--focus-green', rgb(c.focusGreen));
  root.setProperty('--focus-blue', rgb(c.focusBlue));
  root.setProperty('--danger', rgb(c.focusOrange));

  // Начертание и размер — из тех же трёх вариантов, что в приложении.
  // Размер меняется одним множителем на корне, поэтому вся вёрстка, набранная
  // в rem, тянется за ним; значения в px остаются как есть.
  var f = fontOf(S.font);
  root.setProperty('--display', f.css);
  root.setProperty('--body', f.css);
  root.setProperty('--scale', String(fontSizeOf(S.fontSize).scale));

  document.documentElement.setAttribute('data-dark', c.dark ? '1' : '0');
  document.documentElement.setAttribute('data-box', S.box || 'square');
}

// Смена системной темы должна долетать сразу: переменные считает скрипт, а не
// медиазапрос, поэтому без подписки страница осталась бы светлой.
if (window.matchMedia){
  var systemWatch = window.matchMedia('(prefers-color-scheme: dark)');
  if (systemWatch.addEventListener){
    systemWatch.addEventListener('change', function(){ if (S.theme === 'system') render(); });
  }
}

function vTop(){
  return '<div class="top-in">' +
    '<div class="brand"><span class="mark">S</span><span class="nm">Synapse</span></div>' +
    '<div class="top-acts">' +
      '<button class="iconbtn" data-act="theme" title="Тема" aria-label="Сменить тему">' +
        (S.theme === 'dark' ? '☾' : S.theme === 'light' ? '☀' : '◐') + '</button>' +
      // Рядом с аватаркой — имя: без него в шапке висит безымянный кружок с
      // буквой, и непонятно, чей это аккаунт.
      '<button class="whoami' + (S.view === 'profile' ? ' on' : '') + '" data-act="go" data-view="profile" ' +
        'title="Профиль" aria-label="Профиль">' + avatarHTML() +
        (S.profile.name ? '<span class="nm">' + esc(S.profile.name) + '</span>' : '') +
      '</button>' +
    '</div>' +
  '</div>';
}

/* Одного тоста мало: если браузер перестал сохранять, человек должен видеть
   это всё время, пока так, — и иметь под рукой единственный работающий выход,
   копию файлом. */
function vStorageWarning(){
  return '<div class="warnbar">' +
    '<span>Данные не сохраняются: браузер не даёт записать. Работать можно, но после закрытия вкладки всё пропадёт.</span>' +
    '<button class="btn sm" data-act="export">Сохранить копию</button>' +
  '</div>';
}

function initials(){
  var source = (S.profile && S.profile.name) || S.auth.email || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

function activeTab(){
  return TAB_OF_VIEW[S.view] || S.view;
}

function tabButton(t, cls){
  var on = activeTab() === t.id;
  return '<button class="' + cls + '" data-act="go" data-view="' + t.id + '"' +
    (on ? ' aria-current="page"' : '') + '>' +
    '<span class="ic">' + t.ic + '</span>' +
    '<span class="tx">' + esc(cls === 'tab' && t.short ? t.short : t.title) + '</span></button>';
}

/* Одна разметка на обе раскладки: слева колонка целиком, снизу четыре пункта
   и «Ещё». Пункты за «Ещё» лежат в том же дереве — на широком экране просто
   перестают быть спрятанными. */
function vTabbar(){
  var rest = TABS.filter(function(t){ return !t.primary; });
  var restOn = rest.some(function(t){ return t.id === activeTab(); });

  return '<div class="tabs-main">' +
      TABS.filter(function(t){ return t.primary; }).map(function(t){ return tabButton(t, 'tab'); }).join('') +
      '<button class="tab more' + (restOn ? ' on' : '') + '" data-act="more"' +
        ' aria-expanded="' + !!S.more + '" aria-label="Остальные разделы">' +
        '<span class="ic">' + (S.more ? '✕' : '⋯') + '</span><span class="tx">Ещё</span></button>' +
    '</div>' +
    '<div class="tabs-rest' + (S.more ? ' open' : '') + '">' +
      rest.map(function(t){ return tabButton(t, 'tab wide'); }).join('') +
    '</div>';
}

function head(sub, title, backView){
  return (backView ? '<button class="chip" data-act="go" data-view="' + backView + '" style="margin-bottom:12px">← Назад</button>' : '') +
    '<p class="hi">' + esc(sub) + '</p>' +
    '<h1 class="page">' + esc(title) + '</h1>';
}

function blank(icon, title, text, act, label, extra){
  return '<div class="blank">' +
    '<div class="ill">' + icon + '</div>' +
    '<h3>' + esc(title) + '</h3>' +
    '<p>' + esc(text) + '</p>' +
    (act ? '<button class="btn" data-act="' + act + '"' + (extra || '') + '>' + esc(label) + '</button>' : '') +
  '</div>';
}

function bar(value, total, caption){
  var p = pct(value, total);
  return '<div class="barline"><span>' + esc(caption) + '</span><b>' + p + '%</b></div>' +
    '<div class="bar"><i style="width:' + p + '%"></i></div>';
}

function cnt(value, label){
  return '<div class="cnt"><span class="v">' + esc(value) + '</span><span class="l">' + esc(label) + '</span></div>';
}

/* ============ ЗАДАЧИ ============ */

/* Заголовка «Задачи» и счётчика над ним нет намеренно: раздел уже назван в
   меню, а блоки дня подписаны сами. Две строки шапки съедали первый экран
   телефона, ничего к нему не добавляя. */
function vTasks(){
  var html = '';

  if (!liveTasks().length){
    html += blank('☑', 'Задач пока нет',
      'Напиши первую в строке внизу. День и время можно сказать прямо там: «купить молоко завтра в 9 утра».');
  }

  for (var i = 0; i < BUCKETS.length; i++){
    var b = BUCKETS[i];
    var mine = liveTasks().filter(function(t){ return t.bucket === b.id; });
    var closed = !!S.closed[b.id];
    html += '<section class="group' + (closed ? ' closed' : '') + '">' +
      '<button class="group-h' + (closed ? ' closed' : '') + '" data-act="fold" data-bucket="' + b.id + '">' +
        '<h3>' + esc(b.title) + '</h3><span class="car">⌄</span>' +
        '<span class="n">' + taskCount(mine.length) + '</span>' +
      '</button>' +
      '<div class="tasklist" data-drop="' + b.id + '">' +
        (mine.length ? mine.map(itemRow).join('') :
          '<div class="dropnote">Пусто — можно перетащить сюда задачу</div>') +
      '</div>' +
    '</section>';
  }

  html += vComposer();
  return html;
}

function itemRow(t){
  var goal = t.goalId ? findGoal(t.goalId) : null;
  var subDone = t.subtasks.filter(function(s){ return s.done; }).length;
  var open = !!S.open[t.id];

  var meta = [];
  if (t.date && t.bucket !== 'today') meta.push('<span>' + esc(humanDate(t.date)) + '</span>');
  if (t.time) meta.push('<span>🕘 ' + esc(t.time) + '</span>');
  if (t.repeat) meta.push('<span>🔁 ' + esc(repeatLabel(t.repeat)) + '</span>');
  if (isOverdue(t)) meta.push('<span class="chip late">просрочено</span>');
  // Задача, переехавшая с прошлого дня, должна об этом сказать: иначе завтра
  // непонятно, почему она в «Сегодня» и сколько раз уже переезжала.
  if (t.carriedFrom) meta.push('<span class="chip">перенесено с ' + esc(humanDate(t.carriedFrom)) + '</span>');
  if (t.subtasks.length) meta.push('<span class="pct">' + pct(subDone, t.subtasks.length) + '%</span>');

  var expandable = t.subtasks.length || t.note;

  /* Внутренность рисуется всегда, а не только у раскрытой карточки: чтобы
     раскрытие было плавным, элемент должен быть в дереве заранее — иначе
     анимировать нечего, он появляется уже готовым. Высоту схлопывает CSS
     (grid-template-rows: 0fr), а сама перерисовка при нажатии не запускается,
     иначе новая разметка снова возникла бы в конечном состоянии. */
  var detail = '';
  if (true){
    detail = '<div class="detail-wrap"><div class="detail">' +
      // Принадлежность цели — строкой словами, а не чипом с названием: чип
      // читался как метка, а не как «эта задача про вот эту цель».
      (goal ? '<p class="belongs">Относится к цели «' + esc(goal.title) + '»</p>' : '') +
      (t.note ? '<p class="note">' + esc(t.note) + '</p>' : '') +
      t.subtasks.map(function(s){
        return '<div class="subline' + (s.done ? ' on' : '') + '">' +
          '<button class="box' + (s.done ? ' on' : '') + '" data-act="subtoggle" data-task="' + t.id + '" data-sub="' + s.id + '" aria-label="Выполнено">✓</button>' +
          '<span>' + esc(s.title) + '</span>' +
          '<button class="kill" data-act="subkill" data-task="' + t.id + '" data-sub="' + s.id + '" aria-label="Удалить">✕</button>' +
        '</div>';
      }).join('') +
      '<div class="rowadd">' +
        '<input class="inp" type="text" placeholder="Новый подпункт" data-subadd="' + t.id + '" autocomplete="off">' +
        '<button class="btn sm" data-act="subadd" data-task="' + t.id + '">Добавить</button>' +
      '</div>' +
    '</div></div>';
  }

  // Раскрывается вся карточка, а не отдельная кнопка «подпункты»: тап по
  // задаче — самый ожидаемый жест, и искать для него мелкую подпись внизу
  // карточки незачем. data-act висит на .item-main, чтобы нажатия внутри
  // раскрытой части не сворачивали её обратно.
  var summary = t.subtasks.length ? subDone + ' из ' + t.subtasks.length
    : (t.note ? 'описание' : 'подпункты');

  return '<article class="item' + (t.done ? ' done' : '') + (open ? ' open' : '') + '" draggable="true" data-task="' + t.id + '">' +
    '<div class="item-main" data-act="expand" data-task="' + t.id + '">' +
      '<button class="box' + (t.done ? ' on' : '') + '" data-act="toggle" data-task="' + t.id + '" aria-label="Выполнено">✓</button>' +
      '<div class="body">' +
        '<button class="t" data-act="expand" data-task="' + t.id + '" aria-expanded="' + open + '">' +
          esc(t.title) + '</button>' +
        (meta.length ? '<div class="m">' + meta.join('') + '</div>' : '') +
        '<span class="expand"><span class="car">⌄</span>' + esc(summary) +
          (goal ? ' · цель' : '') + '</span>' +
      '</div>' +
      '<div class="side">' +
        // Надёжный путь переноса: жест на сенсоре может не получиться, а с
        // клавиатуры его нет вовсе.
        '<button data-act="move-open" data-task="' + t.id + '" aria-label="Перенести в другой блок" title="Перенести в блок">' + ICON.move + '</button>' +
        '<button data-act="edit-task" data-task="' + t.id + '" aria-label="Редактировать задачу" title="Редактировать">' + ICON.edit + '</button>' +
        '<button data-act="kill-task" data-task="' + t.id + '" aria-label="Удалить задачу" title="Удалить">' + ICON.kill + '</button>' +
      '</div>' +
    '</div>' + detail +
  '</article>';
}

function vComposer(){
  // Форма, а не просто поле: submit прилетает и от Enter на десктопе, и от
  // кнопки «Go» на мобильной клавиатуре, где keydown с Enter приходит не
  // всегда. Обработчик Enter ниже остаётся — он ловит поля вне форм.
  return '<div class="composer">' +
    '<form class="say" data-form="add">' +
      '<label class="visually-hidden" for="field">Новая задача</label>' +
      '<input id="field" type="text" autocomplete="off" enterkeyhint="done" placeholder="Купить молоко завтра в 9 утра" value="' + esc(S.draft) + '">' +
      // Кнопка ассистента рядом с отправкой: место под будущий Syn. Пока
      // объясняет, почему его здесь нет, — заглушка с искоркой, которая
      // молча ничего не делает, была бы хуже.
      '<button class="ai" type="button" data-act="ai" aria-label="Ассистент Syn" title="Ассистент Syn">' + ICON.ai + '</button>' +
      '<button class="send" type="submit" aria-label="Добавить задачу">↑</button>' +
    '</form>' +
    // Подсказка про разбор строки нужна ровно один раз: дальше она просто
    // занимает место над панелью и закрывает собой карточки. Гасим её после
    // первой созданной задачи или по крестику.
    (S.hintSeen ? '' :
      '<p class="hint tip">' +
        '<span>День и время можно сказать прямо в строке — «завтра», «послезавтра», «в 8 вечера». Из названия эти слова уйдут.</span>' +
        '<button data-act="hint-off" aria-label="Понятно">✕</button>' +
      '</p>') +
  '</div>';
}

/* Строка ввода живёт внутри перерисовываемого экрана, поэтому после каждой
   перерисовки в неё надо вернуть каретку — иначе набор рвётся на первом же
   символе, попавшем в render(). */
var composerFocused = false;
function restoreComposer(){
  var field = $('field') || $('gfield');
  if (field && composerFocused){
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }
}

function addTask(){
  var raw = (S.draft || '').trim();
  if (!raw) return;
  var parsed = parseSchedule(raw, 'today');
  if (!parsed.title) return;
  S.tasks.push({
    id: uid(), title: parsed.title, bucket: parsed.bucket, date: parsed.date, done: false, note: '',
    time: parsed.time, repeat: '', series: null, goalId: null, stageId: null, subtasks: []
  });
  S.draft = '';
  S.closed[parsed.bucket] = false;
  commit('Задача в блоке «' + bucketTitle(parsed.bucket) + '»');
}

/* ============ МОЙ ФОКУС ============ */

/* Экран собран по «Синапсу» из приложения (Views/CoachView.swift): карточка
   «Фокус дня» с процентом справа и разделами брифинга, под ней полоса дня
   (SynapseDayStrip) и горизонт на две недели (SynapseHorizonStrip).

   Брифинг здесь не настоящий. Его собирает ассистент, а он в браузере не
   работает — вместо выдуманного текста экран показывает то, что можно
   посчитать по самим задачам, и прямо говорит, откуда это взялось. */
function vFocus(){
  var today = liveTasks().filter(function(t){ return t.bucket === 'today'; });
  var todayDone = today.filter(function(t){ return t.done; }).length;
  var overdue = liveTasks().filter(isOverdue).length;
  var left = liveTasks().filter(function(t){ return !t.done; }).length;
  var withTime = today.filter(function(t){ return t.time && !t.done; })
    .sort(function(a, b){ return a.time < b.time ? -1 : 1; });

  // Заголовка нет: раздел назван в меню, а первая карточка сама говорит,
  // что это фокус дня.
  var html = '';

  html += vFocusCard(today, todayDone, overdue, withTime);
  // День и горизонт — одна мысль: что сегодня и что дальше. Двумя карточками
  // они читались как два несвязанных виджета.
  html += '<section class="card strips">' +
      vDayStrip(today, todayDone, overdue) +
      '<div class="strip-split"></div>' +
      vHorizonStrip() +
    '</section>';

  html += '<div class="counts">' +
    cnt(String(today.length), 'намечено на день') +
    cnt(String(todayDone), 'сделано за день') +
    cnt(String(left), 'не выполнено всего') +
    cnt(String(S.pomodoro.doneToday), 'помидоров сегодня') +
  '</div>';

  if (!today.length){
    html += blank('✦', 'На сегодня пусто',
      'Ничего не назначено на сегодня — можно задать спокойный ритм или перенести сюда задачу из другого блока.',
      'go', 'Открыть задачи', ' data-view="tasks"');
  } else {
    html += '<p class="lbl">Что сегодня</p>';
    html += '<div class="tasklist" data-drop="today">' + today.map(itemRow).join('') + '</div>';
  }

  var attention = S.goals.filter(function(g){ return !tasksOfGoal(g.id).length; });
  if (attention.length){
    html += '<p class="lbl">Требуют внимания</p><section class="card"><div class="lines">' +
      attention.map(function(g){
        return '<button class="line" data-act="open-goal" data-goal="' + g.id + '">' +
          '<span>' + esc(g.title) + '</span><span class="chip">без задач</span></button>';
      }).join('') + '</div></section>';
  }

  return html;
}

/// «Фокус дня» — заголовок с процентом справа и несколько строк «МЕТКА: текст»,
/// как разбирает брифинг SynapseBriefingSection.parse в приложении.
function vFocusCard(today, todayDone, overdue, withTime){
  var percent = pct(todayDone, today.length);

  var lines = [];
  if (!today.length){
    lines.push(['ДЕНЬ', 'На сегодня ничего не назначено. Можно задать спокойный ритм.']);
  } else {
    lines.push(['ДЕНЬ', todayDone + ' из ' + today.length + ' ' +
      plural(todayDone, 'закрыта', 'закрыты', 'закрыто') + '. Осталось ' +
      taskCount(today.length - todayDone) + '.']);
  }
  if (withTime.length){
    var next = withTime[0];
    lines.push(['БЛИЖАЙШЕЕ', next.time + ' — ' + next.title]);
  }
  if (overdue){
    lines.push(['ПРОСРОЧЕНО', taskCount(overdue) + ' ' +
      plural(overdue, 'ждёт', 'ждут', 'ждут') + ' с прошлых дней.']);
  }
  var stale = S.goals.filter(function(g){ return !tasksOfGoal(g.id).length; });
  if (stale.length){
    lines.push(['ЦЕЛИ', stale.length + ' ' + plural(stale.length, 'цель стоит', 'цели стоят', 'целей стоят') +
      ' без единой задачи.']);
  }

  return '<section class="card focus">' +
    '<div class="focus-h">' +
      '<div class="focus-t">' +
        '<h3>Фокус дня</h3>' +
        '<p class="sub">' + (today.length
          ? 'Сегодня в фокусе ' + taskCount(today.length)
          : 'Можно задать спокойный ритм') + '</p>' +
      '</div>' +
      '<div class="focus-p"><b>' + percent + '%</b><span>Прогресс дня</span></div>' +
    '</div>' +
    '<div class="focus-lines">' +
      lines.map(function(l){
        return '<div class="fl"><span class="fll">' + esc(l[0]) + '</span>' +
          '<span class="flt">' + esc(l[1]) + '</span></div>';
      }).join('') +
    '</div>' +
    // Про подмену — вслух: сочинённый «брифинг» без ассистента был бы враньём.
    '<p class="hint">Это сводка по вашим задачам. Разбор от Syn собирается только в приложении: ассистент в браузере пока не работает.</p>' +
  '</section>';
}

/// Полоса дня: по прямоугольнику на задачу плюс словесная легенда.
/// SynapseDayStrip из приложения — там же и решение не рисовать три цветные
/// точки без подписей.
function vDayStrip(today, todayDone, overdue){
  var html = '<div class="strip-h">' +
      '<b>День</b>' +
      '<span class="legend">' +
        legendDot('var(--ok)', todayDone, 'закрыто') +
        (overdue ? legendDot('var(--crit)', overdue, 'просрочено') : '') +
        legendDot('var(--soft-2)', today.length - todayDone, 'осталось') +
      '</span>' +
    '</div>';

  if (!today.length){
    return html + '<div class="strip empty">На сегодня пусто</div>';
  }

  html += '<div class="strip">' + today.map(function(t){
    var kind = t.done ? 'done' : (isOverdue(t) ? 'late' : 'open');
    return '<i class="' + kind + '" title="' + esc(t.title) + '"></i>';
  }).join('') + '</div>';

  return html + '<p class="strip-note">Каждый блок — одна задача на сегодня</p>';
}

function legendDot(color, value, title){
  return '<span class="lg"><i style="background:' + color + '"></i>' +
    '<b>' + value + '</b>' + esc(title) + '</span>';
}

/// Горизонт: четырнадцать дней вперёд. Высота столбика — сколько задач,
/// точка сверху — есть задача с точным временем. Пустой день оставляет
/// заметный след: провал в ряду читался бы как отсутствие данных.
function vHorizonStrip(){
  var days = [];
  var peak = 1;
  for (var i = 0; i < 14; i++){
    var date = new Date(todayDate().getTime());
    date.setDate(date.getDate() + i);
    var iso = isoOf(date);
    var onDay = liveTasks().filter(function(t){ return t.date === iso; });
    var day = {
      iso: iso,
      count: onDay.length,
      hard: onDay.some(function(t){ return !!t.time; }),
      label: String(date.getDate()),
      weekday: WEEKDAYS_SHORT[(date.getDay() + 6) % 7],
      today: i === 0
    };
    if (day.count > peak) peak = day.count;
    days.push(day);
  }

  return '<div class="strip-h"><b>Горизонт</b></div>' +
    '<p class="strip-note" style="margin:2px 0 10px">14 дней вперёд: столбик — сколько задач, точка — задача со временем</p>' +
    '<div class="horizon">' + days.map(function(d){
      var height = d.count ? 3 + (d.count / peak) * 33 : 3;
      return '<div class="hd' + (d.today ? ' now' : '') + '" title="' + esc(d.weekday + ' ' + d.label + ': ' + taskCount(d.count)) + '">' +
        '<i class="dot"' + (d.hard ? '' : ' style="opacity:0"') + '></i>' +
        '<i class="bar" style="height:' + height.toFixed(0) + 'px"></i>' +
        '<span>' + d.label + '</span>' +
      '</div>';
    }).join('') + '</div>';
}

var WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/* ============ ЦЕЛИ ============ */

var STATUS = { planned: 'План', active: 'В работе', done: 'Готово' };

function goalProgress(goal){
  // Прогресс считается по задачам цели, а если их ещё нет — по этапам.
  var tasks = tasksOfGoal(goal.id);
  if (tasks.length){
    return { done: tasks.filter(function(t){ return t.done; }).length, total: tasks.length, unit: 'задач' };
  }
  return {
    done: goal.stages.filter(function(s){ return s.status === 'done'; }).length,
    total: goal.stages.length, unit: 'этапов'
  };
}

/* Заголовка «Цели» над списком нет: раздел назван в меню, а карточка цели и
   так ни на что другое не похожа.

   Цель раскрывается на месте, а не уводит на отдельную страницу. Раньше, чтобы
   посмотреть этапы одной цели и вернуться к другой, приходилось ходить туда и
   обратно; теперь обе видно рядом. */
function vGoals(){
  var html = '';

  if (!S.goals.length){
    return blank('◎', 'Целей пока нет',
      'Цель — это то, ради чего задачи вообще существуют. Назови её в строке внизу, а этапы добавишь потом.') +
      vGoalComposer();
  }

  for (var i = 0; i < S.goals.length; i++){
    var g = S.goals[i];
    var p = goalProgress(g);
    var open = !!S.openGoal[g.id];

    html += '<section class="goalcard' + (open ? ' open' : '') + '" data-goal="' + g.id + '">' +
      '<button class="goalcard-h" data-act="fold-goal" data-goal="' + g.id + '" aria-expanded="' + open + '">' +
        '<span class="gt">' + esc(g.title) + '</span>' +
        '<span class="gp mono">' + pct(p.done, p.total) + '%</span>' +
        '<span class="car">⌄</span>' +
      '</button>' +
      '<div class="bar slim"><i style="width:' + pct(p.done, p.total) + '%"></i></div>' +
      '<div class="gmeta">' +
        p.done + ' из ' + p.total + ' ' + p.unit +
        ' · ' + g.stages.length + ' ' + plural(g.stages.length, 'этап', 'этапа', 'этапов') +
        (g.horizon ? ' · ' + esc(g.horizon) : '') +
      '</div>' +
      // Как и у задач: тело рисуется всегда, высоту схлопывает CSS —
      // иначе раскрытие нечем анимировать.
      '<div class="goalbody-wrap">' + goalBody(g) + '</div>' +
    '</section>';
  }

  return html + vGoalComposer();
}

/// Внутренность раскрытой цели: смысл, этапы с их задачами, действия.
function goalBody(g){
  var html = '<div class="goalbody">';

  if (g.purpose) html += '<p class="sub gpurpose">' + esc(g.purpose) + '</p>';

  if (!g.stages.length){
    html += '<p class="none">Этапов пока нет. Разбей цель на шаги — к каждому можно привязать задачи.</p>';
  }

  for (var i = 0; i < g.stages.length; i++){
    var st = g.stages[i];
    var list = tasksOfStage(g.id, st.id);
    html += '<div class="stage">' +
      '<div class="stage-h">' +
        '<button class="box' + (st.status === 'done' ? ' on' : '') + '" data-act="stage-toggle" data-goal="' + g.id + '" data-stage="' + st.id + '" aria-label="Готово">✓</button>' +
        '<span class="t">' + esc(st.title) + '</span>' +
        '<span class="status">' + STATUS[st.status] + '</span>' +
        '<button class="kill" data-act="kill-stage" data-goal="' + g.id + '" data-stage="' + st.id + '" aria-label="Удалить этап">✕</button>' +
      '</div>' +
      (st.detail ? '<p class="detail">' + esc(st.detail) + '</p>' : '') +
      (list.length
        ? '<div class="tasks">' + list.map(itemRow).join('') + '</div>'
        : '<p class="none">У этого этапа пока нет задач.</p>') +
      '<div class="rowadd">' +
        '<input class="inp" type="text" placeholder="Задача этапа" data-goaltask="' + st.id + '" autocomplete="off">' +
        '<button class="btn sm" data-act="goal-task" data-goal="' + g.id + '" data-stage="' + st.id + '">Добавить</button>' +
      '</div>' +
    '</div>';
  }

  var loose = S.tasks.filter(function(t){ return t.goalId === g.id && !findStage(g, t.stageId); });
  if (loose.length){
    html += '<p class="lbl">Задачи без этапа</p><div class="tasklist">' + loose.map(itemRow).join('') + '</div>';
  }

  html += '<div class="acts">' +
      '<button class="btn sm" data-act="new-stage" data-goal="' + g.id + '">+ Этап</button>' +
      '<button class="btn sm soft" data-act="edit-goal" data-goal="' + g.id + '">Править</button>' +
      '<button class="btn sm soft" data-act="kill-goal" data-goal="' + g.id + '">Удалить цель</button>' +
    '</div>';

  return html + '</div>';
}

/// Строка создания цели — такая же, как строка задачи: одно место внизу
/// экрана, куда пишут, вместо кнопки, открывающей модалку.
function vGoalComposer(){
  return '<div class="composer">' +
    '<form class="say" data-form="add-goal">' +
      '<label class="visually-hidden" for="gfield">Новая цель</label>' +
      '<input id="gfield" type="text" autocomplete="off" enterkeyhint="done" ' +
        'placeholder="Выучить английский за год" value="' + esc(S.goalDraft || '') + '">' +
      '<button class="send" type="submit" aria-label="Создать цель">↑</button>' +
    '</form>' +
  '</div>';
}

function vGoal(){
  var g = findGoal(S.activeGoal);
  if (!g) return head('Цель', 'Цель не найдена', 'goals') +
    blank('◎', 'Похоже, она уже была удалена', 'Вернись к списку целей.', 'go', 'Все цели', ' data-view="goals"');

  var p = goalProgress(g);
  var html = head('Цель', g.title, 'goals');

  html += '<section class="card">' +
    (g.purpose ? '<p class="sub" style="margin:0 0 14px">' + esc(g.purpose) + '</p>' : '') +
    bar(p.done, p.total, p.done + ' из ' + p.total + ' ' + p.unit) +
    '<div class="acts">' +
      '<button class="btn sm" data-act="new-stage" data-goal="' + g.id + '">+ Создать этап</button>' +
      '<button class="btn sm soft" data-act="edit-goal" data-goal="' + g.id + '">Править</button>' +
      '<button class="btn sm soft" data-act="kill-goal" data-goal="' + g.id + '">Удалить цель</button>' +
    '</div>' +
  '</section>';

  if (!g.stages.length){
    html += blank('◇', 'У цели пока нет этапов',
      'Разбей цель на понятные шаги — к каждому можно будет привязать задачи.',
      'new-stage', 'Создать этап', ' data-goal="' + g.id + '"');
  }

  html += '<p class="lbl">Этапы</p>';
  for (var i = 0; i < g.stages.length; i++){
    var st = g.stages[i];
    var list = tasksOfStage(g.id, st.id);
    html += '<section class="card" style="padding:16px">' +
      '<div class="stage-h">' +
        '<button class="box' + (st.status === 'done' ? ' on' : '') + '" data-act="stage-toggle" data-goal="' + g.id + '" data-stage="' + st.id + '" aria-label="Готово">✓</button>' +
        '<span class="t">' + esc(st.title) + '</span>' +
        '<span class="status">' + STATUS[st.status] + '</span>' +
        '<button class="kill" data-act="kill-stage" data-goal="' + g.id + '" data-stage="' + st.id + '" aria-label="Удалить этап" style="color:var(--fg-3)">✕</button>' +
      '</div>' +
      (st.detail ? '<p class="sub" style="padding-left:34px">' + esc(st.detail) + '</p>' : '') +
      (list.length
        ? '<div class="tasklist" style="margin-top:10px">' + list.map(itemRow).join('') + '</div>'
        : '<p class="none" style="font-size:12.5px;color:var(--fg-3);margin-top:10px">У этого этапа пока нет задач.</p>') +
      '<div class="rowadd">' +
        '<input class="inp" type="text" placeholder="Создать задачу этапа" data-goaltask="' + st.id + '" autocomplete="off">' +
        '<button class="btn sm" data-act="goal-task" data-goal="' + g.id + '" data-stage="' + st.id + '">Добавить</button>' +
      '</div>' +
    '</section>';
  }

  var loose = S.tasks.filter(function(t){ return t.goalId === g.id && !findStage(g, t.stageId); });
  if (loose.length){
    html += '<p class="lbl">Задача без этапа</p><div class="tasklist">' + loose.map(itemRow).join('') + '</div>';
  }

  html += '<p class="hint">Задачи цели — те же самые объекты, что на экране «Задачи». Отметил здесь — отмечено и там.</p>';
  return html;
}

/* ============ АНАЛИТИКА ============ */

function vAnalytics(){
  var done = S.tasks.filter(function(t){ return t.done; }).length;
  var today = S.tasks.filter(function(t){ return t.bucket === 'today'; });
  var stages = 0, stagesDone = 0;
  for (var i = 0; i < S.goals.length; i++){
    stages += S.goals[i].stages.length;
    stagesDone += S.goals[i].stages.filter(function(s){ return s.status === 'done'; }).length;
  }

  var html = '';

  if (!S.tasks.length && !S.goals.length){
    return html + blank('◔', 'Считать пока нечего',
      'Появятся задачи и цели — здесь соберётся статистика и карта целей.',
      'go', 'К задачам', ' data-view="tasks"');
  }

  html += '<div class="counts">' +
    cnt(String(S.tasks.length), 'всего задач') +
    cnt(String(done), 'выполнено') +
    cnt(String(S.tasks.length - done), 'в работе') +
    cnt(pct(done, S.tasks.length) + '%', 'идёт по плану') +
  '</div>';

  html += '<section class="card">' +
    '<h3>Сделано за день</h3>' +
    '<div style="margin-top:14px">' +
      bar(today.filter(function(t){ return t.done; }).length, today.length, 'Намечено на день — ' + today.length) +
    '</div>' +
  '</section>';

  // Разбивки по блокам дня здесь нет: те же числа видно на самом экране
  // задач, у каждого блока рядом с названием.

  // Дублирующего списка целей под картой нет: карта их и показывает, а на
  // экране «Цели» они лежат целиком.
  html += '<p class="lbl">Карта целей</p>' + vMindMap();

  html += '<div class="counts" style="margin-top:14px">' +
    cnt(String(S.goals.length), 'целей') +
    cnt(stagesDone + ' / ' + stages, 'этапов пройдено') +
    cnt(String(S.lists.length), 'списков') +
    cnt(String(S.notes.length), 'заметок') +
  '</div>';

  return html;
}

/* ============ MIND MAP ============ */

/* Перенос GoalMapView+MindMap.swift. Раскладка: в центре ствол, от него в две
   колонки расходятся цели (чётные налево, нечётные направо, как в
   buildGoalLayouts), от цели — её этапы, от этапа — задачи. Связи — кривые
   Безье с контрольными точками на 0.34 и 0.72 по горизонтали.

   Заливка — GoalMindMapGeometry.Fill: пустое дерево стоит контуром, лист
   выполненной задачи заливается на 0.32, этап набирает до 0.30, цель до 0.24
   пропорционально доле закрытых задач, ствол наливается снизу вверх по общему
   прогрессу, обводка усиливается с 0.28 до 0.75. */
var MM = {
  goalX: 210, stageX: 205, taskX: 185,
  goalW: 190, stageW: 176, taskW: 158,
  rowH: 62, lineH: 14, stageGap: 10, goalGap: 28,
  coreR: 54,
  fillLeaf: 0.32, fillStage: 0.30, fillGoal: 0.24, fillCore: 0.90
};

/// Подпись в две строки вместо многоточия: узел, у которого от названия
/// осталось «Сдать пробный экз…», не карта, а ребус.
function wrapLabel(text, width, lines){
  var perLine = Math.max(6, Math.floor((width - 18) / 5.9));
  var words = String(text).split(/\s+/);
  var out = [], current = '';
  for (var i = 0; i < words.length; i++){
    var candidate = current ? current + ' ' + words[i] : words[i];
    if (candidate.length <= perLine){ current = candidate; continue; }
    if (current) out.push(current);
    current = words[i];
    if (out.length === lines - 1) break;
  }
  if (current && out.length < lines) out.push(current);
  if (out.length === lines){
    // Последняя строка может не вместить остаток — тогда уже многоточие.
    var used = out.join(' ').length;
    if (used < String(text).length - 1) out[lines - 1] = cut(out[lines - 1] + ' ' + String(text).slice(used).trim(), perLine);
  }
  return out.length ? out : [''];
}

function fillRatio(done, total){
  if (!total) return 0;
  return Math.min(1, Math.max(0, done / total));
}
function strokeOpacity(ratio, base, full){
  base = base === undefined ? 0.28 : base;
  full = full === undefined ? 0.75 : full;
  return base + (full - base) * Math.min(1, Math.max(0, ratio));
}

function cut(text, limit){
  var s = String(text);
  return s.length > limit ? s.slice(0, limit - 1) + '…' : s;
}

/// Высота поддерева одной цели: этапы, а внутри — по строке на задачу.
function goalBlockHeight(goal){
  var height = 0;
  for (var i = 0; i < goal.stages.length; i++){
    var count = tasksOfStage(goal.id, goal.stages[i].id).length;
    height += Math.max(1, count) * MM.rowH + MM.stageGap;
  }
  var loose = S.tasks.filter(function(t){ return t.goalId === goal.id && !findStage(goal, t.stageId); }).length;
  if (loose) height += loose * MM.rowH + MM.stageGap;
  return Math.max(MM.rowH + MM.stageGap, height);
}

function mmNode(x, y, w, text, sub, fillColor, ratio, fillMax, colors){
  var lines = wrapLabel(text, w, 2);
  var h = lines.length * MM.lineH + (sub ? 16 : 6) + 16;
  var left = x - w / 2, top = y - h / 2;
  var first = top + 14 + MM.lineH / 2;

  // Фон непрозрачный, поверх него — цвет по доле сделанного: связи проходят
  // под карточками, и сквозь незалитый узел лезла бы линия.
  return '<g>' +
    '<rect x="' + left + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="11" fill="' + rgb(colors.panel) + '"/>' +
    '<rect x="' + left + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="11" class="mm-node" ' +
      'fill="' + rgba(fillColor, (fillMax * ratio).toFixed(3)) + '" ' +
      'stroke="' + rgba(fillColor, strokeOpacity(ratio).toFixed(3)) + '"/>' +
    lines.map(function(line, i){
      return '<text class="mm-label" x="' + (left + 11) + '" y="' + (first + i * MM.lineH) + '">' + esc(line) + '</text>';
    }).join('') +
    (sub ? '<text class="mm-label sec" x="' + (left + 11) + '" y="' + (first + lines.length * MM.lineH + 2) + '">' + esc(sub) + '</text>' : '') +
  '</g>';
}

function mmLink(x1, y1, x2, y2, colors, ratio){
  var c1 = x1 + (x2 - x1) * 0.34;
  var c2 = x1 + (x2 - x1) * 0.72;
  return '<path class="mm-link" d="M' + x1 + ' ' + y1 + ' C' + c1 + ' ' + y1 + ' ' + c2 + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" ' +
    'stroke="' + rgba(colors.stroke, strokeOpacity(ratio, 0.5, 1).toFixed(3)) + '"/>';
}

function vMindMap(){
  if (!S.goals.length){
    return '<section class="card"><p class="sub" style="margin:0">Когда появятся цели, карта соберётся сама.</p></section>';
  }

  var colors = themeColors();
  var left = [], right = [];
  for (var i = 0; i < S.goals.length; i++) (i % 2 === 0 ? left : right).push(S.goals[i]);

  var sideHeight = function(list){
    var h = 0;
    for (var i = 0; i < list.length; i++) h += goalBlockHeight(list[i]) + MM.goalGap;
    return h;
  };
  // Нижняя граница высоты — чтобы карта из одной цели не превращалась в
  // узкую полоску, в которой подписи мельче текста вокруг.
  var height = Math.max(sideHeight(left), sideHeight(right), MM.coreR * 2 + 60, 300) + 48;
  // Половина ширины считается по самому дальнему ряду плюс поля, чтобы
  // крайние карточки не липли к рамке (contentHalfWidth + edgeMargin).
  var halfWidth = MM.goalX + MM.stageX + MM.taskX + MM.taskW / 2 + 20;
  var width = halfWidth * 2;
  var cx = width / 2, cy = height / 2;

  var body = '';
  var doneAll = 0, totalAll = 0;

  var drawSide = function(list, dir){
    var total = sideHeight(list);
    var cursor = cy - total / 2;

    for (var g = 0; g < list.length; g++){
      var goal = list[g];
      var block = goalBlockHeight(goal);
      var goalY = cursor + block / 2;
      var goalCx = cx + dir * MM.goalX;

      var goalTasks = tasksOfGoal(goal.id);
      var goalDone = goalTasks.filter(function(t){ return t.done; }).length;
      var goalRatio = fillRatio(goalDone, goalTasks.length);
      doneAll += goalDone; totalAll += goalTasks.length;

      body += mmLink(cx + dir * MM.coreR, cy, goalCx - dir * MM.goalW / 2, goalY, colors, goalRatio);

      var stageCursor = cursor;
      var rows = goal.stages.slice();
      var loose = S.tasks.filter(function(t){ return t.goalId === goal.id && !findStage(goal, t.stageId); });
      if (loose.length) rows.push({ id: null, title: 'Задача без этапа', status: 'planned' });

      for (var s = 0; s < rows.length; s++){
        var stage = rows[s];
        var list2 = stage.id ? tasksOfStage(goal.id, stage.id) : loose;
        var stageH = Math.max(1, list2.length) * MM.rowH + MM.stageGap;
        var stageY = stageCursor + stageH / 2;
        var stageCx = goalCx + dir * MM.stageX;
        var stageDone = list2.filter(function(t){ return t.done; }).length;
        // Этап без задач всё равно считается закрытым, если сам отмечен готовым.
        var stageRatio = list2.length ? fillRatio(stageDone, list2.length) : (stage.status === 'done' ? 1 : 0);

        body += mmLink(goalCx + dir * MM.goalW / 2, goalY, stageCx - dir * MM.stageW / 2, stageY, colors, stageRatio);

        for (var t = 0; t < list2.length; t++){
          var task = list2[t];
          var taskY = stageCursor + MM.stageGap / 2 + t * MM.rowH + MM.rowH / 2;
          var taskCx = stageCx + dir * MM.taskX;
          var leafRatio = task.done ? 1 : 0;
          body += mmLink(stageCx + dir * MM.stageW / 2, stageY, taskCx - dir * MM.taskW / 2, taskY, colors, leafRatio);
          body += mmNode(taskCx, taskY, MM.taskW, task.title, '', colors.focusGreen, leafRatio, MM.fillLeaf, colors);
        }

        body += mmNode(stageCx, stageY, MM.stageW, stage.title,
          list2.length ? stageDone + ' / ' + list2.length : 'без задач',
          colors.accent, stageRatio, MM.fillStage, colors);

        stageCursor += stageH;
      }

      body += mmNode(goalCx, goalY, MM.goalW, goal.title,
        goalTasks.length ? goalDone + ' / ' + goalTasks.length + ' задач' : 'без задач',
        colors.accent, goalRatio, MM.fillGoal, colors);

      cursor += block + MM.goalGap;
    }
  };

  drawSide(left, -1);
  drawSide(right, 1);

  var overall = fillRatio(doneAll, totalAll);

  // Ствол наливается снизу вверх: прямоугольник-маска по доле выполненного.
  var core =
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + MM.coreR + '" fill="' + rgb(colors.panelStrong) + '" ' +
      'stroke="' + rgba(colors.stroke, strokeOpacity(overall, 0.45, 0.92).toFixed(3)) + '"/>' +
    '<clipPath id="mm-core-clip"><rect x="' + (cx - MM.coreR) + '" y="' + (cy + MM.coreR - 2 * MM.coreR * overall) + '" ' +
      'width="' + (2 * MM.coreR) + '" height="' + (2 * MM.coreR * overall) + '"/></clipPath>' +
    '<g opacity="0.2" fill="' + rgb(colors.accent) + '">' + mmTree(cx, cy) + '</g>' +
    '<g clip-path="url(#mm-core-clip)" opacity="' + MM.fillCore + '" fill="' + rgb(colors.accent) + '">' + mmTree(cx, cy) + '</g>' +
    '<text class="mm-core-label" x="' + cx + '" y="' + (cy + MM.coreR - 9) + '">' + Math.round(overall * 100) + '%</text>';

  var zoom = (S.mm && S.mm.zoom) || 1;
  var shown = Math.round(width * zoom);
  var full = !!(S.mm && S.mm.full);

  var canvas = '<div class="mmwrap"><svg viewBox="0 0 ' + width + ' ' + height + '" width="' + shown + '" ' +
      'height="' + Math.round(height * zoom) + '" role="img" aria-label="Карта целей">' +
      body + core +
    '</svg></div>';

  var zoomButtons =
    '<button class="chip" data-act="mm-zoom" data-dir="out" aria-label="Мельче">−</button> ' +
    '<button class="chip" data-act="mm-zoom" data-dir="in" aria-label="Крупнее">+</button>';

  var legend = '<div class="mmlegend">' +
      '<span><i style="background:' + rgba(colors.focusGreen, MM.fillLeaf) + '"></i>задача закрыта</span>' +
      '<span><i style="background:' + rgba(colors.accent, MM.fillStage) + '"></i>этап набирает цвет</span>' +
      '<span><i></i>пусто — только контур</span>' +
      (full ? '' : '<span style="margin-left:auto">' + zoomButtons + '</span>') +
    '</div>';

  // В рамке высотой с ладонь видно ствол и обрезанные края двух целей —
  // карту надо открывать целиком, отдельным экраном.
  if (full){
    return '<div class="mmfull">' +
      '<div class="mmfull-bar">' +
        '<span class="ttl">Карта целей</span>' +
        '<span class="sp">' + zoomButtons +
          '<button class="chip" data-act="mm-full" data-full="0">Закрыть</button></span>' +
      '</div>' + canvas + legend +
    '</div>';
  }

  return canvas + legend +
    '<div class="acts" style="margin-top:-4px">' +
      '<button class="btn sm soft" data-act="mm-full" data-full="1">' + ICON.full + ' Развернуть карту</button>' +
    '</div>';
}

/* Карта открывается ровно в ширину окна. В приложении на этом была бага:
   масштаб брали крупнее, чем влезает, и крайние карточки резались по букве
   («ернуть ежим сна»). Здесь ширину считаем после отрисовки, когда рамка уже
   померена браузером, — увеличить можно кнопками, тогда холст прокручивается
   внутри своей рамки и страницу за собой не тянет. */
function fitMindMap(){
  var wrap = document.querySelector('.mmwrap');
  if (!wrap) return;
  var svg = wrap.querySelector('svg');
  if (!svg) return;

  var box = (svg.getAttribute('viewBox') || '').split(' ');
  var vw = Number(box[2]) || 1, vh = Number(box[3]) || 1;
  var available = wrap.clientWidth - 20;
  var zoom = (S.mm && S.mm.zoom) || 1;

  // Развёрнутая карта считается иначе: места хватает по обеим сторонам,
  // поэтому вписываем и по ширине, и по высоте, а не упираемся в 340 px.
  if (S.mm && S.mm.full){
    // Карта широкая и низкая, телефон — узкий и высокий; целиком она туда не
    // помещается ни при каком масштабе, при котором подписи ещё читаются.
    // Поэтому по умолчанию — тот же предел читаемости, что и во врезке (0.9),
    // а не подгонка любой ценой: заполнить высоту значит оставить в кадре один
    // ствол, вписать по ширине — превратить подписи в грязь.
    //
    // Выигрыш развёрнутой карты в другом: рамка во весь экран вместо полоски в
    // 350 пикселей, прокрутка в обе стороны и кнопка «−» — ей человек сам
    // получает общий вид, когда он нужен, и платит за это размером подписей
    // осознанно.
    var fitFull = Math.min(available / vw, (wrap.clientHeight - 32) / vh);
    var scale = Math.max(0.9, Math.min(2.2, fitFull)) * zoom;
    svg.setAttribute('width', Math.max(60, Math.round(vw * scale)));
    svg.setAttribute('height', Math.round(vh * scale));
    wrap.scrollLeft = Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2);
    wrap.scrollTop = Math.max(0, (wrap.scrollHeight - wrap.clientHeight) / 2);
    return;
  }

  // Вписывать по ширине можно только до предела читаемости. Ужать карту в
  // полоску высотой девяносто пикселей — это зеркало той же баги, что была в
  // приложении: там подписи резались, здесь превращались бы в многоточия.
  // Если не влезает — карта прокручивается и таскается внутри рамки.
  var fit = available / vw;
  var readable = Math.max(0.9, Math.min(1, 340 / vh));
  var base = Math.max(readable, Math.min(1, fit));

  svg.setAttribute('width', Math.max(60, Math.round(vw * base * zoom)));
  svg.setAttribute('height', Math.round(vh * base * zoom));

  // Открываем на центре: ствол и обе колонки должны быть видны сразу, а не
  // после того, как человек догадается прокрутить рамку.
  wrap.scrollLeft = Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2);
}

/* Перетаскивание карты пальцем и мышью: при увеличении она шире рамки. */
var mmPan = null;
document.addEventListener('pointerdown', function(event){
  var wrap = event.target.closest ? event.target.closest('.mmwrap') : null;
  if (!wrap) return;
  mmPan = { wrap: wrap, x: event.clientX, left: wrap.scrollLeft };
});
document.addEventListener('pointermove', function(event){
  if (!mmPan) return;
  mmPan.wrap.scrollLeft = mmPan.left - (event.clientX - mmPan.x);
});
document.addEventListener('pointerup', function(){ mmPan = null; });
document.addEventListener('pointercancel', function(){ mmPan = null; });
window.addEventListener('resize', fitMindMap);

/// Дерево в центре — тот же силуэт, что tree.fill в приложении.
function mmTree(cx, cy){
  var x = cx, y = cy - 4;
  return '<path d="M' + x + ' ' + (y - 20) +
    ' c 9 0 15 7 15 14 c 7 1 11 6 11 12 c 0 7 -6 12 -14 12 h -8 l 2 12 h -12 l 2 -12 h -8 ' +
    'c -8 0 -14 -5 -14 -12 c 0 -6 4 -11 11 -12 c 0 -7 6 -14 15 -14 z"/>';
}


/* ---- списки ---- */

function vLists(){
  var html = head('Наборы', 'Списки');
  if (!S.lists.length){
    return html + blank('☰', 'Списков пока нет',
      'Список — это то, что отмечают галочками и не тащат в задачи: покупки, сборы, чек-лист поездки.',
      'new-list', 'Новый список');
  }
  html += '<div class="acts" style="margin:0 0 16px"><button class="btn" data-act="new-list">+ Новый список</button></div>';
  for (var i = 0; i < S.lists.length; i++){
    var l = S.lists[i];
    var d = l.items.filter(function(x){ return x.done; }).length;
    html += '<button class="card" style="display:block;width:100%" data-act="open-list" data-list="' + l.id + '">' +
      '<h3>' + esc(l.title) + '</h3>' +
      '<p class="sub">Готово ' + d + ' из ' + l.items.length + '</p>' +
      '<div style="margin-top:12px"><div class="bar slim"><i style="width:' + pct(d, l.items.length) + '%"></i></div></div>' +
    '</button>';
  }
  return html;
}

function vList(){
  var l = findList(S.activeList);
  if (!l) return head('Список', 'Список не найден', 'lists') +
    blank('☰', 'Похоже, он уже был удалён', 'Вернись к спискам.', 'go', 'Списки', ' data-view="lists"');

  var html = head('Список', l.title, 'lists');
  html += '<section class="card">' +
    (l.note ? '<p class="sub" style="margin:0 0 10px">' + esc(l.note) + '</p>' : '') +
    (l.items.length
      ? '<div class="lines">' + l.items.map(function(it){
          return '<div class="line' + (it.done ? ' on' : '') + '">' +
            '<button class="box' + (it.done ? ' on' : '') + '" data-act="item-toggle" data-list="' + l.id + '" data-item="' + it.id + '" aria-label="Готово">✓</button>' +
            '<span>' + esc(it.title) + '</span>' +
            '<button class="kill" data-act="item-kill" data-list="' + l.id + '" data-item="' + it.id + '" aria-label="Удалить">✕</button>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="sub" style="margin:0">В списке пока пусто.</p>') +
    '<div class="rowadd">' +
      '<input class="inp" type="text" placeholder="Новый пункт" data-itemadd="' + l.id + '" autocomplete="off">' +
      '<button class="btn sm" data-act="item-add" data-list="' + l.id + '">Добавить</button>' +
    '</div>' +
    '<div class="acts"><button class="btn sm soft" data-act="kill-list" data-list="' + l.id + '">Удалить список</button></div>' +
  '</section>';
  return html;
}

/* ---- заметки ---- */

function vNotes(){
  var html = head('Записи', 'Заметки');
  if (!S.notes.length){
    return html + blank('✎', 'Заметок пока нет',
      'Сюда складывают то, что не задача: итоги встречи, мысль, список вопросов.',
      'new-note', 'Новая запись');
  }
  html += '<div class="acts" style="margin:0 0 16px"><button class="btn" data-act="new-note">+ Новая запись</button></div>';
  for (var i = 0; i < S.notes.length; i++){
    var n = S.notes[i];
    html += '<button class="card" style="display:block;width:100%" data-act="open-note" data-note="' + n.id + '">' +
      '<h3>' + esc(n.title) + '</h3>' +
      '<p class="sub">' + esc(n.body ? n.body.slice(0, 120) : 'Пустая запись') + '</p>' +
    '</button>';
  }
  return html;
}

function vNote(){
  var n = findNote(S.activeNote);
  if (!n) return head('Заметка', 'Заметка не найдена', 'notes') +
    blank('✎', 'Похоже, она уже была удалена', 'Вернись к заметкам.', 'go', 'Заметки', ' data-view="notes"');

  var html = head('Заметка', n.title, 'notes');
  html += '<section class="card">' +
    '<textarea class="note-field" data-notebody="' + n.id + '" placeholder="Текст записи">' + esc(n.body) + '</textarea>' +
    '<p class="hint">Сохраняется по мере набора — заметка, которую надо не забыть сохранить, это заметка, которую теряют.</p>' +
    '<div class="acts"><button class="btn sm soft" data-act="kill-note" data-note="' + n.id + '">Удалить запись</button></div>' +
  '</section>';
  return html;
}

/* ---- помодоро ---- */

var POMO = [
  { id: 'focus', title: 'Фокус', key: 'focus' },
  { id: 'shortBreak', title: 'Перерыв', key: 'shortBreak' },
  { id: 'longBreak', title: 'Длинный', key: 'longBreak' }
];

var ticker = null;
var remaining = null;

function modeOf(){
  for (var i = 0; i < POMO.length; i++) if (POMO[i].id === S.pomodoro.mode) return POMO[i];
  return POMO[0];
}

function vPomodoro(){
  var m = modeOf();
  if (remaining === null) remaining = S.pomodoro[m.key] * 60;

  var html = head('Фокус по таймеру', 'Метод Помодоро');
  html += '<section class="card">' +
    '<div class="clock" id="clockface">' + mmss(remaining) + '</div>' +
    '<p class="phase">' + m.title + ' · ' + S.pomodoro[m.key] + ' мин</p>' +
    '<div class="modes">' + POMO.map(function(p){
      // Минуты прямо на карточке режима — ровно то, что чинили в приложении.
      return '<button class="mode" data-act="pomo-mode" data-mode="' + p.id + '" aria-pressed="' + (p.id === S.pomodoro.mode) + '">' +
        '<b>' + p.title + '</b><span>' + S.pomodoro[p.key] + ' мин</span></button>';
    }).join('') + '</div>' +
    '<div class="pomo-actions">' +
      '<button class="btn" data-act="pomo-toggle">' + (ticker ? 'Пауза' : 'Старт') + '</button>' +
      '<button class="btn soft" data-act="pomo-reset">Сброс</button>' +
    '</div>' +
  '</section>';

  html += '<div class="counts">' +
    cnt(String(S.pomodoro.doneToday), 'помидоров сегодня') +
    cnt(S.pomodoro.focus + ' мин', 'длина фокуса') +
    cnt(S.pomodoro.shortBreak + ' мин', 'короткий перерыв') +
    cnt(S.pomodoro.longBreak + ' мин', 'длинный перерыв') +
  '</div>';

  html += '<section class="card"><h3>Длина фокуса</h3>' +
    '<div class="rowadd">' +
      '<input class="inp" type="number" min="1" max="180" value="' + S.pomodoro.focus + '" data-pomofocus="1">' +
      '<button class="btn sm" data-act="pomo-set">Сохранить</button>' +
    '</div></section>';
  return html;
}

function mmss(sec){
  var m = Math.floor(sec / 60), s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function startTicker(){
  stopTicker();
  ticker = setInterval(function(){
    remaining = Math.max(0, remaining - 1);
    var face = $('clockface');
    if (face) face.textContent = mmss(remaining);
    if (remaining === 0){
      stopTicker();
      if (S.pomodoro.mode === 'focus') S.pomodoro.doneToday += 1;
      commit('Помидор закрыт');
    }
  }, 1000);
}

function stopTicker(){
  if (ticker) clearInterval(ticker);
  ticker = null;
}

/* ---- медитация ---- */

/* Те же пять сред, что в приложении, и те же записи: файлы из
   ios-prototype/TaskAIPrototype/MeditationBundleAudio, пережатые под веб —
   моно, AAC 64 кбит/с, длинные дорожки обрезаны до полутора минут и
   зациклены. Сорок пять мегабайт исходников в браузер не тянут, три —
   нормально. */
/* Все двенадцать — настоящие записи, не синтез. Пять первых пришли из
   приложения, семь остальных — полевые записи под Public Domain Mark 1.0
   (archive.org и Викисклад): авторские права на них не заявлены, но людей,
   которые их сделали, мы называем — см. раздел «О сервисе».

   Каждая дорожка нарезана скриптом scripts/make_loops.py: из длинной записи
   берётся ровный участок в полторы-две минуты, конец сшивается с началом
   кроссфейдом, поэтому петля не щёлкает. */
var SOUNDS = [
  { id: 'rain',      title: 'Дождь',   hint: 'Ровный шум по стеклу' },
  { id: 'forest',    title: 'Лес',     hint: 'Листва и редкие птицы' },
  { id: 'stream',    title: 'Ручей',   hint: 'Вода по камням' },
  { id: 'fireplace', title: 'Камин',   hint: 'Треск поленьев' },
  { id: 'flute',     title: 'Флейта',  hint: 'Медленный мотив' },
  { id: 'wind',      title: 'Ветер',   hint: 'Шум в кронах',
    by: 'Kawcze, Польша · radio aporee' },
  { id: 'surf',      title: 'Прибой',  hint: 'Волна о камни',
    by: 'Сан-Висенти · radio aporee' },
  { id: 'storm',     title: 'Гроза',   hint: 'Ливень и раскаты',
    by: 'Викисклад, запись после жаркого дня' },
  { id: 'night',     title: 'Ночь',    hint: 'Сверчки в темноте',
    by: 'Голета, Калифорния · radio aporee' },
  { id: 'bowl',      title: 'Чаша',    hint: 'Поющая чаша и вода',
    by: 'archive.org' },
  { id: 'dawn',      title: 'Рассвет', hint: 'Птицы на восходе',
    by: 'Дофар, Оман · radio aporee' },
  { id: 'snow',      title: 'Вершина', hint: 'Ветер на высоте',
    by: 'Орескутан, Швеция · radio aporee' }
];

function soundOf(name){
  for (var i = 0; i < SOUNDS.length; i++){
    if (SOUNDS[i].title === name || SOUNDS[i].id === name) return SOUNDS[i];
  }
  return SOUNDS[0];
}

/* ---- сеанс медитации ---- */

/* Ход сеанса живёт в памяти вкладки, а не в S: секунды, записанные в
   localStorage, означали бы запись на диск раз в секунду и «продолжающийся»
   сеанс после перезагрузки. В S попадает только итог. */
var med = { running: false, paused: false, preview: false, elapsed: 0, timer: null };
var medAudio = null;

/// Один элемент <audio> на всё: браузер сам подтягивает файл и зацикливает
/// его. Создаём по первому запуску — до жеста человека звук всё равно
/// заблокирован автоплей-политикой.
function medAudioPlay(){
  if (!medAudio){
    medAudio = new Audio();
    medAudio.loop = true;
    medAudio.preload = 'none';
  }
  var file = 'audio/' + soundOf(S.meditation.sound).id + '.m4a';
  if (medAudio.getAttribute('src') !== file){
    medAudio.setAttribute('src', file);
    medAudio.load();
  }
  medAudio.volume = S.meditation.volume;
  var played = medAudio.play();
  // Автоплей могли запретить, файл мог не догрузиться — сеанс от этого не
  // должен останавливаться, но и молчать без объяснения он не должен.
  if (played && played.catch) played.catch(function(){ toast('Звук не запустился — сеанс идёт без него'); });
}

function medAudioStop(){
  if (!medAudio) return;
  medAudio.pause();
  medAudio.currentTime = 0;
}

function medStart(){
  med.running = true;
  med.paused = false;
  med.preview = false;   // прослушивание переходит в сеанс, звук не прерывается
  med.elapsed = 0;
  medAudioPlay();
  medTick();
  commit();
}

function medPause(){
  med.paused = !med.paused;
  if (med.paused){ if (medAudio) medAudio.pause(); }
  else { medAudioPlay(); }
  commit();
}

/// `finished` — дошли до конца, а не бросили на середине: только тогда сеанс
/// идёт в счёт.
function medStop(byHand){
  var wasRunning = med.running;
  var minutes = med.elapsed / 60;
  clearTimeout(med.timer);
  med.timer = null;
  med.running = false;
  med.paused = false;
  med.preview = false;
  med.elapsed = 0;
  medAudioStop();

  if (wasRunning){
    // Полминуты — это не сеанс, а случайное нажатие.
    if (minutes >= 0.5){
      S.meditation.doneTotal += 1;
      S.meditation.totalMinutes = (S.meditation.totalMinutes || 0) + Math.round(minutes);
    }
    commit(byHand
      ? (minutes >= 0.5 ? 'Сеанс засчитан' : 'Сеанс прерван')
      : 'Сеанс закончен');
  } else {
    commit();
  }
}

/* Секунда отсчитывается по часам, а не по числу тиков: вкладка в фоне душит
   таймеры, и счёт «сколько раз сработало» отставал бы на минуты. */
function medTick(){
  clearTimeout(med.timer);
  var startedAt = Date.now() - med.elapsed * 1000;

  med.timer = setInterval(function(){
    if (!med.running){ clearInterval(med.timer); med.timer = null; return; }
    if (med.paused){ startedAt = Date.now() - med.elapsed * 1000; return; }

    med.elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (med.elapsed >= S.meditation.minutes * 60){
      clearInterval(med.timer);
      med.timer = null;
      medStop(false);
      return;
    }
    if (S.view === 'meditation') render();
  }, 1000);
}

/* Экран сеанса, а не форма настроек. В центре — круг, который заполняется по
   ходу сеанса, вокруг него всё остальное; во время дыхания лишнее уходит с
   глаз, чтобы не на что было отвлекаться. */
function vMeditation(){
  var m = S.meditation;
  var running = med.running;
  var total = m.minutes * 60;
  var leftSec = running ? Math.max(0, total - med.elapsed) : total;
  var progress = total ? Math.min(1, med.elapsed / total) : 0;
  var sound = soundOf(m.sound);

  var html = head('Передышка', 'Медитация');

  html += '<section class="card med' + (running ? ' on' : '') + '">' +
    '<div class="med-dial" style="--p:' + progress.toFixed(4) + '">' +
      '<div class="med-ring"></div>' +
      '<div class="med-face">' +
        '<b class="mono">' + clockText(leftSec) + '</b>' +
        '<span>' + (running ? breathWord() : esc(sound.title)) + '</span>' +
      '</div>' +
    '</div>' +

    '<div class="med-acts">' +
      (running
        ? '<button class="btn" data-act="med-stop">Завершить</button>' +
          '<button class="btn soft" data-act="med-pause">' + (med.paused ? 'Продолжить' : 'Пауза') + '</button>'
        : '<button class="btn" data-act="med-start">Начать сеанс</button>') +
    '</div>' +

    // Громкость живёт в той же карточке, что и круг: её крутят, слушая звук,
    // а не отдельно от него.
    '<div class="med-vol">' +
      '<span class="ic">' + volumeGlyph() + '</span>' +
      '<input class="range" type="range" min="0" max="100" step="1" value="' + Math.round(m.volume * 100) + '" ' +
        'data-volume aria-label="Громкость">' +
      '<span class="mono vv">' + Math.round(m.volume * 100) + '</span>' +
    '</div>' +
  '</section>';

  if (!running){
    html += '<p class="lbl">Сколько</p><div class="radios">' +
      [3, 5, 10, 15, 20, 30].map(function(min){
        return '<button class="radio" data-act="med-min" data-min="' + min + '" aria-pressed="' + (m.minutes === min) + '">' + min + ' мин</button>';
      }).join('') + '</div>';

    // Нажатие на среду включает её тут же: звук выбирают ушами, а сравнивать
    // их, уходя куда-то и возвращаясь, невозможно.
    html += '<p class="lbl">Звук <span class="val">нажми, чтобы послушать</span></p>' +
      '<div class="soundgrid">' +
      SOUNDS.map(function(s){
        var on = sound.id === s.id;
        var playing = on && med.preview;
        return '<button class="soundcard' + (on ? ' on' : '') + (playing ? ' playing' : '') + '" ' +
          'data-act="med-sound" data-sound="' + s.id + '" aria-pressed="' + on + '" title="' + esc(s.hint) + '">' +
          '<span class="sw">' + soundGlyph(s.id) + (playing ? '<i class="pulse"></i>' : '') + '</span>' +
          '<span class="tt">' + esc(s.title) + '</span>' +
        '</button>';
      }).join('') + '</div>';

    html += '<div class="counts">' +
      cnt(String(m.doneTotal), 'сеансов всего') +
      cnt(String(Math.round(m.totalMinutes || 0)), 'минут в тишине') +
    '</div>';
  }

  return html;
}

function volumeGlyph(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 9h3.5L12 5v14l-4.5-4H4z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M18.5 7a7 7 0 0 1 0 10"/></svg>';
}

/// Кружки-глифы для звуков: рисунок, а не эмодзи, — эмодзи в разных системах
/// выглядят по-разному и ломают спокойный тон экрана.
function soundGlyph(id){
  var paths = {
    rain:      '<path d="M6 10a4 4 0 0 1 4-4 5 5 0 0 1 9.6 1.4A3.3 3.3 0 0 1 19 14H10a4 4 0 0 1-4-4z"/><path d="M9 17.5l-1 3M13 17.5l-1 3M17 17.5l-1 3"/>',
    forest:    '<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>',
    stream:    '<path d="M3 9c3-2.5 6 2.5 9 0s6-2.5 9 0"/><path d="M3 14c3-2.5 6 2.5 9 0s6-2.5 9 0"/><path d="M3 19c3-2.5 6 2.5 9 0s6-2.5 9 0"/>',
    fireplace: '<path d="M12 3c1 3.5-2 4.5-2 7a4 4 0 0 0 8 0c0-1.2-.4-2.2-1-3 .3 2-1 3-1.6 1.6C14.6 6.6 13.8 4.6 12 3z"/><path d="M8.5 12.5A5 5 0 0 0 12 21a5 5 0 0 0 3.5-8.5"/>',
    flute:     '<path d="M4 15c2-6 6-10 12-11l4 4c-1 6-5 10-11 12z"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="10" r="1"/>',
    wind:      '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h8"/>',
    surf:      '<path d="M3 17c2.5-2 4.5 2 7 0s4.5-2 7 0 3.5 0 4-1"/><path d="M4 12c2-5 6-8 11-8-1 4-1 7 3 9"/>',
    storm:     '<path d="M7 13a4 4 0 0 1 1-7.9 5 5 0 0 1 9.5 1.5A3.2 3.2 0 0 1 18 13"/><path d="M13 11l-3 5h4l-3 5"/>',
    night:     '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    bowl:      '<path d="M4 10h16a8 8 0 0 1-16 0z"/><path d="M9 6.5c1-1.5 5-1.5 6 0"/><path d="M12 3v2"/>',
    dawn:      '<path d="M3 18h18"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 4v2.5M5 7l1.7 1.7M19 7l-1.7 1.7"/>',
    snow:      '<path d="M4 18l6-11 4 6 2.5-3L21 18z"/><path d="M3 7c2-1.6 4 1.6 6 0"/>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[id] || '') + '</svg>';
}

/// Слово вместо секундомера во время сеанса: вдох четыре секунды, выдох
/// шесть — ритм, на который спокойно ложится дыхание.
function breathWord(){
  var cycle = med.elapsed % 10;
  return cycle < 4 ? 'Вдох' : 'Выдох';
}

function clockText(seconds){
  var mm = Math.floor(seconds / 60), ss = seconds % 60;
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
}

/* ============ ПРОФИЛЬ ============ */

/* Профиль — это про человека: имя и лицо. Всё, что про устройство и про
   данные, переехало в настройки: раньше и то и другое лежало одной лентой,
   и найти в ней что-либо можно было только прокруткой. */
function vProfile(){
  var html = head('Аккаунт', 'Профиль', 'settings');

  html += '<section class="card profile-card">' +
    '<div class="avatar-row">' +
      avatarHTML('lg') +
      '<div class="avatar-acts">' +
        '<button class="btn sm soft" data-act="avatar-pick">' +
          (S.profile.avatar ? 'Сменить фото' : 'Загрузить фото') + '</button>' +
        (S.profile.avatar ? '<button class="btn sm soft" data-act="avatar-clear">Убрать</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="field" style="margin:18px 0 0">' +
      '<label for="pname">Имя</label>' +
      '<input class="inp" id="pname" data-name type="text" maxlength="40" placeholder="Как к вам обращаться" ' +
        'value="' + esc(S.profile.name) + '" autocomplete="name">' +
    '</div>' +
    '<p class="hint">Имя и фото никуда не отправляются: они лежат в этом браузере рядом с задачами.</p>' +
  '</section>';

  html += '<p class="lbl">Вход</p><section class="card">' +
    '<h3>' + esc(S.auth.email || 'Без почты') + '</h3>' +
    '<p class="sub">Вход по почте. Пока без Synapse Pro.</p>' +
    '<div class="acts"><button class="btn sm soft" data-act="logout">Выйти</button></div>' +
  '</section>';

  return html;
}

/* Плавное раскрытие карточки. Высоту меряем сами: анимировать «auto» браузер
   не умеет, а трюк с нулевой fr-дорожкой держат не все движки.

   Порядок такой: зафиксировали текущую высоту, распрямили на один кадр, чтобы
   узнать целевую, вернули текущую, и только потом поехали к цели. Без этой
   пляски переход стартует из «auto» и не проигрывается вовсе.

   После перехода inline-высота снимается: у раскрытой карточки содержимое
   должно расти само, когда в неё добавляют подпункт. */
function foldOpen(card, wrap, open){
  if (!wrap){ card.classList.toggle('open', open); return; }

  // scrollHeight отдаёт высоту содержимого даже у схлопнутой обёртки, поэтому
  // распрямлять её на кадр и мерить не нужно: одно чтение вместо трёх, и
  // никакой зависимости от того, когда браузер пересчитает стили.
  var from = wrap.getBoundingClientRect().height;
  var to = open ? wrap.scrollHeight : 0;

  card.classList.toggle('open', open);
  wrap.style.height = from + 'px';
  void wrap.offsetHeight;
  wrap.style.height = to + 'px';

  clearTimeout(wrap._foldTimer);
  wrap._foldTimer = setTimeout(function(){
    // У раскрытой высоту отпускаем, чтобы содержимое могло расти, когда в неё
    // добавляют подпункт. У свёрнутой оставляем нулевую inline-высоту, а не
    // полагаемся на правило в CSS: если переход почему-то не проиграется,
    // карточка всё равно останется закрытой, а не зависнет раскрытой.
    wrap.style.height = open ? '' : '0px';
  }, 280);
}

/// Аватарка или первая буква имени, если фото не загружено.
function avatarHTML(size){
  var cls = 'avatar' + (size === 'lg' ? ' lg' : '');
  if (S.profile.avatar){
    return '<span class="' + cls + '" style="background-image:url(' + S.profile.avatar + ')"></span>';
  }
  return '<span class="' + cls + '">' + esc(initials()) + '</span>';
}

/* ============ НАСТРОЙКИ ============ */

function vSettings(){
  var html = head('Приложение', 'Настройки');
  html += settingsLink('profile', 'Профиль', S.profile.name || S.auth.email || 'Имя и фото') +
    settingsLink('settings-view', 'Вид', fontOf(S.font).title + ' · ' + paletteOf(S.palette).title) +
    settingsLink('settings-data', 'Данные', 'Копия файлом, примеры, стирание') +
    settingsLink('about', 'О сервисе', 'Что умеет веб-версия');
  return html;
}

function settingsLink(view, title, sub){
  return '<button class="setrow tall" data-act="go" data-view="' + view + '">' +
    '<span class="st"><b>' + esc(title) + '</b><i>' + esc(sub) + '</i></span>' +
    '<span class="arrow">›</span></button>';
}

/* ---- вид ---- */

/* Шрифт и его размер перенесены из приложения: AppFontChoice (Rounded, Clean,
   Serif) и AppFontSizeChoice (0.88, 1.0, 1.16). Названия начертаний в
   приложении не переводятся — здесь тоже. */
var FONTS = [
  { id: 'rounded', title: 'Rounded', css: 'ui-rounded,"SF Pro Rounded",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' },
  { id: 'clean',   title: 'Clean',   css: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif' },
  { id: 'serif',   title: 'Serif',   css: 'ui-serif,Georgia,"Times New Roman",serif' }
];

var FONT_SIZES = [
  { id: 'compact',  title: 'маленький', scale: 0.88 },
  { id: 'standard', title: 'средний',   scale: 1 },
  { id: 'large',    title: 'большой',   scale: 1.16 }
];

function fontOf(id){
  for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === id) return FONTS[i];
  return FONTS[0];
}
function fontSizeOf(id){
  for (var i = 0; i < FONT_SIZES.length; i++) if (FONT_SIZES[i].id === id) return FONT_SIZES[i];
  return FONT_SIZES[1];
}

function vSettingsView(){
  var html = head('Настройки', 'Вид', 'settings');

  html += '<p class="lbl">Тема</p><div class="radios">' +
    [['system', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(function(p){
      return '<button class="radio" data-act="set-theme" data-theme="' + p[0] + '" aria-pressed="' + (S.theme === p[0]) + '">' + p[1] + '</button>';
    }).join('') + '</div>';

  // Те же десять палитр, что в приложении, — из AppTheme.swift. Кружок — фон
  // палитры, точка внутри — её акцент, оба в текущей теме: без этого «Бордо»
  // от «Индиго» отличить можно было только применив.
  html += '<p class="lbl">Палитра <span class="val">' + esc(paletteOf(S.palette).title) + '</span></p>' +
    '<div class="radios">' +
      PALETTES.map(function(p){
        var dark = isDarkNow();
        var bg = paletteColor(p, dark ? 'darkBackground' : 'lightBackground');
        var ac = paletteColor(p, dark ? 'accentDark' : 'accent');
        return '<button class="radio pal" data-act="set-palette" data-palette="' + p.id + '" aria-pressed="' + (S.palette === p.id) + '">' +
          '<span class="sw" style="background:' + rgb(bg) + '"><i style="background:' + rgb(ac) + '"></i></span>' +
          p.title + '</button>';
      }).join('') + '</div>';

  // Начертание выбирают глазами, поэтому каждая кнопка набрана своим шрифтом.
  html += '<p class="lbl">Шрифт</p><div class="radios">' +
    FONTS.map(function(f){
      return '<button class="radio" data-act="set-font" data-font="' + f.id + '" aria-pressed="' + (S.font === f.id) + '" ' +
        'style="font-family:' + f.css + '">' + f.title + '</button>';
    }).join('') + '</div>';

  html += '<p class="lbl">Размер</p><div class="radios">' +
    FONT_SIZES.map(function(z){
      return '<button class="radio" data-act="set-fontsize" data-size="' + z.id + '" aria-pressed="' + (S.fontSize === z.id) + '">' + z.title + '</button>';
    }).join('') + '</div>';

  // Отметку показываем прямо на кнопке выбора — заполненной, чтобы было
  // видно, как она будет выглядеть у закрытой задачи.
  html += '<p class="lbl">Отметка выполнения</p><div class="radios">' +
    BOXES.map(function(b){
      return '<button class="radio boxpick" data-act="set-box" data-box="' + b.id + '" aria-pressed="' + (S.box === b.id) + '">' +
        '<span class="box on" data-shape="' + b.id + '">✓</span>' + b.title + '</button>';
    }).join('') + '</div>';

  html += '<section class="card preview">' +
    '<h3>Собрать материалы</h3>' +
    '<p class="sub">Так будет выглядеть текст при выбранном шрифте и размере.</p>' +
    '<div class="chips" style="margin-top:12px">' +
      '<span class="chip">Сегодня</span><span class="chip">09:00</span>' +
      '<span class="chip goal">Выучить английский</span></div>' +
  '</section>';

  return html;
}

/* ---- данные ---- */

function vSettingsData(){
  var html = head('Настройки', 'Данные', 'settings');

  html += '<section class="card">' +
    '<h3>Копия файлом</h3>' +
    '<p class="sub">Один файл со всем: задачи, цели, списки, заметки, настройки. Им же переносят данные в другой браузер или на другое устройство.</p>' +
    '<div class="acts">' +
      '<button class="btn sm" data-act="export">Сохранить копию</button>' +
      '<button class="btn sm soft" data-act="import">Загрузить копию</button>' +
    '</div>' +
    // Про синхронизацию — прямо, без обещаний.
    '<p class="hint">Автоматической синхронизации с приложением нет. Данные приложения лежат в приватной базе iCloud, а читать её из браузера можно только после входа Apple ID прямо здесь — этого мы не делаем. Файл — единственный честный способ перенести данные сегодня.</p>' +
  '</section>';

  html += '<p class="lbl">Содержимое</p>' +
    '<button class="setrow" data-act="reset-demo"><span>Заполнить примерами</span><span class="arrow">›</span></button>' +
    '<button class="setrow" data-act="wipe"><span>Стереть всё в этом браузере</span><span class="arrow">›</span></button>';

  html += '<section class="card" style="margin-top:14px">' +
    '<h3>Где лежат данные</h3>' +
    '<p class="sub">Только в этом браузере, на этом устройстве. Копии на сервере нет: очистка данных сайта или режим инкогнито удалят задачи, цели и заметки безвозвратно.</p>' +
  '</section>';

  return html;
}

/* ---- о сервисе ---- */

function vAbout(){
  var html = head('Synapse', 'О сервисе');

  html += '<section class="card">' +
    '<h3>Веб-версия Synapse</h3>' +
    '<p class="sub">Цели разбираются на этапы, этапы — на задачи, которые можно сделать сегодня. Планирование, списки, заметки, помодоро и медитация работают прямо в браузере, без установки и регистрации.</p>' +
  '</section>';

  // Чего здесь нет — списком, а не умолчанием: человек должен узнать это от
  // нас, а не обнаружить сам.
  html += '<p class="lbl">Чего пока нет</p><section class="card">' +
    '<p class="sub">Ассистент Syn и брифинги работают только в приложении: запросы к нему требуют проверки устройства, которой в браузере не существует. Нет уведомлений, звука в медитации и синхронизации с приложением — данные переносятся файлом в разделе «Данные».</p>' +
  '</section>';

  // Права на записи не заявлены, но людей, которые вышли в поле с
  // микрофоном, назвать надо.
  html += '<p class="lbl">Звуки медитации</p><section class="card">' +
    '<p class="sub">Полевые записи под Public Domain Mark 1.0 — авторские права не заявлены. Собраны с archive.org (проект radio aporee ::: maps) и Викисклада, нарезаны в петли по полторы минуты.</p>' +
    '<div class="lines" style="margin-top:12px">' +
      SOUNDS.filter(function(s){ return s.by; }).map(function(s){
        return '<div class="line"><span>' + esc(s.title) + '</span>' +
          '<span style="color:var(--fg-3);font-size:12.5px;flex:none;text-align:right">' + esc(s.by) + '</span></div>';
      }).join('') +
    '</div>' +
  '</section>';

  html += '<p class="lbl">Ссылки</p>' +
    '<a class="setrow" href="../">' + '<span>Сайт Synapse</span><span class="arrow">›</span></a>' +
    '<a class="setrow" href="../pricing/"><span>Тарифы</span><span class="arrow">›</span></a>' +
    '<a class="setrow" href="../support/"><span>Поддержка</span><span class="arrow">›</span></a>' +
    '<a class="setrow" href="../privacy/"><span>Конфиденциальность</span><span class="arrow">›</span></a>';

  return html;
}

/* ============ ВХОД ============ */

/* ЗАГЛУШКА. Сервера для входа по почте пока не существует: код не
   отправляется, а показывается на экране, и проверяется тут же в браузере.
   Apple и Google на сайте недоступны (вход по Apple на вебе владелец делать
   запретил), SMS требует ИП — поэтому почта и только почта. */
function vAuth(){
  var a = S.auth;
  var html = '<div class="auth"><div class="mark">S</div>';

  if (a.stage === 'email'){
    html += '<h1>Вход в Synapse</h1>' +
      '<p class="s">Введи почту — пришлём код из шести цифр.</p>' +
      '<form class="card" data-form="auth-send">' +
        '<div class="field"><label for="authmail">Почта</label>' +
          '<input class="inp" type="email" id="authmail" placeholder="you@example.com" value="' + esc(a.email) + '" autocomplete="email" enterkeyhint="next"></div>' +
        (a.error ? '<p class="err">' + esc(a.error) + '</p>' : '') +
        '<button class="btn full" type="submit">Получить код</button>' +
      '</form>';
  } else {
    html += '<h1>Код отправлен</h1>' +
      '<p class="s">Отправили на ' + esc(a.email) + '</p>' +
      '<form class="card" data-form="auth-check">' +
        '<div class="field"><label for="authcode">Код из письма</label>' +
          '<input class="inp mono" type="text" id="authcode" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" enterkeyhint="go"></div>' +
        (a.error ? '<p class="err">' + esc(a.error) + '</p>' : '') +
        '<button class="btn full" type="submit">Войти</button>' +
        '<div class="acts"><button class="btn sm soft" data-act="auth-back">Другая почта</button></div>' +
        '<p class="stub">Письма нет и не будет: сервера для почты пока нет. Код для этого прототипа — <b class="mono">' + esc(a.sent) + '</b></p>' +
      '</form>';
  }

  html += '<p class="stub">Это заглушка без сервера. Ни почта, ни код никуда не отправляются, состояние входа лежит в этом браузере.</p></div>';
  return html;
}

/* ============ ПЕРЕНОС ДАННЫХ ============ */

/* Автоматической синхронизации с приложением здесь нет и в ближайшее время не
   будет — и заглушку с надписью «синхронизировано» рисовать нельзя, она хуже
   честного отсутствия. Что работает сегодня без всякого сервера — файл.

   Выгрузка отдаёт всё состояние одним JSON, загрузка принимает его обратно.
   Это и перенос между браузерами и устройствами, и резервная копия — нужная
   тем более остро, что данные живут только в localStorage. */

function exportBackup(){
  var payload = JSON.stringify(S, null, 2);
  var blob = new Blob([payload], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'synapse-' + isoOf(todayDate()) + '.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Ссылку на blob надо отпустить, иначе копия состояния висит в памяти
  // вкладки до её закрытия.
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

/// Разбор загруженного файла. Чужой JSON — это данные, а не команда: берём
/// только знакомые поля и проверяем, что это вообще состояние Synapse.
function importBackup(text){
  var parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)){
    throw new Error('Это не копия Synapse');
  }
  var fresh = seed();
  var fields = ['tasks', 'goals', 'lists', 'notes', 'pomodoro', 'meditation', 'palette', 'theme', 'closed', 'open'];
  for (var i = 0; i < fields.length; i++){
    if (parsed[fields[i]] !== undefined) fresh[fields[i]] = parsed[fields[i]];
  }
  fresh.auth = S.auth;          // вход у этого браузера свой
  fresh.view = 'profile';
  fresh.lastOpened = isoOf(todayDate());
  S = fresh;
  save();
}

/* ============ МОДАЛКА ============ */

function openModal(html){
  $('modalIn').innerHTML = html;
  $('modal').classList.add('on');
  // Курсор встаёт в первое пустое поле, а не в первое подряд: когда название
  // уже введено в строке создания, начинать надо со следующего вопроса.
  var fields = $('modalIn').querySelectorAll('input, textarea, select');
  for (var i = 0; i < fields.length; i++){
    if (!fields[i].value){ fields[i].focus(); return; }
  }
  if (fields.length) fields[0].focus();
}

function closeModal(){
  $('modal').classList.remove('on');
  $('modalIn').innerHTML = '';
}

var HORIZONS = ['Месяц', 'Квартал', 'Полгода', 'Год', 'Три года'];

/* Форма отметки выполнения. По умолчанию скруглённый квадрат — как в
   приложении; остальные варианты для тех, кому так привычнее. Форму задаёт
   CSS через data-box на корне, кроме звезды и треугольника: их прямоугольником
   не нарисуешь, поэтому там clip-path. */
var BOXES = [
  { id: 'square',   title: 'Квадрат' },
  { id: 'circle',   title: 'Круг' },
  { id: 'sharp',    title: 'Угол' },
  { id: 'triangle', title: 'Треугольник' },
  { id: 'star',     title: 'Звезда' },
  { id: 'heart',    title: 'Сердце' }
];

/// `draftTitle` приходит из строки создания: название уже введено, спросить
/// осталось два оставшихся поля.
function modalGoal(goal, draftTitle){
  var g = goal || { title: draftTitle || '', purpose: '', horizon: '' };
  var fresh = !goal;
  return '<h3>' + (fresh ? 'Ещё два вопроса' : 'Редактировать цель') + '</h3>' +
    '<p class="s">' + (fresh
      ? 'Цель без «зачем» через месяц ничем не отличается от списка дел.'
      : 'Чего хочешь добиться и что это тебе даст.') + '</p>' +
    '<div class="field"><label for="m-title">Название</label>' +
      '<input class="inp" id="m-title" value="' + esc(g.title) + '" placeholder="Например: выйти на доход 300 000"></div>' +
    '<div class="field"><label for="m-purpose">Зачем</label>' +
      '<textarea class="inp" id="m-purpose" placeholder="Что изменится, когда цель будет достигнута">' + esc(g.purpose) + '</textarea></div>' +
    // Горизонт свободный: шаблоны подставляются в поле, но их можно стереть и
    // написать «до защиты диплома» — срок у цели бывает какой угодно.
    '<div class="field"><label for="m-horizon">Горизонт</label>' +
      '<input class="inp" id="m-horizon" value="' + esc(g.horizon) + '" placeholder="Свой срок или выбери ниже">' +
      '<div class="radios sm" style="margin-top:9px">' +
        HORIZONS.map(function(h){
          return '<button class="radio" data-act="pick-horizon" data-horizon="' + esc(h) + '"' +
            ' aria-pressed="' + (g.horizon === h) + '">' + esc(h) + '</button>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<button class="btn full" data-act="save-goal"' + (goal ? ' data-goal="' + goal.id + '"' : '') + '>' +
      (fresh ? 'Создать цель' : 'Сохранить') + '</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalStage(goalId){
  return '<h3>Создать этап</h3>' +
    '<p class="s">Разбей цель на понятные шаги.</p>' +
    '<div class="field"><label>Название</label><input class="inp" id="m-title" placeholder="Например: сдать пробный экзамен"></div>' +
    '<div class="field"><label>Описание</label><input class="inp" id="m-detail" placeholder="Если нужен контекст, добавь его сюда"></div>' +
    '<button class="btn full" data-act="save-stage" data-goal="' + goalId + '">Создать этап</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalTask(t){
  var goalOptions = '<option value="">Без цели</option>';
  for (var i = 0; i < S.goals.length; i++){
    var g = S.goals[i];
    goalOptions += '<option value="' + g.id + '"' + (t.goalId === g.id ? ' selected' : '') + '>' + esc(g.title) + '</option>';
    for (var j = 0; j < g.stages.length; j++){
      var st = g.stages[j];
      goalOptions += '<option value="' + g.id + ':' + st.id + '"' +
        (t.goalId === g.id && t.stageId === st.id ? ' selected' : '') + '>— ' + esc(st.title) + '</option>';
    }
  }

  return '<h3>Редактировать задачу</h3>' +
    '<div class="field"><label>Название</label><input class="inp" id="m-title" value="' + esc(t.title) + '"></div>' +
    '<div class="field"><label>Описание</label><textarea class="inp" id="m-note" placeholder="Комментарий к задаче">' + esc(t.note) + '</textarea></div>' +
    '<div class="row2">' +
      '<div class="field"><label>Блок</label><select class="inp" id="m-bucket">' +
        BUCKETS.map(function(b){
          return '<option value="' + b.id + '"' + (t.bucket === b.id ? ' selected' : '') + '>' + b.title + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label>Время</label><input class="inp" id="m-time" type="time" value="' + esc(t.time || '') + '"></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Повтор</label><select class="inp" id="m-repeat">' +
        REPEAT_PRESETS.map(function(r){
          return '<option value="' + r.id + '"' + (t.repeat === r.id ? ' selected' : '') + '>' + r.title + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label>Связь с целью</label><select class="inp" id="m-goal">' + goalOptions + '</select></div>' +
    '</div>' +
    '<button class="btn full" data-act="save-task" data-task="' + t.id + '">Сохранить</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>' +
    '<p class="hint">В блоках «На неделе» и «Потом» времени нет: они не называют конкретный день.</p>';
}

function modalMove(task){
  return '<h3>Перенести в блок</h3>' +
    '<p class="s">' + esc(task.title) + '</p>' +
    BUCKETS.map(function(b){
      return '<button class="setrow" data-act="move-task" data-task="' + task.id + '" data-bucket="' + b.id + '">' +
        '<span>' + b.title + '</span>' +
        (task.bucket === b.id ? '<span class="val">сейчас здесь</span>' : '<span class="arrow">›</span>') +
      '</button>';
    }).join('') +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalKillGoal(goal){
  var count = tasksOfGoal(goal.id).length;
  return '<h3>Удалить цель?</h3>' +
    '<p class="s">' + esc(goal.title) + '</p>' +
    (count
      ? '<p class="s">У цели ' + taskCount(count) + '. Они останутся в списке, но потеряют связь с целью.</p>'
      : '<p class="s">Задач у цели нет.</p>') +
    '<p class="s">Саму цель вернуть будет нельзя.</p>' +
    '<button class="btn full" data-act="kill-goal-confirm" data-goal="' + goal.id + '">Удалить цель</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalText(title, sub, label, act, placeholder){
  return '<h3>' + esc(title) + '</h3>' +
    (sub ? '<p class="s">' + esc(sub) + '</p>' : '') +
    '<div class="field"><label>' + esc(label) + '</label><input class="inp" id="m-title" placeholder="' + esc(placeholder || '') + '"></div>' +
    '<button class="btn full" data-act="' + act + '">Создать</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function mval(id){
  var node = $(id);
  return node ? node.value.trim() : '';
}

/* ============ ТОСТ ============ */

var toastTimer = null;
var pendingToast = '';
var pendingImport = '';

function commit(message){
  // Сообщение держим в переменной, а не в S: попав в localStorage, оно
  // всплывало бы снова при каждом открытии страницы.
  if (message) pendingToast = message;
  save();
  render();
}

/// Сказать что-то, ничего не перерисовывая: для отказов, после которых
/// состояние не поменялось.
function toast(message){
  pendingToast = message;
  showToast();
}

/* Уменьшение картинки перед тем, как класть её в localStorage. Снимок с
   телефона — это несколько мегабайт, а всё хранилище обычно пять: без сжатия
   одна аватарка выбивает квоту и роняет сохранение задач.

   Режем по короткой стороне в квадрат, чтобы кружок не обрезал лицо
   несимметрично, и отдаём JPEG: PNG на фотографии втрое тяжелее. */
function shrinkImage(file, side, done){
  var reader = new FileReader();
  reader.onerror = function(){ done(''); };
  reader.onload = function(){
    var img = new Image();
    img.onerror = function(){ done(''); };
    img.onload = function(){
      var crop = Math.min(img.width, img.height);
      var canvas = document.createElement('canvas');
      canvas.width = side; canvas.height = side;
      canvas.getContext('2d').drawImage(
        img,
        (img.width - crop) / 2, (img.height - crop) / 2, crop, crop,
        0, 0, side, side
      );
      try { done(canvas.toDataURL('image/jpeg', 0.82)); }
      catch (e) { done(''); }
    };
    img.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

function showToast(){
  if (!pendingToast) return;
  // Старую плашку убираем: несколько действий подряд оставляли стопку
  // подсказок, из которой гасла только последняя.
  var old = document.querySelectorAll('.toast');
  for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

  var node = document.createElement('div');
  node.className = 'toast';
  node.textContent = pendingToast;
  document.body.appendChild(node);
  pendingToast = '';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){
    if (node.parentNode) node.parentNode.removeChild(node);
  }, 2200);
}

/* ============ ДЕЙСТВИЯ ============ */

var ACTS = {
  go: function(d){ closeModal(); go(d.view); },

  theme: function(){
    S.theme = S.theme === 'system' ? 'light' : S.theme === 'light' ? 'dark' : 'system';
    commit();
  },
  more: function(){ S.more = !S.more; commit(); },

  /* Место под ассистента. Пока он не подключён, кнопка честно объясняет
     почему, а не молчит и не изображает работу. Когда появится веб-сессия,
     сюда придёт разбор строки через Syn. */
  ai: function(){
    openModal(
      '<h3>Ассистент Syn</h3>' +
      '<p class="s">Здесь будет разбор словами: «перенеси созвон на пятницу», «разбери мой день», «сделай из этого цель».</p>' +
      '<section class="card" style="margin:0 0 16px">' +
        '<p class="sub">Сейчас Syn работает только в приложении. Запросы к нему требуют проверки устройства, которой в браузере не существует, — вебу нужен свой вход, и он в работе.</p>' +
      '</section>' +
      '<button class="btn full" data-act="close-modal">Понятно</button>'
    );
  },
  'set-theme': function(d){ S.theme = d.theme; commit(); },
  'set-palette': function(d){ S.palette = d.palette; commit(); },
  'set-font': function(d){ S.font = d.font; commit(); },
  'set-fontsize': function(d){ S.fontSize = d.size; commit(); },
  'set-box': function(d){ S.box = d.box; commit(); },

  /* Фото профиля. Кладём его в состояние как data-URI, поэтому картинку
     сначала ужимаем: снимок с телефона — это мегабайты, а весь localStorage
     обычно пять. Квадрат 256×256 умещается примерно в 30 КБ. */
  'avatar-pick': function(){
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function(){
      var file = input.files && input.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)){ toast('Это не изображение'); return; }
      shrinkImage(file, 256, function(dataUrl){
        if (!dataUrl){ toast('Не удалось прочитать файл'); return; }
        S.profile.avatar = dataUrl;
        commit('Фото обновлено');
      });
    });
    input.click();
  },
  'avatar-clear': function(){ S.profile.avatar = ''; commit('Фото убрано'); },
  'mm-zoom': function(d){
    if (!S.mm) S.mm = { zoom: 1 };
    S.mm.zoom = Math.min(2, Math.max(0.5, S.mm.zoom + (d.dir === 'in' ? 0.25 : -0.25)));
    commit();
  },
  /* Карта на весь экран. Масштаб при закрытии сбрасывается: то, что удобно
     развернув, во врезке снова не поместится. */
  'mm-full': function(d){
    if (!S.mm) S.mm = { zoom: 1 };
    S.mm.full = d.full === '1';
    if (!S.mm.full) S.mm.zoom = 1;
    document.body.classList.toggle('mm-open', S.mm.full);
    commit();
  },

  /* --- вход (заглушка) --- */
  'auth-send': function(){
    var mail = mval('authmail') || '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){
      S.auth.error = 'Похоже, в почте опечатка.';
      S.auth.email = mail;
      commit();
      return;
    }
    S.auth.email = mail;
    S.auth.error = '';
    // Код «отправляется» тем, что показывается на экране: сервера нет.
    S.auth.sent = String(Math.floor(100000 + Math.random() * 900000));
    S.auth.stage = 'code';
    commit();
  },
  'auth-check': function(){
    var code = mval('authcode');
    if (code !== S.auth.sent){
      S.auth.error = 'Код не совпал. Он написан ниже — сервера пока нет.';
      commit();
      return;
    }
    S.auth.error = '';
    S.auth.stage = 'in';
    commit('С возвращением');
  },
  'auth-back': function(){
    S.auth.stage = 'email';
    S.auth.error = '';
    commit();
  },
  logout: function(){
    S.auth = { stage: 'email', email: S.auth.email, sent: '', error: '' };
    commit();
  },

  /* --- задачи --- */
  add: function(){ S.hintSeen = true; addTask(); },
  'hint-off': function(){ S.hintSeen = true; commit(); },
  toggle: function(d){
    var t = findTask(d.task);
    if (!t) return;
    t.done = !t.done;
    // createNextRecurringTaskIfNeeded(afterCompleting:) из WorkspaceStore:
    // закрытая повторяющаяся задача не исчезает, а ставит следующую в серии.
    if (t.done && t.repeat){
      var made = spawnNextOccurrence(t);
      commit(made ? 'Повторится ' + humanDate(made.date) : 'Выполнено');
      return;
    }
    commit('');
  },
  /* Раскрытие меняет один класс, а не перерисовывает экран: перерисовка
     подменила бы карточку уже раскрытой, и переход было бы не увидеть. */
  expand: function(d){
    S.open[d.task] = !S.open[d.task];
    save();
    var card = document.querySelector('.item[data-task="' + d.task + '"]');
    if (!card){ render(); return; }
    var title = card.querySelector('.t');
    if (title) title.setAttribute('aria-expanded', String(!!S.open[d.task]));
    foldOpen(card, card.querySelector('.detail-wrap'), S.open[d.task]);
  },
  'kill-task': function(d){
    S.tasks = S.tasks.filter(function(t){ return t.id !== d.task; });
    commit('Задача удалена');
  },
  'edit-task': function(d){
    var t = findTask(d.task);
    if (t) openModal(modalTask(t));
  },
  'save-task': function(d){
    var t = findTask(d.task);
    if (!t) return;
    var title = mval('m-title');
    if (title) t.title = title;
    t.note = $('m-note') ? $('m-note').value.trim() : t.note;
    t.bucket = mval('m-bucket') || t.bucket;
    t.date = dateForBucket(t.bucket);
    t.time = spansSeveralDays(t.bucket) ? null : (mval('m-time') || null);
    t.repeat = mval('m-repeat');
    var link = mval('m-goal');
    if (!link){ t.goalId = null; t.stageId = null; }
    else {
      var parts = link.split(':');
      t.goalId = parts[0];
      t.stageId = parts[1] || null;
    }
    closeModal();
    commit('Сохранено');
  },
  fold: function(d){ S.closed[d.bucket] = !S.closed[d.bucket]; commit(); },

  subtoggle: function(d){
    var t = findTask(d.task);
    if (!t) return;
    for (var i = 0; i < t.subtasks.length; i++){
      if (t.subtasks[i].id === d.sub) t.subtasks[i].done = !t.subtasks[i].done;
    }
    commit();
  },
  subkill: function(d){
    var t = findTask(d.task);
    if (!t) return;
    t.subtasks = t.subtasks.filter(function(s){ return s.id !== d.sub; });
    commit();
  },
  subadd: function(d){
    var t = findTask(d.task);
    var input = document.querySelector('[data-subadd="' + d.task + '"]');
    if (!t || !input) return;
    var value = input.value.trim();
    if (!value) return;
    t.subtasks.push({ id: uid(), title: value, done: false });
    S.open[t.id] = true;
    commit();
  },

  /* --- цели --- */
  'new-goal': function(){ openModal(modalGoal(null)); },
  'edit-goal': function(d){ openModal(modalGoal(findGoal(d.goal))); },
  'save-goal': function(d){
    var title = mval('m-title');
    if (!title) return;
    var purpose = $('m-purpose') ? $('m-purpose').value.trim() : '';
    var horizon = mval('m-horizon');
    if (d.goal){
      var g = findGoal(d.goal);
      if (g){ g.title = title; g.purpose = purpose; g.horizon = horizon; }
    } else {
      var fresh = { id: uid(), title: title, purpose: purpose, horizon: horizon,
        sphere: 'personal', pinned: false, stages: [] };
      S.goals.push(fresh);
      // Раскрываем на месте, а не уводим на отдельный экран: список целей
      // никуда не делся, и созданная цель просто открылась в нём.
      S.openGoal[fresh.id] = true;
      S.view = 'goals';
    }
    closeModal();
    commit('Цель сохранена');
  },
  'open-goal': function(d){ S.activeGoal = d.goal; go('goal'); },
  /* Шаблон только подставляет текст в поле — поле остаётся своим, и написать
     «до защиты диплома» вместо «Год» никто не мешает. Перерисовки нет: она
     закрыла бы модалку. */
  'pick-horizon': function(d){
    var field = $('m-horizon');
    if (!field) return;
    field.value = field.value === d.horizon ? '' : d.horizon;
    var chips = document.querySelectorAll('[data-act="pick-horizon"]');
    for (var i = 0; i < chips.length; i++){
      chips[i].setAttribute('aria-pressed', String(chips[i].getAttribute('data-horizon') === field.value));
    }
    field.focus();
  },
  'fold-goal': function(d){
    S.openGoal[d.goal] = !S.openGoal[d.goal];
    save();
    var card = document.querySelector('.goalcard[data-goal="' + d.goal + '"]');
    if (!card){ render(); return; }
    var head = card.querySelector('.goalcard-h');
    if (head) head.setAttribute('aria-expanded', String(!!S.openGoal[d.goal]));
    foldOpen(card, card.querySelector('.goalbody-wrap'), S.openGoal[d.goal]);
  },
  /* Создание цели строкой. У цели, кроме названия, есть ещё два поля — зачем
     она и на какой срок, — и спрашиваются они сразу: заполнять их потом
     никто не возвращается, а цель без «зачем» через месяц не отличается от
     списка дел. Название уже введено, поэтому окно открывается с ним и
     курсором в следующем поле. */
  'add-goal': function(){
    var field = $('gfield');
    var title = field ? field.value.trim() : '';
    if (!title) return;
    S.goalDraft = '';
    openModal(modalGoal(null, title));
  },
  'export': function(){
    exportBackup();
    pendingToast = 'Файл сохранён';
    render();
  },
  'import': function(){
    var picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'application/json,.json';
    picker.addEventListener('change', function(){
      var file = picker.files && picker.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(){
        // Подтверждение до замены: текущие данные исчезнут, вернуть их будет
        // неоткуда, кроме такого же файла.
        pendingImport = String(reader.result || '');
        openModal(
          '<h3>Заменить данные копией?</h3>' +
          '<p class="s">Файл: ' + esc(file.name) + '</p>' +
          '<p class="s">Всё, что сейчас в этом браузере — задачи, цели, списки, заметки, — будет заменено содержимым файла. Отменить это будет нельзя.</p>' +
          '<button class="btn full" data-act="import-confirm">Заменить</button>' +
          '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>'
        );
      };
      reader.readAsText(file);
    });
    picker.click();
  },
  'import-confirm': function(){
    closeModal();
    try {
      importBackup(pendingImport);
      pendingImport = '';
      commit('Данные загружены из копии');
    } catch (e) {
      pendingImport = '';
      commit('Не получилось: ' + (e && e.message ? e.message : 'файл не читается'));
    }
  },

  'move-open': function(d){
    var t = findTask(d.task);
    if (t) openModal(modalMove(t));
  },
  'move-task': function(d){
    var t = findTask(d.task);
    if (!t) return;
    t.bucket = d.bucket;
    t.date = dateForBucket(d.bucket);
    if (spansSeveralDays(d.bucket)) t.time = null;
    closeModal();
    commit('Перенесено в «' + bucketTitle(d.bucket) + '»');
  },

  'kill-goal': function(d){
    var g = findGoal(d.goal);
    if (g) openModal(modalKillGoal(g));
  },
  'kill-goal-confirm': function(d){
    closeModal();
    ACTS['kill-goal-do'](d);
  },
  'kill-goal-do': function(d){
    // Вместе с целью её задачи не удаляются, а отвязываются: задача остаётся в
    // своём блоке дня, потому что она всё ещё дело, которое надо сделать.
    S.goals = S.goals.filter(function(g){ return g.id !== d.goal; });
    S.tasks.forEach(function(t){ if (t.goalId === d.goal){ t.goalId = null; t.stageId = null; } });
    S.activeGoal = null;
    S.view = 'goals';
    commit('Цель удалена, её задачи остались');
  },
  'new-stage': function(d){ openModal(modalStage(d.goal)); },
  'save-stage': function(d){
    var g = findGoal(d.goal);
    var title = mval('m-title');
    if (!g || !title) return;
    g.stages.push({ id: uid(), title: title, detail: mval('m-detail'), status: 'planned' });
    closeModal();
    commit('Этап создан');
  },
  'stage-toggle': function(d){
    var st = findStage(findGoal(d.goal), d.stage);
    if (!st) return;
    st.status = st.status === 'done' ? 'active' : 'done';
    commit();
  },
  'kill-stage': function(d){
    var g = findGoal(d.goal);
    if (!g) return;
    g.stages = g.stages.filter(function(s){ return s.id !== d.stage; });
    S.tasks.forEach(function(t){ if (t.stageId === d.stage) t.stageId = null; });
    commit('Этап удалён');
  },
  'goal-task': function(d){
    var input = document.querySelector('[data-goaltask="' + d.stage + '"]');
    if (!input) return;
    var value = input.value.trim();
    if (!value) return;
    var parsed = parseSchedule(value, 'today');
    // Та же самая задача, что на экране «Задачи» — один объект в S.tasks.
    S.tasks.push({
      id: uid(), title: parsed.title, bucket: parsed.bucket, date: parsed.date, done: false, note: '',
      time: parsed.time, repeat: '', series: null, goalId: d.goal, stageId: d.stage, subtasks: []
    });
    commit('Задача в блоке «' + bucketTitle(parsed.bucket) + '»');
  },

  /* --- списки --- */
  'new-list': function(){ openModal(modalText('Новый список', 'Коротко опиши, для чего этот список.', 'Название списка', 'save-list', 'Например, Купить фрукты')); },
  'save-list': function(){
    var title = mval('m-title');
    if (!title) return;
    var fresh = { id: uid(), title: title, note: '', items: [] };
    S.lists.push(fresh);
    S.activeList = fresh.id;
    S.view = 'list';
    closeModal();
    commit();
  },
  'open-list': function(d){ S.activeList = d.list; go('list'); },
  'kill-list': function(d){
    S.lists = S.lists.filter(function(l){ return l.id !== d.list; });
    S.view = 'lists';
    commit('Список удалён');
  },
  'item-toggle': function(d){
    var l = findList(d.list);
    if (!l) return;
    l.items.forEach(function(it){ if (it.id === d.item) it.done = !it.done; });
    commit();
  },
  'item-kill': function(d){
    var l = findList(d.list);
    if (!l) return;
    l.items = l.items.filter(function(it){ return it.id !== d.item; });
    commit();
  },
  'item-add': function(d){
    var l = findList(d.list);
    var input = document.querySelector('[data-itemadd="' + d.list + '"]');
    if (!l || !input) return;
    var value = input.value.trim();
    if (!value) return;
    l.items.push({ id: uid(), title: value, done: false });
    commit();
  },

  /* --- заметки --- */
  'new-note': function(){ openModal(modalText('Новая запись', '', 'Заголовок', 'save-note', 'Название')); },
  'save-note': function(){
    var title = mval('m-title');
    if (!title) return;
    var fresh = { id: uid(), title: title, body: '' };
    S.notes.push(fresh);
    S.activeNote = fresh.id;
    S.view = 'note';
    closeModal();
    commit();
  },
  'open-note': function(d){ S.activeNote = d.note; go('note'); },
  'kill-note': function(d){
    S.notes = S.notes.filter(function(n){ return n.id !== d.note; });
    S.view = 'notes';
    commit('Запись удалена');
  },

  /* --- помодоро --- */
  'pomo-mode': function(d){
    stopTicker();
    S.pomodoro.mode = d.mode;
    remaining = S.pomodoro[modeOf().key] * 60;
    commit();
  },
  'pomo-toggle': function(){
    if (ticker) stopTicker(); else startTicker();
    render();
  },
  'pomo-reset': function(){
    stopTicker();
    remaining = S.pomodoro[modeOf().key] * 60;
    render();
  },
  'pomo-set': function(){
    var node = document.querySelector('[data-pomofocus]');
    if (!node) return;
    var minutes = Math.max(1, Math.min(180, Number(node.value) || 0));
    S.pomodoro.focus = minutes;
    if (S.pomodoro.mode === 'focus') remaining = minutes * 60;
    commit('Длина фокуса — ' + minutes + ' мин');
  },

  /* --- медитация --- */
  'med-min': function(d){ S.meditation.minutes = Number(d.min); commit(); },
  /* Нажатие на среду включает её сразу же, не уводя никуда: звук выбирают
     ушами. Повторное нажатие по уже играющей — выключает. Если идёт сеанс,
     дорожка просто меняется на лету и не останавливается. */
  'med-sound': function(d){
    var picked = soundOf(d.sound);
    var same = soundOf(S.meditation.sound).id === picked.id;
    S.meditation.sound = picked.title;

    if (med.running){
      medAudioPlay();
    } else if (same && med.preview){
      med.preview = false;
      medAudioStop();
    } else {
      med.preview = true;
      medAudioPlay();
    }
    commit();
  },
  'med-start': function(){ medStart(); },
  'med-pause': function(){ medPause(); },
  'med-stop': function(){ medStop(true); },

  /* --- данные --- */
  'reset-demo': function(){
    var mail = S.auth.email, theme = S.theme, view = S.view, palette = S.palette;
    S = seed();
    S.auth = { stage: 'in', email: mail, sent: '', error: '' };
    S.theme = theme;
    S.palette = palette;
    S.view = view;
    commit('Примеры на месте');
  },
  wipe: function(){
    var mail = S.auth.email, theme = S.theme, view = S.view, palette = S.palette;
    S = seed();
    S.view = view;
    S.palette = palette;
    S.tasks = []; S.goals = []; S.lists = []; S.notes = [];
    S.pomodoro.doneToday = 0;
    S.meditation.doneTotal = 0;
    S.auth = { stage: 'in', email: mail, sent: '', error: '' };
    S.theme = theme;
    commit('Пусто');
  },

  'close-modal': function(){ closeModal(); }
};

/* ============ СОБЫТИЯ ============ */

/* Один делегированный обработчик на весь документ: экраны перерисовываются
   строками, вешать слушателей на узлы бессмысленно. */
document.addEventListener('click', function(event){
  var node = event.target.closest ? event.target.closest('[data-act]') : null;
  if (!node) {
    if (event.target === $('modal')) closeModal();
    return;
  }
  var act = ACTS[node.getAttribute('data-act')];
  if (!act) return;
  event.preventDefault();
  act(node.dataset);
});

/* Отправка формы — самый надёжный путь к «создать»: Enter, кнопка и «Go» на
   мобильной клавиатуре приходят сюда одинаково. */
document.addEventListener('submit', function(event){
  var form = event.target.closest ? event.target.closest('[data-form]') : null;
  if (!form) return;
  event.preventDefault();
  var act = ACTS[form.getAttribute('data-form')];
  if (act) act(form.dataset);
});

document.addEventListener('input', function(event){
  var t = event.target;
  if (t.id === 'field'){ S.draft = t.value; return; }
  if (t.id === 'gfield'){ S.goalDraft = t.value; return; }
  // Громкость ведём без перерисовки: она бы дёргала ползунок из-под пальца.
  if (t.hasAttribute && t.hasAttribute('data-volume')){
    S.meditation.volume = Number(t.value) / 100;
    if (medAudio) medAudio.volume = S.meditation.volume;
    var readout = document.querySelector('.volume .vv');
    if (readout) readout.textContent = String(Math.round(S.meditation.volume * 100));
    save();
    return;
  }
  // Имя сохраняем по вводу и не перерисовываем: перерисовка увела бы курсор
  // из поля на первой же букве.
  if (t.hasAttribute && t.hasAttribute('data-name')){
    S.profile.name = t.value.slice(0, 40);
    save();
    var av = document.querySelector('.top .avatar');
    if (av && !S.profile.avatar) av.textContent = initials();
    return;
  }
  if (t.getAttribute && t.getAttribute('data-notebody')){
    var note = findNote(t.getAttribute('data-notebody'));
    if (note){ note.body = t.value; save(); }
  }
});

document.addEventListener('focusin', function(event){
  if (event.target.id === 'field' || event.target.id === 'gfield') composerFocused = true;
});
document.addEventListener('focusout', function(event){
  if (event.target.id === 'field' || event.target.id === 'gfield') composerFocused = false;
});

document.addEventListener('keydown', function(event){
  if (event.key === 'Escape'){
    // Развёрнутая карта закрывается тем же Esc, что и модалка, и раньше неё:
    // иначе из неё нет выхода с клавиатуры.
    if (S.mm && S.mm.full){
      S.mm.full = false; S.mm.zoom = 1;
      document.body.classList.remove('mm-open');
      commit();
      return;
    }
    closeModal();
    return;
  }
  if (event.key !== 'Enter') return;

  var t = event.target;
  if (t.id === 'field'){ event.preventDefault(); addTask(); return; }
  if (t.id === 'authmail'){ event.preventDefault(); ACTS['auth-send']({}); return; }
  if (t.id === 'authcode'){ event.preventDefault(); ACTS['auth-check']({}); return; }
  if (t.getAttribute && t.getAttribute('data-subadd')){
    event.preventDefault(); ACTS.subadd({ task: t.getAttribute('data-subadd') }); return;
  }
  if (t.getAttribute && t.getAttribute('data-itemadd')){
    event.preventDefault(); ACTS['item-add']({ list: t.getAttribute('data-itemadd') }); return;
  }
  if (t.getAttribute && t.getAttribute('data-goaltask')){
    event.preventDefault();
    var stage = t.getAttribute('data-goaltask');
    ACTS['goal-task']({ goal: S.activeGoal, stage: stage });
    return;
  }
  // Enter в модалке нажимает её главную кнопку.
  if ($('modal').classList.contains('on') && t.tagName === 'INPUT'){
    var main = $('modalIn').querySelector('.btn.full');
    if (main){ event.preventDefault(); main.click(); }
  }
});

/* --- перетаскивание между блоками и внутри блока --- */

/* Порядок задач внутри блока — это порядок в S.tasks. Раньше перенос умел
   только менять блок, и внутри блока карточку было не подвинуть: задача,
   добавленная последней, оставалась последней навсегда. */

/// Перед какой карточкой встанет перетаскиваемая, если отпустить здесь.
/// Возвращает id или null — значит в конец блока.
function dropTargetIn(zone, clientY){
  var cards = zone.querySelectorAll('.item:not(.dragging)');
  for (var i = 0; i < cards.length; i++){
    var box = cards[i].getBoundingClientRect();
    if (clientY < box.top + box.height / 2) return cards[i].getAttribute('data-task');
  }
  return null;
}

/// Подсветить место вставки: линия над карточкой или рамка у пустого конца.
function markDropSpot(zone, beforeId){
  var lit = document.querySelectorAll('.item.drop-before, .tasklist.drop-end');
  for (var i = 0; i < lit.length; i++){
    lit[i].classList.remove('drop-before');
    lit[i].classList.remove('drop-end');
  }
  if (!zone) return;
  if (beforeId){
    var card = zone.querySelector('.item[data-task="' + beforeId + '"]');
    if (card) card.classList.add('drop-before');
  } else {
    zone.classList.add('drop-end');
  }
}

/// Перенос карточки. Возвращает true, если сменился блок, — только тогда есть
/// о чём говорить вслух.
function dropTask(id, bucket, beforeId){
  var task = findTask(id);
  if (!task) return false;
  var from = S.tasks.indexOf(task);
  if (from < 0) return false;

  var changedBucket = task.bucket !== bucket;
  if (changedBucket){
    task.bucket = bucket;
    task.date = dateForBucket(bucket);
    if (spansSeveralDays(bucket)) task.time = null;
  }

  S.tasks.splice(from, 1);

  var to = S.tasks.length;
  if (beforeId){
    for (var i = 0; i < S.tasks.length; i++){
      if (S.tasks[i].id === beforeId){ to = i; break; }
    }
  } else {
    // В конец своего блока, а не всего списка: иначе порядок в массиве
    // перестаёт совпадать с тем, что видно на экране.
    for (var j = S.tasks.length - 1; j >= 0; j--){
      if (S.tasks[j].bucket === bucket){ to = j + 1; break; }
    }
  }
  S.tasks.splice(to, 0, task);
  return changedBucket;
}

document.addEventListener('dragstart', function(event){
  var item = event.target.closest ? event.target.closest('[data-task]') : null;
  if (!item || !item.classList.contains('item')) return;
  S.drag = item.getAttribute('data-task');
  item.classList.add('dragging');
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
});

document.addEventListener('dragend', function(event){
  var item = event.target.closest ? event.target.closest('.item') : null;
  if (item) item.classList.remove('dragging');
  S.drag = null;
  var over = document.querySelectorAll('.tasklist.over');
  for (var i = 0; i < over.length; i++) over[i].classList.remove('over');
  markDropSpot(null, null);
});

document.addEventListener('dragover', function(event){
  var zone = event.target.closest ? event.target.closest('[data-drop]') : null;
  if (!zone || !S.drag) return;
  event.preventDefault();
  zone.classList.add('over');
  markDropSpot(zone, dropTargetIn(zone, event.clientY));
});

document.addEventListener('dragleave', function(event){
  var zone = event.target.closest ? event.target.closest('[data-drop]') : null;
  if (zone) zone.classList.remove('over');
});

/* --- перетаскивание пальцем --- */

/* HTML5 Drag and Drop сенсорные экраны не поддерживают: ни Safari на iOS, ни
   мобильный Chrome не пришлют ни dragstart, ни drop. На десктопе всё работало,
   поэтому дырку легко не заметить — на телефоне ключевого жеста просто нет.

   Здесь второй путь на Pointer Events: долгое нажатие берёт карточку, палец
   ведёт её за собой, отпускание кладёт в блок под пальцем. Третий путь —
   кнопка «Перенести в блок» в карточке, для клавиатуры и для случаев, когда
   жест не вышел. */
var HOLD_MS = 320;
var touchDrag = null;

document.addEventListener('pointerdown', function(event){
  if (event.pointerType === 'mouse') return;          // мышь идёт обычным путём
  var item = event.target.closest ? event.target.closest('.item[data-task]') : null;
  if (!item) return;
  if (event.target.closest('button')) return;         // галочка и кнопки — не перенос

  touchDrag = {
    id: item.getAttribute('data-task'),
    node: item,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    timer: setTimeout(function(){
      if (!touchDrag) return;
      touchDrag.active = true;
      // touch-action выключаем только на время жеста, иначе список перестанет
      // прокручиваться пальцем вообще.
      item.style.touchAction = 'none';
      item.classList.add('dragging');
      if (navigator.vibrate) navigator.vibrate(8);
    }, HOLD_MS)
  };
});

document.addEventListener('pointermove', function(event){
  if (!touchDrag) return;

  if (!touchDrag.active){
    // Уехал пальцем до срабатывания удержания — значит, он листает список.
    var moved = Math.abs(event.clientX - touchDrag.startX) + Math.abs(event.clientY - touchDrag.startY);
    if (moved > 12) cancelTouchDrag();
    return;
  }

  event.preventDefault();

  // Блок, в который несут задачу, обычно ниже экрана телефона: без подкрутки
  // у края дотащить её было бы некуда.
  autoScroll(event.clientY);

  var under = document.elementFromPoint(event.clientX, event.clientY);
  var zone = under && under.closest ? under.closest('[data-drop]') : null;
  var lit = document.querySelectorAll('.tasklist.over');
  for (var i = 0; i < lit.length; i++) lit[i].classList.remove('over');
  if (zone) zone.classList.add('over');
  markDropSpot(zone, zone ? dropTargetIn(zone, event.clientY) : null);
}, { passive: false });

document.addEventListener('pointerup', function(event){
  if (!touchDrag) return;
  var wasActive = touchDrag.active;
  var id = touchDrag.id;
  var under = wasActive ? document.elementFromPoint(event.clientX, event.clientY) : null;
  var zone = under && under.closest ? under.closest('[data-drop]') : null;
  var before = zone ? dropTargetIn(zone, event.clientY) : null;
  cancelTouchDrag();
  if (!wasActive || !zone) return;

  var bucket = zone.getAttribute('data-drop');
  if (before === id) { render(); return; }
  var changed = dropTask(id, bucket, before);
  commit(changed ? 'Перенесено в «' + bucketTitle(bucket) + '»' : '');
});

document.addEventListener('pointercancel', function(){ cancelTouchDrag(); });

var scrollTimer = null;
function autoScroll(y){
  var edge = 90;
  var speed = 0;
  if (y < edge) speed = -Math.ceil((edge - y) / 6);
  else if (y > window.innerHeight - edge) speed = Math.ceil((y - (window.innerHeight - edge)) / 6);

  if (!speed){
    if (scrollTimer){ clearInterval(scrollTimer); scrollTimer = null; }
    return;
  }
  if (scrollTimer) return;
  scrollTimer = setInterval(function(){
    if (!touchDrag || !touchDrag.active){ clearInterval(scrollTimer); scrollTimer = null; return; }
    window.scrollBy(0, speed);
  }, 16);
}

function cancelTouchDrag(){
  if (scrollTimer){ clearInterval(scrollTimer); scrollTimer = null; }
  if (!touchDrag) return;
  clearTimeout(touchDrag.timer);
  if (touchDrag.node){
    touchDrag.node.style.touchAction = '';
    touchDrag.node.classList.remove('dragging');
  }
  var lit = document.querySelectorAll('.tasklist.over');
  for (var i = 0; i < lit.length; i++) lit[i].classList.remove('over');
  touchDrag = null;
}

document.addEventListener('drop', function(event){
  var zone = event.target.closest ? event.target.closest('[data-drop]') : null;
  if (!zone || !S.drag) return;
  event.preventDefault();
  zone.classList.remove('over');
  var id = S.drag;
  var bucket = zone.getAttribute('data-drop');
  var before = dropTargetIn(zone, event.clientY);
  S.drag = null;
  markDropSpot(null, null);
  if (before === id) return;
  var changed = dropTask(id, bucket, before);
  commit(changed ? 'Перенесено в «' + bucketTitle(bucket) + '»' : '');
});

/* ============ УСТАНОВКА И РАБОТА БЕЗ СЕТИ ============ */

/* Планировщик, который и так держит все записи в браузере, без сети не
   открывался вовсе — терялась только оболочка. Service worker кладёт три
   файла в кэш при установке и отдаёт их офлайн; манифест даёт ярлык на
   домашнем экране. Регистрация тихая: не вышло — приложение работает как
   работало, просто без офлайна. */
function registerServiceWorker(){
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  });
}

// Развёрнутая карта не переживает перезагрузку: страница, открывшаяся сразу
// поверх всего, читается как поломка, а не как выбранный экран.
if (S.mm) { S.mm.full = false; }

rolloverIfNeeded();
render();
registerServiceWorker();

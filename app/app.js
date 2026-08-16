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

/* ============ НАПОМИНАНИЯ ============ */

/* Что напомнить — решает страница, показать — система.

   Правила живут здесь, потому что здесь записи. Если бы их продублировали на
   Java, две копии разошлись бы в первый же вечер: тут поменяли определение
   «требует внимания», там забыли.

   Мост принимает готовый список и заменяет им прежний целиком. Разбираться,
   что изменилось со вчера, незачем: задач в дне десятки.

   Ежедневные брифинг и отчёт помечены особо — они переставляют себя сами, уже
   на стороне системы. Иначе утренний план пришёл бы один раз: чтобы переставить
   его на завтра, надо открыть приложение, а человек, которому нужен план на
   утро, как раз до него приложение и не открывает. */

function уведомленияДоступны(){
  return inApp() && typeof window.AndroidNotify !== 'undefined';
}

/// Ближайший момент с заданным временем: сегодня, если ещё не прошло, иначе завтра.
function ближайшее(время){
  var ч = parseInt(String(время).slice(0, 2), 10) || 0;
  var м = parseInt(String(время).slice(3, 5), 10) || 0;
  var д = new Date();
  д.setHours(ч, м, 0, 0);
  if (д.getTime() <= Date.now()) д.setDate(д.getDate() + 1);
  return д.getTime();
}

/// Момент задачи: её собственные дата и время.
function когдаЗадача(t){
  if (!t.date || !t.time) return 0;
  var ч = parseInt(t.time.slice(0, 2), 10) || 0;
  var м = parseInt(t.time.slice(3, 5), 10) || 0;
  var д = new Date(t.date + 'T00:00:00');
  if (isNaN(д.getTime())) return 0;
  д.setHours(ч, м, 0, 0);
  return д.getTime();
}

function собратьНапоминания(){
  var н = S.notify || {};
  var список = [];
  if (!н.on) return список;

  var сейчас = Date.now();

  if (н.tasks){
    // Задачи со временем — о каждой в её час. Выполненные молчат.
    liveTasks().forEach(function(t){
      if (t.done) return;
      var когда = когдаЗадача(t);
      if (когда <= сейчас) return;
      /* Заголовок — само дело, второй строкой контекст. Сперва писал в обе
         строки одно и то же («Позвонить в клинику» / «Пора: Позвонить в
         клинику») — уведомление занимало два ряда, чтобы сказать одно. */
      var цель = t.goalId ? findGoal(t.goalId) : null;
      список.push({ когда: когда, заголовок: t.title,
        текст: (цель ? 'Цель: ' + цель.title + ' · ' : '') + 'на ' + t.time });
    });
  }

  if (н.goals){
    /* Цель напоминает о себе накануне срока, а не в сам день: цель — это не
       задача на пятнадцать минут, и «сегодня последний день» приходит поздно. */
    (S.goals || []).forEach(function(g){
      if (!g.targetDate) return;
      var д = new Date(g.targetDate + 'T09:00:00');
      if (isNaN(д.getTime())) return;
      д.setDate(д.getDate() - 1);
      var п = goalProgress(g);
      if (д.getTime() > сейчас){
        список.push({ когда: д.getTime(), заголовок: 'Завтра срок цели',
          текст: g.title + ' — пройдено ' + pct(п.done, п.total) + '%' });
      }
    });
  }

  if (н.brief){
    var сегодня = liveTasks().filter(function(t){ return t.bucket === 'today'; });
    var просрочено = liveTasks().filter(isOverdue).length;
    var осталось = сегодня.filter(function(t){ return !t.done; }).length;

    список.push({ когда: ближайшее(н.morning || '08:00'), ежедневно: true,
      заголовок: 'План на день',
      текст: сегодня.length
        ? 'На сегодня ' + taskCount(сегодня.length) +
          (просрочено ? ', и ' + просрочено + ' ждут со вчера' : '') + '. С чего начнём?'
        : 'На сегодня пока пусто. Что важно успеть?' });

    список.push({ когда: ближайшее(н.evening || '21:00'), ежедневно: true,
      заголовок: 'Как прошёл день',
      текст: сегодня.length
        ? 'Закрыто ' + (сегодня.length - осталось) + ' из ' + сегодня.length +
          (осталось ? '. Осталось ' + осталось + ' — перенести на завтра?' : '. Всё сделано.')
        : 'Задач на сегодня не было. Наметить что-то на завтра?' });
  }

  // По времени: номера в мосте раздаются по порядку, и ближайшее должно
  // получить место даже если дальних набралось больше предела.
  список.sort(function(a, b){ return a.когда - b.когда; });
  return список;
}

function пересобратьНапоминания(){
  if (!уведомленияДоступны()) return;
  try {
    window.AndroidNotify.reschedule(JSON.stringify(собратьНапоминания()));
  } catch (e){}
}

/* ============ БЛОКИ ДНЯ ============ */

/* Порядок, названия и подписи — из TaskBucket в Models.swift. День, в котором
   лежит задача, это единственное, в чём веб и приложение не имеют права
   расходиться. */
/* Подписей под названиями блоков нет: «Сегодня» не нуждается в пояснении
   «то, что важно не потерять сегодня». Пять таких строк съедали экран и
   ничего не сообщали. */
/* Стоит выше состояния намеренно: seed() строит из этого списка стартовый
   набор свёрнутых блоков, а он выполняется до конца файла. */
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

function свёрнутыеБлоки(){
  var map = {};
  for (var i = 0; i < BUCKETS.length; i++) map[BUCKETS[i].id] = true;
  return map;
}

/* Значки дней — те же, что в приложении на айфоне (TaskBucket.icon):
   солнце, рассвет, календарь, календарь с часами, короб. Смысл у них не
   декоративный: свёрнутые блоки различаются только словом, а слово читается
   медленнее рисунка — глаз находит «Сегодня» по солнцу раньше, чем по буквам.

   Нарисованы, а не взяты из шрифта: эмодзи солнца на разных андроидах то
   плоское, то объёмное, и ряд из пяти таких выглядит собранным из разных
   приложений. */
var BUCKET_ICONS = {
  today: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<circle cx="8" cy="8" r="3.1"/>' +
    '<path d="M8 1.3v1.5M8 13.2v1.5M1.3 8h1.5M13.2 8h1.5' +
      'M3.25 3.25l1.05 1.05M11.7 11.7l1.05 1.05M12.75 3.25L11.7 4.3M4.3 11.7l-1.05 1.05"/></svg>',
  tomorrow: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M4.4 10.4a3.6 3.6 0 0 1 7.2 0"/>' +
    '<path d="M1.8 13h12.4"/>' +
    '<path d="M8 1.4v3.1M6.6 2.8 8 1.4l1.4 1.4"/></svg>',
  dayAfterTomorrow: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<rect x="2.1" y="3.3" width="11.8" height="10.6" rx="2"/>' +
    '<path d="M2.1 6.6h11.8M5.4 1.8v2.6M10.6 1.8v2.6M5.4 10.3h5.2"/></svg>',
  thisWeek: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M13.9 8.1V5.3a2 2 0 0 0-2-2H4.1a2 2 0 0 0-2 2v6.6a2 2 0 0 0 2 2h4"/>' +
    '<path d="M2.1 6.8h11.8M5.4 1.8v2.6M10.6 1.8v2.6"/>' +
    '<circle cx="11.9" cy="11.9" r="2.8"/><path d="M11.9 10.5v1.5l1.1.7"/></svg>',
  later: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<rect x="1.8" y="3.2" width="12.4" height="3" rx="1.1"/>' +
    '<path d="M3.1 6.2v6.1a1.6 1.6 0 0 0 1.6 1.6h6.6a1.6 1.6 0 0 0 1.6-1.6V6.2"/>' +
    '<path d="M6.4 9.1h3.2"/></svg>'
};

/* Первое открытие — пустой планировщик, а не чужой день.

   Раньше здесь лежали примеры: презентация, автосервис, английский за год. Они
   хорошо показывали возможности и ровно так же ломали доверие — двое разных
   людей открывали сервис и видели одни и те же задачи, свои ли это, понять
   было нельзя. Планировщик, который начинается с чужих дел, не выглядит
   личным.

   Примеры никуда не делись: они лежат в demoState() и заводятся по кнопке в
   «Настройки → Данные». Разница в том, что теперь их заводят, а не получают. */
function seed(){
  return {
    version: 2,
    view: 'tasks',
    sub: null,
    pro: { active: false, plan: '', expiresAt: '', code: '' },
    synChat: [],
    briefing: null,
    profile: { name: '', avatar: '' },
    installID: '',
    openGoal: {},
    goalDraft: '',
    theme: systemPrefersDark() ? 'dark' : 'light',
    palette: 'paper',
    font: 'rounded',
    /* В приложении по умолчанию мелкий, в браузере прежний средний.

       На телефоне средний давал огромные карточки: на экран влезало вдвое
       меньше, чем помещается. На большом экране этой беды нет, и менять там
       привычный размер незачем. */
    fontSize: touchUI() ? 'compact' : 'standard',
    box: 'square',
    markColor: 'default',
    /* Напоминания — только в приложении: в браузере их показывать нечем.
       Времена хранятся строкой ЧЧ:ММ, как и всё остальное время в сервисе. */
    notify: { on: false, tasks: true, goals: true, brief: true, morning: '08:00', evening: '21:00' },
    hintSeen: false,
    // Обучение показывается, пока не пройдено или пока его не закрыли руками.
    tourDone: false,
    more: false,
    draft: '',
    drag: null,
    /* В приложении дни свёрнуты с самого начала.

       Пять развёрнутых блоков — это несколько экранов прокрутки на телефоне
       ещё до того, как человек что-то записал. Свёрнутые дают карту всей
       недели в один взгляд, а нужный день открывается касанием и таким и
       остаётся: состояние сохраняется. Записанная задача сама раскрывает свой
       блок, так что первый ввод ни во что не упирается.

       В браузере оставляем как было: там экран большой и разворачивать нечего.
       Признак — inApp(), а не touchUI(): мобильный сайт должен остаться тем же
       сайтом. */
    closed: inApp() ? свёрнутыеБлоки() : {},
    open: {},
    activeGoal: null,
    activeList: null,
    activeNote: null,
    tasks: [],
    goals: [],
    lists: [],
    notes: [],
    trash: [],
    pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, mode: 'focus', doneToday: 0, goal: 0 },
    meditation: { minutes: 10, sound: 'Дождь', doneTotal: 0, totalMinutes: 0, volume: 0.7 },
    // Финансы стартуют пустыми, как и всё остальное: чужие траты в примере
    // читаются как свои и портят первую же сводку.
    finance: { ops: [], debts: [], jars: [], subs: [], accounts: [],
               budgets: {}, recurring: [], cats: [], opening: 0 },
    finTab: 'sum',
    finKind: 'spend',
    finMonth: '',
    finPayTab: 'subs',
    finPending: null,
    finDate: ''
  };
}

/// Те же примеры, что раньше стояли по умолчанию. Теперь — по кнопке.
function demoState(){
  var base = seed();
  var g1 = uid(), s11 = uid(), s12 = uid(), s13 = uid();
  var g2 = uid(), s21 = uid(), s22 = uid();

  base.tourDone = true;
  base.tasks = [
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
  ];
  base.goals = [
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
  ];
  base.lists = [
    { id: uid(), title: 'Собрать чемодан в Сочи', note: 'Вылет в субботу утром',
      items: [
        { id: uid(), title: 'Паспорт и билеты', done: true },
        { id: uid(), title: 'Крем от солнца', done: false },
        { id: uid(), title: 'Зарядка для телефона', done: false }
      ] }
  ];
  base.notes = [
    { id: uid(), title: 'Встреча с подрядчиком',
      body: 'Обсудили сроки: черновой этап к 20 числу, приём работ через неделю.' }
  ];
  return base;
}

function load(){
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    var parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2 || !parsed.tasks) return seed();
    // Поля, которых могло не быть в раньше сохранённом состоянии.
    parsed.drag = null;
    // Поле auth осталось у тех, кто открывал прошлые версии. Не читаем и не
    // пишем: входа больше нет, а чужие ключи в хранилище чистить не наше дело.
    if (!parsed.pro) parsed.pro = { active: false, plan: '', expiresAt: '', code: '' };
    if (!parsed.synChat || !parsed.synChat.length) parsed.synChat = [];
    if (!parsed.briefing) parsed.briefing = null;
    if (!parsed.trash) parsed.trash = [];
    // Тем, у кого уже что-то заведено, обучение показывать поздно и незачем.
    if (typeof parsed.tourDone !== 'boolean'){
      parsed.tourDone = (parsed.tasks && parsed.tasks.length > 0) || (parsed.goals && parsed.goals.length > 0);
    }
    if (!parsed.palette) parsed.palette = 'paper';
    // «Как в системе» больше нет: тема теперь решение человека, а не среды.
    // Тем, у кого стояла системная, ставим ту, которую они и видели.
    if (parsed.theme !== 'light' && parsed.theme !== 'dark') parsed.theme = systemPrefersDark() ? 'dark' : 'light';
    if (!parsed.mm) parsed.mm = { zoom: 1 };
    if (!parsed.notify) parsed.notify = { on: false, tasks: true, goals: true, brief: true, morning: '08:00', evening: '21:00' };
    if (!parsed.closed) parsed.closed = {};
    if (!parsed.open) parsed.open = {};
    if (!parsed.profile) parsed.profile = { name: '', avatar: '' };
    if (!parsed.openGoal) parsed.openGoal = {};
    // Финансы завелись позже остальных разделов: у всех, кто открывал прошлые
    // версии, их в сохранённом состоянии нет.
    if (!parsed.finance) parsed.finance = {};
    if (!parsed.finance.ops) parsed.finance.ops = [];
    if (!parsed.finance.debts) parsed.finance.debts = [];
    if (!parsed.finance.jars) parsed.finance.jars = [];
    if (!parsed.finance.subs) parsed.finance.subs = [];
    // Счета, конверты, регулярные операции и свои категории появились позже
    // первой версии раздела.
    if (!parsed.finance.accounts) parsed.finance.accounts = [];
    /* Счета были отдельным разделом и оказались перегрузом: ради одного
       числа — сколько всего есть — приходилось заводить карточку, наличные и
       накопительный. Раздел убран, а деньги с заведённых счетов сложены
       обратно в остаток, чтобы «Свободно» не поехало. */
    if (parsed.finance.accounts.length){
      for (var ai = 0; ai < parsed.finance.accounts.length; ai++){
        parsed.finance.opening = (parsed.finance.opening || 0) +
          (parsed.finance.accounts[ai].opening || 0);
      }
      parsed.finance.accounts = [];
    }
    if (!parsed.finance.budgets) parsed.finance.budgets = {};
    if (!parsed.finance.recurring) parsed.finance.recurring = [];
    if (!parsed.finance.cats) parsed.finance.cats = [];
    // У прежних подписок не было ни категории, ни отметок об оплате: они
    // появились вместе с ЖКХ, где сумма своя каждый месяц.
    for (var si = 0; si < parsed.finance.subs.length; si++){
      var sb = parsed.finance.subs[si];
      if (!sb.cat) sb.cat = 'subs';
      if (typeof sb.vary !== 'boolean') sb.vary = false;
      // Вид выводим из категории: жильё, кредиты и учёба — обязательное.
      if (typeof sb.duty !== 'boolean'){
        sb.duty = ['home', 'loans', 'learn'].indexOf(sb.cat) !== -1;
      }
      if (!sb.paid) sb.paid = {};
      if (!sb.ops) sb.ops = {};
    }
    if (typeof parsed.finance.opening !== 'number') parsed.finance.opening = 0;
    if (typeof parsed.finTab !== 'string') parsed.finTab = 'sum';
    if (typeof parsed.finKind !== 'string') parsed.finKind = 'spend';
    if (typeof parsed.finMonth !== 'string') parsed.finMonth = '';
    if (typeof parsed.finPayTab !== 'string') parsed.finPayTab = 'subs';
    // Неподтверждённая пачка живёт только в этой сессии: подтверждать вчера
    // предложенное сегодня — верный способ записать не то.
    parsed.finPending = null;
    parsed.finDate = '';
    if (typeof parsed.installID !== 'string') parsed.installID = '';
    if (typeof parsed.meditation.volume !== 'number') parsed.meditation.volume = 0.7;
    if (typeof parsed.meditation.totalMinutes !== 'number') parsed.meditation.totalMinutes = 0;
    if (typeof parsed.goalDraft !== 'string') parsed.goalDraft = '';
    if (typeof parsed.pomodoro.goal !== 'number') parsed.pomodoro.goal = 0;
    if (!parsed.font) parsed.font = 'rounded';
    if (!parsed.fontSize) parsed.fontSize = 'standard';
    if (!parsed.box) parsed.box = 'square';
    parsed.more = false;
    // Раздела «Главная» больше нет: состояние, сохранённое на нём, никуда бы
    // не отрисовалось.
    if (parsed.view === 'home') parsed.view = 'tasks';
    if (parsed.view === 'pricing') parsed.view = 'subscription';
    // Экрана входа больше нет: сохранённый на нём никуда бы не отрисовался.
    if (parsed.view === 'auth') parsed.view = 'settings';
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
      // Выполненное вчерашнее уходит с глаз, но не пропадает: оно остаётся
      // в S.tasks, попадает в выгрузку данных и возвращается по просьбе
      // ассистента («верни задачу такую-то»). Числами его больше нигде не
      // показывают — счётчики, которые его считали, стояли в разделе с
      // картой целей и были там чужими.
      if (!t.archived){ t.archived = true; archived += 1; }
      continue;
    }
    /* Счётчик переносов. Сама дата, с которой задача переехала, ничего не
       говорит — а число переездов говорит: задача, перенесённая пятый раз, это
       не «не успел», это «не буду», и увидеть это надо раньше, чем через
       месяц. То же поле есть в приложении (missStreak). */
    t.carriedFrom = t.carriedFrom || t.date;
    t.carried = (t.carried || 0) + 1;
    t.date = today;
    t.bucket = 'today';
    moved += 1;
  }

  // Заодно уходит просроченное хранение в корзине: это единственное место, где
  // мы и так сверяем даты.
  var swept = trashSweep();

  S.lastOpened = today;
  if (swept && !moved && !archived){
    pendingToast = 'Из корзины убрано: ' + swept;
  }
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

/* ============ ПОДПИСКА ============ */

/* Бесплатно отдаётся то, чем планировщик остаётся планировщиком: задачи без
   счёта и по две штуки остального, чтобы человек попробовал каждый раздел на
   своих данных, а не на демо. Помодоро и медитация — целиком в подписке.

   Гейт на стороне браузера честно называется тем, что он есть: витриной, а не
   замком. Всё, что стоит денег по-настоящему, — запросы к Syn — считает
   сервер, и обойти это, почистив localStorage, нельзя. */
var FREE_LIMITS = {
  lists: 2, notes: 2, goals: 2,
  // Финансы: по две записи на каждый вид. Операции намеренно не ограничены —
  // это «обычные задачи» финансов: без ленты трат раздел нечем оценить, а
  // платят здесь за масштаб — за счета, конверты, копилки и долги, которые
  // растут вместе с тем, как человек ведёт деньги.
  debts: 2, jars: 2, subs: 2, budgets: 2, recurring: 2, cats: 2
};

/// Сколько записей уже заведено — по видам, которые считает freeLeft.
function haveOf(kind){
  if (kind === 'lists') return S.lists.length;
  if (kind === 'notes') return S.notes.length;
  if (kind === 'goals') return S.goals.length;
  if (kind === 'budgets') return Object.keys(S.finance.budgets || {}).length;
  if (kind === 'cats') return (S.finance.cats || []).length;
  var box = S.finance && S.finance[kind];
  return box ? box.length : 0;
}

/* Платных разделов больше нет.

   Помодоро и медитация были за подпиской, и это оказалось той жадностью, которую
   замечают первой: таймер и запись дождя не стоят нам ничего, никому не мешают и
   ничего не решают в деньгах. Платят здесь за ассистента и за масштаб — за то,
   что стоит денег нам и растёт вместе с работой человека.

   Объект остаётся пустым, а не удаляется: сама развилка «платный раздел»
   рабочая, и когда такой раздел появится, его хватит вписать сюда одной
   строкой. */
/* Платных разделов нет. Финансы открыты всем: закрытый раздел нечем
   оценить, а платят здесь за объём — по две записи каждого вида бесплатно,
   дальше подписка. Так же, как с целями, списками и заметками. */
var PRO_ONLY = {};

/* Сколько подписка живёт без подтверждения с сервера.

   Признак Pro лежит в памяти устройства, и подделать его — дело одной строки:
   вскрывать apk для этого даже не нужно. Совсем убрать локальную проверку
   нельзя, иначе приложение перестанет работать без сети, а офлайн — половина
   его смысла.

   Поэтому не запрещаем, а даём признаку срок годности. Раз в трое суток
   приложение молча спрашивает сервер, жива ли подписка. Не спросив
   подтверждения две недели, признак угасает сам.

   Две недели, а не два дня: человек уезжает без интернета, живёт в дороге,
   ставит телефон в авиарежим. Наказывать его за это нельзя. А подделанный
   флаг за две недели всё равно умрёт — сервер о такой подписке ничего не
   знает и не подтвердит её никогда. */
var ПОДТВЕРЖДАТЬ_ЧЕРЕЗ = 3 * 24 * 3600 * 1000;
var ЖИТЬ_БЕЗ_ПОДТВЕРЖДЕНИЯ = 14 * 24 * 3600 * 1000;

function isPro(){
  if (!S.pro || !S.pro.active) return false;

  /* Только в приложении: сайт раздаём мы сами, пересобрать и раздать его
     нельзя, и лишняя проверка там только мешала бы. */
  if (inApp() && S.pro.checkedAt){
    if (Date.now() - S.pro.checkedAt > ЖИТЬ_БЕЗ_ПОДТВЕРЖДЕНИЯ) return false;
  }
  // Срок кончился — Pro выключается сам, не дожидаясь ответа сервера: иначе
  // человек с истёкшим кодом видел бы платное до следующего запуска.
  if (S.pro.expiresAt){
    var until = Date.parse(S.pro.expiresAt);
    if (until && until < Date.now()) return false;
  }
  return true;
}

/// Сколько ещё можно завести бесплатно. -1 значит «сколько угодно».
function freeLeft(kind){
  if (isPro()) return -1;
  if (FREE_LIMITS[kind] === undefined) return -1;
  return Math.max(0, FREE_LIMITS[kind] - haveOf(kind));
}

function canAdd(kind){ return freeLeft(kind) !== 0; }

/* Что из оформления открыто без подписки.

   Раньше здесь было пусто: темы, значки, звуки и режимы таймера отдавались
   целиком. Владелец решил иначе — и это не жадность на пустом месте: каждая
   тема, каждый звук и каждый режим кем-то нарисован и записан, а платит за
   всю работу подписка. Первое из каждого набора остаётся бесплатным, чтобы
   человек видел, что выбор вообще существует, и понимал, за что платит.

   Считаем по месту в списке, а не по имени: порядок в наборах и есть порядок
   «сначала бесплатное». */
var FREE_LOOKS = {
  palettes: 2,   // «Бумага» и «Графит»
  boxes: 1,      // квадрат
  sounds: 1,     // дождь
  pomoModes: 1   // самый короткий режим; остальные — в подписке
};

/// Открыт ли элемент под номером index в наборе kind.
function lookOpen(kind, index){
  if (isPro()) return true;
  return index < (FREE_LOOKS[kind] || 0);
}

var LIMIT_WORDS = {
  lists: ['список', 'списка', 'списков'],
  notes: ['заметка', 'заметки', 'заметок'],
  goals: ['цель', 'цели', 'целей'],
  debts: ['долг', 'долга', 'долгов'],
  jars: ['копилка', 'копилки', 'копилок'],
  subs: ['подписка', 'подписки', 'подписок'],
  budgets: ['конверт', 'конверта', 'конвертов'],
  recurring: ['регулярная операция', 'регулярные операции', 'регулярных операций'],
  cats: ['своя категория', 'свои категории', 'своих категорий']
};

function limitReason(kind){
  var n = FREE_LIMITS[kind];
  var w = LIMIT_WORDS[kind] || ['запись', 'записи', 'записей'];
  return 'Без подписки ' + (kind === 'goals' ? 'можно вести ' : 'можно держать ') +
    n + ' ' + plural(n, w[0], w[1], w[2]) + '.';
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

var MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function humanDate(iso){
  var d = dateOf(iso);
  if (!d) return '';
  return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()];
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
/// Возвращает {title, bucket, date, time, hasDate, hasTime}: два последних —
/// назвал ли человек день и время сам или мы вывели их из блока.
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

/* Время, которое сегодня уже прошло, — это завтра.

   «Купить молоко в девять утра», сказанное в два часа дня, означает завтрашние
   девять: задача, созданная просроченной, выглядит как ошибка сервиса, а не как
   планирование. Исключение одно, и оно важное: человек сказал «сегодня» явно —
   значит, он знает, что делает, и спорить с ним незачем.

   Правила нет ни в приложении, ни на сервере: это новая логика, а не перенос.
   Сервер теперь тоже об этом просят в промпте, но промпт — просьба, а это
   проверка. */
/* «Дату назвали явно» — отдельный факт, а не догадка по наличию времени.

   Разница видна на карточке: у задачи, которой день назвали («в пятницу»),
   дата — обещание, и её показывают всегда. У задачи, попавшей в блок без даты,
   дата выведена нами из блока, и показывать её как решение человека — врать.
   В приложении для этого есть hasExplicitDate/hasExplicitTime, теперь есть и
   здесь. */
function pushPastTimeToTomorrow(parsed, source){
  if (!parsed.time || parsed.bucket !== 'today') return parsed;
  if (/(^|[^а-яa-z])сегодня([^а-яa-z]|$)/i.test(String(source || ''))) return parsed;

  var now = new Date();
  var parts = parsed.time.split(':');
  var planned = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
    Number(parts[0]), Number(parts[1]));
  if (planned >= now) return parsed;

  parsed.bucket = 'tomorrow';
  parsed.date = dateForBucket('tomorrow');
  return parsed;
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

/* Своё правило повтора, а не один из шести пресетов.

   Пресеты закрывают обычные случаи и остаются главным путём: «каждый день», «по
   будням». Но правила, которые присылает Syn и которые люди правда держат в
   голове, ими не выражаются — «каждые три дня», «по вторникам и четвергам», «5 и
   20 числа». Раньше такие округлялись до ближайшего пресета, то есть тихо
   подменялись другим правилом.

   Своё правило лежит в task.rule, а task.repeat при этом равен 'custom'. Так
   старые задачи с пресетом продолжают работать без миграции, а весь остальной
   код спрашивает правило одной функцией. */
var CUSTOM_REPEAT = 'custom';

function taskRule(task){
  if (!task || !task.repeat) return null;
  if (task.repeat === CUSTOM_REPEAT) return task.rule || null;
  return repeatPreset(task.repeat).rule;
}

var WEEKDAY_SHORT_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/// Человеческое название любого правила — и пресета, и своего.
/// Правило из того, что уже лежит в объекте, — без обращения к полям формы.
/// Нужна отдельно, чтобы подпись «Сейчас: …» считалась и до открытия модалки.
function ruleFromFields(rule){
  if (!rule) return null;
  return {
    unit: rule.unit || 'day',
    interval: Math.max(1, Math.min(365, Number(rule.interval) || 1)),
    weekdaysOnly: false,
    weeklyWeekdays: rule.weeklyWeekdays || [],
    monthlyDays: rule.monthlyDays || []
  };
}

function ruleLabel(rule){
  if (!rule) return '';
  var step = normalizedInterval(rule);

  if (rule.unit === 'day'){
    if (rule.weekdaysOnly) return 'по будням';
    if (step === 1) return 'каждый день';
    return 'каждые ' + step + ' ' + plural(step, 'день', 'дня', 'дней');
  }

  if (rule.unit === 'week'){
    var days = (rule.weeklyWeekdays || []).slice().sort(function(a, b){ return a - b; });
    var prefix = step === 1 ? '' : 'через ' + (step - 1) + ' нед · ';
    if (days.length) return prefix + 'по ' + days.map(function(d){ return WEEKDAY_SHORT_RU[d]; }).join(', ');
    return step === 1 ? 'каждую неделю' : 'каждые ' + step + ' недели';
  }

  var numbers = (rule.monthlyDays || []).slice().sort(function(a, b){ return a - b; });
  if (numbers.length) return numbers.join(' и ') + ' числа';
  return step === 1 ? 'каждый месяц' : 'каждые ' + step + ' месяца';
}

function repeatLabel(id, task){
  if (task) return ruleLabel(taskRule(task));
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
function nextOccurrence(fromISO, rule, minISO){
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
  var next = nextOccurrence(base, taskRule(task), isoOf(addDays(dateOf(base) || todayDate(), 1)));
  if (!next) return null;

  var series = task.series || task.id;
  // Дубль той же серии на тот же день не создаём — hasRecurringOccurrence.
  for (var i = 0; i < S.tasks.length; i++){
    var other = S.tasks[i];
    if ((other.series || other.id) === series && other.date === next && !other.done) return null;
  }

  var copy = {
    id: uid(), title: task.title, bucket: derivedBucket(next), date: next, done: false,
    note: task.note, time: task.time, repeat: task.repeat, rule: task.rule || null, series: series,
    deadline: task.deadline || null, windowFrom: task.windowFrom || null,
    hasExplicitDate: task.hasExplicitDate, hasExplicitTime: task.hasExplicitTime,
    goalId: task.goalId, stageId: task.stageId,
    subtasks: task.subtasks.map(function(s){ return { id: uid(), title: s.title, done: false }; })
  };
  S.tasks.push(copy);
  return copy;
}

/* ============ ПРОСРОЧКА ============ */

/// Задача просрочена, если её день (а если задано — и время) уже прошёл.
/* Крайний срок — не то же самое, что день в плане: задача может стоять на
   вторник, а быть нужной до пятницы. В приложении это два разных поля, здесь
   тоже. Хранится {date, time, hard}; hard значит, что срок назван жёстко. */
function deadlineText(deadline){
  if (!deadline) return '';
  var parts = [];
  if (deadline.date) parts.push(humanDate(deadline.date));
  if (deadline.time) parts.push(deadline.time);
  return parts.join(' ');
}

function deadlinePassed(task){
  if (task.done || !task.deadline) return false;
  var d = task.deadline;
  if (!d.date) return false;
  var day = dateOf(d.date);
  if (!day) return false;
  if (d.time){
    var parts = d.time.split(':');
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(parts[0]), Number(parts[1]));
    return day < new Date();
  }
  return day < todayDate();
}

/* Просрочка — это прошедшее время, и только оно.

   У задачи без времени просрочки не бывает: «купить корм» на сегодня не
   становится провалом в полночь, оно просто переезжает на следующий день и
   висит дальше. Раньше такая задача получала красную отметку за то, что
   пролежала день, — и отметка обесценивалась, потому что была почти у всех. */
function isOverdue(task){
  if (task.done || !task.date || !task.time) return false;
  var day = dateOf(task.date);
  if (!day) return false;
  var parts = task.time.split(':');
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(),
    Number(parts[0]), Number(parts[1])) < new Date();
}

/* ============ ЗНАЧКИ РАЗДЕЛОВ ============ */

/* Свой набор вместо символов шрифта.

   Раньше в меню стояли ☑ ◎ ✦ ◔ ≡ ✎ ⚙ ⓘ — символы Unicode. У них два неустранимых
   недостатка: рисует их шрифт системы, поэтому в Safari, Chrome и на Android они
   разной толщины и разного размера, и управлять этим нельзя — только кеглем. На
   телефоне из-за этого они выглядели мелкими и бледными рядом с жирными
   подписями.

   Здесь один набор, нарисованный по одним правилам: сетка 24×24, штрих 1.8 без
   заливки, скруглённые концы. Так рисуют Lucide и Feather, и причина та же —
   при таком штрихе значки читаются и в 18 пикселей, и в 26, и не спорят друг с
   другом по весу. Никакой библиотеки при этом не подключается: набор небольшой,
   а зависимостей у этого проекта нет и не будет.

   Форма выбиралась по узнаваемости в маленьком размере, а не по красоте в
   большом: шестерёнка настроек в 18 пикселей превращается в кляксу, поэтому
   настройки — ползунки. */
function navIcon(path){
  return '<svg viewBox="0 0 24 24" aria-hidden="true" class="nav-ic">' + path + '</svg>';
}

var NAV_ICONS = {
  // Задачи — квадрат с галочкой: самый прямой образ отметки о выполнении.
  tasks: navIcon('<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="M8 12.2l2.7 2.6L16 9.4"/>'),
  // Цели — мишень: круги, сходящиеся к точке.
  goals: navIcon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/>'),
  /* Значки переехали вслед за названиями.

     Раздел focus теперь называется «Аналитика» и берёт столбцы — разговор
     про числа и сравнение. Раздел analytics называется «Карта целей», и
     столбцы ему больше не по делу: у него узлы и связи, тот же образ, что у
     самой карты и у марки сервиса. Искра ушла: она значила «ассистент», а
     ассистент живёт в своей кнопке. */
  focus: navIcon('<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8.5 20v-6.5"/><path d="M13 20V8.5"/><path d="M17.5 20v-4"/>'),
  analytics: navIcon('<circle cx="5.4" cy="12" r="2.6"/><circle cx="17.8" cy="6.4" r="2.3"/>' +
    '<circle cx="17.8" cy="17.6" r="2.3"/><path d="M7.8 10.9l7.8-3.5M7.8 13.1l7.8 3.5"/>'),
  // Списки — строки с отметками.
  lists: navIcon('<path d="M9 7h11M9 12h11M9 17h11"/><path d="M4 7h.01M4 12h.01M4 17h.01"/>'),
  // Заметки — лист с текстом и загнутым углом.
  notes: navIcon('<path d="M14 3.5H7a2.5 2.5 0 0 0-2.5 2.5v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3.5V9h5.5"/><path d="M8.5 13.5h7M8.5 17h4.5"/>'),
  // Помодоро — таймер: круг, стрелка и кнопка сверху.
  pomodoro: navIcon('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.8"/><path d="M9.5 2.5h5"/><path d="M12 2.5v3.5"/>'),
  // Медитация — волны: ровное дыхание, а не поза лотоса, которую в 18 пикселей
  // не разобрать.
  meditation: navIcon('<path d="M3 8.5c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 4.5 0"/><path d="M3 13c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 4.5 0"/><path d="M3 17.5c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 4.5 0"/>'),
  // Подписка — карта: то, чем платят, без золота и короны.
  subscription: navIcon('<rect x="2.8" y="5.5" width="18.4" height="13" rx="3"/><path d="M2.8 10h18.4"/><path d="M6.5 14.5h3"/>'),
  // Настройки — ползунки. Шестерёнка в маленьком размере превращается в кляксу.
  settings: navIcon('<path d="M4 8h10M18 8h2M4 16h4M12 16h8"/><circle cx="16" cy="8" r="2.2"/><circle cx="10" cy="16" r="2.2"/>'),
  // О сервисе — «i» в круге.
  about: navIcon('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.8h.01"/>'),
  // Поддержка — спасательный круг: узнаётся мгновенно и не путается с
  // «О сервисе», у которого тоже круг.
  support: navIcon('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/><path d="M14.4 9.6l3.6-3.6M6 6l3.6 3.6M14.4 14.4l3.6 3.6M6 18l3.6-3.6"/>'),
  // Ещё — три точки.
  more: navIcon('<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
  // Закрыть «Ещё» — крест.
  close: navIcon('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  // Корзина — ведро с крышкой.
  // Финансы — не рубль и не мешок с деньгами: столбики, как в аналитике,
  // потому что раздел про разбор, а не про кассу.
  finance: navIcon('<path d="M4 20h16"/><path d="M7 20v-6"/><path d="M12 20V6"/><path d="M17 20v-9"/>'),
  trash: navIcon('<path d="M4 7.5h16"/><path d="M9.5 7.5V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6A1.7 1.7 0 0 1 14.5 5.2v2.3"/>' +
    '<path d="M6.5 7.5l.9 11a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-11"/><path d="M10.5 11.5v5M13.5 11.5v5"/>'),
  // Выход — дверь со стрелкой наружу.
  leave: navIcon('<path d="M9.5 20.5H6a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 6 3.5h3.5"/><path d="M15.5 16l4.5-4-4.5-4"/><path d="M20 12H9"/>'),

  // Строка со стрелкой вправо: «здесь есть продолжение».
  chevron: navIcon('<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>'),
  // Отправить — стрелка вверх, как в строке создания.
  send: navIcon('<path d="M12 19.5V5"/><path d="M5.5 11.5L12 5l6.5 6.5"/>'),
  // Тема: солнце и месяц.
  sun: navIcon('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.2M12 19v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.8 12h2.2M19 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
  moon: navIcon('<path d="M20 13.5A8.2 8.2 0 0 1 10.5 4a8.2 8.2 0 1 0 9.5 9.5z"/>'),
  // Этап цели — ромб: шаг на пути, а не отметка.
  stage: navIcon('<path d="M12 3.6l8.4 8.4-8.4 8.4L3.6 12z"/>')
};

/* ============ РОУТИНГ ============ */

/* Порядок разделов задан владельцем: задачи, цели, аналитика, карта целей,
   списки, заметки, помодоро, медитация, настройки, о сервисе. Отдельного
   раздела «Главная» больше нет — то, что в нём лежало, стало пунктами меню.

   Десять пунктов — это меню, а не таб-бар. На широком экране они умещаются
   колонкой слева целиком. На телефоне в нижнюю панель влезает четыре, поэтому
   там первые четыре и кнопка «Ещё», открывающая остальные списком: прятать
   половину разделов за горизонтальной прокруткой хуже, чем честно показать,
   что их больше. */
var TABS = [
  { id: 'tasks',      title: 'Задачи',    primary: true },
  { id: 'goals',      title: 'Цели',      primary: true },
  /* Названия поменялись местами по смыслу, а не по прихоти.

     «Мой фокус» и был аналитикой: процент дня, брифинг от Syn, полосы
     выполнения, сессии помодоро. А в разделе, который назывался
     «Аналитика», от статистики остались два ряда счётчиков, дублирующих
     соседние экраны, — и карта целей, ради которой туда и заходили. Теперь
     каждый назван тем, что в нём лежит.

     Идентификаторы разделов остались прежними: по ним ходят сохранённое
     состояние, история переходов и все data-view в разметке. Переименовать
     их — значит выкинуть у людей открытый экран при первом же обновлении
     ради красоты в исходнике. */
  { id: 'focus',      title: 'Аналитика',   primary: true },
  { id: 'analytics',  title: 'Карта целей', primary: true, short: 'Карта' },
  { id: 'lists',      title: 'Списки'    },
  { id: 'notes',      title: 'Заметки'   },
  { id: 'pomodoro',   title: 'Метод Помодоро', short: 'Помодоро' },
  { id: 'meditation', title: 'Медитация' },
  // Тарифы стоят в самом меню, а не в углу настроек: два раздела из десяти
  // открываются только по подписке, и человек должен видеть, где про это
  // написано, в ту же секунду, когда упёрся.
  // «Мои финансы» стоят рядом с аналитикой, а не в конце: это тот же разбор
  // своей жизни числами, только про деньги. Раздел платный целиком — он
  // держится на подписке, как ассистент.
  { id: 'finance',    title: 'Мои финансы', short: 'Финансы' },
  { id: 'trash',      title: 'Корзина' },
  // Черта проходит здесь, а не после «Аналитики»: выше неё то, чем работают,
  // ниже — то, что открывают про сам сервис. Корзина принадлежит работе.
  { id: 'subscription', title: 'Моя подписка', short: 'Подписка', sep: true },
  { id: 'settings',   title: 'Настройки' },
  // «О сервисе» в меню нет: он открывается из настроек, и держать один и тот
  // же экран в двух местах — лишний пункт в списке из десяти.
  // Поддержка — не экран приложения, а телеграм-канал, поэтому у пункта есть
  // href: он уводит наружу, и притворяться разделом ему незачем. Открывается
  // в новой вкладке: человек уходит спросить, а не уходит из планировщика,
  // и вернуться он должен туда же, где стоял.
  { id: 'support',    title: 'Служба поддержки', short: 'Поддержка',
    href: 'https://t.me/synapseapp', external: true }
];

/* Какой пункт меню подсвечивать на экране, который сам пунктом не является. */
var TAB_OF_VIEW = {
  goal: 'goals',
  list: 'lists',
  note: 'notes',
  profile: 'settings',
  'settings-view': 'settings',
  'settings-data': 'settings',
  about: 'settings'
};

var VIEWS = {
  analytics:  { title: 'Карта целей', render: vAnalytics },
  focus:      { title: 'Аналитика',   render: vFocus },
  goals:      { title: 'Цели',       render: vGoals },
  goal:       { title: 'Цель',       render: vGoal },
  finance:    { title: 'Мои финансы', render: vFinance },
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
  meditation: { title: 'Медитация',  render: vMeditation },
  trash:      { title: 'Корзина',    render: vTrash },
  subscription: { title: 'Моя подписка', render: vSubscription },
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
  pushView(view);
  render();
  window.scrollTo(0, 0);
}

/* Переход между разделами — запись в истории браузера.

   Раньше её не было вовсе, и кнопка «назад» уводила с сайта целиком: человек
   заходил в настройки, жал назад и оказывался там, откуда пришёл, вместо
   экрана задач. В приложении на андроиде это было бы ещё грубее — системная
   кнопка закрывала бы приложение с любого экрана.

   Заменяющая запись для первого экрана и добавляющая для остальных: иначе в
   истории копится по записи на каждое переключение, и чтобы выйти, назад
   пришлось бы жать десять раз. */
var historyReady = false;

function pushView(view){
  if (!window.history || !window.history.pushState) return;
  var state = { view: view };
  if (!historyReady){
    window.history.replaceState(state, '', location.href);
    historyReady = true;
    return;
  }
  // Повторный переход в тот же раздел записи не заслуживает.
  if (window.history.state && window.history.state.view === view) return;
  window.history.pushState(state, '', location.href);
}

window.addEventListener('popstate', function(event){
  // Открытое окно перехватывает «назад» первым: пока оно на экране, менять
  // раздел под ним нельзя — человек не увидит, что что-то произошло.
  if (modalOpen()){
    if (modalDepth > 0) modalDepth--;
    hideModal();
    return;
  }

  var view = event.state && event.state.view;
  if (!view || !VIEWS[view]) return;
  // Не через go(): она сама пишет в историю, и мы бы зациклились.
  S.view = view;
  S.more = false;
  save();
  render();
  window.scrollTo(0, 0);
});

/* ============ ОТРИСОВКА ============ */

/* Стены на входе нет. Планировщик, который держит записи в этом же браузере,
   не может требовать логин до первой задачи: человеку с лендинга обещано
   «без регистрации», а состояние входа всё равно лежит рядом с задачами.
   Вход есть, он живёт отдельным экраном и нужен для будущего аккаунта. */
function render(){
  applyTheme();

  var view = VIEWS[S.view] || VIEWS.tasks;
  $('top').innerHTML = vTop() + (storageBroken ? vStorageWarning() : '');
  $('tabbar').classList.remove('hidden');
  $('tabbar').innerHTML = vTabbar();
  // Полоса вкладок финансов прокручена вбок, и перерисовка сбрасывала её в
  // самое начало: нажал «Подписки» справа — и они уехали за край экрана.
  // Запоминаем сдвиг до перерисовки, возвращаем после.
  var stripLeft = (function(){
    var strip = document.querySelector('.fintabs');
    return strip ? strip.scrollLeft : null;
  })();

  // Платный раздел не подменяется тарифами молча: у него свой экран, с тем же
  // названием в шапке, — иначе нажатие в меню выглядит как промах.
  $('app').innerHTML = (PRO_ONLY[S.view] && !isPro()) ? vLocked(S.view) : view.render();
  restoreTabStrip(stripLeft);

  restoreComposer();
  restoreAddField();
  growNotes();
  fitMindMap();
  showToast();
  // Высота шапки могла поменяться вместе с размером шрифта.
  syncRail();
}

/* ============ ТЕМА ============ */

/* Палитры перенесены из AppTheme.swift — все десять, в том же порядке. Каждая
   строка v: восемнадцать чисел по три на цвет, в порядке PALETTE_KEYS.
   Внешний вид у веба и у приложения общий сознательно, поэтому цвета не
   выдуманы заново, а взяты оттуда. */
/* Цвет отметки — единственное место, где человеку можно дать чистый цвет
   без оглядки на палитру.

   Везде остальное красится темой, и правильно: разнобой в интерфейсе утомляет.
   Но галочка у сделанной задачи — это награда, её видят по сто раз в день, и
   пусть она будет такой, какую человек себе выбрал. Оттенки взяты одной
   насыщенности и светлоты, чтобы белая галочка читалась на любом из них: цвет
   выбирают на глаз, а не проверяя контраст. */
var MARK_COLORS = [
  { id: 'default', title: 'Как в теме', css: '' },
  { id: 'grass',   title: 'Трава',      css: '#4C8A45' },
  { id: 'pine',    title: 'Хвоя',       css: '#2F6E5A' },
  { id: 'sky',     title: 'Небо',       css: '#3A76B8' },
  { id: 'indigo',  title: 'Индиго',     css: '#4A55A8' },
  { id: 'plum',    title: 'Слива',      css: '#7B4796' },
  { id: 'berry',   title: 'Ягода',      css: '#A83E6E' },
  { id: 'brick',   title: 'Кирпич',     css: '#B24A38' },
  { id: 'amber',   title: 'Янтарь',     css: '#B07A1E' },
  { id: 'clay',    title: 'Глина',      css: '#8A6A4F' },
  { id: 'slate',   title: 'Графит',     css: '#55606B' },
  // Двенадцатый не для красоты: одиннадцать кнопок вставали шестью и пятью,
  // и ряд обрывался неровно. Двенадцать делятся на шесть без остатка.
  { id: 'moss',    title: 'Мох',        css: '#6B7A3D' }
];

function markColorOf(id){
  for (var i = 0; i < MARK_COLORS.length; i++) if (MARK_COLORS[i].id === id) return MARK_COLORS[i];
  return MARK_COLORS[0];
}

var PALETTE_KEYS = ['lightBackground','darkBackground','lightTextPrimary','darkTextPrimary','lightTextSecondary','darkTextSecondary','lightStroke','darkStroke','accent','accentDark','accentWarm','accentWarmDark','focusBlue','focusBlueDark','focusGreen','focusGreenDark','focusOrange','focusOrangeDark'];
var PALETTES = [
  /* lift — насколько карточка светлее (или темнее) фона, в единицах L*.

     Раньше он был один на все десять — 5,5, — и темы отличались только
     оттенком фона: одинаковая светлота, одинаковый шаг, почти одинаковый
     текст. Отсюда и ощущение, что всё в смежных цветах: оно было верным.

     Теперь у каждой темы свои три числа — светлота фона, шаг до карточки и
     насыщенность. Спокойные живут выше по светлоте и с мягким шагом,
     современные — ниже и с резким. «Уголь» стоит на краю: почти белое
     против почти чёрного, шаг 9. */
  { id: 'paper', title: 'Бумага', lift: 4.5, v: [247,245,239,37,31,17,47,39,20,242,240,237,121,102,57,189,181,165,216,205,177,71,60,35,93,78,46,203,186,148,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'graphite', title: 'Графит', lift: 7.5, v: [240,241,241,24,26,30,29,34,40,243,243,244,95,104,118,180,182,184,198,201,207,52,57,63,63,82,107,175,189,208,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'forest', title: 'Лес', lift: 5.0, v: [239,243,241,20,32,26,24,41,33,236,239,237,72,112,92,172,185,178,185,208,196,42,63,53,38,90,64,132,202,167,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'brass', title: 'Латунь', lift: 4.0, v: [244,238,229,40,31,14,53,40,18,238,235,229,127,100,54,193,180,160,216,198,165,76,60,33,101,75,32,215,183,129,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'burgundy', title: 'Бордо', lift: 5.5, v: [245,240,240,45,26,27,57,30,32,241,237,237,152,85,91,194,179,180,220,195,198,86,51,53,140,49,57,227,174,179,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'tobacco', title: 'Табак', lift: 4.0, v: [241,235,231,42,31,22,57,41,27,235,232,229,131,97,68,191,181,172,213,194,177,80,60,43,108,73,42,215,181,152,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'indigo', title: 'Индиго', lift: 7.0, v: [242,243,248,21,27,44,26,34,60,239,241,244,79,101,168,176,182,197,196,204,226,44,56,90,42,73,166,171,187,234,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'plum', title: 'Слива', lift: 6.0, v: [246,241,246,40,22,42,54,28,56,243,240,243,144,80,149,193,177,194,219,195,222,80,46,83,128,43,135,223,169,228,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'sea', title: 'Море', lift: 6.5, v: [243,247,248,17,33,35,20,41,44,238,241,242,59,112,120,167,185,188,182,213,217,36,64,69,28,88,97,113,200,214,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] },
  { id: 'charcoal', title: 'Уголь', lift: 9.0, v: [248,247,247,24,21,19,31,27,23,247,247,246,113,102,92,183,181,180,211,208,204,54,50,46,91,77,64,198,185,173,138,110,53,198,164,105,47,90,114,130,176,201,63,107,82,127,191,155,132,97,31,211,168,92] }
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
  // Стрелка возврата — для корзины: «вернуть» словом занимало полстроки,
  // а строк там бывает сотня.
  back: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M6.4 3.2 2.8 6.8l3.6 3.6"/><path d="M2.8 6.8h6.4a3.6 3.6 0 0 1 0 7.2H7.6"/></svg>',

  /* Значки вместо знаков шрифта.

     Здесь стояли ✓, ⏻, ↺, ‹ и › — символы Юникода. На части андроидов их
     попросту нет в шрифте, и человек видел пустой квадрат вместо кнопки
     «закрыть долг». Рисунок свой не зависит ни от шрифта, ни от системы. */
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4 6.4 11.6 12.8 4.8"/></svg>',
  power: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M8 2.4v5.2"/><path d="M11.7 4.6a5 5 0 1 1-7.4 0"/></svg>',
  undo: '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M3.2 6.4h4.4V2"/><path d="M3.6 6.2a5.4 5.4 0 1 1-.7 4.6"/></svg>',
  left: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.2 5.2 8l4.8 4.8"/></svg>',
  right: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.2 10.8 8 6 12.8"/></svg>',
  /* Кнопка ассистента подписана буквами, а не звёздочками.

     Звёздочки стали общим местом и ничего не сообщают: их ставят и на
     «улучшить текст», и на «показать рекомендации», и на анимацию загрузки.
     Две буквы говорят, что за кнопкой, без догадок. */
  ai: '<span class="ai-mark" aria-hidden="true">AI</span>',
  full: '<svg viewBox="0 0 16 16" aria-hidden="true" style="width:14px;height:14px;fill:none;' +
    'stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;display:inline-block;vertical-align:-2px">' +
    '<path d="M6 2H2v4M10 2h4v4M10 14h4v-4M6 14H2v-4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/>' +
    '<path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg>',
  pro: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="9" y="3" width="6" height="11" rx="3"/>' +
    '<path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg>',
  // Повтор — рисунком, а не 🔁: эмодзи в разных системах то плоское, то
  // цветное, и в мелкой мете оно единственное кричало цветом.
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true" class="nav-ic">' +
    '<path d="M4 9.5A5.5 5.5 0 0 1 9.5 4H16"/><path d="M13.5 1.5L16.5 4l-3 2.5"/>' +
    '<path d="M20 14.5A5.5 5.5 0 0 1 14.5 20H8"/><path d="M10.5 22.5L7.5 20l3-2.5"/></svg>'
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

/* Тема — светлая или тёмная, третьего нет.

   «Как в системе» звучит разумно, но на деле означает третье состояние, в
   котором переключатель не отвечает на вопрос «какая сейчас тема»: нажал — и
   не знаешь, что получишь. Системная настройка используется ровно один раз, в
   самом начале, чтобы первое открытие не било по глазам. */
function systemPrefersDark(){
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function isDarkNow(){
  return S.theme === 'dark';
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
  // «ближе» к зрителю, чем фон под ней. Величину шага задаёт сама тема:
  // у «Латуни» он мягкий, у «Угля» вдвое резче.
  var dir = dark ? 1 : -1;
  var lift = pal.lift || 5.5;

  return {
    dark: dark,
    background: background,
    // Небольшая примесь акцента остаётся: без неё панели у всех десяти
    // палитр выглядели одинаково серыми.
    panel: blend(shiftL(background, dir * lift), accent, 0.03),
    panelStrong: blend(shiftL(background, dir * lift * 2), accent, 0.04),
    stroke: blend(shiftL(background, dir * (lift * 2 + 9)), accent, dark ? 0.07 : 0.09),
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
  // Цвет отметки живёт своей переменной: --ok используется ещё в полутора
  // десятках мест, и красить ими всё подряд человек не просил.
  var mark = markColorOf(S.markColor);
  if (mark.css) document.documentElement.style.setProperty('--mark', mark.css);
  else document.documentElement.style.removeProperty('--mark');

  var f = fontOf(S.font);
  root.setProperty('--display', f.css);
  root.setProperty('--body', f.css);
  root.setProperty('--scale', String(fontSizeOf(S.fontSize).scale));

  document.documentElement.setAttribute('data-dark', c.dark ? '1' : '0');
  document.documentElement.setAttribute('data-box', S.box || 'square');
}

function vTop(){
  return '<div class="top-in">' +
    // Логотип с названием — кнопка «домой»: из любого раздела возвращает к
    // задачам. Так устроен любой сайт, и человек пробует это первым, ещё до
    // того, как найдёт «Задачи» в меню.
    '<button class="brand" data-act="go" data-view="tasks" title="К задачам" aria-label="К задачам">' +
      '<img class="mark" src="icons/icon-192.png" alt="" width="28" height="28">' +
      '<span class="nm">Synapse AI</span></button>' +
    '<div class="top-acts">' +
      '<button class="iconbtn" data-act="theme" title="' + (isDarkNow() ? 'Светлая тема' : 'Тёмная тема') +
        '" aria-label="' + (isDarkNow() ? 'Включить светлую тему' : 'Включить тёмную тему') + '">' +
        (isDarkNow() ? NAV_ICONS.sun : NAV_ICONS.moon) + '</button>' +
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
  var source = (S.profile && S.profile.name) || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

function activeTab(){
  return TAB_OF_VIEW[S.view] || S.view;
}

function tabButton(t, cls){
  var on = activeTab() === t.id;
  var inside =
    '<span class="ic">' + (NAV_ICONS[t.id] || '') + '</span>' +
    '<span class="tx">' + esc(cls === 'tab' && t.short ? t.short : t.title) + '</span>';

  // Пункт со ссылкой — настоящая ссылка, а не кнопка: её можно открыть в
  // новой вкладке средним щелчком, и она видна читалке с экрана как переход
  // наружу, а не как ещё один раздел приложения.
  if (t.href){
    return '<a class="' + cls + '" href="' + t.href + '"' +
      (t.external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + inside + '</a>';
  }

  return '<button class="' + cls + '" data-act="go" data-view="' + t.id + '"' +
    (on ? ' aria-current="page"' : '') + '>' + inside + '</button>';
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
        '<span class="ic">' + (S.more ? NAV_ICONS.close : NAV_ICONS.more) + '</span>' +
        '<span class="tx">Ещё</span></button>' +
    '</div>' +
    '<div class="tabs-rest' + (S.more ? ' open' : '') + '">' +
      rest.map(function(t){
        // Черта рисуется перед пунктом, который начинает новую группу, а не
        // на стыке «первых четырёх» и остальных: группы в меню про смысл, а
        // не про то, что влезло в нижнюю панель телефона.
        return (t.sep ? '<div class="tabs-sep"></div>' : '') + tabButton(t, 'tab wide');
      }).join('') +
      // Выход — последним и отделённым чертой: это не раздел, а уход из
      // приложения на сайт. Записи при этом остаются в браузере, о чём
      // спрашивают в первую очередь, поэтому это сказано в подсказке кнопки.
      '<button class="tab wide leave" data-act="leave" title="Записи останутся в этом браузере">' +
        '<span class="ic">' + NAV_ICONS.leave + '</span><span class="tx">Выйти</span></button>' +
    '</div>';
}

/* Надстрочник над заголовком — только когда он что-то добавляет. У списка со
   своим названием строка «Список» сверху не сообщает ничего: и так видно, что
   это список, — вернуться помогает кнопка «Назад», а не подпись. Пустой первый
   аргумент означает «без надстрочника». */
/* В приложении «Назад» рисовать не нужно.

   На андроиде есть системная кнопка и жест от края, и они теперь работают:
   переходы между разделами пишутся в историю. Своя кнопка сверху дублирует их
   и занимает строку на каждом втором экране. В браузере она остаётся — там
   кнопка браузера далеко, а на десктопе жеста нет вовсе. */
function inApp(){
  return !!(window.AndroidVoice);
}

/* Свайп решается наличием пальца, а не тем, приложение это или браузер.

   Сперва я развёл по «приложение против веба» и ошибся: с телефона сайт
   открывают тем же пальцем, и свайп там уместен ровно так же. А вот с
   компьютера его не сделать вовсе — мышью карточку не сдвинешь, и убрать
   оттуда кнопки значило бы отобрать правку и удаление совсем.

   Поэтому признак — сенсорный ввод: телефон и планшет получают свайп хоть в
   приложении, хоть в браузере; десктоп остаётся с кнопками, как был. */
function touchUI(){
  return !!(window.matchMedia &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches);
}

function head(sub, title, backView){
  return (backView && !inApp() ? '<button class="chip" data-act="go" data-view="' + backView + '" style="margin-bottom:12px">← Назад</button>' : '') +
    (sub ? '<p class="hi">' + esc(sub) + '</p>' : '') +
    (title ? '<h1 class="page">' + esc(title) + '</h1>' : '');
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

/* ============ КОРЗИНА ============ */

/* Удаление, которое можно отменить.

   До этого «✕» на карточке стирал задачу навсегда — единственная необратимая
   операция во всём сервисе, и та без подтверждения. Один промах пальцем по
   мелкой кнопке, и работа исчезла. В приложении для этого есть корзина
   (`trashedAt` у задачи), в вебе не было.

   Устройство простое и намеренно одинаковое для всех четырёх видов записей:
   удалённое не выбрасывается, а перекладывается в S.trash вместе с тем, чем
   оно было, — целиком, объектом. Восстановление кладёт объект назад, туда же,
   откуда взяли. Так не нужно ни отдельных полей вроде `deletedAt` в каждой
   модели, ни фильтров «покажи только не удалённые» на каждом экране: удалённого
   в рабочих списках просто нет.

   Срок хранения — TRASH_DAYS. Дальше запись уходит сама, иначе корзина
   становится второй базой, которую никто не чистит, и её объём начинает влиять
   на квоту localStorage. Чистка идёт при первом открытии в новый день, вместе с
   переносом задач: это единственное место, где мы и так трогаем даты. */
var TRASH_DAYS = 30;

var TRASH_KINDS = {
  task: { title: 'Задача', many: 'Задачи' },
  goal: { title: 'Цель', many: 'Цели' },
  list: { title: 'Список', many: 'Списки' },
  note: { title: 'Заметка', many: 'Заметки' }
};

/// Положить в корзину. `extra` — то, что нужно знать при восстановлении и чего
/// нет в самом объекте (например, задачи удалённой цели).
function trashPut(kind, data, extra){
  S.trash.unshift({
    id: uid(),
    kind: kind,
    at: Date.now(),
    title: String(data && data.title || 'Без названия'),
    data: data,
    extra: extra || null
  });
}

function trashFind(id){
  for (var i = 0; i < S.trash.length; i++) if (S.trash[i].id === id) return S.trash[i];
  return null;
}

/// Убрать из корзины просроченное хранение. Возвращает, сколько убрано.
function trashSweep(){
  var edge = Date.now() - TRASH_DAYS * 86400000;
  var before = S.trash.length;
  S.trash = S.trash.filter(function(item){ return item.at >= edge; });
  return before - S.trash.length;
}

/// Сколько дней записи осталось лежать.
function trashDaysLeft(item){
  var left = Math.ceil((item.at + TRASH_DAYS * 86400000 - Date.now()) / 86400000);
  return Math.max(0, left);
}

/* Восстановление. Задача возвращается в свой блок — но если её день уже прошёл,
   то в «Сегодня»: возвращать в прошлое бессмысленно, там её никто не увидит.

   Цель возвращается вместе со связями: задачи, которые были к ней привязаны,
   привязываются обратно. Их идентификаторы сохранены в extra, потому что сами
   задачи никуда не удалялись — у них лишь снялась связь. */
function trashRestore(id){
  var item = trashFind(id);
  if (!item) return '';

  if (item.kind === 'task'){
    var task = item.data;
    if (task.date && task.date < isoOf(todayDate())){
      task.date = isoOf(todayDate());
      task.bucket = 'today';
      task.archived = false;
    }
    S.tasks.push(task);
  } else if (item.kind === 'goal'){
    S.goals.push(item.data);
    var links = (item.extra && item.extra.taskIDs) || [];
    S.tasks.forEach(function(t){
      for (var i = 0; i < links.length; i++){
        if (links[i].id === t.id){
          t.goalId = item.data.id;
          t.stageId = links[i].stageId || null;
        }
      }
    });
  } else if (item.kind === 'list'){
    S.lists.push(item.data);
  } else if (item.kind === 'note'){
    S.notes.push(item.data);
  }

  S.trash = S.trash.filter(function(entry){ return entry.id !== id; });
  return item.title;
}

/* ============ МОИ ФИНАНСЫ ============

   Не бухгалтерия и не банковское приложение: у нас нет и не будет доступа к
   счетам, а ручной ввод каждой копейки бросают на второй неделе. Поэтому
   раздел отвечает на четыре вопроса, которые человек задаёт себе сам, и
   ничего сверх:

     сколько у меня есть · сколько я должен и сколько должны мне ·
     на что уходит · успею ли накопить

   Устроено так же, как остальной Synapse: строка ввода разбирает написанное
   («кофе 350», «зарплата 90000»), деньги не уходят на сервер, а копилка —
   это та же цель, только измеряется в рублях.

   Раздел платный целиком: он держится на подписке, как ассистент. */

var FIN_KINDS = {
  spend:  { title: 'Трата',  sign: -1 },
  income: { title: 'Доход',  sign: 1 }
};

/* Категории с цветом. Не справочник на сто строк: восемь корзин покрывают
   почти всё, а девятая — «прочее» — принимает остальное без вопросов.
   Угадываются по словам в строке, чтобы не выбирать из списка каждый раз. */
var FIN_CATS = [
  { id: 'food',      title: 'Еда',          hue: 18,  words: ['еда','продукт','магазин','кофе','обед','ужин','завтрак','кафе','ресторан','пятёроч','пятероч','перекрёст','перекрест','доставка','столов'] },
  { id: 'home',      title: 'Дом',          hue: 152, words: ['аренда','квартир','ипотек','коммунал','жкх','свет','газ','вода','интернет','ремонт','мебель'] },
  { id: 'transport', title: 'Транспорт',    hue: 205, words: ['такси','метро','автобус','бензин','заправк','парков','каршер','билет','поезд','самолёт','самолет'] },
  { id: 'health',    title: 'Здоровье',     hue: 340, words: ['аптек','врач','лекарств','стоматолог','анализ','клиник','зал','фитнес','спорт'] },
  { id: 'fun',       title: 'Развлечения',  hue: 275, words: ['кино','театр','концерт','игр','бар','подар','отдых','поездк','отпуск'] },
  { id: 'subs',      title: 'Подписки',     hue: 45,  words: ['подписк','яндекс','плюс','музык','облак','хостинг','домен','тариф','связь','мобильн'] },
  { id: 'clothes',   title: 'Одежда',       hue: 300, words: ['одежд','обув','кроссов','куртк','джинс','футболк','маркетплейс','озон','вайлдберриз','wb'] },
  { id: 'learn',     title: 'Учёба',        hue: 95,  words: ['курс','книг','учеб','обучен','школ','репетитор','конференц','садик','детсад','кружок','секц'] },
  { id: 'loans',     title: 'Кредиты',      hue: 12,  words: ['кредит','ипотек','рассрочк','заём','заем','долг банку','платёж банку','алимент','налог','штраф','страховк','осаго','каско'] },
  { id: 'salary',    title: 'Доход',        hue: 152, words: ['зарплат','аванс','премия','гонорар','фриланс','возврат','кешбэк','кэшбэк','процент'] },
  { id: 'other',     title: 'Прочее',       hue: 0,   words: [] }
];

/// Встроенные плюс заведённые человеком. «Прочее» всегда последним: оно
/// принимает всё, что не узналось, и в списке выбора должно быть в конце.
function finAllCats(){
  var own = (S.finance && S.finance.cats) || [];
  var base = FIN_CATS.slice(0, FIN_CATS.length - 1);
  return base.concat(own, [FIN_CATS[FIN_CATS.length - 1]]);
}

function finCat(id){
  var all = finAllCats();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return FIN_CATS[FIN_CATS.length - 1];
}

/* Цвет категории — оттенок одной насыщенности, а не десять произвольных
   красок: так строки списка отличаются, но не превращаются в светофор.
   «Прочее» без оттенка вовсе — серое. */
function finTint(cat, alpha){
  var c = finCat(cat);
  if (c.id === 'other') return 'var(--soft-2)';
  return 'hsl(' + c.hue + ' 42% 52% / ' + alpha + ')';
}

/* ---- деньги ----

   Хранятся в копейках целыми числами. 0.1 + 0.2 в двоичной дроби даёт
   0.30000000000000004, и на третьей сотне операций итог месяца разъезжается
   с суммой строк на рубль — ровно то место, где человек перестаёт верить
   всему разделу. */
function finMoney(kopecks, opts){
  opts = opts || {};
  var negative = kopecks < 0;
  var whole = Math.round(Math.abs(kopecks) / 100);
  var text = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (opts.kop && Math.abs(kopecks) % 100) text += ',' + ('0' + Math.abs(kopecks) % 100).slice(-2);
  return (negative ? '−' : (opts.plus ? '+' : '')) + text + ' ₽';
}

/* Разбор строки: «кофе 350», «350 кофе», «зарплата 90 000», «такси 1.5к».
   Сумма — последнее или первое число; всё остальное становится названием, а
   по названию угадывается категория. Человек пишет как говорит, а не
   заполняет три поля. */
function finParse(raw, kind){
  var text = String(raw || '').trim();
  if (!text) return null;

  // Тысячи словом: «1.5к», «20к», «5 тыс».
  // Граница слова тут не \b: в JS она считается по латинице, и после
  // кириллической «к» в конце строки границы попросту нет — «1.5к»
  // не совпадало и превращалось в полтора рубля.
  var multiplied = text.replace(/(\d+(?:[.,]\d+)?)\s*(к|k|тыс\.?|тысяч[аи]?)(?![а-яёa-z0-9])/gi, function(_, num){
    return String(Math.round(parseFloat(num.replace(',', '.')) * 1000));
  });

  var joined = multiplied.replace(/(\d)[   ](?=\d{3}\b)/g, '$1');
  var found = joined.match(/-?\d+(?:[.,]\d{1,2})?/);
  if (!found) return null;

  var amount = Math.round(Math.abs(parseFloat(found[0].replace(',', '.'))) * 100);
  if (!amount) return null;

  var title = joined.replace(found[0], ' ').replace(/\s+/g, ' ').trim();
  title = title.replace(/^[-–—:,.]+|[-–—:,.]+$/g, '').trim();

  var low = title.toLowerCase();
  var cat = 'other';
  var cats = (typeof S !== 'undefined' && S.finance) ? finAllCats() : FIN_CATS;
  for (var i = 0; i < cats.length && cat === 'other'; i++){
    var c = cats[i];
    if (!c.words) continue;
    for (var j = 0; j < c.words.length; j++){
      if (low.indexOf(c.words[j]) !== -1){ cat = c.id; break; }
    }
  }
  // Доход без узнанной категории — всё равно доход, а не «прочее».
  if (kind === 'income' && cat === 'other') cat = 'salary';

  return { title: title || (kind === 'income' ? 'Доход' : 'Трата'), amount: amount, cat: cat };
}

/* ---- счёт ---- */

function finOpSign(op){ return FIN_KINDS[op.kind] ? FIN_KINDS[op.kind].sign : -1; }

/* Сколько денег есть.

   Раздел счетов оказался перегрузом ради одного числа. Осталось само число —
   «сколько у вас сейчас», вписанное однажды; дальше к нему прибавляются
   доходы и вычитаются траты.

   Без него «Свободно» показывало бы не деньги, а разницу доходов и трат с
   первой записи, и у любого, кто записал две траты до зарплаты, там стоял бы
   минус, которому нечем объясниться. */
function finBalance(){
  var kop = S.finance.opening || 0;
  for (var i = 0; i < S.finance.ops.length; i++){
    kop += S.finance.ops[i].amount * finOpSign(S.finance.ops[i]);
  }
  return kop;
}

function finDebtSums(){
  var owe = 0, owed = 0;
  for (var i = 0; i < S.finance.debts.length; i++){
    var d = S.finance.debts[i];
    if (d.closed) continue;
    var left = Math.max(0, d.amount - (d.paid || 0));
    if (d.mine) owe += left; else owed += left;
  }
  return { owe: owe, owed: owed, net: owed - owe };
}

function finSaved(){
  var kop = 0;
  for (var i = 0; i < S.finance.jars.length; i++) kop += S.finance.jars[i].saved || 0;
  return kop;
}

function finMonthKey(iso){ return String(iso || isoOf(todayDate())).slice(0, 7); }

/// Месяц, который смотрят. Пусто значит «текущий» — так он сам съезжает
/// первого числа, вместо того чтобы застрять на августе до перезагрузки.
function finShownMonth(){ return S.finMonth || finMonthKey(); }

/// Сдвиг на месяц назад или вперёд, но не в будущее дальше текущего.
function finMonthShift(key, step){
  var parts = String(key).split('-');
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1 + step, 1);
  var next = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2);
  return next > finMonthKey() ? finMonthKey() : next;
}

function finMonthOps(key){
  key = key || finShownMonth();
  return S.finance.ops.filter(function(op){ return finMonthKey(op.date) === key; });
}

function finMonthTotals(key){
  var ops = finMonthOps(key || finShownMonth()), spent = 0, earned = 0;
  for (var i = 0; i < ops.length; i++){
    if (ops[i].kind === 'income') earned += ops[i].amount; else spent += ops[i].amount;
  }
  return { spent: spent, earned: earned, ops: ops };
}

/* По категориям за месяц, от большего к меньшему: вопрос «куда уходит»
   отвечается одной колонкой, а не таблицей из тридцати строк. */
function finByCat(key){
  var totals = {}, ops = finMonthOps(key || finShownMonth());
  for (var i = 0; i < ops.length; i++){
    if (ops[i].kind === 'income') continue;
    totals[ops[i].cat] = (totals[ops[i].cat] || 0) + ops[i].amount;
  }
  var rows = Object.keys(totals).map(function(id){
    return { cat: id, title: finCat(id).title, sum: totals[id] };
  });
  rows.sort(function(a, b){ return b.sum - a.sum; });
  return rows;
}

/* ---- конверты ----

   Единственная часть раздела, которая меняет поведение, а не описывает
   прошлое. Отчёт объясняет, куда ушли деньги; конверт говорит, сколько
   осталось до конца месяца, — и говорит это сейчас, когда решение ещё
   принимается. Поэтому полоса «осталось» важнее всех цифр в сводке. */
function finBudget(cat){ return (S.finance.budgets || {})[cat] || 0; }

function finBudgetSpent(cat, key){
  var ops = finMonthOps(key || finShownMonth()), kop = 0;
  for (var i = 0; i < ops.length; i++){
    if (ops[i].kind === 'income' || ops[i].cat !== cat) continue;
    kop += ops[i].amount;
  }
  return kop;
}

function finBudgetRows(key){
  var box = S.finance.budgets || {};
  return Object.keys(box).map(function(cat){
    var plan = box[cat], spent = finBudgetSpent(cat, key);
    return { cat: cat, title: finCat(cat).title, plan: plan, spent: spent,
             left: plan - spent, share: plan ? Math.min(100, Math.round(spent * 100 / plan)) : 0 };
  }).sort(function(a, b){ return b.plan - a.plan; });
}

/* ---- регулярные операции ----

   Аренда, зарплата, платёж по кредиту. Половина месячного оборота — это
   десяток одних и тех же строк, и вносить их руками каждый месяц никто не
   станет: раздел бросят на второй месяц, а не на второй неделе.

   Догоняются при открытии приложения, а не по таймеру: вкладка может быть
   закрыта неделями, и пропущенные списания всё равно должны появиться —
   каждое своим днём, а не все одним. */
function finRunRecurring(){
  var box = S.finance.recurring || [];
  var today = isoOf(todayDate());
  var made = 0;

  for (var i = 0; i < box.length; i++){
    var rule = box[i];
    if (rule.off) continue;
    var every = FIN_EVERY[rule.every] || FIN_EVERY.month;
    var cursor = rule.lastRun || rule.since;
    if (!cursor) continue;

    // Первый раз — сама дата начала, дальше шагаем от неё.
    var when = rule.lastRun ? finStepDate(cursor, every) : cursor;
    var guard = 0;
    while (when <= today && guard++ < 400){
      S.finance.ops.push({
        id: uid(), kind: rule.kind, title: rule.title, amount: rule.amount,
        cat: rule.cat, date: when, at: Date.now() + guard,
        accountId: rule.accountId || '', fromRule: rule.id
      });
      rule.lastRun = when;
      made++;
      when = finStepDate(when, every);
    }
  }
  return made;
}

function finStepDate(iso, every){
  var date = new Date(iso + 'T00:00:00');
  if (every === FIN_EVERY.week) date.setDate(date.getDate() + 7);
  else if (every === FIN_EVERY.year) date.setFullYear(date.getFullYear() + 1);
  else date.setMonth(date.getMonth() + 1);
  return isoOf(date);
}

/* Сколько откладывать в месяц, чтобы успеть к сроку копилки. Считается по
   целым месяцам до даты: «ещё 8 400 в месяц» — это ответ, а «осталось
   67 200» — только половина ответа. */
function finJarPace(jar){
  if (!jar.due) return null;
  var left = Math.max(0, jar.target - (jar.saved || 0));
  if (!left) return { done: true, perMonth: 0, months: 0 };
  var now = new Date(), due = new Date(jar.due + 'T00:00:00');
  var months = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());
  if (months < 1) months = 1;
  return { done: false, perMonth: Math.ceil(left / months / 100) * 100, months: months };
}

/* Подписки: следующее списание и во что обходится год. Люди платят за
   двенадцать сервисов и помнят про пять — годовая сумма и есть тот довод,
   ради которого раздел заведён отдельно от обычных трат. */
/* Готовые карточки популярных сервисов.

   Суммы — ориентир на середину 2026 года, а не справочник: тарифы меняются
   чаще, чем выходит наша сборка, поэтому цена подставляется в поле и её
   правят. Смысл шаблона не в точной цене, а в том, чтобы не набирать
   «Яндекс Плюс» руками и не вспоминать, помесячно там или раз в год. */
/* Заголовки групп внутри списка шаблонов: тридцать кнопок подряд не
   просматриваются, а с подписями глаз находит нужную строку сразу. */
var FIN_TPL_GROUPS = { home: 'Жильё и ЖКХ', loans: 'Кредиты и налоги',
                       kids: 'Дети и учёба', subs: 'Подписки и сервисы' };

var FIN_SUB_TEMPLATES = [
  /* Обязательное идёт первым: это платят все и каждый месяц.

     ЖКХ — одной строкой «Квартплата», а не разложенное на свет, воду и газ:
     в платёжке они всё равно приходят вместе, а шесть строк с суммой «своя
     каждый месяц» — это шесть напоминаний вместо одного. Кому нужно врозь,
     заведёт своё. */
  { g: 'home', duty: true, title: 'Квартплата',    amount: 0, every: 'month', cat: 'home', vary: true },
  { g: 'home', duty: true, title: 'Аренда жилья',  amount: 0, every: 'month', cat: 'home' },
  { g: 'home', duty: true, title: 'Интернет дома', amount: 70000, every: 'month', cat: 'home' },
  { g: 'home', duty: true, title: 'Охрана',        amount: 0, every: 'month', cat: 'home' },
  { g: 'home', duty: true, title: 'Парковка',      amount: 0, every: 'month', cat: 'transport' },

  { g: 'loans', duty: true, title: 'Ипотека',      amount: 0, every: 'month', cat: 'loans' },
  { g: 'loans', duty: true, title: 'Кредит',       amount: 0, every: 'month', cat: 'loans' },
  { g: 'loans', duty: true, title: 'Автокредит',   amount: 0, every: 'month', cat: 'loans' },
  { g: 'loans', duty: true, title: 'Рассрочка',    amount: 0, every: 'month', cat: 'loans' },
  { g: 'loans', duty: true, title: 'Кредитная карта', amount: 0, every: 'month', cat: 'loans', vary: true },
  { g: 'loans', duty: true, title: 'Алименты',     amount: 0, every: 'month', cat: 'loans' },
  { g: 'loans', duty: true, title: 'ОСАГО',        amount: 0, every: 'year',  cat: 'loans' },
  { g: 'loans', duty: true, title: 'КАСКО',        amount: 0, every: 'year',  cat: 'loans' },
  { g: 'loans', duty: true, title: 'Налог на имущество', amount: 0, every: 'year', cat: 'loans' },
  { g: 'loans', duty: true, title: 'Транспортный налог', amount: 0, every: 'year', cat: 'loans' },

  { g: 'kids', duty: true, title: 'Детский сад',   amount: 0, every: 'month', cat: 'learn' },
  { g: 'kids', duty: true, title: 'Школа',         amount: 0, every: 'month', cat: 'learn' },
  { g: 'kids', duty: true, title: 'Продлёнка',     amount: 0, every: 'month', cat: 'learn' },
  { g: 'kids', duty: true, title: 'Кружок',        amount: 0, every: 'month', cat: 'learn' },
  { g: 'kids', duty: true, title: 'Репетитор',     amount: 0, every: 'month', cat: 'learn' },
  { g: 'kids', duty: true, title: 'Няня',          amount: 0, every: 'month', cat: 'learn' },

  { g: 'subs', dom: 'mts.ru',            title: 'Мобильная связь', amount: 60000,  every: 'month', cat: 'subs' },
  { g: 'subs', dom: 'plus.yandex.ru',    title: 'Яндекс Плюс',     amount: 39900,  every: 'month' },
  { g: 'subs', dom: 'kinopoisk.ru',      title: 'Кинопоиск',       amount: 39900,  every: 'month' },
  { g: 'subs', dom: 'music.yandex.ru',   title: 'Яндекс Музыка',   amount: 29900,  every: 'month' },
  { g: 'subs', dom: 'vk.com',            title: 'VK Музыка',       amount: 26900,  every: 'month' },
  { g: 'subs', dom: 'zvuk.com',          title: 'Звук',            amount: 26900,  every: 'month' },
  { g: 'subs', dom: 'telegram.org',      title: 'Telegram Premium',amount: 34900,  every: 'month' },
  { g: 'subs', dom: 'sber.ru',           title: 'СберПрайм',       amount: 39900,  every: 'month' },
  { g: 'subs', dom: 'tbank.ru',          title: 'Т-Банк Pro',      amount: 19900,  every: 'month' },
  { g: 'subs', dom: 'alfabank.ru',       title: 'Альфа-Смарт',     amount: 19900,  every: 'month' },
  { g: 'subs', dom: 'ozon.ru',           title: 'Ozon Premium',    amount: 39900,  every: 'month' },
  { g: 'subs', dom: 'wildberries.ru',    title: 'WB Клуб',         amount: 19900,  every: 'month' },
  { g: 'subs', dom: 'mts.ru',            title: 'МТС Premium',     amount: 34900,  every: 'month' },
  { g: 'subs', dom: 'megafon.ru',        title: 'Мегафон',         amount: 60000,  every: 'month', cat: 'subs' },
  { g: 'subs', dom: 'beeline.ru',        title: 'Билайн',          amount: 60000,  every: 'month', cat: 'subs' },
  { g: 'subs', dom: 'ivi.ru',            title: 'Иви',             amount: 39900,  every: 'month' },
  { g: 'subs', dom: 'okko.tv',           title: 'Okko',            amount: 39900,  every: 'month' },
  { g: 'subs', dom: 'wink.ru',           title: 'Wink',            amount: 29900,  every: 'month' },
  { g: 'subs', dom: 'kion.ru',           title: 'KION',            amount: 29900,  every: 'month' },
  { g: 'subs', dom: 'premier.one',       title: 'Premier',         amount: 29900,  every: 'month' },
  { g: 'subs', dom: 'start.ru',          title: 'Start',           amount: 29900,  every: 'month' },
  { g: 'subs', dom: 'more.tv',           title: 'more.tv',         amount: 29900,  every: 'month' },
  { g: 'subs', dom: 'amediateka.ru',     title: 'Амедиатека',      amount: 59900,  every: 'month' },
  { g: 'subs', dom: 'rutube.ru',         title: 'Rutube',          amount: 0,      every: 'month' },
  { g: 'subs', dom: 'litres.ru',         title: 'Литрес',          amount: 49900,  every: 'month' },
  { g: 'subs', dom: 'bookmate.ru',       title: 'Букмейт',         amount: 29900,  every: 'month' },
  { g: 'subs', dom: 'skyeng.ru',         title: 'Skyeng',          amount: 300000, every: 'month', cat: 'learn' },
  { g: 'subs', dom: 'duolingo.com',      title: 'Duolingo',        amount: 79000,  every: 'month', cat: 'learn' },
  { g: 'subs', dom: 'yandex.ru',         title: 'Яндекс 360',      amount: 19900,  every: 'month' },
  { g: 'subs', dom: 'icloud.com',        title: 'iCloud+',         amount: 5900,   every: 'month' },
  { g: 'subs', dom: 'one.google.com',    title: 'Google One',      amount: 19900,  every: 'month' },
  { g: 'subs', dom: 'dropbox.com',       title: 'Dropbox',         amount: 90000,  every: 'month' },
  { g: 'subs', dom: 'openai.com',        title: 'ChatGPT Plus',    amount: 200000, every: 'month' },
  { g: 'subs', dom: 'notion.so',         title: 'Notion',          amount: 80000,  every: 'month' },
  { g: 'subs', dom: 'figma.com',         title: 'Figma',           amount: 120000, every: 'month' },
  { g: 'subs', dom: 'github.com',        title: 'GitHub',          amount: 40000,  every: 'month' },
  { g: 'subs', dom: 'boosty.to',         title: 'Boosty',          amount: 50000,  every: 'month' },
  { g: 'subs', dom: 'twitch.tv',         title: 'Twitch',          amount: 30000,  every: 'month' },
  { g: 'subs', dom: 'steampowered.com',  title: 'Steam',           amount: 0,      every: 'month', cat: 'fun' },
  { g: 'subs', dom: 'playstation.com',   title: 'PS Plus',         amount: 69900,  every: 'month', cat: 'fun' },
  { g: 'subs', dom: 'xbox.com',          title: 'Game Pass',       amount: 69900,  every: 'month', cat: 'fun' },
  { g: 'subs', dom: 'kaspersky.ru',      title: 'Kaspersky',       amount: 180000, every: 'year' },
  { g: 'subs', dom: 'reg.ru',            title: 'Домен',           amount: 90000,  every: 'year' },
  { g: 'subs', dom: 'timeweb.com',       title: 'Хостинг',         amount: 600000, every: 'year' }
];

var FIN_EVERY = {
  month: { title: 'в месяц', perYear: 12 },
  year:  { title: 'в год',   perYear: 1 },
  week:  { title: 'в неделю', perYear: 52 }
};

/* Сколько платёж стоит «в среднем за раз».

   У подписки это её сумма. У ЖКХ по счётчику суммы нет вовсе, пока по нему
   не заплатили хотя бы раз, — берём среднее по тому, что действительно
   заплатили. Придумывать за человека средний счёт за свет нельзя: он зависит
   от города, дома и времени года, и придуманное число будет врать весь год. */
function finSubVaries(sub){ return !sub.amount; }

function finSubTypical(sub){
  var paid = sub.paid || {};
  var keys = Object.keys(paid);
  if (!keys.length) return sub.amount || 0;
  var sum = 0;
  for (var i = 0; i < keys.length; i++) sum += paid[keys[i]];
  return Math.round(sum / keys.length);
}

/// Есть ли у платежа надёжная цифра. У переменного без единой оплаты — нет.
function finSubKnown(sub){ return !!finSubTypical(sub); }

/// Обязательный ли платёж. Подписку отменяют, квартплату — нет: это и есть
/// разница, ради которой они лежат в разных таблицах.
function finIsDuty(sub){
  if (typeof sub.duty === 'boolean') return sub.duty;
  return ['home', 'loans', 'learn'].indexOf(sub.cat) !== -1;
}

/* Сколько платёж стоит в месяц и в год — приведённые суммы.

   Годовая страховка в таблице «в месяц» показывается двенадцатой частью, а
   недельная подписка — умноженной на 4,33. Иначе колонки не складываются:
   рядом стоят 399 в месяц и 6 000 в год, и итог под ними ничего не значит. */
function finPerYear(sub){
  return finSubTypical(sub) * (FIN_EVERY[sub.every] || FIN_EVERY.month).perYear;
}
function finPerMonth(sub){ return Math.round(finPerYear(sub) / 12); }

function finSubsOf(duty){
  return S.finance.subs.filter(function(sub){ return finIsDuty(sub) === duty; });
}

function finSubsYear(){
  var kop = 0;
  for (var i = 0; i < S.finance.subs.length; i++){
    var sub = S.finance.subs[i];
    if (sub.off) continue;
    kop += finSubTypical(sub) * (FIN_EVERY[sub.every] || FIN_EVERY.month).perYear;
  }
  return kop;
}

/// Оплачен ли платёж в этом периоде. Месяц — ключ вида 2026-08.
function finSubPaidIn(sub, key){
  return !!(sub.paid || {})[key || finMonthKey()];
}

/* Обязательные платежи месяца — то, что уходит до всякого планирования.

   Считаются только помесячные: годовая страховка в августе не «обязательный
   платёж августа», если платить её в марте. Годовые и недельные попадают
   сюда в свой месяц по дате следующего списания. */
function finDueThisMonth(key){
  key = key || finMonthKey();
  var rows = [];
  for (var i = 0; i < S.finance.subs.length; i++){
    var sub = S.finance.subs[i];
    if (sub.off) continue;
    var every = FIN_EVERY[sub.every] || FIN_EVERY.month;
    if (every !== FIN_EVERY.month){
      var next = finSubNext(sub);
      if (finMonthKey(next) !== key && !finSubPaidIn(sub, key)) continue;
    }
    rows.push({
      sub: sub,
      paid: (sub.paid || {})[key] || 0,
      expect: finSubTypical(sub),
      known: finSubKnown(sub)
    });
  }
  return rows;
}

function finSubNext(sub){
  if (!sub.since) return '';
  var every = (FIN_EVERY[sub.every] || FIN_EVERY.month);
  var step = every === FIN_EVERY.week ? 7 : 0;
  var date = new Date(sub.since + 'T00:00:00');
  var now = new Date(isoOf(todayDate()) + 'T00:00:00');
  var guard = 0;
  while (date < now && guard++ < 400){
    if (step) date.setDate(date.getDate() + step);
    else if (every === FIN_EVERY.year) date.setFullYear(date.getFullYear() + 1);
    else date.setMonth(date.getMonth() + 1);
  }
  return isoOf(date);
}

/* ---- экраны ---- */

var FIN_TABS = [
  { id: 'sum',      title: 'Сводка' },
  // «Операции» звучало как выписка из банка. Человек ведёт не операции, а
  // свои траты — и аналитика теперь живёт здесь же, под лентой: разбирать
  // траты в отдельной вкладке значит смотреть на те же числа дважды.
  { id: 'ops',      title: 'Мои траты' },
  { id: 'budgets',  title: 'Конверты' },
  { id: 'debts',    title: 'Долги' },
  { id: 'jars',     title: 'Копилки' },
  { id: 'subs',     title: 'Подписки и платежи', short: 'Платежи' }
  // Аналитика денег живёт здесь, а не в общей: там разбирают день и цели, и
  // рубли среди задач читаются как чужая колонка.
];

function vFinance(){
  var tab = S.finTab || 'sum';
  var html = '<div class="fintabs">' + FIN_TABS.map(function(t){
    return '<button class="fintab' + (t.id === tab ? ' on' : '') + '" data-act="fin-tab" data-tab="' + t.id + '">' +
      esc(t.title) + '</button>';
  }).join('') + '</div>';

  if (tab === 'ops') return html + vFinOps();
  if (tab === 'budgets') return html + vFinBudgets();
  if (tab === 'debts') return html + vFinDebts();
  if (tab === 'jars') return html + vFinJars();
  if (tab === 'subs') return html + vFinSubs();
  return html + vFinSummary();
}

/* Полоса выбора месяца. Одна на все вкладки, где месяц вообще имеет смысл:
   сводка, операции, конверты и аналитика. Вперёд за текущий месяц не пускает —
   смотреть там нечего. */
function finMonthBar(){
  var key = finShownMonth();
  var now = finMonthKey();
  return '<div class="finmonth">' +
    '<button data-act="fin-month" data-step="-1" aria-label="Прошлый месяц">' + ICON.left + '</button>' +
    '<b>' + esc(monthName(key)) + '</b>' +
    '<button data-act="fin-month" data-step="1"' + (key >= now ? ' disabled' : '') +
      ' aria-label="Следующий месяц">' + ICON.right + '</button>' +
    (key !== now ? '<button class="now" data-act="fin-month" data-step="0">Сегодня</button>' : '') +
  '</div>';
}

/* Сводка отвечает на четыре вопроса подряд, каждый своей строкой: сколько
   есть, сколько должен и должны мне, на что ушло в этом месяце, успеваю ли
   копить. Ничего, что нельзя прочесть за десять секунд. */
function vFinSummary(){
  var month = finMonthTotals();
  var debts = finDebtSums();
  var free = finBalance() - finSaved();
  var html = finMonthBar();

  /* Сводка отвечает на три вопроса и молчит обо всём остальном.

     Раньше она показывала сразу всё: плитки, полосы по категориям, конверты,
     список обязательных платежей, темп копилок и годовую сумму подписок —
     пять карточек с линиями подряд. Каждая по отдельности осмысленная, вместе
     — стена, в которой не за что зацепиться глазу.

     Осталось: сколько есть (плитки, которые и так читаются лучше всего),
     сколько уйдёт в этом месяце и куда уходит. Подробности живут в своих
     вкладках, и туда ведут короткие строки, а не пересказ. */

  if (!S.finance.opening){
    html += '<section class="card finhint">' +
      '<h3>Сначала — сколько у вас есть</h3>' +
      '<p class="sub">Впишите, сколько сейчас на карте и в кошельке, — одним числом. ' +
        'Без него «Свободно» показывает не деньги, а разницу доходов и трат с первой записи.</p>' +
      '<div class="acts"><button class="btn sm" data-act="fin-opening">Вписать</button></div>' +
    '</section>';
  }

  html += '<div class="fintiles">' +
    // Плитка открывает правку остатка: число меняют там же, где на него смотрят.
    '<button class="fintile' + (free < 0 ? ' bad' : '') + '" data-act="fin-opening">' +
      '<span>Свободно</span><b>' + finMoney(free) + '</b></button>' +
    finTile('Отложено', finMoney(finSaved()), '') +
    finTile('Я должен', finMoney(debts.owe), debts.owe ? 'warn' : '') +
    finTile('Мне должны', finMoney(debts.owed), '') +
  '</div>';

  /* Обязательные платежи — одной строкой с суммой, а не списком.

     Список из восьми строк повторял вкладку «Подписки и платежи» слово в
     слово. Здесь важно одно число: сколько ещё уйдёт в этом месяце. */
  var due = finDueThisMonth(finShownMonth());
  var left = 0, blind = 0;
  due.forEach(function(row){
    if (row.paid) return;
    if (row.known) left += row.expect; else blind++;
  });

  if (due.length){
    html += '<button class="finrow-link" data-act="fin-tab" data-tab="subs">' +
      '<span class="frl-t">Обязательные платежи' +
        (blind ? '<span class="frl-n">' + blind + ' по счётчику, сумма пока не известна</span>' : '') +
      '</span>' +
      '<b>' + (left ? finMoney(left) : 'всё оплачено') + '</b>' +
      '<span class="frl-go">' + ICON.right + '</span>' +
    '</button>';
  }

  // Конверты — тоже одной строкой: сколько всего осталось до конца месяца.
  var env = finBudgetRows();
  if (env.length){
    var plan = 0, spent = 0;
    env.forEach(function(r){ plan += r.plan; spent += r.spent; });
    html += '<button class="finrow-link" data-act="fin-tab" data-tab="budgets">' +
      '<span class="frl-t">Осталось в конвертах' +
        '<span class="frl-n">из ' + finMoney(plan) + ' на месяц</span></span>' +
      '<b class="' + (plan - spent < 0 ? 'bad' : '') + '">' + finMoney(plan - spent) + '</b>' +
      '<span class="frl-go">' + ICON.right + '</span>' +
    '</button>';
  }

  /* Куда уходит — единственная картинка в сводке, и та короткая: три самые
     дорогие категории. Полный разбор живёт в «Моих тратах». */
  var top = finByCat().slice(0, 3);
  html += '<section class="card">' +
    '<div class="finhead"><h3>' + esc(monthName(finShownMonth())) + '</h3>' +
      '<span class="sub">' + finMoney(month.earned, { plus: true }) + ' · ' +
        finMoney(-month.spent) + '</span></div>' +
    (top.length
      ? '<div class="finbars">' + top.map(function(row){
          var share = month.spent ? Math.round(row.sum * 100 / month.spent) : 0;
          return '<div class="finbar">' +
            '<span class="fb-t">' + esc(row.title) + '</span>' +
            '<span class="fb-r"><i style="width:' + share + '%;background:' + finTint(row.cat, .9) + '"></i></span>' +
            '<span class="fb-v">' + finMoney(row.sum) + '</span>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="sub" style="margin:0">В этом месяце ещё ничего не записано. ' +
        'Первая строка — во вкладке «Мои траты».</p>') +
  '</section>';

  return html;
}

function finTile(caption, value, tone){
  return '<div class="fintile' + (tone ? ' ' + tone : '') + '">' +
    '<span>' + esc(caption) + '</span><b>' + esc(value) + '</b></div>';
}

function vFinOps(){
  var kind = S.finKind || 'spend';
  var html = finMonthBar();

  html += '<div class="finadd">' +
    '<div class="finswitch">' +
      '<button class="' + (kind === 'spend' ? 'on' : '') + '" data-act="fin-kind" data-kind="spend">Трата</button>' +
      '<button class="' + (kind === 'income' ? 'on' : '') + '" data-act="fin-kind" data-kind="income">Доход</button>' +
    '</div>' +
    '<div class="rowadd">' +
      '<input class="inp" type="text" id="finfield" autocomplete="off" ' +
        'placeholder="' + (kind === 'income' ? 'зарплата 90000' : 'кофе 350') + '">' +
      // Кнопка AI уходит к Syn: пачка за раз, прошедшие даты, возвраты по долгам.
      '<button class="ai" type="button" data-act="fin-ai" aria-label="Записать через Syn" title="Записать через Syn">' +
        ICON.ai + '</button>' +
      '<button class="btn sm" data-act="fin-add">Записать</button>' +
    '</div>' +
    // Дата отдельным полем: пачку за неделю иначе не записать — всё падало
    // на сегодня. По умолчанию сегодняшняя, менять нужно редко.
    '<div class="finwhen">' +
      '<label for="findate">Дата</label>' +
      '<input class="inp" type="date" id="findate" value="' + esc(S.finDate || isoOf(todayDate())) + '">' +

    '</div>' +
    '<p class="hint" style="margin:8px 0 0">Сумму можно писать прямо в строке — «такси 1.5к», «продукты 2 400». ' +
      'Категория подставится сама. Кнопка AI рядом понимает несколько трат за раз и вчерашние даты.</p>' +
  '</div>';

  if (!S.finance.ops.length){
    return html + blank(NAV_ICONS.finance, 'Записей пока нет',
      'Одна строка на трату — этого достаточно. Через месяц раздел покажет, куда уходят деньги.');
  }

  // По дням, свежие сверху: список трат читают как ленту, а не как таблицу.
  var days = {};
  var order = [];
  var sorted = S.finance.ops.slice().sort(function(a, b){
    return a.date === b.date ? b.at - a.at : (a.date < b.date ? 1 : -1);
  });
  for (var i = 0; i < sorted.length; i++){
    var d = sorted[i].date;
    if (!days[d]){ days[d] = []; order.push(d); }
    days[d].push(sorted[i]);
  }

  html += order.map(function(date){
    var rows = days[date];
    var sum = rows.reduce(function(acc, op){
      return acc + op.amount * (FIN_KINDS[op.kind] ? FIN_KINDS[op.kind].sign : -1);
    }, 0);
    return '<div class="finday">' +
      '<div class="finday-h"><b>' + esc(humanDate(date)) + '</b>' +
        '<span>' + finMoney(sum, { plus: sum > 0 }) + '</span></div>' +
      '<div class="finrows">' + rows.map(function(op){
        return '<div class="finrow' + (touchUI() ? ' swipe' : '') + '">' +
          (touchUI() ?
            '<div class="side">' +
              '<button data-act="fin-op-edit" data-op="' + op.id + '" aria-label="Править">' + ICON.edit + '</button>' +
              '<button class="kill" data-act="fin-op-kill" data-op="' + op.id + '" aria-label="Удалить">' + ICON.kill + '</button>' +
            '</div>' +
            '<div class="swipe-face">' : '') +
          '<span class="fr-dot" style="background:' + finTint(op.cat, .95) + '"></span>' +
          '<button class="fr-t" data-act="fin-op-edit" data-op="' + op.id + '">' + esc(op.title) +
            '<span class="fr-c">' + esc(finCat(op.cat).title) + '</span></button>' +
          '<span class="fr-v' + (op.kind === 'income' ? ' up' : '') + '">' +
            finMoney(op.amount * (op.kind === 'income' ? 1 : -1), { plus: op.kind === 'income' }) + '</span>' +
          (touchUI() ? '' :
            '<button class="fr-x" data-act="fin-op-edit" data-op="' + op.id + '" title="Править" aria-label="Править">' + ICON.edit + '</button>' +
            '<button class="fr-x" data-act="fin-op-kill" data-op="' + op.id + '" aria-label="Удалить">' + ICON.kill + '</button>') +
          (touchUI() ? '</div>' : '') +
        '</div>';
      }).join('') + '</div>' +
    '</div>';
  }).join('');

  // Аналитика под лентой: те же числа, только собранные. Отдельной вкладкой
  // она заставляла смотреть на одно и то же дважды.
  return html + vFinChart(true);
}

function vFinBudgets(){
  var rows = finBudgetRows();
  var html = finMonthBar();

  html += '<div class="acts center" style="margin:0 0 14px">' +
    '<button class="btn" data-act="fin-budget-new">+ Новый конверт</button>' + finLeftHint('budgets') + '</div>';

  if (!rows.length){
    return html + blank(NAV_ICONS.finance, 'Конвертов пока нет',
      'Конверт — это сколько вы кладёте на категорию в месяц. ' +
      'Он один во всём разделе говорит, сколько ещё можно потратить, а не куда ушло.');
  }

  var plan = 0, spent = 0;
  rows.forEach(function(r){ plan += r.plan; spent += r.spent; });
  html += '<div class="fintiles">' +
    finTile('Разложено', finMoney(plan), '') +
    finTile('Потрачено', finMoney(spent), '') +
    finTile('Осталось', finMoney(plan - spent), plan - spent < 0 ? 'bad' : '') +
  '</div>';

  html += '<div class="sublist">' + rows.map(function(row){
    return '<div class="envrow' + (row.left < 0 ? ' over' : '') + '">' +
      '<div class="env-h">' +
        '<b>' + esc(row.title) + '</b>' +
        '<span>' + finMoney(row.spent) + ' из ' + finMoney(row.plan) + '</span>' +
        '<button class="fr-x" data-act="fin-budget-edit" data-cat="' + row.cat + '" title="Править" aria-label="Править">' + ICON.edit + '</button>' +
        '<button class="fr-x" data-act="fin-budget-kill" data-cat="' + row.cat + '" aria-label="Удалить">' + ICON.kill + '</button>' +
      '</div>' +
      '<div class="bar slim"><i style="width:' + row.share + '%' +
        (row.left < 0 ? ';background:var(--crit)' : '') + '"></i></div>' +
      '<div class="env-f">' + (row.left < 0
        ? 'перерасход ' + finMoney(-row.left)
        : 'осталось ' + finMoney(row.left)) + '</div>' +
    '</div>';
  }).join('') + '</div>';

  return html;
}

/* Аналитика денег — здесь, а не в общей.

   Три вопроса подряд: как месяц идёт против прошлого, что выросло сильнее
   всего, и на что уходит из месяца в месяц. Всё считается по тем же
   операциям, никаких отдельных счётчиков. */
function vFinChart(inline){
  var key = finShownMonth();
  var prevKey = finMonthShift(key, -1);
  var now = finMonthTotals(key), prev = finMonthTotals(prevKey);
  var html = inline ? '' : finMonthBar();

  // Внутри ленты пустая аналитика молчит: там уже сказано, что записей нет.
  if (!S.finance.ops.length){
    return inline ? '' : html + blank(NAV_ICONS.analytics, 'Считать пока нечего',
      'Аналитика появится, как только наберётся первый месяц записей.');
  }

  if (inline) html += '<p class="lbl">Разбор месяца</p>';

  var diff = now.spent - prev.spent;
  var pctText = prev.spent ? Math.round(Math.abs(diff) * 100 / prev.spent) + '%' : '—';

  html += '<div class="fintiles">' +
    finTile('Потрачено', finMoney(now.spent), '') +
    finTile('Заработано', finMoney(now.earned), '') +
    finTile('Разница', finMoney(now.earned - now.spent, { plus: now.earned > now.spent }),
      now.earned < now.spent ? 'bad' : '') +
    finTile('К прошлому', prev.spent ? (diff > 0 ? '+' : diff < 0 ? '−' : '') + pctText : '—',
      prev.spent && diff > 0 ? 'warn' : '') +
  '</div>';

  // Полугодие столбиками: тренд виден формой, а не колонкой чисел.
  var months = [], k = key;
  for (var i = 0; i < 6; i++){ months.unshift(k); k = finMonthShift(k, -1); }
  var peak = 1;
  var bars = months.map(function(mk){
    var t = finMonthTotals(mk);
    if (t.spent > peak) peak = t.spent;
    return { key: mk, spent: t.spent, earned: t.earned };
  });

  html += '<section class="card">' +
    '<div class="finhead"><h3>Полгода</h3><span class="sub">траты по месяцам</span></div>' +
    '<div class="fincols">' + bars.map(function(b){
      var height = Math.max(2, Math.round(b.spent * 100 / peak));
      return '<div class="fincol' + (b.key === key ? ' on' : '') + '">' +
        '<span class="fc-v">' + (b.spent ? finMoney(b.spent) : '') + '</span>' +
        '<span class="fc-b"><i style="height:' + height + '%"></i></span>' +
        '<span class="fc-t">' + esc(monthShort(b.key)) + '</span>' +
      '</div>';
    }).join('') + '</div>' +
  '</section>';

  // Что выросло и что упало — по категориям, к прошлому месяцу.
  var moved = finByCat(key).map(function(row){
    var was = finBudgetSpent(row.cat, prevKey);
    return { title: row.title, cat: row.cat, sum: row.sum, was: was, diff: row.sum - was };
  }).filter(function(r){ return r.was || r.sum; });
  moved.sort(function(a, b){ return Math.abs(b.diff) - Math.abs(a.diff); });

  if (moved.length){
    html += '<section class="card">' +
      '<div class="finhead"><h3>Что изменилось</h3>' +
        '<span class="sub">к ' + esc(monthDative(prevKey)) + '</span></div>' +
      moved.slice(0, 8).map(function(r){
        var share = r.was ? Math.round(Math.abs(r.diff) * 100 / r.was) : 0;
        return '<div class="finline">' +
          '<span>' + esc(r.title) + '</span>' +
          '<b class="' + (r.diff > 0 ? 'up-bad' : r.diff < 0 ? 'down-ok' : '') + '">' +
            (r.diff > 0 ? '+' : r.diff < 0 ? '−' : '') + finMoney(Math.abs(r.diff)) +
            (r.was ? ' · ' + share + '%' : ' · впервые') +
          '</b>' +
        '</div>';
      }).join('') +
    '</section>';
  }

  return html;
}

/// «к июлю», а не «к июль». Списком, а не правилом: русские месяцы склоняются
/// без исключений, но выводить это из именительного всё равно негде.
function monthDative(key){
  var names = ['январю','февралю','марту','апрелю','маю','июню',
               'июлю','августу','сентябрю','октябрю','ноябрю','декабрю'];
  var parts = String(key).split('-');
  return names[Number(parts[1]) - 1] + ' ' + parts[0];
}

function monthShort(key){
  var names = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  var parts = String(key).split('-');
  return names[Number(parts[1]) - 1];
}

/// Подсказка «осталось N бесплатно» рядом с кнопкой создания.
function finLeftHint(kind){
  var left = freeLeft(kind);
  if (left < 0) return '';
  return '<span class="freeleft">' + (left ? 'ещё ' + left + ' бесплатно' : 'бесплатные кончились') + '</span>';
}

function vFinDebts(){
  var sums = finDebtSums();
  var html = '';

  if (S.finance.debts.length){
    html += '<div class="fintiles">' +
      finTile('Я должен', finMoney(sums.owe), sums.owe ? 'warn' : '') +
      finTile('Мне должны', finMoney(sums.owed), '') +
      finTile('Итого', finMoney(sums.net, { plus: sums.net > 0 }), sums.net < 0 ? 'bad' : '') +
    '</div>';
  }

  html += '<div class="acts center" style="margin:0 0 14px">' +
    '<button class="btn" data-act="fin-debt-new">+ Новый долг</button>' +
  '</div>';

  var open = S.finance.debts.filter(function(d){ return !d.closed; });
  if (!open.length && !S.finance.debts.length){
    return html + blank(NAV_ICONS.finance, 'Долгов нет',
      'Сюда записывают, у кого взяли и кому дали. Видно сумму, срок и сколько уже вернули.');
  }

  /* Карточка в один ряд вместо пяти.

     Три кнопки словами занимали строку целиком и делали из долга блок в
     пол-экрана — а долгов бывает десяток. Осталась одна подписанная («Платёж»
     или «Возврат»: это действие, за которым сюда приходят), остальное
     значками справа. */
  html += '<div class="debtlist">' + S.finance.debts.map(function(d){
    var left = Math.max(0, d.amount - (d.paid || 0));
    return '<article class="debtrow' + (d.closed ? ' done' : '') + (touchUI() ? ' swipe' : '') + '">' +
      /* Под свайп уходит только удаление: «вернуть», «закрыть» и частичный
         возврат — это то, ради чего в долги и заходят, и прятать их за жест
         значило бы прятать сам смысл раздела. */
      (touchUI() ?
        '<div class="side">' +
          '<button class="kill" data-act="fin-debt-kill" data-debt="' + d.id + '" aria-label="Удалить">' + ICON.kill + '</button>' +
        '</div>' : '') +
      '<div class="dr-main' + (touchUI() ? ' swipe-face' : '') + '">' +
        '<span class="dr-t">' + esc(d.who) +
          '<span class="dr-n">' + (d.mine ? 'я должен' : 'мне должны') +
            (d.due ? ' · до ' + esc(humanDate(d.due)) : '') +
            // Полосы прогресса тут нет намеренно: «5 000 из 15 000» говорит
            // ровно то же, занимает ту же строку и не добавляет третьей.
            (d.paid ? ' · отдал ' + finMoney(d.paid, {}) + ' из ' + finMoney(d.amount) : '') +
          '</span></span>' +
        '<span class="dr-v' + (d.closed ? ' closed' : '') + '">' +
          (d.closed ? 'закрыт' : finMoney(left)) + '</span>' +
        '<span class="dr-a">' +
          (d.closed
            ? '<button class="fr-x" data-act="fin-debt-open" data-debt="' + d.id + '" title="Вернуть в открытые" aria-label="Вернуть в открытые">' + ICON.back + '</button>'
            : '<button class="fr-pay" data-act="fin-debt-pay" data-debt="' + d.id + '">' +
                (d.mine ? 'Платёж' : 'Возврат') + '</button>' +
              '<button class="fr-x" data-act="fin-debt-close" data-debt="' + d.id + '" title="Закрыть долг" aria-label="Закрыть долг">' + ICON.check + '</button>') +
          (touchUI() ? '' :
            '<button class="fr-x" data-act="fin-debt-kill" data-debt="' + d.id + '" title="Удалить" aria-label="Удалить">' + ICON.kill + '</button>') +
        '</span>' +
      '</div>' +
    '</article>';
  }).join('') + '</div>';

  return html;
}

function vFinJars(){
  var html = '<div class="acts center" style="margin:0 0 14px">' +
    '<button class="btn" data-act="fin-jar-new">+ Новая копилка</button></div>';

  if (!S.finance.jars.length){
    return html + blank(NAV_ICONS.finance, 'Копилок пока нет',
      'Копилка — это цель, измеряемая в рублях: «на отпуск 120 000 к июню». ' +
      'Synapse посчитает, сколько откладывать в месяц, чтобы успеть.');
  }

  html += S.finance.jars.map(function(jar){
    var saved = jar.saved || 0;
    var share = jar.target ? Math.min(100, Math.round(saved * 100 / jar.target)) : 0;
    var pace = finJarPace(jar);
    return '<article class="card jar' + (saved >= jar.target ? ' full' : '') + '">' +
      '<div class="finhead">' +
        '<h3>' + esc(jar.title) + '</h3>' +
        '<span class="sub">' + share + '%</span>' +
      '</div>' +
      '<div class="debt-sum"><b>' + finMoney(saved) + '</b>' +
        '<span class="sub">из ' + finMoney(jar.target) +
          (jar.due ? ' · к ' + esc(humanDate(jar.due)) : '') + '</span></div>' +
      '<div class="bar slim" style="margin-top:10px"><i style="width:' + share + '%"></i></div>' +
      (pace && !pace.done
        ? '<p class="sub" style="margin-top:10px">Чтобы успеть — ' + finMoney(pace.perMonth) +
          ' в месяц, осталось ' + pace.months + ' ' + plural(pace.months, 'месяц', 'месяца', 'месяцев') + '.</p>'
        : (saved >= jar.target ? '<p class="sub" style="margin-top:10px">Собрано.</p>' : '')) +
      '<div class="acts">' +
        '<button class="btn sm" data-act="fin-jar-put" data-jar="' + jar.id + '">Отложить</button>' +
        '<button class="btn sm soft" data-act="fin-jar-take" data-jar="' + jar.id + '">Снять</button>' +
        '<button class="btn sm soft" data-act="fin-jar-edit" data-jar="' + jar.id + '">Править</button>' +
        '<button class="btn sm soft" data-act="fin-jar-kill" data-jar="' + jar.id + '">Удалить</button>' +
      '</div>' +
    '</article>';
  }).join('');

  return html;
}

function vFinSubs(){
  var key = finShownMonth();
  var duty = S.finPayTab === 'duty';
  var html = finMonthBar();

  /* Две вкладки вместо двух таблиц подряд.

     Стопкой они читались как один длинный список, в котором надо ещё найти,
     где кончилось одно и началось другое. Разделены — и сразу видно, сколько
     уходит на то, от чего можно отказаться, отдельно от того, от чего нельзя.
     Кнопки одной ширины: это выбор из двух равных, а не главное и второстепенное. */
  html += '<div class="paytabs">' +
    '<button class="paytab' + (duty ? '' : ' on') + '" data-act="fin-pay-tab" data-kind="subs">Подписки</button>' +
    '<button class="paytab' + (duty ? ' on' : '') + '" data-act="fin-pay-tab" data-kind="duty">Платежи</button>' +
  '</div>';

  html += '<div class="acts center" style="margin:0 0 16px">' +
    '<button class="btn" data-act="fin-sub-new" data-duty="' + (duty ? '1' : '') + '">' +
      (duty ? '+ Новый платёж' : '+ Новая подписка') + '</button>' +
    finLeftHint('subs') + '</div>';

  var rows = finSubsOf(duty);
  if (!rows.length){
    return html + blank(NAV_ICONS.finance,
      duty ? 'Платежей пока нет' : 'Подписок пока нет',
      duty
        ? 'Квартплата, кредиты, детский сад — то, что уйдёт в любом случае.'
        : 'То, от чего можно отказаться. Годовая сумма — главный довод.');
  }

  return html + finPayTable(rows, key,
    duty ? 'Обязательные платежи' : 'Подписки',
    duty
      ? 'Квартплата, кредиты, дети — то, что уйдёт в любом случае.'
      : 'То, от чего можно отказаться. Годовая сумма — главный довод.');
}

function finPayTable(rows, key, title, lead){
  if (!rows.length) return '';

  var perMonth = 0, perYear = 0, unknown = 0;
  rows.forEach(function(sub){
    if (sub.off) return;
    if (!finSubKnown(sub)){ unknown++; return; }
    perMonth += finPerMonth(sub);
    perYear += finPerYear(sub);
  });

  // Заголовка и пояснения тут нет: вкладка выше и есть заголовок, а число
  // штук и суммы стоят в плитках. Повторять то же словами — отодвигать
  // таблицу вниз ради подписи, которую уже прочитали.
  var html = '<section class="paysec">' +

    '<div class="fintiles">' +
      finTile('В месяц', finMoney(perMonth), '') +
      finTile('В год', finMoney(perYear), '') +
      finTile('Штук', String(rows.filter(function(x){ return !x.off; }).length), '') +
    '</div>' +

    '<div class="paytable">' +
      '<div class="payhead">' +
        '<span>Название</span><span>В месяц</span><span class="year">В год</span><span></span>' +
      '</div>' +
      rows.map(function(sub){
        var paid = (sub.paid || {})[key] || 0;
        var known = finSubKnown(sub);
        var every = FIN_EVERY[sub.every] || FIN_EVERY.month;
        var next = finSubNext(sub);

        var note;
        if (sub.off) note = 'отключено';
        else if (paid) note = 'оплачено';
        else if (next) note = 'до ' + humanDate(next);
        else note = every.title;

        return '<div class="payrow' + (sub.off ? ' off' : '') + (paid ? ' paid' : '') + (touchUI() ? ' swipe' : '') + '">' +
          (touchUI() ?
            '<div class="side">' +
              '<button data-act="fin-sub-edit" data-sub="' + sub.id + '" aria-label="Править">' + ICON.edit + '</button>' +
              '<button class="kill" data-act="fin-sub-kill" data-sub="' + sub.id + '" aria-label="Удалить">' + ICON.kill + '</button>' +
            '</div>' +
            '<div class="swipe-face">' : '') +
          '<span class="pr-t">' + esc(sub.title) +
            '<span class="pr-n">' + esc(note) + '</span></span>' +
          '<span class="pr-v">' + (known ? (finSubVaries(sub) ? '≈ ' : '') + finMoney(finPerMonth(sub)) : '—') + '</span>' +
          '<span class="pr-v year">' + (known ? (finSubVaries(sub) ? '≈ ' : '') + finMoney(finPerYear(sub)) : '—') + '</span>' +
          '<span class="pr-a">' +
            (sub.off ? '' :
              '<button class="fr-pay' + (paid ? ' on' : '') + '" data-act="fin-sub-pay" data-sub="' + sub.id + '" ' +
                'title="' + (paid ? 'Отменить отметку' : 'Отметить оплату') + '">' +
                (paid ? ICON.check : 'Оплатить') + '</button>') +
            (touchUI() ? '' : '<button class="fr-x" data-act="fin-sub-edit" data-sub="' + sub.id + '" title="Править" aria-label="Править">' + ICON.edit + '</button>') +
            '<button class="fr-x" data-act="fin-sub-toggle" data-sub="' + sub.id + '" ' +
              'title="' + (sub.off ? 'Включить' : 'Отключить') + '" aria-label="Включить или отключить">' +
              (sub.off ? ICON.undo : ICON.power) + '</button>' +
            (touchUI() ? '' : '<button class="fr-x" data-act="fin-sub-kill" data-sub="' + sub.id + '" aria-label="Удалить">' + ICON.kill + '</button>') +
          '</span>' +
        '</div>';
      }).join('') +
    '</div>' +

    (unknown ? '<p class="hint" style="margin-top:10px">У ' + unknown + ' ' +
      plural(unknown, 'платежа', 'платежей', 'платежей') +
      ' сумма своя каждый месяц. Она встанет в таблицу после первой отметки об оплате.</p>' : '') +
  '</section>';

  return html;
}

function monthName(key){
  var months = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  var parts = String(key).split('-');
  return months[Number(parts[1]) - 1] + ' ' + parts[0];
}

/* Применение финансовых действий модели.

   Всё считает клиент: суммы приходят в рублях целыми, здесь они переводятся
   в копейки и складываются по нашим правилам. Модель ни разу не участвует в
   арифметике — её дело вынуть числа из фразы, а не сложить их. */
function finApplyBatch(actions){
  var said = [];

  actions.forEach(function(a){
    var kind = String(a.kind || '').toLowerCase();

    if (kind === 'fin_add_ops'){
      var ops = Array.isArray(a.ops) ? a.ops : [a];
      var added = 0;
      ops.forEach(function(op){
        var kop = Math.round(Number(op.amount) * 100);
        if (!kop || !isFinite(kop)) return;
        S.finance.ops.push({
          id: uid(), kind: op.kind === 'income' ? 'income' : 'spend',
          title: String(op.title || 'Запись'), amount: Math.abs(kop),
          cat: finCat(op.category || op.cat || 'other').id,
          date: /^\d{4}-\d{2}-\d{2}$/.test(op.date || '') ? op.date : isoOf(todayDate()),
          at: Date.now() + added,
          accountId: ''
        });
        added++;
      });
      if (added) said.push('записано ' + added + ' ' + plural(added, 'операция', 'операции', 'операций'));
      return;
    }

    if (kind === 'fin_add_debt'){
      if (!canAdd('debts')) { said.push('долг не записан: ' + limitReason('debts')); return; }
      var amount = Math.round(Number(a.amount) * 100);
      if (!a.who || !amount) return;
      var debt = {
        id: uid(), who: String(a.who), mine: a.mine !== false,
        amount: Math.abs(amount), paid: 0, due: a.due || '', note: String(a.note || ''),
        closed: false, at: Date.now(), taskId: ''
      };
      S.finance.debts.push(debt);
      if (debt.due) finDebtTask(debt);
      said.push('долг «' + debt.who + '»');
      return;
    }

    if (kind === 'fin_pay_debt'){
      // Ищем по имени среди открытых: модель получила этот список и должна
      // была взять имя оттуда. Не нашли — говорим, а не заводим новый долг.
      var target = null;
      var needle = String(a.who || '').toLowerCase();
      for (var i = 0; i < S.finance.debts.length; i++){
        var d = S.finance.debts[i];
        if (d.closed) continue;
        if (d.who.toLowerCase().indexOf(needle) !== -1 || needle.indexOf(d.who.toLowerCase()) !== -1){
          target = d; break;
        }
      }
      if (!target){ said.push('долг «' + (a.who || '?') + '» не найден'); return; }
      var back = Math.round(Number(a.amount) * 100);
      if (!back) return;
      target.paid = Math.min(target.amount, (target.paid || 0) + Math.abs(back));
      if (target.paid >= target.amount){
        target.closed = true;
        if (target.taskId) S.tasks = S.tasks.filter(function(t){ return t.id !== target.taskId; });
        target.taskId = '';
        said.push('долг «' + target.who + '» закрыт');
      } else {
        said.push('возврат от «' + target.who + '»');
      }
      return;
    }

    if (kind === 'fin_add_jar'){
      if (!canAdd('jars')) { said.push('копилка не заведена: ' + limitReason('jars')); return; }
      var goal = Math.round(Number(a.amount) * 100);
      if (!a.title || !goal) return;
      S.finance.jars.push({
        id: uid(), title: String(a.title), target: Math.abs(goal), saved: 0,
        due: a.due || '', at: Date.now(), goalId: '', stageId: ''
      });
      said.push('копилка «' + a.title + '»');
      return;
    }

    if (kind === 'fin_add_sub'){
      if (!canAdd('subs')) { said.push('подписка не записана: ' + limitReason('subs')); return; }
      var price = Math.round(Number(a.amount) * 100);
      if (!a.title || !price) return;
      S.finance.subs.push({
        id: uid(), title: String(a.title), amount: Math.abs(price),
        every: FIN_EVERY[a.every] ? a.every : 'month',
        since: a.since || isoOf(todayDate()), off: false, taskId: ''
      });
      said.push('подписка «' + a.title + '»');
      return;
    }

    if (kind === 'fin_set_budget'){
      var cat = finCat(a.category || a.cat || 'other').id;
      var plan = Math.round(Number(a.amount) * 100);
      if (!plan) return;
      var fresh = !(S.finance.budgets || {})[cat];
      if (fresh && !canAdd('budgets')) { said.push('конверт не разложен: ' + limitReason('budgets')); return; }
      S.finance.budgets[cat] = Math.abs(plan);
      said.push('конверт «' + finCat(cat).title + '»');
      return;
    }
  });

  return said;
}

/* Что именно запишется — словами и с итоговой суммой.

   Человек должен увидеть цифру до того, как она попадёт в сводку, а не
   после. Поэтому итог считается здесь же, теми же правилами, что и запись. */
function finPreview(actions){
  var rows = [], total = 0;

  actions.forEach(function(a){
    var kind = String(a.kind || '').toLowerCase();
    if (kind === 'fin_add_ops'){
      var ops = Array.isArray(a.ops) ? a.ops : [a];
      ops.forEach(function(op){
        var kop = Math.round(Math.abs(Number(op.amount)) * 100);
        if (!kop) return;
        var income = op.kind === 'income';
        total += income ? kop : -kop;
        rows.push((income ? '+ ' : '− ') + finMoney(kop) + ' · ' + (op.title || 'запись') +
          ' · ' + finCat(op.category || op.cat || 'other').title +
          ' · ' + humanDate(op.date || isoOf(todayDate())));
      });
    } else if (kind === 'fin_add_debt'){
      rows.push((a.mine !== false ? 'Я должен ' : 'Мне должен ') + (a.who || '?') + ' — ' +
        finMoney(Math.round(Math.abs(Number(a.amount)) * 100)) +
        (a.due ? ', до ' + humanDate(a.due) : ''));
    } else if (kind === 'fin_pay_debt'){
      rows.push('Возврат от ' + (a.who || '?') + ' — ' +
        finMoney(Math.round(Math.abs(Number(a.amount)) * 100)));
    } else if (kind === 'fin_add_jar'){
      rows.push('Копилка «' + (a.title || '?') + '» на ' +
        finMoney(Math.round(Math.abs(Number(a.amount)) * 100)) +
        (a.due ? ', к ' + humanDate(a.due) : ''));
    } else if (kind === 'fin_add_sub'){
      rows.push('Подписка «' + (a.title || '?') + '» — ' +
        finMoney(Math.round(Math.abs(Number(a.amount)) * 100)) + ' ' +
        (FIN_EVERY[a.every] || FIN_EVERY.month).title);
    } else if (kind === 'fin_set_budget'){
      rows.push('Конверт «' + finCat(a.category || a.cat || 'other').title + '» — ' +
        finMoney(Math.round(Math.abs(Number(a.amount)) * 100)) + ' в месяц');
    }
  });

  var head = rows.length === 1 ? 'Записать?'
    : 'Записать ' + rows.length + ' ' + plural(rows.length, 'запись', 'записи', 'записей') +
      (total ? ' на ' + finMoney(Math.abs(total)) : '') + '?';
  return { head: head, rows: rows };
}

/// Финансовые действия из ответа — узнаём их по приставке.
function finIsFinanceAction(a){
  return String(a && a.kind || '').toLowerCase().indexOf('fin_') === 0;
}

function finOp(id){
  for (var i = 0; i < S.finance.ops.length; i++) if (S.finance.ops[i].id === id) return S.finance.ops[i];
  return null;
}
function finRec(id){
  var box = S.finance.recurring || [];
  for (var i = 0; i < box.length; i++) if (box[i].id === id) return box[i];
  return null;
}

/* Задача на возврат долга. Та же механика, что у напоминания о списании:
   обычная задача в плане дня, а не отметка внутри финансов. */
function finDebtTask(debt){
  if (!debt || !debt.due) return null;
  if (debt.taskId && findTask(debt.taskId)) return findTask(debt.taskId);
  var task = {
    id: uid(),
    // Через двоеточие, а не «вернуть Марату»: склонять имена надёжно нельзя,
    // и «Вернуть Марат» читается как опечатка в собственном приложении.
    title: (debt.mine ? 'Вернуть долг: ' : 'Забрать долг: ') + debt.who + ' — ' +
      finMoney(Math.max(0, debt.amount - (debt.paid || 0))),
    bucket: bucketForDate(debt.due), date: debt.due, done: false,
    note: 'Долг из раздела «Мои финансы».',
    time: '', repeat: '', rule: null, series: null,
    hasExplicitDate: true, hasExplicitTime: false,
    goalId: null, stageId: null, subtasks: []
  };
  S.tasks.push(task);
  debt.taskId = task.id;
  return task;
}

/* Копилка внутри цели.

   Цель разбита на этапы, и «накопить 120 000» — такой же этап, как «сдать
   пробный экзамен»: у него есть готовность, и она считается сама, по тому,
   сколько отложено. Связь держится в обе стороны — этап знает про копилку,
   копилка про этап, — чтобы удаление одного не оставляло второе висеть. */
function finLinkJarToGoal(jar, goalId){
  // Отвязка от прежней цели, если её сменили.
  if (jar.goalId && jar.goalId !== goalId){
    var was = findGoal(jar.goalId);
    if (was) was.stages = was.stages.filter(function(st){ return st.id !== jar.stageId; });
  }
  if (!goalId){ jar.goalId = ''; jar.stageId = ''; return; }

  var goal = findGoal(goalId);
  if (!goal) { jar.goalId = ''; jar.stageId = ''; return; }

  var stage = jar.stageId ? findStage(goal, jar.stageId) : null;
  if (!stage){
    stage = { id: uid(), title: jar.title, detail: 'Копилка: ' + finMoney(jar.target),
              targetDate: jar.due || '', status: 'planned', jarId: jar.id };
    goal.stages.push(stage);
  } else {
    stage.title = jar.title;
    stage.detail = 'Копилка: ' + finMoney(jar.target);
    stage.targetDate = jar.due || '';
  }
  jar.goalId = goal.id;
  jar.stageId = stage.id;
  finSyncJarStages();
}

/// Этап-копилка закрывается, когда собрана вся сумма. Считается там же, где
/// остальная готовность, — снизу вверх, одним проходом.
function finSyncJarStages(){
  var jars = (S.finance && S.finance.jars) || [];
  for (var i = 0; i < jars.length; i++){
    var jar = jars[i];
    if (!jar.goalId || !jar.stageId) continue;
    var goal = findGoal(jar.goalId);
    var stage = goal ? findStage(goal, jar.stageId) : null;
    if (!stage){ jar.goalId = ''; jar.stageId = ''; continue; }
    stage.status = (jar.saved || 0) >= jar.target ? 'done'
      : ((jar.saved || 0) > 0 ? 'active' : 'planned');
  }
}

/* Знак сервиса.

   Настоящие логотипы сюда не поставить: чужие товарные знаки нельзя носить
   в своей сборке, а тянуть их с сайтов сервисов значит на каждом открытии
   окна ходить в сеть за картинкой — мимо офлайна и мимо приватности.

   Поэтому фирменный цвет и буква: Яндекс красным, ВК синим, Сбер зелёным,
   Telegram голубым. Узнаётся с той же скоростью, а принадлежит нам.
   У обязательных платежей знака нет вовсе — квартплата и детсад не бренды. */
/* Знак сервиса: настоящий логотип, если сервис его отдаёт.

   Картинка берётся с сайта самого сервиса, а не через посредника вроде
   сборщиков фавиконок: посредник видел бы, кто и что открывает. Запрос
   уходит только когда список раскрыли, и только за иконкой.

   Если логотипа нет (Сбер и МТС свою фавиконку закрыли), сети нет или
   картинка не загрузилась — на её месте остаётся плашка с фирменным цветом
   и буквой. Поэтому список читается и офлайн. */
/* Откуда берётся логотип.

   Своих плашек с буквой было заметно много: сайт отдаёт фавиконку не всегда
   (у Сбера и МТС она закрыта, у OpenAI отвечает 403), и там оставалась
   самоделка. Служба фавиконок Яндекса знает их все и работает в России —
   в отличие от DuckDuckGo, который здесь заблокирован, и Clearbit, который
   стал платным.

   Плата за это — запрос уходит к Яндексу, и он видит, что человек открыл
   список сервисов. Уходит он только когда список раскрыли, и только за
   картинкой. Плашка с буквой осталась запасной: сети нет — виден знак. */
var FIN_LOGO = 'https://favicon.yandex.net/favicon/v2/https://';

function finTplMark(tpl){
  var fallback = tpl.mark
    ? '<span class="tplmark" style="background:' + tpl.mark[0] + '">' + esc(tpl.mark[1]) + '</span>'
    : '<span class="tplmark none"></span>';
  if (!tpl.dom) return fallback;

  /* Картинка проявляется только когда действительно загрузилась.

     Наоборот — показать её сразу и прятать по ошибке — не работает: пока
     запрос висит, на месте логотипа пустой квадрат, а если сеть его молча
     отбросила, ошибки может и не быть вовсе, и квадрат останется навсегда.
     Плашка лежит под картинкой и видна всё это время. */
  return '<span class="tpllogo">' +
    fallback +
    '<img src="' + FIN_LOGO + tpl.dom + '?size=120" alt="" width="20" height="20" loading="lazy" ' +
      'onload="this.classList.add(&quot;ok&quot;)">' +
  '</span>';
}

function finTemplateChips(duty){
  /* Выпадающий список вместо ленты чипов.

     Лента прокручивалась вбок, и в ней помещалось три сервиса из шестнадцати:
     остальные приходилось искать пальцем вслепую. Список показывает все
     разом, с логотипами, и закрывается сам после выбора.

     Сделан на <details>: он открывается и закрывается без единой строки
     скрипта и переживает перерисовку окна. */
  var order = duty ? ['home', 'loans', 'kids'] : ['subs'];
  var rows = '';
  for (var g = 0; g < order.length; g++){
    var group = order[g];
    var inner = '';
    for (var i = 0; i < FIN_SUB_TEMPLATES.length; i++){
      var tpl = FIN_SUB_TEMPLATES[i];
      if ((tpl.g || 'subs') !== group) continue;
      inner += '<button class="tplrow" type="button" data-act="fin-sub-tpl" data-tpl="' + i + '">' +
        finTplMark(tpl) + '<span class="tplname">' + esc(tpl.title) + '</span>' +
        (tpl.amount ? '<span class="tplsum">' + finMoney(tpl.amount) + '</span>' : '') +
      '</button>';
    }
    if (!inner) continue;
    if (order.length > 1) rows += '<p class="tpl-group">' + esc(FIN_TPL_GROUPS[group]) + '</p>';
    rows += inner;
  }

  return '<details class="tplpick">' +
    '<summary>' + (duty ? 'Выбрать из готовых платежей' : 'Выбрать сервис') + '</summary>' +
    '<div class="tpllist">' + rows + '</div>' +
  '</details>';
}

function modalSubEdit(sub){
  return '<h3>' + esc(sub.title) + '</h3>' +
    '<div class="field"><label for="m-title">Название</label>' +
      '<input class="inp" id="m-title" value="' + esc(sub.title) + '"></div>' +
    '<div class="pairfields">' +
      '<div class="field"><label for="m-amount">Сумма</label>' +
        '<input class="inp" id="m-amount" inputmode="numeric" value="' +
          (sub.amount ? Math.round(sub.amount / 100) : '') + '" placeholder="необязательно"></div>' +
      '<div class="field"><label for="m-every">Раз в</label>' +
        '<select class="inp" id="m-every">' +
          '<option value="week"' + (sub.every === 'week' ? ' selected' : '') + '>неделю</option>' +
          '<option value="month"' + (sub.every === 'month' ? ' selected' : '') + '>месяц</option>' +
          '<option value="year"' + (sub.every === 'year' ? ' selected' : '') + '>год</option>' +
        '</select></div>' +
    '</div>' +
    '<div class="field"><label for="m-due">Дата списания</label>' +
      '<input class="inp" id="m-due" type="date" value="' + esc(sub.since || '') + '"></div>' +
    // Вид оставлен только в правке: он решает, в какой таблице строка стоит,
    // и нужен, чтобы поправить промах. При заведении его задаёт кнопка.
    '<div class="field"><label for="m-duty">Куда относится</label>' +
      '<select class="inp" id="m-duty">' +
        '<option value=""' + (finIsDuty(sub) ? '' : ' selected') + '>Подписки</option>' +
        '<option value="1"' + (finIsDuty(sub) ? ' selected' : '') + '>Обязательные платежи</option>' +
      '</select></div>' +
    '<label class="check"><input type="checkbox" id="m-remind"' + (sub.taskId ? ' checked' : '') + '>' +
      '<span>Напоминать о списании задачей в этот день</span></label>' +
    '<button class="btn full" data-act="fin-sub-save" data-sub="' + sub.id + '">Сохранить</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function finDebt(id){
  for (var i = 0; i < S.finance.debts.length; i++) if (S.finance.debts[i].id === id) return S.finance.debts[i];
  return null;
}
/* Напоминание о списании — обычная повторяющаяся задача, а не отдельная
   сущность внутри финансов. Так оно попадает в план дня, в аналитику и в
   брифинг сразу, ничего для этого не дописывая; и человек закрывает его той
   же галочкой, что и всё остальное.

   Ставится на первую дату списания в будущем, а не на дату начала подписки:
   напоминание о том, что списали в марте, в августе бесполезно. */
function finSubRemind(sub){
  var every = FIN_EVERY[sub.every] || FIN_EVERY.month;
  var repeat = sub.every === 'week' ? 'weekly' : (sub.every === 'year' ? '' : 'monthly');
  var when = finSubNext(sub) || sub.since || isoOf(todayDate());
  var task = {
    id: uid(),
    title: 'Списание: ' + sub.title + ' — ' + finMoney(sub.amount),
    bucket: bucketForDate(when),
    date: when,
    done: false,
    note: 'Подписка ' + every.title + '. Напоминание создано из раздела «Мои финансы».',
    time: '', repeat: repeat, rule: repeatPreset(repeat).rule, series: null,
    hasExplicitDate: true, hasExplicitTime: false,
    goalId: null, stageId: null, subtasks: []
  };
  S.tasks.push(task);
  sub.taskId = task.id;
  return task;
}

function finSub(id){
  for (var i = 0; i < S.finance.subs.length; i++) if (S.finance.subs[i].id === id) return S.finance.subs[i];
  return null;
}
function finJar(id){
  for (var i = 0; i < S.finance.jars.length; i++) if (S.finance.jars[i].id === id) return S.finance.jars[i];
  return null;
}

/* Отложить и снять — одним обработчиком: разница только в знаке. Копилка не
   уходит в минус и не переполняется выше цели молча — лишнее просто не
   принимается, чтобы «отложено» всегда совпадало с тем, что есть. */
function finJarMove(id, sign){
  var jar = finJar(id);
  if (!jar) return;
  var answer = prompt(sign > 0 ? 'Сколько отложить?' : 'Сколько снять?', '');
  if (answer === null) return;
  var parsed = finParse(answer, 'spend');
  if (!parsed) return;
  jar.saved = Math.max(0, (jar.saved || 0) + parsed.amount * sign);
  finSyncJarStages();
  commit(sign > 0 ? 'Отложено ' + finMoney(parsed.amount) : 'Снято ' + finMoney(parsed.amount));
}

/* ---- окна ввода ---- */

/* Платёж по долгу — частями.

   Долги редко отдают одной суммой: отдают, сколько есть сейчас. Поэтому окно
   показывает остаток, но не требует его целиком, а рядом стоит кнопка «всё
   сразу» — для случая, когда закрывают полностью. Работает в обе стороны:
   и когда платит человек, и когда возвращают ему. */
function modalDebtPay(debt){
  var left = Math.max(0, debt.amount - (debt.paid || 0));
  return '<h3>' + (debt.mine ? 'Платёж по долгу' : 'Возврат долга') + '</h3>' +
    '<p class="s">' + esc(debt.who) + ' · осталось ' + finMoney(left) +
      (debt.paid ? ' из ' + finMoney(debt.amount) : '') + '</p>' +
    '<div class="field"><label for="m-amount">' +
      (debt.mine ? 'Сколько отдали' : 'Сколько вернули') + '</label>' +
      '<input class="inp" id="m-amount" inputmode="numeric" placeholder="можно частью"></div>' +
    '<div class="acts center" style="margin:0 0 14px">' +
      '<button class="btn sm soft" data-act="fin-debt-pay-all" data-debt="' + debt.id + '">' +
        'Всё сразу — ' + finMoney(left) + '</button></div>' +
    '<button class="btn full" data-act="fin-debt-pay-save" data-debt="' + debt.id + '">Записать</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalDebt(){
  var mine = S.finDraftMine !== false;
  return '<h3>Новый долг</h3>' +
    '<div class="sidepick">' +
      '<button type="button" class="' + (mine ? 'on' : '') + '" data-act="fin-debt-side" data-mine="1">Я занял</button>' +
      '<button type="button" class="' + (mine ? '' : 'on') + '" data-act="fin-debt-side" data-mine="0">Мне должны</button>' +
    '</div>' +
    '<div class="field"><label for="m-who" id="m-who-label">' +
      (mine ? 'У кого взял' : 'Кто взял у меня') + '</label>' +
      '<input class="inp" id="m-who" placeholder="Имя"></div>' +
    '<div class="field"><label for="m-amount">Сумма</label>' +
      '<input class="inp" id="m-amount" placeholder="15 000"></div>' +
    '<div class="field"><label for="m-due" id="m-due-label">' +
      (mine ? 'Когда вернуть' : 'Когда должны вернуть') + '</label>' +
      '<input class="inp" id="m-due" type="date"></div>' +
    '<div class="field"><label for="m-note">Заметка</label>' +
      '<input class="inp" id="m-note" placeholder="Необязательно"></div>' +
    '<label class="check"><input type="checkbox" id="m-remind">' +
      '<span>Поставить задачу на день возврата</span></label>' +
    '<button class="btn full" data-act="fin-debt-save">Записать</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function finCatSelect(id, chosen){
  return '<select class="inp" id="' + id + '">' + finAllCats().map(function(c){
    return '<option value="' + c.id + '"' + (c.id === chosen ? ' selected' : '') + '>' +
      esc(c.title) + '</option>';
  }).join('') + '</select>';
}

function modalOpening(){
  return '<h3>Сколько у вас сейчас</h3>' +
    '<p class="s">Одним числом: карта, наличные и всё остальное вместе. ' +
      'Дальше Synapse считает сам — прибавляет доходы и вычитает траты.</p>' +
    '<div class="field"><label for="m-amount">Всего сейчас</label>' +
      '<input class="inp" id="m-amount" inputmode="numeric" value="' +
        (S.finance.opening ? Math.round(S.finance.opening / 100) : '') + '" placeholder="35 000"></div>' +
    '<button class="btn full" data-act="fin-opening-save">Записать</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalBudget(cat){
  var fresh = !cat;
  return '<h3>' + (fresh ? 'Новый конверт' : 'Конверт') + '</h3>' +
    '<p class="s">Сколько кладём на категорию в месяц. Полоса покажет, сколько ещё можно потратить.</p>' +
    '<div class="field"><label for="m-cat">Категория</label>' + finCatSelect('m-cat', cat) + '</div>' +
    '<div class="field"><label for="m-amount">Сколько в месяц</label>' +
      '<input class="inp" id="m-amount" value="' +
        (fresh ? '' : Math.round(finBudget(cat) / 100)) + '" placeholder="25 000"></div>' +
    '<button class="btn full" data-act="fin-budget-save">' + (fresh ? 'Разложить' : 'Сохранить') + '</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalOp(op){
  return '<h3>Запись</h3>' +
    '<div class="field"><label for="m-opkind">Что это</label>' +
      '<select class="inp" id="m-opkind">' +
        '<option value="spend"' + (op.kind === 'spend' ? ' selected' : '') + '>Трата</option>' +
        '<option value="income"' + (op.kind === 'income' ? ' selected' : '') + '>Доход</option>' +
      '</select></div>' +
    '<div class="field"><label for="m-title">Название</label>' +
      '<input class="inp" id="m-title" value="' + esc(op.title) + '"></div>' +
    '<div class="field"><label for="m-amount">Сумма</label>' +
      '<input class="inp" id="m-amount" value="' + Math.round(op.amount / 100) + '"></div>' +
    '<div class="field"><label for="m-cat">Категория</label>' + finCatSelect('m-cat', op.cat) + '</div>' +
    '<div class="field"><label for="m-due">Дата</label>' +
      '<input class="inp" id="m-due" type="date" value="' + esc(op.date) + '"></div>' +
    '<button class="btn full" data-act="fin-op-save" data-op="' + op.id + '">Сохранить</button>' +
    '<div class="acts">' +
      '<button class="btn sm soft" data-act="fin-op-kill" data-op="' + op.id + '">Удалить</button>' +
      '<button class="btn sm soft" data-act="close-modal">Отмена</button>' +
    '</div>';
}

function modalRecurring(rule){
  var fresh = !rule;
  return '<h3>' + (fresh ? 'Регулярная операция' : 'Правило') + '</h3>' +
    '<p class="s">Аренда, зарплата, платёж по кредиту. Появляется в ленте сама, в свой день.</p>' +
    '<div class="field"><label for="m-opkind">Что это</label>' +
      '<select class="inp" id="m-opkind">' +
        '<option value="spend"' + (!fresh && rule.kind === 'spend' ? ' selected' : '') + '>Трата</option>' +
        '<option value="income"' + (!fresh && rule.kind === 'income' ? ' selected' : '') + '>Доход</option>' +
      '</select></div>' +
    '<div class="field"><label for="m-title">Название</label>' +
      '<input class="inp" id="m-title" value="' + esc(fresh ? '' : rule.title) + '" placeholder="Аренда"></div>' +
    '<div class="field"><label for="m-amount">Сумма</label>' +
      '<input class="inp" id="m-amount" value="' + (fresh ? '' : Math.round(rule.amount / 100)) +
        '" placeholder="45 000"></div>' +
    '<div class="field"><label for="m-cat">Категория</label>' +
      finCatSelect('m-cat', fresh ? 'home' : rule.cat) + '</div>' +
    '<div class="field"><label for="m-every">Как часто</label>' +
      '<select class="inp" id="m-every">' +
        '<option value="month"' + (!fresh && rule.every === 'month' ? ' selected' : '') + '>Раз в месяц</option>' +
        '<option value="week"' + (!fresh && rule.every === 'week' ? ' selected' : '') + '>Раз в неделю</option>' +
        '<option value="year"' + (!fresh && rule.every === 'year' ? ' selected' : '') + '>Раз в год</option>' +
      '</select></div>' +
    '<div class="field"><label for="m-due">С какого числа</label>' +
      '<input class="inp" id="m-due" type="date" value="' +
        esc(fresh ? isoOf(todayDate()) : rule.since) + '"></div>' +
    '<button class="btn full" data-act="fin-rec-save"' + (fresh ? '' : ' data-rec="' + rule.id + '"') + '>' +
      (fresh ? 'Записать' : 'Сохранить') + '</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalJar(jar){
  var fresh = !jar;
  var goals = S.goals || [];
  return '<h3>' + (fresh ? 'Новая копилка' : 'Копилка') + '</h3>' +
    '<p class="s">Копилка — это цель в рублях. Со сроком Synapse посчитает, сколько откладывать в месяц.</p>' +
    '<div class="field"><label for="m-title">На что</label>' +
      '<input class="inp" id="m-title" value="' + esc(fresh ? '' : jar.title) + '" placeholder="Отпуск"></div>' +
    '<div class="field"><label for="m-amount">Сколько нужно</label>' +
      '<input class="inp" id="m-amount" value="' + (fresh ? '' : Math.round(jar.target / 100)) +
        '" placeholder="120 000"></div>' +
    '<div class="field"><label for="m-due">К какому числу</label>' +
      '<input class="inp" id="m-due" type="date" value="' + esc(fresh ? '' : (jar.due || '')) + '"></div>' +
    // Привязка к цели: копилка становится её этапом и закрывается сама, когда
    // сумма собрана.
    (goals.length ? '<div class="field"><label for="m-goal">Этап какой цели</label>' +
      '<select class="inp" id="m-goal">' +
        '<option value="">Сама по себе</option>' +
        goals.map(function(g){
          return '<option value="' + g.id + '"' +
            (!fresh && jar.goalId === g.id ? ' selected' : '') + '>' + esc(g.title) + '</option>';
        }).join('') + '</select></div>' : '') +
    '<button class="btn full" data-act="fin-jar-save"' + (fresh ? '' : ' data-jar="' + jar.id + '"') + '>' +
      (fresh ? 'Завести' : 'Сохранить') + '</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalSub(sub){
  var fresh = !sub;
  if (!fresh) return modalSubEdit(sub);

  /* Четыре поля и ни одним больше: название, сумма, как часто, с какого
     числа. Категорию и вид берём из того, какую кнопку нажали и какой
     шаблон выбрали, — спрашивать о них нечего.

     Нажатие на готовый сервис по-прежнему заводит его сразу: там и эти
     четыре уже известны. */
  return '<h3>' + (S.finDraftDuty ? 'Обязательный платёж' : 'Подписка') + '</h3>' +
    '<p class="s">Выберите готовое — поля заполнятся, останется проверить и записать.</p>' +
    finTemplateChips(S.finDraftDuty) +
    '<div class="ownadd">' +
      '<div class="field"><label for="m-title">Название</label>' +
        '<input class="inp" id="m-title" placeholder="' +
          (S.finDraftDuty ? 'Квартплата' : 'Название сервиса') + '" autocomplete="off"></div>' +
      '<div class="pairfields">' +
        '<div class="field"><label for="m-amount">Сумма</label>' +
          '<input class="inp" id="m-amount" inputmode="numeric" placeholder="необязательно"></div>' +
        '<div class="field"><label for="m-every">Раз в</label>' +
          '<select class="inp" id="m-every">' +
            '<option value="week">неделю</option>' +
            '<option value="month" selected>месяц</option>' +
            '<option value="year">год</option>' +
          '</select></div>' +
      '</div>' +
      '<div class="field"><label for="m-due">Дата списания</label>' +
        '<input class="inp" id="m-due" type="date" value="' + esc(isoOf(todayDate())) + '"></div>' +
      '<button class="btn full" data-act="fin-sub-save">Записать</button>' +
    '</div>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Закрыть</button></div>';
}

function vTrash(){
  var html = head('', 'Корзина');

  if (!S.trash.length){
    return html + blank(NAV_ICONS.trash, 'Корзина пуста',
      'Удалённые задачи, цели, списки и заметки лежат здесь ' + TRASH_DAYS +
      ' дней, и всё это время их можно вернуть.');
  }

  /* Полоса вместо карточки: срок хранения — одна строка, и целый блок под
     неё занимал первый экран, оставляя самим записям половину. Кнопки уехали
     туда же, вправо, где их и ищут. */
  html += '<div class="trashbar">' +
    '<span class="sub">Хранится ' + TRASH_DAYS + ' дней, потом уходит само</span>' +
    '<span class="trashbar-a">' +
      '<button class="btn sm soft" data-act="trash-restore-all">Восстановить все</button>' +
      '<button class="btn sm soft" data-act="trash-empty">Удалить все</button>' +
    '</span>' +
  '</div>';

  html += '<div class="trashlist">' +
    S.trash.map(function(item){
      var kind = TRASH_KINDS[item.kind] || { title: 'Запись' };
      var left = trashDaysLeft(item);
      /* Тип и срок — в одну строку с названием, а не под ним: так запись
         занимает один ряд вместо трёх, и на экран их влезает вдесятеро
         больше. Именно за этим в корзину и приходят — окинуть взглядом. */
      return '<article class="trashrow">' +
        '<div class="trashrow-t">' +
          '<b>' + esc(item.title) + '</b>' +
          '<span class="sub">' + esc(kind.title) + ' · ' +
            (left ? left + ' ' + plural(left, 'день', 'дня', 'дней') : 'сегодня') +
          '</span>' +
        '</div>' +
        '<div class="trashrow-a">' +
          '<button data-act="trash-restore" data-item="' + item.id + '" title="Вернуть" aria-label="Вернуть">' + ICON.back + '</button>' +
          '<button data-act="trash-kill" data-item="' + item.id + '" title="Стереть навсегда" aria-label="Стереть навсегда">' + ICON.kill + '</button>' +
        '</div>' +
      '</article>';
    }).join('') +
  '</div>';

  return html;
}

/* ============ ПЕРВЫЕ ШАГИ ============ */

/* Обучение, которое ничему не учит на словах.

   Четыре шага, и каждый отмечается сам — по состоянию, а не по нажатию
   «понятно». Это важнее, чем кажется: галочка, которую ставит человек,
   означает «я прочитал», а галочка, которую ставит сервис, означает «я сделал».
   Второе и есть обучение.

   Шаги выбраны так, чтобы после них планировщик был уже своим: появилась
   задача, одна закрыта, есть цель, и ассистент один раз ответил. Дальше
   карточка исчезает навсегда — обучение, которое остаётся на экране после
   того, как всё пройдено, превращается в мебель. */
var TOUR_STEPS = [
  {
    id: 'task',
    title: 'Создай первую задачу',
    hint: 'Напиши её в строке внизу. День и время можно сказать прямо там: «купить молоко завтра в 9 утра» — из названия эти слова уйдут.',
    done: function(){ return S.tasks.length > 0; }
  },
  {
    id: 'done',
    title: 'Отметь её выполненной',
    hint: 'Нажми на кружок слева от названия. Отмеченное сегодня останется в аналитике, а завтра уйдёт из списка само.',
    done: function(){ return S.tasks.some(function(t){ return t.done || t.archived; }); }
  },
  {
    id: 'goal',
    title: 'Заведи цель',
    hint: 'Раздел «Цели». У цели есть этапы, у этапов — свои задачи: так большое дело превращается в то, что можно сделать сегодня.',
    done: function(){ return S.goals.length > 0; },
    act: 'go', extra: ' data-view="goals"', label: 'Открыть цели'
  },
  {
    id: 'syn',
    title: 'Попроси Syn',
    hint: 'Скажи словами: «разбери мой день» или «перенеси урок на субботу». Можно голосом — Syn выполнит сказанное.',
    done: function(){ return S.synChat.length > 0; },
    act: 'ai', label: 'Открыть ассистента'
  }
];

/* Пройдено ли обучение — записывается, а не вычисляется каждый раз.

   Разница принципиальная. Шаги сами по себе выводятся из состояния: есть
   задача, есть закрытая, есть цель, был разговор с Syn. Но состояние меняется
   и в обратную сторону: человек прошёл все четыре, удалил тестовую задачу — и
   первый шаг снова «не сделан», а карточка возвращается, как будто он ничего
   не делал. Именно это и случилось.

   Поэтому факт прохождения фиксируется навсегда отдельным флагом. Вызывать эту
   проверку нужно отовсюду, где состояние меняется, — в том числе из ответа
   Syn, который идёт мимо commit(). Раньше он мимо и шёл: четвёртый шаг
   выполнялся, а записать это было некому. */
function tourCheck(){
  if (S.tourDone) return false;
  if (TOUR_STEPS.some(function(step){ return !step.done(); })) return false;
  S.tourDone = true;
  return true;
}

function tourVisible(){
  if (S.tourDone) return false;
  return TOUR_STEPS.some(function(step){ return !step.done(); });
}

function vTour(){
  var passed = TOUR_STEPS.filter(function(step){ return step.done(); }).length;
  // Текущий шаг — первый незакрытый. Раскрыт только он: четыре подсказки
  // разом читаются как инструкция, а не как следующий шаг.
  var current = null;
  for (var i = 0; i < TOUR_STEPS.length; i++){
    if (!TOUR_STEPS[i].done()){ current = TOUR_STEPS[i]; break; }
  }

  return '<section class="card tour">' +
    '<div class="tour-head">' +
      '<div>' +
        '<h3>Первые шаги</h3>' +
        '<p class="sub">Пройдено ' + passed + ' из ' + TOUR_STEPS.length + '</p>' +
      '</div>' +
      '<button class="tour-hide" data-act="tour-hide" aria-label="Пропустить первые шаги" title="Пропустить">✕</button>' +
    '</div>' +
    '<div class="tour-bar"><i style="width:' + Math.round(passed / TOUR_STEPS.length * 100) + '%"></i></div>' +
    '<div class="tour-steps">' +
      TOUR_STEPS.map(function(step){
        var isDone = step.done();
        var isNow = current && current.id === step.id;
        return '<div class="tour-step' + (isDone ? ' on' : '') + (isNow ? ' now' : '') + '">' +
          '<span class="tour-mark">' + (isDone ? '✓' : '') + '</span>' +
          '<div class="tour-body">' +
            '<b>' + esc(step.title) + '</b>' +
            (isNow ? '<p>' + esc(step.hint) + '</p>' : '') +
            (isNow && step.act
              ? '<button class="btn sm" data-act="' + step.act + '"' + (step.extra || '') + '>' +
                esc(step.label) + '</button>'
              : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
    // Кнопка словом, а не только крестиком в углу: пропустить знакомство —
    // это нормальный выбор, и он не должен выглядеть как закрытие рекламы.
    '<div class="acts"><button class="btn sm soft" data-act="tour-hide">Пропустить знакомство</button></div>' +
  '</section>';
}

/* ============ ЗАДАЧИ ============ */

/* Заголовка «Задачи» и счётчика над ним нет намеренно: раздел уже назван в
   меню, а блоки дня подписаны сами. Две строки шапки съедали первый экран
   телефона, ничего к нему не добавляя. */
function vTasks(){
  var html = '';

  /* Обучение стоит выше пустого экрана и заменяет его: два объяснения подряд
     об одном и том же — это уже уговоры.

     А в приложении пустого экрана нет вовсе. Плашка на полтелефона говорила
     ровно то, что и так видно — задач нет, — и отодвигала вниз сами блоки,
     то есть единственное, с чем тут можно что-то сделать. Строка ввода стоит
     внизу и никуда не девается, подсказка про «купить молоко завтра в 9 утра»
     живёт в обучении. */
  if (tourVisible()){
    html += vTour();
  } else if (!liveTasks().length && !inApp()){
    html += blank(NAV_ICONS.tasks, 'Задач пока нет',
      'Напиши первую в строке внизу. День и время можно сказать прямо там: «купить молоко завтра в 9 утра».');
  }

  /* Пустой блок дня виден, но тихо.

     Сначала их не рисовали вовсе, и это оказалось хуже: человек видит
     «Сегодня» и «Потом», между ними ничего, и решает, что у сервиса своя
     непонятная сортировка. Порядок дней — это и есть устройство экрана, его
     надо показывать целиком.

     Но и подписанная пустота на полкарточки не годится: пять таких подряд
     отодвигают настоящие задачи вниз. Поэтому у пустого блока остаётся одна
     строка заголовка со словом «пусто» — сетка дня видна, места почти не
     занимает, и перетащить туда задачу по-прежнему можно. */
  for (var i = 0; i < BUCKETS.length; i++){
    var b = BUCKETS[i];
    var mine = liveTasks().filter(function(t){ return t.bucket === b.id; });
    var closed = !!S.closed[b.id];

    // Пустой блок — тот же самый блок, только без строк. Отдельной вёрстки у
    // него нет намеренно: она делала из одного и того же дня две разные
    // вещи, и экран переставал читаться как один список дней.
    html += '<section class="group' + (closed ? ' closed' : '') +
        (mine.length ? '' : ' empty') + '" data-bucket="' + b.id + '">' +
      '<button class="group-h' + (closed ? ' closed' : '') + '" data-act="fold" data-bucket="' + b.id + '"' +
        ' aria-expanded="' + !closed + '">' +
        // Значок дня — только в приложении: в браузере заголовки крупные и
        // стоят просторно, там рисунок ничего не ускоряет.
        (inApp() ? '<span class="group-ic">' + (BUCKET_ICONS[b.id] || '') + '</span>' : '') +
        '<h3>' + esc(b.title) + '</h3><span class="car">⌄</span>' +
        '<span class="n">' + (mine.length ? taskCount(mine.length) : 'пусто') + '</span>' +
      '</button>' +
      // Обёртка нужна для той же плавности, что у карточек: высоту ведёт
      // foldOpen, а список внутри остаётся нетронутым.
      '<div class="tasklist-wrap">' +
        '<div class="tasklist" data-drop="' + b.id + '">' +
          mine.map(itemRow).join('') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  html += vComposer();
  return html;
}

/* Кнопки строки задачи.

   Одна разметка на два места: в браузере она стоит внутри строки справа, как
   стояла всегда, в приложении — под карточкой, откуда её достаёт свайп.
   Кнопка переноса нужна только в браузере: в приложении блок меняется
   перетаскиванием, а на телефоне три кнопки в ряд слишком мелкие для пальца. */
function боковыеКнопкиЗадачи(t){
  return '<div class="side">' +
    (touchUI() ? '' :
      '<button data-act="move-open" data-task="' + t.id + '" aria-label="Перенести в другой блок" title="Перенести в блок">' + ICON.move + '</button>') +
    '<button data-act="edit-task" data-task="' + t.id + '" aria-label="Редактировать задачу" title="Редактировать">' + ICON.edit + '</button>' +
    '<button class="kill" data-act="kill-task" data-task="' + t.id + '" aria-label="Удалить задачу" title="Удалить">' + ICON.kill + '</button>' +
  '</div>';
}

/* Второй параметр — «эта строка рисуется внутри самой цели».

   Сравнение именно с true не педантизм: строки почти везде собираются через
   list.map(itemRow), а map передаёт вторым аргументом индекс. Без проверки
   первая задача каждого списка (индекс 0) вела бы себя как обычная, а все
   остальные — как внутренние. */
function itemRow(t, внутриЦели){
  var goal = (t.goalId && внутриЦели !== true) ? findGoal(t.goalId) : null;
  var subDone = t.subtasks.filter(function(s){ return s.done; }).length;
  var open = !!S.open[t.id];

  /* Дата и время — справа от названия, одной тихой строкой.

     Чипами они занимали отдельный ряд под названием, и карточка вырастала в
     два раза: пять задач вместо десяти на экране телефона. В приложении это
     мелкая мета в 9–10 пунктов, и здесь теперь так же — только вынесенная
     вправо, где для неё есть пустое место, а не вниз, где его нет.

     «Перенесено с такого-то» убрано вовсе. Задача, переехавшая на сегодня, не
     нуждается в объяснении: она в «Сегодня», её надо делать. А вот время,
     которое прошло, назвать надо — это единственное, что действительно
     изменилось со вчера. Без времени задача просто висит, и никакой отметки на
     ней не нужно. */
  var meta = [];
  // Дату показываем, когда её назвали сами или когда блок не «сегодня».
  // Выведенная нами дата сегодняшнего блока не сообщает ничего.
  if (t.date && (t.hasExplicitDate || t.bucket !== 'today')){
    meta.push('<span class="chip">' + esc(humanDate(t.date)) + '</span>');
  }
  if (t.time) meta.push('<span class="chip">' + esc(t.time) + '</span>');
  if (t.repeat) meta.push('<span class="chip rep">' + ICON.repeat +
    esc(repeatLabel(t.repeat, t)) + '</span>');
  if (t.windowFrom && t.windowFrom.time) meta.push('<span class="chip">с ' + esc(t.windowFrom.time) + '</span>');
  // Срок — со словом «до»: без него «15 апреля 18:30» читается как время самой
  // задачи.
  /* Срок показываем, только если он говорит что-то новое.

     У задачи, созданной «на 16 августа в 10:00», срок ставится тем же днём и
     часом — и рядом с датой и временем появлялся третий чип «до 16 августа
     10:00», повторяющий оба. Три чипа на одну мысль. Совпал с датой задачи —
     молчим; стоит на другой день или час — говорим, ради этого он и нужен. */
  var срокДублирует = t.deadline &&
    t.deadline.date === t.date &&
    (t.deadline.time || '') === (t.time || '');
  if (t.deadline && !срокДублирует){
    meta.push('<span class="chip ' + (deadlinePassed(t) ? 'late' : 'hard') + '">до ' +
      esc(deadlineText(t.deadline)) + '</span>');
  }
  if (isOverdue(t)) meta.push('<span class="chip late">просрочено</span>');
  // Один перенос — житейское дело, о нём молчим. Со второго это уже привычка,
  // и человек имеет право её видеть.
  if ((t.carried || 0) >= 2) meta.push('<span class="chip carried" title="Столько раз переносилась">' +
    t.carried + '×</span>');
  // Цель — такой же чип, как дата, только акцентный: задача, которая ведёт к
  // цели, этим и отличается от рядовой, и сказать об этом надо словами, а не
  // припиской «· цель», из которой не понять, к какой именно.
  if (goal) meta.push('<span class="chip goal">' + esc(goal.title) + '</span>');
  // Подпункты — последним чипом и только когда они есть. Раньше слово
  // «подпункты» стояло в каждой карточке, включая те, где их ноль: подпись
  // обещала содержимое, которого нет.
  if (t.subtasks.length){
    meta.push('<span class="chip sub"><span class="car">⌄</span>' +
      subDone + ' из ' + t.subtasks.length + '</span>');
  } else if (t.note){
    meta.push('<span class="chip sub"><span class="car">⌄</span>описание</span>');
  }

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

  /* draggable убираем только в приложении.

     Атрибут нужен браузерному перетаскиванию, которым на компьютере таскают
     карточки между блоками. На сенсорном экране он вреден: андроид на долгое
     нажатие по draggable-элементу запускает СВОЁ перетаскивание — рисует
     полупрозрачную копию карточки и ведёт её за пальцем, а оригинал остаётся
     лежать в списке. Отсюда и «тень-клон ходит, а карточка стоит». Хуже того,
     системный жест забирает себе поток указательных событий, наш обработчик
     перестаёт получать pointermove, и собственный перенос замирает на месте.

     На телефоне перенос ведём сами — зажатием, — поэтому атрибут там просто
     не ставим: отменить системный жест из скрипта уже нельзя, он начинается
     раньше, чем страница о нём узнаёт. */
  return '<article class="item' + (touchUI() ? ' swipe' : '') + (t.done ? ' done' : '') + (open ? ' open' : '') + '"' +
    (inApp() ? '' : ' draggable="true"') + ' data-task="' + t.id + '">' +
    '<div class="item-main' + (touchUI() ? ' swipe-face' : '') + '" data-act="expand" data-task="' + t.id + '">' +
      '<button class="box' + (t.done ? ' on' : '') + '" data-act="toggle" data-task="' + t.id + '" aria-label="Выполнено">✓</button>' +
      '<div class="body">' +
        '<button class="t" data-act="expand" data-task="' + t.id + '" aria-expanded="' + open + '">' +
          esc(t.title) + '</button>' +
        /* Всё, что известно о задаче, — рядом чипов под названием.

           Мелкой серой строкой справа это занимало одну строку вместо двух, но
           читалось как сноска: дату и срок приходилось искать. Владелец увидел
           такую карточку в превью настроек и попросил её же здесь — а раз
           смотреть на них будут по сто раз в день, пусть смотреть будет легко.
           Карточка от этого выше на строку, и это честная плата.

           Ряда нет вовсе, если сказать нечего: у задачи без даты, цели и
           подпунктов остаётся одно название. */
        (meta.length ? '<div class="chips">' + meta.join('') + '</div>' : '') +
      '</div>' +
      (touchUI() ? '' : боковыеКнопкиЗадачи(t)) +
    '</div>' +
    (touchUI() ? боковыеКнопкиЗадачи(t) : '') + detail +
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
      // Кнопка ассистента рядом с отправкой: написанное в строке уходит
      // Syn как есть, поэтому «разбери мой день» можно набрать там же, где
      // обычную задачу, и нажать искру вместо стрелки.
      '<button class="ai" type="button" data-act="ai" aria-label="Ассистент Syn" title="Ассистент Syn">' + ICON.ai + '</button>' +
      '<button class="send" type="submit" aria-label="Добавить задачу">' + NAV_ICONS.send + '</button>' +
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

/* Курсор остаётся в поле после добавления.

   Подпункты и пункты списка заводят пачками — пять покупок подряд, семь
   шагов подряд. Перерисовка после каждого добавления уносила фокус, и за
   каждым пунктом приходилось возвращаться в строку мышкой. Запоминаем, куда
   вернуть курсор, и возвращаем после отрисовки — поле к тому времени уже
   новое, поэтому храним не узел, а как его найти. */
var refocusSelector = '';

function keepFocus(selector){ refocusSelector = selector; }

/* Полоса вкладок остаётся там, где её оставили.

   Сдвиг возвращается как был, а дальше проверяется одно: видна ли нажатая
   вкладка целиком. Не видна — дотягиваем ровно до неё, а не в начало и не в
   центр. Нажатие не должно ни сбрасывать полосу, ни дёргать её, когда и так
   всё на виду. */
function restoreTabStrip(left){
  var strip = document.querySelector('.fintabs');
  if (!strip) return;
  if (left !== null && left !== undefined) strip.scrollLeft = left;

  var active = strip.querySelector('.fintab.on');
  if (!active) return;

  var pad = 12;
  var from = strip.scrollLeft;
  var view = strip.clientWidth;
  var start = active.offsetLeft;
  var end = start + active.offsetWidth;

  if (start < from + pad) strip.scrollLeft = Math.max(0, start - pad);
  else if (end > from + view - pad) strip.scrollLeft = end - view + pad;
}

function restoreAddField(){
  if (!refocusSelector) return;
  var node = document.querySelector(refocusSelector);
  refocusSelector = '';
  if (!node) return;
  node.focus();
  if (node.setSelectionRange) node.setSelectionRange(node.value.length, node.value.length);
}

function addTask(){
  var raw = (S.draft || '').trim();
  if (!raw) return;
  var parsed = parseSchedule(raw, 'today');
  if (!parsed.title) return;
  parsed = pushPastTimeToTomorrow(parsed, raw);
  S.tasks.push({
    id: uid(), title: parsed.title, bucket: parsed.bucket, date: parsed.date, done: false, note: '',
    time: parsed.time, repeat: '', rule: null, series: null,
    hasExplicitDate: !!parsed.hasDate, hasExplicitTime: !!parsed.hasTime,
    goalId: null, stageId: null, subtasks: []
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
    cnt(String(S.pomodoro.doneToday), 'сессий фокуса') +
  '</div>';

  /* Списка задач дня здесь больше нет. Он повторял «Задачи» карточка в
     карточку — тот же блок «Сегодня», те же кнопки, — и экран фокуса
     превращался во второй список дел. Фокус отвечает на вопрос «как идёт
     день», а не «что в нём»: на это есть свой раздел. */
  if (!today.length){
    html += blank(NAV_ICONS.focus, 'На сегодня пусто',
      'Ничего не назначено на сегодня — можно задать спокойный ритм или перенести сюда задачу из другого блока.',
      'go', 'Открыть задачи', ' data-view="tasks"');
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

  /* Брифинг вытесняет сводку, а не встаёт рядом. Сводка — заготовка на случай,
     когда разбора ещё нет: две карточки об одном и том же дне заставляли бы
     читать дважды и сравнивать. */
  var brief = S.briefing && S.briefing.text && S.briefing.date === isoOf(todayDate()) ? S.briefing : null;
  var shown = brief ? briefingLines(brief.text) : lines;

  return '<section class="card focus">' +
    '<div class="focus-h">' +
      '<div class="focus-t">' +
        '<h3>' + (brief ? 'Брифинг' : 'Фокус дня') + '</h3>' +
        '<p class="sub">' + (brief
          ? (brief.morning ? 'Утренний разбор от Syn' : 'Вечерний разбор от Syn')
          : today.length
            ? 'Сегодня в фокусе ' + taskCount(today.length)
            : 'Можно задать спокойный ритм') + '</p>' +
      '</div>' +
      '<div class="focus-p"><b>' + percent + '%</b><span>Прогресс дня</span></div>' +
    '</div>' +
    '<div class="focus-lines">' +
      shown.map(function(l){
        return '<div class="fl"><span class="fll">' + esc(l[0]) + '</span>' +
          '<span class="flt">' + esc(l[1]) + '</span></div>';
      }).join('') +
    '</div>' +
    (brief && brief.main ? '<p class="focus-main"><span>Главное</span>' + esc(brief.main) + '</p>' : '') +
    (S.briefing && S.briefing.error ? '<p class="err" style="margin-top:12px">' + esc(S.briefing.error) + '</p>' : '') +
    '<div class="acts">' +
      '<button class="btn sm" data-act="briefing"' + (BRIEFING.busy ? ' disabled' : '') + '>' +
        (BRIEFING.busy ? 'Syn собирает…' : brief ? 'Обновить брифинг' : 'Собрать брифинг') + '</button>' +
      (brief && speechSupported()
        ? '<button class="btn sm soft" data-act="briefing-say"' + (speech.busy ? ' disabled' : '') + '>' +
          (speech.busy ? 'Готовим голос…' : speech.on ? 'Остановить' : 'Прослушать') + '</button>'
        : '') +
      (brief ? '<span class="hint" style="align-self:center">' + esc(brief.at) + '</span>' : '') +
    '</div>' +
    (brief ? '' : '<p class="hint">Пока это сводка по вашим задачам. Брифинг соберёт Syn — он посмотрит на день целиком и скажет, с чего начать. Один запрос из дневной нормы.</p>') +
  '</section>';
}

/* ---- брифинг ---- */

/* Тот же маршрут и тот же режим, что в приложении: POST /v1/synapse/research
   с mode=daily_briefing. Модель отвечает строками вида «МЕТКА: текст» и
   последней строкой «ГЛАВНОЕ: …» — её вынимаем и показываем отдельно, это
   указание интерфейсу, а не то, что человеку надо прочитать дважды.

   Утро или вечер решает час: до четырёх дня разбор про то, что впереди,
   после — про то, что вышло. */
var BRIEFING = { busy: false };

function briefingIsMorning(){ return new Date().getHours() < 16; }

/// Срез дня для разбора. Тот же смысл, что focusBriefingDigest в приложении:
/// не весь список задач, а то, по чему можно судить о дне.
function briefingDigest(){
  var today = liveTasks().filter(function(t){ return t.bucket === 'today'; });
  var doneCount = today.filter(function(t){ return t.done; }).length;
  var overdue = liveTasks().filter(isOverdue);
  var tomorrow = liveTasks().filter(function(t){ return t.bucket === 'tomorrow'; });

  var lines = ['ДАТА: ' + isoOf(todayDate()),
    'СЕЙЧАС: ' + clock(new Date().getHours(), new Date().getMinutes()),
    'СДЕЛАНО СЕГОДНЯ: ' + doneCount + ' из ' + today.length];
  // Имя — чтобы вслух брифинг начинался с обращения, а не с «здравствуйте».
  if (S.profile.name) lines.splice(1, 0, 'ИМЯ: ' + S.profile.name);

  if (today.length){
    lines.push('ЗАДАЧИ ДНЯ:');
    today.forEach(function(t){
      lines.push('- ' + t.title + (t.time ? ' в ' + t.time : '') + (t.done ? ' (сделано)' : '') +
        (t.deadline ? ' [срок ' + deadlineText(t.deadline) + ']' : ''));
    });
  }
  if (overdue.length){
    lines.push('ПРОСРОЧЕНО:');
    overdue.forEach(function(t){ lines.push('- ' + t.title + (t.date ? ' с ' + t.date : '')); });
  }
  if (tomorrow.length){
    lines.push('ЗАВТРА:');
    tomorrow.forEach(function(t){ lines.push('- ' + t.title + (t.time ? ' в ' + t.time : '')); });
  }
  if (S.goals.length){
    lines.push('ЦЕЛИ:');
    S.goals.forEach(function(g){
      var mine = tasksOfGoal(g.id);
      lines.push('- ' + g.title + ' (' + (mine.length ? taskCount(mine.length) : 'без задач') + ')');
    });
  }
  return lines.join('\n');
}

/// «МЕТКА: текст» → пара для карточки. Строки без метки тоже показываем —
/// модель иногда отвечает обычным предложением, и терять его нельзя.
function briefingLines(text){
  return String(text).split('\n').map(function(line){
    var trimmed = line.trim();
    if (!trimmed) return null;
    var at = trimmed.indexOf(':');
    if (at > 0 && at <= 24 && trimmed.slice(0, at) === trimmed.slice(0, at).toUpperCase()){
      return [trimmed.slice(0, at), trimmed.slice(at + 1).trim()];
    }
    return ['SYN', trimmed];
  }).filter(Boolean);
}

/* ---- озвучка ---- */

/* Брифинг можно послушать. Смысл не в озвучке ради озвучки: разбор дня читают
   утром, когда руки заняты — одеваются, едут, варят кофе. Тогда он должен
   звучать, а не ждать, пока на него посмотрят.

   Читает голос с сервера — модель с аудио на выходе. Браузерный синтез остался
   вторым путём: голос берём русский, если он в системе есть; если нет — молча
   читаем тем, что стоит по умолчанию: чужой акцент лучше тишины.

   Метки «СЕЙЧАС», «ПЛАН» в озвучку не идут: на письме они разделяют куски, а
   вслух звучат как выкрики. */
var speech = { on: false, audio: null, url: '', busy: false };

function speechSupported(){
  // Системный синтез есть почти везде; голос с сервера — сверх него. Если
  // сервера нет, читать всё равно есть чем.
  return ('speechSynthesis' in window) || typeof Audio === 'function';
}

function speechStop(){
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (speech.audio){
    var audio = speech.audio;
    speech.audio = null;
    /* Обработчики снимаем до остановки, и это не осторожность, а лечение.
       Пустой src — это для браузера «загрузи ничего», он честно пробует,
       не может и поднимает error. Живой onerror принимал его за сбой
       озвучки и читал брифинг заново системным голосом — тем самым, ради
       ухода от которого всё и делалось, и ровно в тот миг, когда нормальный
       голос только дочитал. Снаружи выглядело как «после хорошего голоса
       сразу включается уродский». */
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = '';
  }
  if (speech.url){
    URL.revokeObjectURL(speech.url);
    speech.url = '';
  }
  speech.on = false;
  speech.busy = false;
}

/* Озвучка брифинга.

   Сначала голос с сервера: там брифинг читает модель, и разницу слышно —
   системный синтезатор читает правильно, но узнаваемо машинно.

   Если сервер не настроен, не ответил или отказал — читаем системным. Это не
   путь «на всякий случай», а обычный: пока ключа нет, так работает у всех, и
   брифинг человек слышит в любом случае. Молчание в ответ на «прослушать» было
   бы худшим из возможных исходов.

   Но только когда серверный голос действительно не прозвучал. Системный голос
   вслед за нормальным — не подстраховка, а брак: человек уже всё услышал.

   Про разницу в тембре в интерфейсе не пишем: человек просил послушать — он
   слушает. */
function speechSay(text, done){
  var clean = String(text || '').trim();
  if (!clean) return;

  speechStop();
  speech.on = true;
  speech.busy = true;
  render();

  ttsFromServer(clean).then(function(blob){
    if (!speech.on) return;                       // успели нажать «остановить»
    speech.busy = false;
    speech.url = URL.createObjectURL(blob);
    var audio = new Audio(speech.url);
    speech.audio = audio;
    audio.onended = function(){ speechStop(); if (done) done(); };
    /* Читаем системным голосом только если сорвалось это самое
       воспроизведение и оно всё ещё нужно. Нажатие «остановить» тоже
       отклоняет play() — с AbortError, — и без проверки человек, оборвавший
       чтение, получал бы вместо тишины системный голос с начала. */
    var current = function(){ return speech.audio === audio; };
    audio.onerror = function(){ if (current()) speechFallback(clean, done); };
    audio.play().catch(function(){ if (current()) speechFallback(clean, done); });
    render();
  }).catch(function(){
    if (!speech.on) return;
    speech.busy = false;
    speechFallback(clean, done);
  });
}

/// Системный синтезатор — когда серверного голоса нет.
function speechFallback(text, done){
  if (!('speechSynthesis' in window)){ speechStop(); if (done) done(); return; }

  window.speechSynthesis.cancel();
  var utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = 0.98;
  utterance.pitch = 1;

  var voices = window.speechSynthesis.getVoices() || [];
  for (var i = 0; i < voices.length; i++){
    if ((voices[i].lang || '').toLowerCase().indexOf('ru') === 0){ utterance.voice = voices[i]; break; }
  }

  utterance.onend = function(){ speech.on = false; speech.busy = false; if (done) done(); };
  utterance.onerror = function(){ speech.on = false; speech.busy = false; if (done) done(); };

  speech.on = true;
  speech.busy = false;
  window.speechSynthesis.speak(utterance);
  render();
}

/// Запрос к своему серверу за озвучкой: отдаёт mp3 или падает. Второе тоже
/// нормально — выше есть чем прочитать.
function ttsFromServer(text){
  return synSession().then(function(token){
    return fetch(SYN.base + '/v1/synapse/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'X-Synapse-Install-ID': webInstallID()
      },
      body: JSON.stringify({ text: text })
    });
  }).then(function(response){
    if (!response.ok) throw new Error('tts ' + response.status);
    return response.blob();
  });
}

/* Что читать вслух.

   Живой пересказ, если он пришёл: он написан для уха — с обращением, связными
   фразами и временем словами. Экранный брифинг для этого не годится: он
   разбит на метки, а метки вслух звучат как выкрики, и «19:00» диктуется
   цифрами.

   Если пересказа нет — старый ответ сервера, сбой модели, — читаем сам
   брифинг без меток. Хуже, но лучше молчания. */
function briefingSpeech(){
  var brief = S.briefing;
  if (!brief) return '';
  if (brief.voice) return brief.voice;
  if (!brief.text) return '';
  var lines = briefingLines(brief.text).map(function(pair){ return pair[1]; });
  if (brief.main) lines.push('Главное на сегодня: ' + brief.main);
  return lines.join(' ');
}

function briefingRun(){
  if (BRIEFING.busy) return;
  var digest = briefingDigest();
  BRIEFING.busy = true;
  S.briefing = S.briefing || {};
  S.briefing.error = '';
  render();

  var morning = briefingIsMorning();
  synSession().then(function(token){
    return synFetch('/v1/synapse/research', {
      query: 'Собери брифинг по этому срезу.',
      taskTitle: morning ? 'morning' : 'evening',
      existingNote: digest,
      mode: 'daily_briefing'
    }, token);
  }).then(function(data){
    BRIEFING.busy = false;
    var raw = String(data.note || '').trim();
    if (!raw){
      S.briefing.error = 'Syn не собрал брифинг. Попробуй ещё раз.';
      commit();
      return;
    }
    /* Из ответа вынимаются две служебные строки.

       «ГЛАВНОЕ» — указание интерфейсу, какую задачу подсветить.
       «ВСЛУХ» — тот же брифинг, рассказанный голосом: с обращением по имени,
       связными фразами и временем словами. Он приходит тем же запросом, а не
       вторым, поэтому прослушивание не стоит ещё одного обращения к Syn.

       Строка ВСЛУХ может оказаться многострочной, если модель перенесла
       предложение, — поэтому после её начала всё остальное считается ею. */
    var main = '';
    var voice = '';
    var kept = [];
    var inVoice = false;
    raw.split('\n').forEach(function(line){
      var trimmed = line.trim();
      if (!trimmed) return;

      var voiceAt = trimmed.toUpperCase().indexOf('ВСЛУХ:');
      if (voiceAt >= 0){
        inVoice = true;
        voice = trimmed.slice(voiceAt + 6).trim();
        return;
      }
      if (inVoice){ voice += ' ' + trimmed; return; }

      var at = trimmed.toUpperCase().indexOf('ГЛАВНОЕ:');
      if (at >= 0){
        var value = trimmed.slice(at + 8).trim().replace(/^[«"]|[».,"]$/g, '');
        if (value.toLowerCase().indexOf('нет') !== 0) main = value;
        return;
      }
      kept.push(trimmed);
    });

    S.briefing = {
      text: kept.join('\n'), main: main, voice: voice.trim(), morning: morning,
      date: isoOf(todayDate()), at: clock(new Date().getHours(), new Date().getMinutes()), error: ''
    };
    commit('Брифинг собран');
  }).catch(function(error){
    BRIEFING.busy = false;
    S.briefing = S.briefing || {};
    S.briefing.error = synErrorText(error);
    commit();
  });
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

/* Цель меряется этапами, а не задачами.

   Считалось наоборот: есть хоть одна задача — прогресс по задачам. Цель из
   четырёх этапов, у которой закрыта одна задача одного этапа, показывала
   100% и полную зелёную полосу, пока три этапа стояли в работе и в плане.
   Полоса врала ровно там, где её и смотрят.

   Задача — это шаг внутри этапа, и «все задачи закрыты» никогда не значит
   «цель достигнута»: следующий этап просто ещё не расписан. Этапы же и есть
   цель, разложенная на части, поэтому доля закрытых этапов — честный ответ.
   Внутри этапа за задачами следит syncCompletion: закрылись все — этап
   закрывается сам и попадает в этот счёт.

   Без этапов считаем по задачам: там цель и есть список задач, делить
   нечего. */
function goalProgress(goal){
  var stages = goal.stages || [];
  if (!stages.length){
    var tasks = tasksOfGoal(goal.id);
    return { done: tasks.filter(function(t){ return t.done; }).length,
             total: tasks.length, unit: 'задач' };
  }
  return {
    done: stages.filter(function(s){ return s.status === 'done'; }).length,
    total: stages.length, unit: 'этапов'
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
    return blank(NAV_ICONS.goals, 'Целей пока нет',
      'Цель — это то, ради чего задачи вообще существуют. Назови её в строке внизу, а этапы добавишь потом.') +
      vGoalComposer();
  }

  for (var i = 0; i < S.goals.length; i++){
    var g = S.goals[i];
    var p = goalProgress(g);
    var open = !!S.openGoal[g.id];

    html += '<section class="goalcard' + (touchUI() ? ' swipe' : '') + (open ? ' open' : '') + '" data-goal="' + g.id + '">' +
      /* В приложении править и удалить — свайпом по карточке, как у задач:
         две текстовые кнопки внизу каждой раскрытой цели занимали по строке.
         В браузере они остаются на прежнем месте — там места хватает. */
      (touchUI() ?
        '<div class="side">' +
          '<button data-act="edit-goal" data-goal="' + g.id + '" aria-label="Править цель">' + ICON.edit + '</button>' +
          '<button class="kill" data-act="kill-goal" data-goal="' + g.id + '" aria-label="Удалить цель">' + ICON.kill + '</button>' +
        '</div>' : '') +
      /* Едет вся карточка, а не одна шапка.

         Сперва лицом сделал шапку — и у раскрытой цели уезжала полоска в
         сорок пикселей, а тело в двести оставалось на месте; кнопки при этом
         растягивались на всю высоту карточки. Выглядело поломкой, и владелец
         справедливо сказал, что свайп в целях не работает. Оборачиваем всё
         содержимое: карточка едет целиком, как задача. */
      (touchUI() ? '<div class="swipe-face gc-face">' : '') +
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
      (touchUI() ? '</div>' : '') +
    '</section>';
  }

  return html + vGoalComposer();
}

/* Один этап — одной разметкой на оба экрана.

   Копий было две: в раскрытой цели этап рисовался чертой слева, на отдельной
   странице цели — карточкой с полем в шестнадцать пикселей. Они успели
   разойтись: на странице не было ни кнопки правки, ни срока этапа, зато были
   свои отступы прямо в атрибуте style. Любая правка иерархии требовала
   вспомнить про второе место, а вспоминалось оно не всегда.

   Оставлен вариант с чертой: он и есть иерархия — рёбра вместо вложенных
   коробок.

   Номер этапа не украшение. Этапы идут последовательно, и «Этап 2» отвечает
   на вопрос, который иначе решается пересчётом строк глазами: где я и сколько
   ещё. Он же отделяет заголовок этапа от названия задачи — раньше их роднил
   почти одинаковый кегль, и раскрытая цель читалась как один длинный список
   без уровней. */
function stageBlock(g, st, номер){
  var list = tasksOfStage(g.id, st.id);
  return '<div class="stage' + (st.status === 'done' ? ' on' : '') + '">' +
    '<p class="st-num">Этап ' + номер + '</p>' +
    '<div class="stage-h">' +
      '<button class="box' + (st.status === 'done' ? ' on' : '') + '" data-act="stage-toggle" data-goal="' + g.id + '" data-stage="' + st.id + '" aria-label="Готово">✓</button>' +
      '<span class="t">' + esc(st.title) + '</span>' +
      '<span class="status">' + STATUS[st.status] + '</span>' +
      '<button class="kill" data-act="edit-stage" data-goal="' + g.id + '" data-stage="' + st.id + '" aria-label="Править этап" title="Править">' + ICON.edit + '</button>' +
      '<button class="kill" data-act="kill-stage" data-goal="' + g.id + '" data-stage="' + st.id + '" aria-label="Удалить этап">✕</button>' +
    '</div>' +
    (st.detail ? '<p class="detail">' + esc(st.detail) + '</p>' : '') +
    (st.targetDate && st.status !== 'done'
      ? '<p class="detail stage-target' + dueSoonClass(st.targetDate) + '">К ' +
        esc(humanDate(st.targetDate)) + ' · ' + esc(untilText(st.targetDate)) + '</p>'
      : '') +
    (list.length
      /* Чип с названием цели внутри самой цели — это повтор заголовка на
         каждой строке. Он нужен на экране задач, где задача оторвана от
         своего контекста, и мешает здесь, где контекст и есть экран. */
      ? '<div class="tasks">' + list.map(function(t){ return itemRow(t, true); }).join('') + '</div>'
      : '<p class="none">У этого этапа пока нет задач.</p>') +
    '<div class="rowadd">' +
      '<input class="inp" type="text" placeholder="Задача этапа" data-goaltask="' + st.id + '" autocomplete="off">' +
      '<button class="btn sm" data-act="goal-task" data-goal="' + g.id + '" data-stage="' + st.id + '">Добавить</button>' +
    '</div>' +
  '</div>';
}

/// Внутренность раскрытой цели: смысл, этапы с их задачами, действия.
function goalBody(g){
  var html = '<div class="goalbody">';

  if (g.purpose) html += '<p class="sub gpurpose">' + esc(g.purpose) + '</p>';

  /* Дата цели — вместе с тем, сколько до неё осталось. Сама дата без остатка
     заставляет считать в голове, а именно остаток и есть повод шевелиться. */
  if (g.targetDate){
    html += '<p class="gtarget' + (dueSoonClass(g.targetDate)) + '">' +
      'Дата цели: ' + esc(humanDate(g.targetDate)) + ' · ' + esc(untilText(g.targetDate)) + '</p>';
  }

  if (!g.stages.length){
    html += '<p class="none">Этапов пока нет. Разбей цель на шаги — к каждому можно привязать задачи.</p>';
  }

  for (var i = 0; i < g.stages.length; i++){
    html += stageBlock(g, g.stages[i], i + 1);
  }

  var loose = S.tasks.filter(function(t){ return t.goalId === g.id && !findStage(g, t.stageId); });
  if (loose.length){
    html += '<p class="lbl">Задачи без этапа</p><div class="tasklist">' + loose.map(function(t){ return itemRow(t, true); }).join('') + '</div>';
  }

  html += '<div class="acts">' +
      '<button class="btn sm" data-act="new-stage" data-goal="' + g.id + '">+ Этап</button>' +
      (touchUI() ? '' :
        '<button class="btn sm soft" data-act="edit-goal" data-goal="' + g.id + '">Править</button>' +
        '<button class="btn sm soft" data-act="kill-goal" data-goal="' + g.id + '">Удалить цель</button>') +

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
      /* Та же кнопка, что в задачах, но с другим намерением. Стрелка заводит
         цель с одним названием и пустой серединой — это правильно, когда
         человек уже знает, чего хочет. AI нужен, когда не знает: Syn
         сам придумает этапы, сроки и первые задачи. */
      '<button class="ai" type="button" data-act="ai-goal" aria-label="Придумать цель с Syn" title="Придумать цель с Syn">' + ICON.ai + '</button>' +
      '<button class="send" type="submit" aria-label="Создать цель">' + NAV_ICONS.send + '</button>' +
    '</form>' +
  '</div>';
}

function vGoal(){
  var g = findGoal(S.activeGoal);
  if (!g) return head('Цель', 'Цель не найдена', 'goals') +
    blank(NAV_ICONS.goals, 'Похоже, она уже была удалена', 'Вернись к списку целей.', 'go', 'Все цели', ' data-view="goals"');

  var p = goalProgress(g);
  var html = head('Цель', g.title, 'goals');

  html += '<section class="card">' +
    (g.purpose ? '<p class="sub" style="margin:0 0 14px">' + esc(g.purpose) + '</p>' : '') +
    bar(p.done, p.total, p.done + ' из ' + p.total + ' ' + p.unit) +
    '<div class="acts">' +
      '<button class="btn sm" data-act="new-stage" data-goal="' + g.id + '">+ Создать этап</button>' +

    '</div>' +
  '</section>';

  if (!g.stages.length){
    html += blank(NAV_ICONS.stage, 'У цели пока нет этапов',
      'Разбей цель на понятные шаги — к каждому можно будет привязать задачи.',
      'new-stage', 'Создать этап', ' data-goal="' + g.id + '"');
  }

  if (g.stages.length){
    html += '<p class="lbl">Этапы</p><section class="card">';
    for (var i = 0; i < g.stages.length; i++){
      html += stageBlock(g, g.stages[i], i + 1);
    }
    html += '</section>';
  }

  var loose = S.tasks.filter(function(t){ return t.goalId === g.id && !findStage(g, t.stageId); });
  if (loose.length){
    html += '<p class="lbl">Задача без этапа</p><div class="tasklist">' + loose.map(function(t){ return itemRow(t, true); }).join('') + '</div>';
  }

  html += '<p class="hint">Задачи цели — те же самые объекты, что на экране «Задачи». Отметил здесь — отмечено и там.</p>';
  return html;
}

/* ============ АНАЛИТИКА ============ */

/* Раздел «Карта целей» — только карта.

   Здесь стояли два ряда счётчиков и полоса дня, и ни одно из этих чисел не
   было здешним. «Всего задач», «выполнено», «в работе» человек читает на
   самом экране задач, у каждого блока рядом с названием. «Сделано за день» —
   это процент дня, он же стоит первой строкой в «Аналитике». «Целей»,
   «этапов пройдено», «списков», «заметок» — счётчики четырёх других
   разделов, собранные в кучу там, где ни один из них не открывается.

   Осталась карта, ради которой сюда и заходят. Заголовка над ней нет: раздел
   назван так же, повторять название под названием незачем.

   Дублирующего списка целей под картой тоже нет: карта их и показывает, а на
   экране «Цели» они лежат целиком. */
function vAnalytics(){
  // Пусто здесь тогда, когда нет целей: без них рисовать нечего — останется
  // один ствол. Задачи без цели на карту не попадают, и считать их незачем.
  if (!S.goals.length){
    return blank(NAV_ICONS.analytics, 'Карта пока пустая',
      'Заведи цель и разбей её на этапы — здесь вырастет дерево: от цели к этапам, от этапов к задачам.',
      'go', 'К целям', ' data-view="goals"');
  }

  return vMindMap();
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

  /* На телефоне карта односторонняя.

     Симметричная раскладка — ствол в середине, цели веером в обе стороны —
     даёт полотно 1400 на 350: соотношение четыре к одному. Экран телефона
     ровно наоборот, 375 на 800, и такая карта вписывается в него полоской
     высотой в палец, где от подписей остаются точки.

     Односторонняя вдвое уже и вдвое выше: те же цели, но столбиком, и ствол
     слева. Соотношение становится ближе к экрану, масштаб вырастает примерно в
     полтора раза — структура видна без прокрутки, а подробности по-прежнему
     достаются увеличением.

     На широком экране остаётся симметричная: там места хватает, и веер в обе
     стороны читается лучше столбца. */
  var oneSided = window.innerWidth < 760;

  var left = [], right = [];
  if (oneSided){
    right = S.goals.slice();
  } else {
    for (var i = 0; i < S.goals.length; i++) (i % 2 === 0 ? left : right).push(S.goals[i]);
  }

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
  var width = oneSided ? halfWidth + MM.coreR + 24 : halfWidth * 2;
  var cx = oneSided ? MM.coreR + 20 : width / 2;
  var cy = height / 2;

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
    // На телефоне пол ниже: развернув карту на весь экран, человек просит
    // общий вид, а не крупные подписи.
    var floorFull = window.innerWidth < 760 ? 0.34 : 0.9;
    var scale = Math.max(floorFull, Math.min(2.2, fitFull)) * zoom;
    svg.setAttribute('width', Math.max(60, Math.round(vw * scale)));
    svg.setAttribute('height', Math.round(vh * scale));
    wrap.scrollLeft = Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2);
    wrap.scrollTop = Math.max(0, (wrap.scrollHeight - wrap.clientHeight) / 2);
    return;
  }

  /* На телефоне карта вписывается целиком, как в приложении.

     Раньше здесь стоял пол читаемости 0.9: карта не сжималась мельче, а
     переставала влезать и превращалась в полоску, которую надо таскать пальцем.
     На широком экране это правильно — там места хватает и подписи важнее. На
     телефоне нет: человек открывает карту, чтобы увидеть **всю** структуру
     целей, а не читать один узел через прокрутку. Приложение поступает так же —
     его нижний предел масштаба 0.2, и общий вид оно предпочитает крупным
     буквам.

     Разглядеть подробности можно кнопкой «+» и перетаскиванием: увеличение —
     осознанное действие, в отличие от прокрутки, которую никто не просил. */
  var narrow = window.innerWidth < 760;
  var frameHeight = wrap.clientHeight - 24;
  var fit = Math.min(available / vw, frameHeight / vh);

  var base;
  if (narrow){
    // Честная подгонка по обеим сторонам, но не мельче того, при чём ещё видно,
    // что это карта, а не сетка точек.
    base = Math.max(0.34, Math.min(1, fit));
  } else {
    // Вписывать по ширине можно только до предела читаемости. Ужать карту в
    // полоску высотой девяносто пикселей — это зеркало той же баги, что была в
    // приложении: там подписи резались, здесь превращались бы в многоточия.
    var readable = Math.max(0.9, Math.min(1, 340 / vh));
    base = Math.max(readable, Math.min(1, available / vw));
  }

  var drawnW = Math.max(60, Math.round(vw * base * zoom));
  var drawnH = Math.round(vh * base * zoom);
  svg.setAttribute('width', drawnW);
  svg.setAttribute('height', drawnH);

  /* Рамка на телефоне подгоняется под карту, а не наоборот.

     Ширина экрана — жёсткий предел, поэтому карта редко занимает всю высоту
     рамки: при фиксированных 460 пикселях под ней оставалась пустая половина,
     и раздел выглядел недоделанным. Теперь рамка ровно по карте, но не выше
     62% экрана — дальше начинается прокрутка внутри неё. */
  if (narrow && !(S.mm && S.mm.full)){
    var limit = Math.round(window.innerHeight * 0.62);
    wrap.style.height = Math.min(limit, drawnH + 24) + 'px';
  } else {
    wrap.style.height = '';
  }

  /* Куда смотреть при открытии. На широком экране — в центр: ствол и обе
     колонки. На телефоне карта односторонняя, и центр там — середина ветвей;
     начинать надо от ствола, то есть от левого края. */
  wrap.scrollLeft = narrow ? 0 : Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2);
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
  var html = '';
  if (!S.lists.length){
    return html + blank(NAV_ICONS.lists, 'Списков пока нет',
      'Список — это то, что отмечают галочками и не тащат в задачи: покупки, сборы, чек-лист поездки.',
      'new-list', 'Новый список');
  }
  html += '<div class="acts" style="margin:0 0 16px"><button class="btn" data-act="new-list">+ Новый список</button></div>';
  for (var i = 0; i < S.lists.length; i++){
    var l = S.lists[i];
    var d = l.items.filter(function(x){ return x.done; }).length;
    // Не одна большая кнопка, а карточка с кнопкой внутри: переименовать и
    // удалить теперь можно прямо отсюда, не заходя внутрь. Кнопку в кнопку
    // браузер не пускает, поэтому обёртка — обычный article.
    html += '<article class="card row-card' + (touchUI() ? ' swipe' : '') + '" data-list="' + l.id + '">' +
      '<button class="main' + (touchUI() ? ' swipe-face' : '') + '" data-act="open-list" data-list="' + l.id + '">' +
        '<h3>' + esc(l.title) + '</h3>' +
        '<p class="sub">Готово ' + d + ' из ' + l.items.length + '</p>' +
        '<div style="margin-top:12px"><div class="bar slim"><i style="width:' + pct(d, l.items.length) + '%"></i></div></div>' +
      '</button>' +
      '<div class="side">' +
        '<button data-act="rename-list" data-list="' + l.id + '" aria-label="Переименовать список" title="Переименовать">' + ICON.edit + '</button>' +
        '<button class="kill" data-act="kill-list" data-list="' + l.id + '" aria-label="Удалить список">' + ICON.kill + '</button>' +
      '</div>' +
    '</article>';
  }
  return html;
}

function vList(){
  var l = findList(S.activeList);
  if (!l) return head('', 'Список не найден', 'lists') +
    blank(NAV_ICONS.lists, 'Похоже, он уже был удалён', 'Вернись к спискам.', 'go', 'Списки', ' data-view="lists"');

  var html = head('', l.title, 'lists');
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
  var html = '';
  if (!S.notes.length){
    return html + blank(NAV_ICONS.notes, 'Заметок пока нет',
      'Сюда складывают то, что не задача: итоги встречи, мысль, список вопросов.',
      'new-note', 'Новая запись');
  }
  html += '<div class="acts" style="margin:0 0 16px"><button class="btn" data-act="new-note">+ Новая запись</button></div>';
  for (var i = 0; i < S.notes.length; i++){
    var n = S.notes[i];
    html += '<article class="card row-card' + (touchUI() ? ' swipe' : '') + '" data-note="' + n.id + '">' +
      '<button class="main' + (touchUI() ? ' swipe-face' : '') + '" data-act="open-note" data-note="' + n.id + '">' +
        '<h3>' + esc(n.title) + '</h3>' +
        '<p class="sub">' + esc(n.body ? n.body.slice(0, 120) : 'Пустая запись') + '</p>' +
      '</button>' +
      '<div class="side">' +
        '<button data-act="rename-note" data-note="' + n.id + '" aria-label="Переименовать запись" title="Переименовать">' + ICON.edit + '</button>' +
        '<button class="kill" data-act="kill-note" data-note="' + n.id + '" aria-label="Удалить запись">' + ICON.kill + '</button>' +
      '</div>' +
    '</article>';
  }
  return html;
}

function vNote(){
  var n = findNote(S.activeNote);
  if (!n) return head('', 'Заметка не найдена', 'notes') +
    blank(NAV_ICONS.notes, 'Похоже, она уже была удалена', 'Вернись к заметкам.', 'go', 'Заметки', ' data-view="notes"');

  /* Поле во всю карточку, без пояснений и кнопок.

     Было три лишних вещи разом. Карточка внутри карточки — поле со своей
     рамкой внутри блока со своей: две рамки на пустом месте и двойное поле по
     краям, а пишут в заметке длинный текст, и место там дороже всего.
     Пояснение «сохраняется по мере набора» — правда, но человек читает её
     один раз, а занимает она строку всегда. Кнопка «Удалить запись» под
     текстом: удаление живёт в списке записей на свайпе, и держать его ещё и
     здесь, где на него можно ткнуть промахнувшись мимо текста, незачем. */
  if (!touchUI()){
    return head('', n.title, 'notes') +
      '<section class="card">' +
        '<textarea class="note-field" data-notebody="' + n.id + '" placeholder="Текст записи" rows="1">' + esc(n.body) + '</textarea>' +
        '<p class="hint">Сохраняется по мере набора — заметка, которую надо не забыть сохранить, это заметка, которую теряют.</p>' +
        '<div class="acts"><button class="btn sm soft" data-act="kill-note" data-note="' + n.id + '">Удалить запись</button></div>' +
      '</section>';
  }
  return head('', n.title, 'notes') +
    '<textarea class="note-field solo" data-notebody="' + n.id + '" ' +
      'placeholder="Текст записи" rows="1">' + esc(n.body) + '</textarea>';
}

/* ---- помодоро ---- */

var POMO = [
  { id: 'focus', title: 'Фокус', key: 'focus' },
  { id: 'shortBreak', title: 'Перерыв', key: 'shortBreak' },
  { id: 'longBreak', title: 'Длинный', key: 'longBreak' }
];

/* Режимы на экране идут от короткого к длинному.

   Сортируем по фактической длительности, а не порядком в массиве: минуты
   настраиваются, и порядок, верный для 5–15–25 по умолчанию, перестал бы
   быть верным, как только человек поставит фокус на 20, а длинный перерыв
   на 30. Порядок в самом массиве оставлен как есть — на него завязан modeOf
   и сохранённое состояние. */
function pomoOrdered(){
  return POMO.slice().sort(function(a, b){
    return (S.pomodoro[a.key] || 0) - (S.pomodoro[b.key] || 0);
  });
}

/// Номер режима в том порядке, в каком он показан человеку. Замок и экран
/// обязаны считать одинаково, иначе открытым окажется не тот, что виден первым.
function порядковыйРежима(id){
  var список = pomoOrdered();
  for (var i = 0; i < список.length; i++) if (список[i].id === id) return i;
  return 0;
}

var ticker = null;
var remaining = null;

function modeOf(){
  for (var i = 0; i < POMO.length; i++) if (POMO[i].id === S.pomodoro.mode) return POMO[i];
  return POMO[0];
}

function vPomodoro(){
  var m = modeOf();
  if (remaining === null) remaining = S.pomodoro[m.key] * 60;

  var html = '';
  html += '<section class="card">' +
    '<div class="clock" id="clockface">' + mmss(remaining) + '</div>' +
    '<p class="phase">' + m.title + ' · ' + S.pomodoro[m.key] + ' мин</p>' +
    '<div class="modes">' + pomoOrdered().map(function(p){
      // Минуты прямо на карточке режима — ровно то, что чинили в приложении.
      /* Считаем по порядку НА ЭКРАНЕ, а не в массиве.

         Массив идёт «фокус, перерыв, длинный», экран — по возрастанию минут:
         5, 15, 25. Замок вешался по массиву, поэтому бесплатным оказывался
         «Фокус» на 25 минут, стоящий третьим, а первая карточка на экране была
         закрыта. Бесплатен первый из показанных — самый короткий. */
      var режимОткрыт = lookOpen('pomoModes', порядковыйРежима(p.id));
      return '<button class="mode' + (режимОткрыт ? '' : ' locked') + '" data-act="pomo-mode" data-mode="' + p.id + '" aria-pressed="' + (p.id === S.pomodoro.mode) + '">' +
        '<b>' + p.title + '</b><span>' + S.pomodoro[p.key] + ' мин</span></button>';
    }).join('') + '</div>' +
    '<div class="pomo-actions">' +
      '<button class="btn" data-act="pomo-toggle">' + (ticker ? 'Пауза' : 'Старт') + '</button>' +
      '<button class="btn soft" data-act="pomo-reset">Сброс</button>' +
    '</div>' +
  '</section>';

  html += '<div class="counts">' +
    cnt(S.pomodoro.goal ? S.pomodoro.doneToday + ' из ' + S.pomodoro.goal : String(S.pomodoro.doneToday),
      S.pomodoro.goal ? 'сессий к цели' : 'сессий сегодня') +
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

/* Syn называет среду как придётся: английским id из промпта («rain»), русским
   названием («дождь») или словом, которого у нас нет вовсе («waves»). Первые
   два находим, на третье честно отвечаем, что такой среды нет, — поэтому
   возвращается null, а не первая попавшаяся запись. */
var SOUND_ALIASES = { waves: 'surf', ocean: 'surf', sea: 'surf', water: 'stream',
  river: 'stream', fire: 'fireplace', thunder: 'storm', birds: 'forest', bell: 'bowl' };

function soundByAnyName(name){
  var needle = String(name || '').toLowerCase().trim();
  if (!needle) return null;
  if (SOUND_ALIASES[needle]) needle = SOUND_ALIASES[needle];
  for (var i = 0; i < SOUNDS.length; i++){
    if (SOUNDS[i].id === needle || SOUNDS[i].title.toLowerCase() === needle) return SOUNDS[i];
  }
  return null;
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

  var html = '';

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
    // Шесть готовых длительностей и своя рядом: сорок минут или семь никто
    // не подберёт из списка, а сеанс у каждого свой.
    var preset = [3, 5, 10, 15, 20, 30];
    var own = preset.indexOf(m.minutes) === -1;
    html += '<p class="lbl">Сколько</p><div class="radios med-mins">' +
      preset.map(function(min){
        return '<button class="radio" data-act="med-min" data-min="' + min + '" aria-pressed="' + (m.minutes === min) + '">' + min + ' мин</button>';
      }).join('') +
      '<span class="medown' + (own ? ' on' : '') + '">' +
        '<input class="inp" type="number" id="medown" min="1" max="180" inputmode="numeric" ' +
          'placeholder="своё" value="' + (own ? m.minutes : '') + '" aria-label="Своя длительность в минутах">' +
        '<span class="mu">мин</span>' +
      '</span>' +
    '</div>';

    // Нажатие на среду включает её тут же: звук выбирают ушами, а сравнивать
    // их, уходя куда-то и возвращаясь, невозможно.
    html += '<p class="lbl">Звук <span class="val">нажми, чтобы послушать</span></p>' +
      '<div class="soundgrid">' +
      SOUNDS.map(function(s){
        var on = sound.id === s.id;
        var playing = on && med.preview;
        var звукОткрыт = lookOpen('sounds', SOUNDS.indexOf(s));
        return '<button class="soundcard' + (on ? ' on' : '') + (playing ? ' playing' : '') +
          (звукОткрыт ? '' : ' locked') + '" ' +
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
  var html = head('', 'Профиль', 'settings');

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

  /* Вместо входа — прямой ответ на вопрос «а где мои записи». Он и был
     настоящей причиной, по которой люди искали здесь вход. */
  html += '<p class="lbl">Где записи</p><section class="card">' +
    '<h3>Только в этом браузере</h3>' +
    '<p class="sub">Входа нет и не нужно: задачи, цели, списки и заметки лежат здесь, на этом устройстве, и никуда не отправляются. Подписка включается кодом с сайта — он и опознаёт вас, если оплата есть.</p>' +
    '<div class="acts">' +
      '<button class="btn sm soft" data-act="go" data-view="settings-data">Сохранить копию</button>' +
    '</div>' +
  '</section>';

  /* Подписка в профиле — то, что человек ищет, когда спрашивает «а что у меня
     подключено»: тариф, срок и сам код, который может понадобиться на другом
     устройстве. Управление и отмена живут в «Моей подписке», сюда их не
     дублируем — одна и та же кнопка в двух местах читается как две разные. */
  html += '<p class="lbl">Подписка</p><section class="card">' +
    '<h3>' + (isPro() ? 'Synapse Pro' : 'Бесплатный доступ') + '</h3>' +
    '<p class="sub">' + (isPro()
      ? planTitle(S.pro.plan) + (S.pro.expiresAt ? ' · действует до ' + esc(humanDateTime(S.pro.expiresAt)) : '') +
        ' · открыты все разделы и ' + proSynLimit(S.pro.plan) + ' запросов к Syn в день'
      : FREE_LIMITS.goals + ' цели, ' + FREE_LIMITS.lists + ' списка, ' + FREE_LIMITS.notes +
        ' заметки, ' + FREE_SYN_LIMIT + ' запросов к Syn в день. Помодоро и медитация — ' +
        'по одному режиму и звуку.') + '</p>' +
    (isPro() && S.pro.code
      ? '<div class="sub-code"><span class="lbl">Код</span><b class="mono">' + esc(S.pro.code) + '</b>' +
        '<button class="btn sm soft" data-act="pro-copy">Скопировать</button></div>' +
        '<p class="hint">Тот же код включает Pro и на телефоне: телефон и браузер держатся отдельно и не гасят друг друга.</p>'
      : '') +
    '<div class="acts"><button class="btn sm soft" data-act="go" data-view="subscription">' +
      (isPro() ? 'Моя подписка' : 'Тарифы и подписка') + '</button>' +
      (isPro() ? '' : '<button class="btn sm soft" data-act="pro-code">Ввести код</button>') +
    '</div>' +
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

/// То же самое для блоков дня. Отличие одно: у секции класс называется
/// `closed`, а не `open`, — состояние инвертировано.
function foldGroup(group, wrap, open){
  if (!wrap){ group.classList.toggle('closed', !open); return; }
  var from = wrap.getBoundingClientRect().height;
  var to = open ? wrap.scrollHeight : 0;
  group.classList.toggle('closed', !open);
  wrap.style.height = from + 'px';
  void wrap.offsetHeight;
  wrap.style.height = to + 'px';
  clearTimeout(wrap._foldTimer);
  wrap._foldTimer = setTimeout(function(){
    wrap.style.height = open ? '' : '0px';
  }, 280);
}

/// Аватарка или первая буква имени, если фото не загружено.
function avatarHTML(size){
  var cls = 'avatar' + (size === 'lg' ? ' lg' : '');
  if (S.profile.avatar){
    /* Кавычки и проверка вида — на случай, если в поле окажется не наша
       картинка. Сегодня туда пишет только shrinkImage, но состояние лежит в
       localStorage, а его правит кто угодно с доступом к устройству: строка
       вида `)" onload=...` без этой проверки вырвалась бы из атрибута. */
    var src = String(S.profile.avatar);
    if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)){
      return '<span class="' + cls + '">' + esc(initials()) + '</span>';
    }
    return '<span class="' + cls + '" style="background-image:url(&quot;' + src + '&quot;)"></span>';
  }
  return '<span class="' + cls + '">' + esc(initials()) + '</span>';
}

/* ============ НАСТРОЙКИ ============ */

function vSettings(){
  var html = head('Приложение', 'Настройки');
  html += settingsLink('profile', 'Профиль', S.profile.name || 'Имя и фото') +
    settingsLink('settings-view', 'Вид', fontOf(S.font).title + ' · ' + paletteOf(S.palette).title) +
    settingsLink('settings-data', 'Данные', 'Копия файлом, примеры, стирание') +
    settingsLink('about', 'О сервисе', 'Что умеет веб-версия');
  return html;
}

function settingsLink(view, title, sub){
  return '<button class="setrow tall" data-act="go" data-view="' + view + '">' +
    '<span class="st"><b>' + esc(title) + '</b><i>' + esc(sub) + '</i></span>' +
    '<span class="arrow">' + NAV_ICONS.chevron + '</span></button>';
}

/* ---- вид ---- */

/* Шрифт и его размер перенесены из приложения: AppFontChoice (Rounded, Clean,
   Serif) и AppFontSizeChoice (0.88, 1.0, 1.16). Названия начертаний в
   приложении не переводятся — здесь тоже. */
var FONTS = [
  /* Свой шрифт стоит после системного, а не вместо него.

     Порядок здесь и есть вся правка. Раньше «Rounded» просил ui-rounded и
     SF Pro Rounded, а «Clean» — -apple-system и Segoe UI: на айфоне это два
     разных шрифта, на андроиде ни одного из них нет, и оба падали в Roboto.
     Кнопки жались, шрифт не менялся.

     Теперь после системных имён идёт свой: Manrope у скруглённого, Inter у
     чистого. Айфон по-прежнему берёт SF и выглядит как выглядел, андроид
     доходит до нашего файла и получает настоящую разницу. */
  { id: 'rounded', title: 'Rounded', css: 'ui-rounded,"SF Pro Rounded",Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' },
  { id: 'clean',   title: 'Clean',   css: '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,system-ui,sans-serif' },
  { id: 'serif',   title: 'Serif',   css: 'ui-serif,Georgia,"Times New Roman","Noto Serif",serif' }
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

/* Каждая настройка — своя карточка с названием и одной строкой объяснения.

   До этого экран был плоским списком: подпись мелкими буквами, ряд кнопок,
   снова подпись, снова ряд. Пять таких пар подряд сливались в одно полотно —
   не было видно, где кончается одна настройка и начинается другая, а превью в
   конце вообще прилипало к последнему ряду и читалось как его часть.

   Объяснения короткие и по делу: не «выберите тему», а что именно поменяется.
   Шрифт и размер собраны в одну карточку «Текст»: их выбирают вместе и смотрят
   на один и тот же результат. */
function settingsBlock(title, note, body, wide){
  return '<section class="card setblock' + (wide ? ' wide' : '') + '">' +
    '<div class="setblock-h">' +
      '<h3>' + esc(title) + '</h3>' +
      (note ? '<p class="sub">' + esc(note) + '</p>' : '') +
    '</div>' + body +
  '</section>';
}

/* cols — сколько кнопок в ряду.

   Раньше кнопки просто переносились по мере заполнения строки, и ряд
   получался рваным: «Rounded» шире «Clean», «Треугольник» шире «Круг», и
   каждая строка кончалась в своём месте. Сетка с равными колонками делает
   их одинаковыми, а число колонок подбирается под содержимое блока. */
function settingsRow(label, body, cols){
  return '<div class="subrow">' +
    (label ? '<span class="subrow-l">' + esc(label) + '</span>' : '') +
    '<div class="radios"' + (cols ? ' style="--cols:' + cols + '"' : '') + '>' + body + '</div>' +
  '</div>';
}

/// Строка «название — переключатель». Своего компонента для этого не было:
/// в настройках до сих пор были только наборы кнопок-радио.
function строкаПереключателя(название, действие, включено, пояснение){
  return '<button class="switchrow" data-act="' + действие + '" aria-pressed="' + !!включено + '">' +
    '<span class="sw-text"><b>' + esc(название) + '</b>' +
      (пояснение ? '<i>' + esc(пояснение) + '</i>' : '') + '</span>' +
    '<span class="sw-knob" aria-hidden="true"></span>' +
  '</button>';
}

function vSettingsView(){
  // Ни «Настройки», ни «Вид» тут не нужны: человек пришёл нажатием на
  // «Вид», кнопка «Назад» говорит откуда, а два заголовка съедали верх
  // экрана ради того, что и так известно.
  var html = head('', '', 'settings');

  /* Превью стоит первым, а не последним.

     Внизу его не было видно: меняешь палитру наверху — а результат за краем
     экрана, и приходится листать туда-обратно после каждого нажатия. Теперь
     карточка прямо под шапкой: любое изменение видно, не сходя с места. */
  /* Напоминания — только в приложении: в браузере их показывать нечем, и
     переключатель, который ничего не делает, хуже его отсутствия. */
  if (уведомленияДоступны()){
    var н = S.notify;
    html += '<p class="lbl">Напоминания</p><section class="card">' +
      строкаПереключателя('Напоминать', 'notify-on', н.on,
        'Задачи со временем, сроки целей, план утром и итог вечером.') +
      (н.on
        ? строкаПереключателя('О задачах со временем', 'notify-tasks', н.tasks, '') +
          строкаПереключателя('О сроках целей', 'notify-goals', н.goals, 'Накануне дня цели.') +
          строкаПереключателя('План и итог дня', 'notify-brief', н.brief, '') +
          (н.brief
            ? '<div class="rowadd" style="margin-top:10px">' +
                '<label class="hint" style="flex:1">Утром' +
                  '<input class="inp" type="time" value="' + esc(н.morning) + '" data-notify-time="morning"></label>' +
                '<label class="hint" style="flex:1">Вечером' +
                  '<input class="inp" type="time" value="' + esc(н.evening) + '" data-notify-time="evening"></label>' +
              '</div>'
            : '')
        : '') +
    '</section>';
  }

  html += '<div class="preview-dock">' +
    '<p class="lbl">Как это выглядит</p>' +
    '<section class="card preview">' +
      '<div class="preview-task">' +
        '<span class="box on" data-shape="' + (S.box || 'square') + '">✓</span>' +
        '<div>' +
          '<h3>Собрать материалы</h3>' +
          '<div class="chips" style="margin-top:8px">' +
            '<span class="chip">Сегодня</span><span class="chip">09:00</span>' +
            '<span class="chip goal">Выучить английский</span></div>' +
        '</div>' +
      '</div>' +
    '</section>' +
  '</div>';

  html += '<div class="setgrid">';


  html += settingsBlock('Тема', isDarkNow() ? 'Сейчас тёмная.' : 'Сейчас светлая.',
    settingsRow('', [['light', 'Светлая'], ['dark', 'Тёмная']].map(function(p){
      return '<button class="radio" data-act="set-theme" data-theme="' + p[0] + '" aria-pressed="' + (S.theme === p[0]) + '">' + p[1] + '</button>';
    }).join(''), 2));

  // Начертание выбирают глазами, поэтому каждая кнопка набрана своим шрифтом.
  html += settingsBlock('Текст', 'Начертание и размер — во всём сервисе сразу.',
    settingsRow('Начертание', FONTS.map(function(f){
      return '<button class="radio" data-act="set-font" data-font="' + f.id + '" aria-pressed="' + (S.font === f.id) + '" ' +
        'style="font-family:' + f.css + '">' + f.title + '</button>';
    }).join(''), 3) +
    settingsRow('Размер', FONT_SIZES.map(function(z){
      return '<button class="radio" data-act="set-fontsize" data-size="' + z.id + '" aria-pressed="' + (S.fontSize === z.id) + '">' + z.title + '</button>';
    }).join(''), 3));

  // Те же десять палитр, что в приложении, — из AppTheme.swift. Кружок — фон
  // палитры, точка внутри — её акцент, оба в текущей теме: без этого «Бордо»
  // от «Индиго» отличить можно было только применив.
  html += settingsBlock('Палитра · ' + paletteOf(S.palette).title,
    'Цвет фона и акцента. В кружке — фон, точкой внутри — акцент.',
    settingsRow('', PALETTES.map(function(p){
      var dark = isDarkNow();
      var bg = paletteColor(p, dark ? 'darkBackground' : 'lightBackground');
      var ac = paletteColor(p, dark ? 'accentDark' : 'accent');
      var открыта = lookOpen('palettes', PALETTES.indexOf(p));
      return '<button class="radio pal' + (открыта ? '' : ' locked') + '" data-act="set-palette" data-palette="' + p.id + '" aria-pressed="' + (S.palette === p.id) + '">' +
        '<span class="sw" style="background:' + rgb(bg) + '"><i style="background:' + rgb(ac) + '"></i></span>' +
        '<span class="rl">' + esc(p.title) + '</span></button>';
    }).join(''), 2));

  // Отметку показываем прямо на кнопке выбора — заполненной, чтобы было
  // видно, как она будет выглядеть у закрытой задачи.
  // Отметку показываем прямо на кнопке выбора — заполненной и в выбранном
  // цвете, чтобы было видно, как она будет выглядеть у закрытой задачи.
  var markNow = markColorOf(S.markColor).css;
  var markStyle = markNow ? ' style="background:' + markNow + '; border-color:' + markNow + '"' : '';

  html += settingsBlock('Отметка выполнения', 'Форма галочки у закрытой задачи.',
    settingsRow('', BOXES.map(function(b){
      var формаОткрыта = lookOpen('boxes', BOXES.indexOf(b));
      return '<button class="radio boxpick' + (формаОткрыта ? '' : ' locked') + '" data-act="set-box" data-box="' + b.id + '" aria-pressed="' + (S.box === b.id) + '" ' +
        'title="' + esc(b.title) + '" aria-label="' + esc(b.title) + '">' +
        '<span class="box on" data-shape="' + b.id + '"' + markStyle + '>' + ICON.check + '</span>' +
        '<span class="rl">' + esc(b.title) + '</span></button>';
    }).join(''), 6) +
    settingsRow('Цвет', MARK_COLORS.map(function(c){
      // Кружок цвета в кнопке: выбирают глазом, а не по названию.
      var круг = c.css
        ? '<span class="msw" style="background:' + c.css + '"></span>'
        : '<span class="msw" style="background:var(--ok)"></span>';
      var цветОткрыт = isPro() || c.id === 'default';
      return '<button class="radio markpick' + (цветОткрыт ? '' : ' locked') + '" data-act="set-mark-color" data-color="' + c.id + '" ' +
        'aria-pressed="' + ((S.markColor || 'default') === c.id) + '" ' +
        'title="' + esc(c.title) + '" aria-label="Цвет отметки: ' + esc(c.title) + '">' +
        круг + '<span class="rl">' + esc(c.title) + '</span></button>';
    }).join(''), 6), true);

  html += '</div>';

  return html;
}

/* ---- данные ---- */

function vSettingsData(){
  var html = head('', '', 'settings');

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
    '<button class="setrow" data-act="reset-demo"><span>Заполнить примерами</span><span class="arrow">' + NAV_ICONS.chevron + '</span></button>' +
    '<button class="setrow" data-act="wipe"><span>Стереть всё в этом браузере</span><span class="arrow">' + NAV_ICONS.chevron + '</span></button>';

  html += '<section class="card" style="margin-top:14px">' +
    '<h3>Где лежат данные</h3>' +
    '<p class="sub">Только в этом браузере, на этом устройстве. Копии на сервере нет: очистка данных сайта или режим инкогнито удалят задачи, цели и заметки безвозвратно.</p>' +
  '</section>';

  return html;
}

/* ---- о сервисе ---- */

function vAbout(){
  var html = head('', 'О сервисе', 'settings');

  /* Экран отвечает на два вопроса подряд, каждый своей карточкой: что это и
     где лежат мои записи. Раньше второй ответ стоял в «Данных», а сюда человек
     приходил именно с ним.

     Список «чего пока нет» отсюда убран решением владельца: витрина сервиса —
     не место для перечня недоделок. То, что записи не покидают браузер,
     сказано ниже как свойство, а не как нехватка. */
  html += '<section class="card about-lead">' +
    '<img class="about-mark" src="icons/icon-192.png" alt="" width="56" height="56">' +
    '<div>' +
      '<h3>Synapse в браузере</h3>' +
      '<p class="sub">Большая цель разбирается на этапы, этапы — на задачи, которые можно сделать сегодня. Планирование, цели, списки, заметки, помодоро и медитация работают прямо здесь, без установки.</p>' +
    '</div>' +
  '</section>';

  html += '<p class="lbl">Что умеет</p><section class="card"><div class="lines">' +
    [['Задачи', 'блоки дня, подзадачи, повторы, сроки'],
     ['Цели', 'этапы, прогресс и задачи под ними'],
     ['Карта целей', 'дерево от цели к этапам и задачам'],
     ['Ассистент Syn', 'голосом и текстом, ' + FREE_SYN_LIMIT + ' запросов в день бесплатно'],
     ['Брифинг', 'разбор дня от Syn на экране «Аналитика»'],
     ['Помодоро и медитация', 'бесплатно, без ограничений']].map(function(pair){
      return '<div class="line"><span>' + esc(pair[0]) + '</span>' +
        '<span class="line-note">' + esc(pair[1]) + '</span></div>';
    }).join('') + '</div></section>';

  html += '<p class="lbl">Где лежат записи</p><section class="card">' +
    '<p class="sub">Только в этом браузере, на этом устройстве. Копии на сервере нет: очистка данных сайта или режим инкогнито удалят их безвозвратно. Копию можно сохранить файлом в разделе «Данные».</p>' +
    '<p class="hint">К Syn уходит срез задач и целей — иначе он не знает, о чём его спрашивают. Сам срез не сохраняется, а вот разговор с ассистентом и его память лежат на сервере: без них он не помнил бы сказанное раньше. Стереть их можно в настройках.</p>' +
  '</section>';

  // Права на записи не заявлены, но людей, которые вышли в поле с
  // микрофоном, назвать надо.
  html += '<p class="lbl">Звуки медитации</p><section class="card">' +
    '<p class="sub">Полевые записи под Public Domain Mark 1.0 — авторские права не заявлены. Собраны с archive.org (проект radio aporee ::: maps) и Викисклада, нарезаны в петли по полторы минуты.</p>' +
    '<div class="lines" style="margin-top:12px">' +
      SOUNDS.filter(function(s){ return s.by; }).map(function(s){
        return '<div class="line"><span>' + esc(s.title) + '</span>' +
          '<span class="line-note">' + esc(s.by) + '</span></div>';
      }).join('') +
    '</div>' +
  '</section>';

  html += '<p class="lbl">Документы и помощь</p>' +
    '<a class="setrow" href="../"><span>Сайт Synapse</span><span class="arrow">' + NAV_ICONS.chevron + '</span></a>' +
    '<a class="setrow" href="../support/"><span>Поддержка</span><span class="arrow">' + NAV_ICONS.chevron + '</span></a>' +
    '<a class="setrow" href="../privacy/"><span>Политика конфиденциальности</span><span class="arrow">' + NAV_ICONS.chevron + '</span></a>' +
    '<a class="setrow" href="../terms/"><span>Пользовательское соглашение</span><span class="arrow">' + NAV_ICONS.chevron + '</span></a>' +
    '<a class="setrow" href="../offer/"><span>Публичная оферта</span><span class="arrow">' + NAV_ICONS.chevron + '</span></a>' +
    '<a class="setrow" href="../requisites/"><span>Реквизиты</span><span class="arrow">' + NAV_ICONS.chevron + '</span></a>';

  return html;
}

/* ============ ЛИЧНОСТЬ ============ */

/* Входа в веб-версии нет, и это решение, а не недоделка.

   Он тут стоял заглушкой: почта, код из шести цифр, показанный на том же
   экране, проверка в браузере. Заглушка оказалась хуже отсутствия — человек
   жал «Войти», вводил почту и узнавал, что сервис ненастоящий. Доверие она
   тратила, а не копила.

   Разобрались, кому и зачем здесь вообще нужна личность:

   — планировщику не нужна: записи лежат в этом браузере и никуда не уходят;
   — подписке уже есть чем опознать человека — код с сайта: сервер связывает
     установку браузера с оплаченным аккаунтом, и это работает;
   — суточной норме Syn личность нужна, и вот здесь дыра: очистив данные сайта,
     человек получает новую установку и новые шесть запросов. Закрыть это может
     только настоящий аккаунт, и это единственная причина, по которой его
     когда-нибудь стоит завести.

   Пока такой причины не набралось на отдельный сервер почты — входа нет. */

/* ============ МОЯ ПОДПИСКА ============ */

/* Раздел отвечает на два вопроса сразу: что у меня сейчас и что можно
   получить. Раньше они жили в разных местах — состояние подписки на сайте,
   цены на другой странице, — и человеку приходилось держать в голове, где
   что. Здесь это один экран в меню.

   Шапки с надписью «Тарифы» нет: раздел уже назван в меню, а карточка
   состояния говорит о себе сама. Две строки заголовка съедали первый экран
   телефона, ничего к нему не добавляя. */

/* Те же три тарифа и те же цены, что на странице оплаты. Ключи совпадают с
   PLANS в checkout/index.html — они уезжают в ссылку параметром plan, и
   страница открывается с уже выбранным тарифом. */
var PLANS = [
  { id: 'pro.weekly',  title: 'Неделя', price: '149 ₽',   note: 'Попробовать без длинного обязательства.' },
  { id: 'pro.monthly', title: 'Месяц',  price: '590 ₽',   note: 'Основной тариф.', main: true },
  { id: 'pro.yearly',  title: 'Год',    price: '4 990 ₽', note: 'Примерно 416 ₽ в месяц.', tag: 'выгодно' }
];

function planTitle(id){
  for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === id) return PLANS[i].title;
  return id;
}

function vSubscription(){
  var pro = isPro();
  var html = '';

  /* Состояние — первым, до цен. Человек, который уже платит, приходит сюда
     посмотреть срок и код, а не выбирать тариф заново. */
  html += '<section class="card sub-state' + (pro ? ' on' : '') + '">' +
    '<div class="sub-head">' +
      '<span class="sub-mark" aria-hidden="true">' + (pro ? ICON.pro : ICON.lock) + '</span>' +
      '<div>' +
        '<h3>' + (pro ? 'Synapse Pro' : 'Бесплатный доступ') + '</h3>' +
        '<p class="sub">' + (pro
          ? planTitle(S.pro.plan) + (S.pro.expiresAt ? ' · до ' + esc(humanDateTime(S.pro.expiresAt)) : '') +
            ' · открыты все разделы'
          : 'Задачи без ограничений. Дальше: ' + FREE_LIMITS.goals + ' цели, ' +
            FREE_LIMITS.lists + ' списка, ' + FREE_LIMITS.notes + ' заметки, ' +
            'по одному режиму помодоро и звуку медитации.') + '</p>' +
      '</div>' +
    '</div>' +
    (pro && S.pro.code ? '<div class="sub-code"><span class="lbl">Код подписки</span>' +
      '<b class="mono">' + esc(S.pro.code) + '</b>' +
      '<button class="btn sm soft" data-act="pro-copy">Скопировать</button></div>' : '') +
    '<div class="acts">' +
      (pro
        ? '<button class="btn sm soft" data-act="pro-refresh">Проверить</button>' +
          '<a class="btn sm soft" href="../account/">Управление и отмена</a>' +
          '<button class="btn sm soft" data-act="pro-forget">Отвязать</button>'
        : '<button class="btn sm" data-act="pro-code">У меня есть код</button>') +
    '</div>' +
  '</section>';

  if (!pro){
    html += '<p class="lbl">Тарифы</p>' +
      '<div class="plancards">' +
        PLANS.map(function(plan){
          return '<a class="plancard' + (plan.main ? ' main' : '') + '" href="../checkout/?plan=' + plan.id + '">' +
            (plan.tag ? '<span class="plantag">' + esc(plan.tag) + '</span>' : '') +
            '<b class="planname">' + esc(plan.title) + '</b>' +
            '<span class="planprice">' + esc(plan.price) + '</span>' +
            '<span class="plannote">' + esc(plan.note) + '</span>' +
            '<span class="planbuy">Оформить</span>' +
          '</a>';
        }).join('') +
      '</div>' +
      '<p class="hint">Оплата проходит на сайте, после неё придёт код. Он включает Pro и здесь, и на телефоне.</p>';
  }

  html += '<p class="lbl">Что входит</p>' +
    '<section class="card"><div class="plan-table">' +
      planRow('Задачи, блоки дня, повторы', 'без ограничений', 'без ограничений') +
      planRow('Цели с этапами', FREE_LIMITS.goals + ' цели', 'без ограничений') +
      planRow('Списки', FREE_LIMITS.lists + ' списка', 'без ограничений') +
      planRow('Заметки', FREE_LIMITS.notes + ' заметки', 'без ограничений') +
      planRow('Ассистент Syn', FREE_SYN_LIMIT + ' запросов в день',
        PLAN_SYN_LIMITS['pro.monthly'] + ' в день, на годовом ' + PLAN_SYN_LIMITS['pro.yearly']) +
      /* Раньше здесь стояло «есть / есть» — с тех пор оформление и наборы
         закрыли подпиской, а таблица осталась прежней и обещала лишнее. */
      planRow('Метод Помодоро', 'самый короткий режим', 'все режимы') +
      planRow('Медитация', 'один звук', 'все звуки и своя длительность') +
      planRow('Оформление', FREE_LOOKS.palettes + ' темы, одна форма отметки', 'все темы, формы и цвета') +
      planRow('Мои финансы', 'по две записи каждого вида', 'без ограничений') +
    '</div></section>';

  html += '<p class="lbl">Как это работает</p><section class="card">' +
    '<p class="sub">Один код открывает Pro и в браузере, и на телефоне. Записи при этом не общие: веб хранит их в браузере, приложение у себя, а перенести можно файлом в разделе «Данные».</p>' +
  '</section>';

  return html;
}

function planRow(title, free, pro){
  return '<div class="plan-row">' +
    '<span class="plan-what">' + esc(title) + '</span>' +
    '<span class="plan-free' + (free === '—' ? ' off' : '') + '">' + esc(free) + '</span>' +
    '<span class="plan-pro">' + esc(pro) + '</span>' +
  '</div>';
}

/// Дата со сроком подписки приходит с сервера в ISO с временем.
/* Сколько осталось до даты, словами. «Через 12 дней» человек понимает сразу, а
   «15 сентября» требует посчитать — и обычно не считают. */
function untilText(iso){
  var days = dayDiff(isoOf(todayDate()), iso);
  if (days === null) return '';
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days < 0){
    var late = -days;
    return 'прошло ' + late + ' ' + plural(late, 'день', 'дня', 'дней');
  }
  if (days < 31) return 'через ' + days + ' ' + plural(days, 'день', 'дня', 'дней');
  var months = Math.round(days / 30);
  return 'через ' + months + ' ' + plural(months, 'месяц', 'месяца', 'месяцев');
}

/// Класс для даты, которая близко или уже прошла.
function dueSoonClass(iso){
  var days = dayDiff(isoOf(todayDate()), iso);
  if (days === null) return '';
  if (days < 0) return ' late';
  if (days <= 7) return ' soon';
  return '';
}

function humanDateTime(iso){
  var date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.getDate() + ' ' + MONTH_NAMES[date.getMonth()] + ' ' + date.getFullYear();
}

/* Экран под замком. Не пустая страница с ценой, а рассказ о том, что здесь
   лежит: человек должен понимать, что покупает, ещё не купив. */
function vLocked(view){
  var html = head('Synapse', PRO_ONLY[view]);
  // Текст под замком — про то, что человек получит, а не про то, чего он
  // лишён: экран открывается ровно в ту секунду, когда упёрлись, и должен
  // отвечать «вот что там», а не «заплати».
  var ABOUT = {
    pomodoro: 'Таймер на 25 минут работы и 5 минут перерыва, счёт пройденных кругов за день и свои длительности, если стандартные не подходят.',
    meditation: 'Двенадцать полевых записей — дождь, прибой, лес, гроза, — круг, который заполняется по ходу сеанса, и счёт минут за всё время.',
    finance: 'Траты одной строкой — «кофе 350», категория подставится сама. Долги в обе стороны с возвратом по частям. Копилки со сроком и расчётом, сколько откладывать в месяц. Подписки с датой следующего списания и годовой суммой.'
  };
  var about = ABOUT[view] || ABOUT.meditation;

  html += '<section class="card locked-card">' +
    '<span class="locked-mark" aria-hidden="true">' + ICON.lock + '</span>' +
    '<h3>' + esc(PRO_ONLY[view]) + ' — в подписке</h3>' +
    '<p class="sub">' + about + '</p>' +
    '<div class="acts">' +
      '<button class="btn sm" data-act="go" data-view="subscription">Что даёт подписка</button>' +
      '<button class="btn sm soft" data-act="pro-code">Ввести код</button>' +
    '</div>' +
  '</section>';

  html += '<p class="hint" style="margin-top:14px">Задачи, цели, списки и заметки остаются бесплатными.</p>';
  return html;
}

/* ============ АССИСТЕНТ SYN ============ */

/* Тот же сервер и тот же маршрут, что у приложения: POST /v1/synapse/reply.
   Разница одна — как выдаётся сессия. Приложение доказывает через App Attest,
   что запрос идёт с настоящего iPhone; в браузере такого механизма нет,
   поэтому у веба свой вход: POST /v1/synapse/session/web, ограниченный по IP
   и включаемый флагом на сервере.

   Ответ приходит в виде {reply, actions}. Reply показываем словами, actions
   применяем к состоянию — ровно то, что в приложении делает WorkspaceStore. */

/* Суточная квота. Считает её сервер — здесь эти числа нужны только для того,
   чтобы называть их вслух до первого запроса, а не после отказа. Сервер
   присылает свои в ответе, и они всегда главнее написанного тут. */
var FREE_SYN_LIMIT = 6;
/* Норма подписчика зависит от тарифа, и цифры здесь должны совпадать с
   PLAN_DAILY_AI_REQUESTS на сервере: считает он, а показываем мы. Разойдутся —
   человек увидит одно число, а упрётся в другое. */
var PLAN_SYN_LIMITS = { 'pro.weekly': 50, 'pro.monthly': 50, 'pro.yearly': 100 };
/// Норма для неизвестного тарифа: старая запись без поля plan.
var PRO_SYN_LIMIT = 50;

function proSynLimit(plan){
  return PLAN_SYN_LIMITS[plan] || PRO_SYN_LIMIT;
}

var SYN = {
  base: (function(){
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
      return 'http://localhost:8787';
    }
    return 'https://api.synapseapp.ru';
  })(),
  token: '',
  expiresAt: 0,
  busy: false,
  // Последнее, что сказал сервер про остаток на сегодня: {used, limit}.
  quota: null
};

/// Install id браузера. Живёт рядом с задачами: пропал он — пропали и они,
/// так что отдельного смысла беречь его нет.
function synInstallID(){
  if (!S.installID){
    S.installID = 'b' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    save();
  }
  return S.installID;
}

/// Тот же идентификатор, каким его знает сервер: приставку он ставит сам, и
/// подписка с квотой считаются именно по ней.
function webInstallID(){
  var id = synInstallID();
  return id.indexOf('web-') === 0 ? id : 'web-' + id;
}

function synFetch(path, body, token){
  var headers = { 'Content-Type': 'application/json' };
  if (token){
    headers.Authorization = 'Bearer ' + token;
    headers['X-Synapse-Install-ID'] = webInstallID();
  }
  return fetch(SYN.base + path, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  }).then(function(response){
    return response.json().catch(function(){ return {}; }).then(function(data){
      if (!response.ok){
        var error = new Error(data.error || ('Сервер ответил ' + response.status));
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    });
  });
}

/// Сессия берётся один раз и живёт до истечения срока.
function synSession(){
  var now = Date.now();
  if (SYN.token && SYN.expiresAt - 60000 > now) return Promise.resolve(SYN.token);
  return synFetch('/v1/synapse/session/web', { installID: synInstallID() }).then(function(data){
    SYN.token = data.token;
    SYN.expiresAt = Date.parse(data.expiresAt) || (now + 3600000);
    return SYN.token;
  });
}

/* Срез рабочего пространства для Syn. Отдаём то же, что приложение: без
   контекста он не знает, какую задачу переносить, и отвечает вслепую. */
function synWorkspace(){
  return {
    userID: synInstallID(),
    // Дату и время сервер берёт отсюда: без них «перенеси на завтра» и «в
    // девять утра» считаются по часам сервера, а он в Москве и не обязан
    // совпадать с человеком.
    localDate: isoOf(todayDate()),
    localTime: clock(new Date().getHours(), new Date().getMinutes()),
    currentScreen: (VIEWS[S.view] || VIEWS.tasks).title,
    tasks: liveTasks().map(function(t){
      return {
        title: t.title, bucket: t.bucket, date: t.date, time: t.time,
        done: t.done, note: t.note || '',
        subtasks: t.subtasks.map(function(s){ return { title: s.title, done: s.done }; }),
        goalTitle: t.goalId && findGoal(t.goalId) ? findGoal(t.goalId).title : ''
      };
    }),
    goals: S.goals.map(function(g){
      return {
        title: g.title, purpose: g.purpose || '', horizon: g.horizon || '',
        stages: g.stages.map(function(st){ return { title: st.title, status: st.status }; })
      };
    }),
    lists: S.lists.map(function(l){
      return {
        title: l.title, note: l.note || '',
        items: l.items.map(function(i){ return { title: i.title, done: i.done }; })
      };
    }),
    notes: S.notes.map(function(n){ return { title: n.title, body: n.body || '' }; })
  };
}

/// Человекочитаемый контекст: тем же текстом его собирает приложение.
/* Срез финансов для модели — именно срез, а не история.

   Триста операций — это и деньги на токенах, и лишний вынос личных трат
   наружу. Модели нужны только имена, чтобы связать «Марат вернул пять» с
   существующим долгом, и список категорий, чтобы не выдумывать свои. Суммы
   отдельных трат ей не нужны вовсе. */
function finContext(){
  var lines = ['РАЗДЕЛ «МОИ ФИНАНСЫ»'];
  lines.push('СЕГОДНЯ: ' + isoOf(todayDate()));
  lines.push('КАТЕГОРИИ: ' + finAllCats().map(function(c){
    return c.id + ' (' + c.title + ')';
  }).join(', '));

  var open = S.finance.debts.filter(function(d){ return !d.closed; });
  if (open.length){
    lines.push('ОТКРЫТЫЕ ДОЛГИ:');
    open.forEach(function(d){
      lines.push('  - ' + d.who + ': ' + (d.mine ? 'должен я' : 'должны мне') +
        ', осталось ' + Math.round(Math.max(0, d.amount - (d.paid || 0)) / 100) + ' руб.');
    });
  } else {
    lines.push('ОТКРЫТЫХ ДОЛГОВ НЕТ');
  }

  if (S.finance.jars.length){
    lines.push('КОПИЛКИ: ' + S.finance.jars.map(function(j){ return j.title; }).join(', '));
  }
  if (S.finance.subs.length){
    lines.push('ПОДПИСКИ: ' + S.finance.subs.map(function(x){ return x.title; }).join(', '));
  }

  var month = finMonthTotals(finMonthKey());
  lines.push('ЭТОТ МЕСЯЦ: потрачено ' + Math.round(month.spent / 100) +
    ' руб., получено ' + Math.round(month.earned / 100) + ' руб.');
  var top = finByCat(finMonthKey()).slice(0, 5);
  if (top.length){
    lines.push('ТРАТЫ ПО КАТЕГОРИЯМ ЗА МЕСЯЦ: ' + top.map(function(r){
      return r.title + ' ' + Math.round(r.sum / 100);
    }).join(', '));
  }
  return lines.join('\n');
}

function synContext(){
  if (S.synIntent === 'finance') return finContext();
  var lines = ['СЕГОДНЯ: ' + isoOf(todayDate())];
  var byBucket = {};
  liveTasks().forEach(function(t){
    (byBucket[t.bucket] = byBucket[t.bucket] || []).push(t);
  });
  BUCKETS.forEach(function(b){
    var list = byBucket[b.id] || [];
    if (!list.length) return;
    lines.push('');
    lines.push(b.title.toUpperCase() + ':');
    list.forEach(function(t){
      lines.push('- ' + t.title +
        (t.time ? ' в ' + t.time : '') +
        (t.done ? ' (сделано)' : '') +
        (t.subtasks.length ? ' [подпункты: ' + t.subtasks.map(function(s){ return s.title; }).join(', ') + ']' : ''));
    });
  });
  // Списки и заметки в срезе тоже: без них Syn не знает, какой список
  // дополнять, и заводит второй с тем же названием.
  if (S.lists.length){
    lines.push('');
    lines.push('СПИСКИ:');
    S.lists.forEach(function(l){
      lines.push('- «' + l.title + '»' + (l.items.length ? ': ' + l.items.map(function(i){
        return i.title + (i.done ? ' (отмечено)' : '');
      }).join(', ') : ' (пустой)'));
    });
  }
  if (S.notes.length){
    lines.push('');
    lines.push('ЗАМЕТКИ:');
    S.notes.forEach(function(n){
      lines.push('- «' + n.title + '»' + (n.body ? ': ' + cut(n.body, 160) : ''));
    });
  }
  lines.push('');
  lines.push('ПОМОДОРО: фокус ' + S.pomodoro.focus + ' мин, перерыв ' + S.pomodoro.shortBreak +
    ' мин, длинный ' + S.pomodoro.longBreak + ' мин, кругов сегодня ' + S.pomodoro.doneToday + '.');
  lines.push('МЕДИТАЦИЯ: ' + S.meditation.minutes + ' мин, среда «' + S.meditation.sound + '».');
  lines.push('ОФОРМЛЕНИЕ: тема ' + S.theme + ', палитра «' + paletteOf(S.palette).title +
    '», шрифт «' + fontOf(S.font).title + '», размер ' + fontSizeOf(S.fontSize).title + '.');
  if (!isPro()){
    lines.push('');
    lines.push('ЭТО ВЕБ-ВЕРСИЯ БЕЗ ПОДПИСКИ: списков не больше ' + FREE_LIMITS.lists +
      ', заметок ' + FREE_LIMITS.notes + ', целей ' + FREE_LIMITS.goals +
      '. Помодоро и медитация открыты. Не обещай того, что закрыто подпиской.');
  }

  if (S.goals.length){
    lines.push('');
    lines.push('ИЕРАРХИЯ ЦЕЛЕЙ И ИХ ЗАДАЧ:');
    S.goals.forEach(function(g){
      lines.push('- цель «' + g.title + '»' + (g.horizon ? ', горизонт ' + g.horizon : ''));
      g.stages.forEach(function(st){
        lines.push('  - этап «' + st.title + '» (' + st.status + ')');
        tasksOfStage(g.id, st.id).forEach(function(t){
          lines.push('    - задача «' + t.title + '»' + (t.date ? ' на ' + t.date : ''));
        });
      });
    });
  }
  return lines.join('\n');
}

/* Окно ассистента. Разговор, а не одиночный запрос: реплики копятся в ленте,
   лента прокручивается, и «перенеси его на пятницу» после «что у меня в
   четверг» понятно без повторения названия — прошлые реплики уезжают на
   сервер вместе с новой.

   Лента живёт в S, а не в памяти вкладки: разговор, исчезающий от случайной
   перезагрузки, заставляет объяснять всё заново. Хранится последние
   SYN_CHAT_KEEP реплик — больше в localStorage держать незачем. */
var SYN_CHAT_KEEP = 40;
var SYN_CHAT_SEND = 8;

function synChatPush(role, text, result){
  S.synChat.push({ role: role, text: String(text || ''),
    done: result ? result.done : [], skipped: result ? result.skipped : [] });
  if (S.synChat.length > SYN_CHAT_KEEP) S.synChat = S.synChat.slice(-SYN_CHAT_KEEP);
}

function modalSyn(draft, error){
  return '<div class="syn-win">' +
    '<div class="syn-top">' +
      '<h3>Ассистент Syn</h3>' +
      (S.synChat.length ? '<button class="btn sm soft" data-act="syn-clear">Очистить</button>' : '') +
    '</div>' +
    '<div class="syn-log" id="syn-log">' + synLogHTML() + '</div>' +
    (error ? '<p class="err syn-error">' + esc(error) + '</p>' : '') +
    '<form class="syn-bar" data-form="syn-send">' +
      '<label class="visually-hidden" for="syn-input">Что сделать</label>' +
      '<textarea class="inp" id="syn-input" rows="1" enterkeyhint="send" ' +
        'placeholder="Перенеси урок на субботу">' + esc(draft || '') + '</textarea>' +
      (voiceSupported()
        ? '<button class="syn-mic' + (voice.on ? ' on' : '') + '" type="button" data-act="syn-voice" ' +
          'aria-label="' + (voice.on ? 'Остановить диктовку' : 'Продиктовать') + '" ' +
          'title="' + (voice.on ? 'Остановить диктовку' : 'Продиктовать') + '">' + ICON.mic + '</button>'
        : '') +
      '<button class="syn-go" type="submit" aria-label="Отправить"' + (SYN.busy ? ' disabled' : '') + '>' +
        (SYN.busy ? '…' : '↑') + '</button>' +
    '</form>' +
    (voice.on
      ? '<p class="hint syn-voice-hint">Слушаю. Замолчите — и Syn выполнит сказанное.</p>'
      : synQuotaHTML()) +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Закрыть</button></div>' +
  '</div>';
}

function synLogHTML(){
  if (!S.synChat.length){
    return '<p class="syn-empty">Скажи словами: «перенеси созвон на пятницу», «разбери мой день», ' +
      '«сделай из этого цель», «включи дождь на 15 минут».' +
      (voiceSupported() ? ' Или продиктуй голосом — Syn выполнит сказанное.' : '') + '</p>';
  }

  return S.synChat.map(function(item, index){
    item.i = index;
    if (item.role === 'user'){
      return '<div class="syn-msg mine"><span>' + esc(item.text) + '</span></div>';
    }
    var html = '<div class="syn-msg"><span>' + esc(item.text) + '</span></div>';

    /* Ответ без единого действия — самая обидная поломка ассистента: он
       написал «добавил», а на экране прежнее, и человек верит словам. Модель
       иногда так отвечает, и никакой каталог действий этого не исправит —
       поправить можно только молчание интерфейса.

       Поэтому пустой ответ называется прямо, и рядом даётся выход: повторить
       запрос или создать задачу из той же фразы своим разбором строки — тем
       самым, что работает в строке создания. Второе не стоит ни запроса, ни
       ожидания. */
    if (item.none){
      html += '<div class="syn-none">' +
        '<b>Ничего не изменилось.</b> Syn ответил словами, но не прислал ни одного действия.' +
        '<div class="syn-none-acts">' +
          (item.said ? '<button class="btn sm" data-act="syn-local" data-i="' + item.i + '">Создать задачу из фразы</button>' : '') +
          (item.said ? '<button class="btn sm soft" data-act="syn-again" data-i="' + item.i + '">Повторить</button>' : '') +
        '</div>' +
      '</div>';
    }

    // Карточка подтверждения: что именно запишется и на какую сумму.
    if (item.finance && item.finance.rows.length){
      html += '<div class="syn-fin">' +
        '<b>' + esc(item.finance.head) + '</b>' +
        '<ul>' + item.finance.rows.map(function(row){
          return '<li>' + esc(row) + '</li>';
        }).join('') + '</ul>' +
        '<div class="syn-none-acts">' +
          '<button class="btn sm" data-act="fin-apply">Записать</button>' +
          '<button class="btn sm soft" data-act="fin-drop">Не надо</button>' +
        '</div>' +
      '</div>';
    }

    if (item.done && item.done.length){
      html += '<ul class="syn-did">' + item.done.map(function(line){
        return '<li>' + esc(line) + '</li>';
      }).join('') + '</ul>';
    }
    // Про непринятое — вслух: иначе Syn пишет «перенёс», а на экране прежнее.
    if (item.skipped && item.skipped.length){
      html += '<ul class="syn-did off">' + item.skipped.map(function(line){
        return '<li>' + esc(line) + '</li>';
      }).join('') + '</ul>';
    }
    return html;
  }).join('') + (SYN.busy ? '<div class="syn-msg wait"><span>Syn думает…</span></div>' : '');
}

/// Лента всегда показывает последнее сказанное: без этого новая реплика
/// появляется ниже края, и кажется, что ответа нет.
/* Заметка показывается целиком.

   Поле было фиксированной высоты со своей полосой прокрутки внутри: страница
   не двигалась, а текст ездил в окошке — читать длинную запись приходилось
   через щель. Теперь поле растёт под содержимое, а прокручивается сама
   страница, как и всё остальное на ней.

   Предела нет намеренно: заметка на десять экранов — это нормальная заметка,
   и обрезать её ради компактности значит спрятать то, ради чего её открыли. */
function growNote(field){
  if (!field) return;
  field.style.height = 'auto';
  field.style.height = field.scrollHeight + 'px';
}

function growNotes(){
  var fields = document.querySelectorAll('.note-field');
  for (var i = 0; i < fields.length; i++) growNote(fields[i]);
}

/// Поле ввода растёт под текст до своего предела — дальше прокручивается.
function growInput(field){
  if (!field) return;
  field.style.height = 'auto';
  field.style.height = Math.min(field.scrollHeight, 120) + 'px';
}

function synScrollDown(){
  var log = $('syn-log');
  if (log) log.scrollTop = log.scrollHeight;
}

/// Остаток запросов. Число берём у сервера, а до первого ответа называем
/// дневную норму — молчать про счётчик хуже, чем ошибиться на единицу.
function synQuotaHTML(){
  var limit = isPro() ? proSynLimit(S.pro.plan) : FREE_SYN_LIMIT;
  var text;
  if (SYN.quota && typeof SYN.quota.used === 'number'){
    limit = SYN.quota.limit || limit;
    var left = Math.max(0, limit - SYN.quota.used);
    text = 'Осталось ' + left + ' из ' + limit + ' запросов на сегодня.';
  } else {
    text = (isPro() ? 'В подписке ' : 'Бесплатно ') + limit + ' запросов к Syn в день.';
  }
  if (!isPro()){
    text += ' <a class="q-link" href="#" data-act="go" data-view="subscription">Подписка</a>';
  }
  return '<p class="hint syn-quota">' + text + '</p>';
}

/// Перерисовать окно, не трогая остального экрана.
function synRender(draft, error){
  openModal(modalSyn(draft, error), true);
  var field = $('syn-input');
  if (field){
    growInput(field);
    field.scrollTop = field.scrollHeight;
  }
  synScrollDown();
}

/// Отправка и применение. Текст в поле сохраняем при ошибке — иначе повторить
/// запрос с правкой было бы нечем.
function synSend(text){
  if (!text || SYN.busy) return;
  voiceStop();

  SYN.busy = true;
  synChatPush('user', text, null);
  save();
  synRender('', '');

  synAsk().then(function(data){
    if (data.quota) SYN.quota = data.quota;
    /* Финансовые действия не применяются сразу.

       Задачу Syn создаёт молча — ошибку видно и её легко убрать. С деньгами
       так нельзя: неверная сумма разъедет и сводку, и конверт, и остаток на
       счёте, а заметит человек это через месяц. Поэтому пачка сначала
       показывается карточкой, и пишется только по нажатию. */
    var finance = (data.actions || []).filter(finIsFinanceAction);
    var rest = (data.actions || []).filter(function(a){ return !finIsFinanceAction(a); });
    S.finPending = finance.length ? finance : null;

    var result = synApplyActions(rest);
    SYN.busy = false;
    synChatPush('assistant', data.reply || 'Готово.', result);
    // Разговор с Syn — четвёртый шаг обучения, и записать это надо здесь:
    // ответ ассистента идёт мимо commit().
    tourCheck();
    // Помечаем именно «действий не было вовсе»: пустой список — это не то же
    // самое, что действия, которые не применились, — про те сказано отдельно.
    if (!(data.actions || []).length){
      var last = S.synChat[S.synChat.length - 1];
      last.none = true;
      last.said = text;
    }
    if (finance.length){
      var card = S.synChat[S.synChat.length - 1];
      card.none = false;
      card.finance = finPreview(finance);
    }
    save();
    synRender('', '');
    // Экран под окном должен показывать уже новые данные.
    render();
  }).catch(function(error){
    SYN.busy = false;
    // Неотвеченный вопрос не остаётся в ленте: иначе он уедет на сервер
    // следующим запросом как будто на него уже ответили.
    S.synChat.pop();
    save();
    synRender(text, synErrorText(error));
    /* Кончились запросы — предлагаем подписку, а не просто сообщаем.

       Раньше человек упирался в серую строчку «бесплатные запросы на сегодня
       закончились» и маленькое слово «Подписка» под полем. Это сообщение о
       факте, а не предложение: в момент, когда человек как раз хотел
       воспользоваться ассистентом и не смог, ему надо показать, чем это
       лечится. Показываем один раз за сутки — окно, которое выскакивает на
       каждую попытку, из предложения превращается в помеху. */
    if (error && error.status === 402) synOfferPro();
  });
}

/* Окно с подпиской после исчерпания дневной нормы.

   Раз в сутки, а не на каждую попытку: человек, который уже отказался, знает
   про подписку — второе окно в тот же день только злит. */
function synOfferPro(){
  if (isPro()) return;
  var сегодня = isoOf(todayDate());
  if (S.proOfferShown === сегодня) return;
  S.proOfferShown = сегодня;
  save();
  // Даём дочитать ответ Syn, а не накрываем его окном в ту же миллисекунду.
  setTimeout(function(){ openModal(modalSynPaywall()); }, 700);
}

/* Окно должно вести к покупке, а не к ожиданию.

   Первая версия предлагала «подождать до завтра» — и это была честная, но
   вредная кнопка: человек, которому ассистент нужен прямо сейчас, получал
   готовый повод ничего не решать. Ждать он и так может, ему для этого кнопка
   не нужна: достаточно закрыть окно.

   Поэтому здесь названы цена и то, что за неё дают, а не то, когда всё
   починится само. Недельный тариф стоит первым: 149 рублей — это решение на
   один вечер, а не обязательство на год, и именно с него начинают. */
function modalSynPaywall(){
  var limit = (SYN.quota && SYN.quota.limit) || FREE_SYN_LIMIT;
  var неделя = planPrice('pro.weekly'), месяц = planPrice('pro.monthly');
  return '<h3>Syn на сегодня закончился</h3>' +
    '<p class="s">Бесплатно он отвечает ' + limit + ' раз в сутки. В подписке — ' +
      PLAN_SYN_LIMITS['pro.monthly'] + ' в сутки, на годовом ' + PLAN_SYN_LIMITS['pro.yearly'] +
      ', плюс утренний план, вечерний отчёт и память между разговорами.</p>' +
    '<div class="paywall-price">' +
      '<b>' + неделя + '</b><span>за неделю, чтобы попробовать</span>' +
      '<b>' + месяц + '</b><span>за месяц</span>' +
    '</div>' +
    '<button class="btn full" data-act="go" data-view="subscription">Подключить Pro</button>' +
    '<div class="acts pair">' +
      '<button class="btn soft" data-act="pro-code">У меня есть код</button>' +
      '<button class="btn soft" data-act="close-modal">Закрыть</button>' +
    '</div>';
}

function planPrice(id){
  for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === id) return PLANS[i].price;
  return '';
}

function synErrorText(error){
  var message = error && error.message ? error.message : 'Не получилось';
  if (!error) return message;
  if (error.status === 503) return 'Syn для веба ещё не включён на сервере.';
  if (error.status === 404) return 'Syn в браузере ещё не включён на сервере.';
  if (error.status === 402){
    if (error.data && error.data.quota) SYN.quota = error.data.quota;
    return error.data && error.data.error ? error.data.error : 'Запросы к Syn на сегодня закончились.';
  }
  if (error.status === 403) return 'Сервер не принял запрос с этого адреса.';
  if (error.status === 429) return 'Слишком часто. Подожди минуту и попробуй снова.';
  if (error.status === undefined) return 'Сервер не ответил. Проверь соединение.';
  return message;
}

/* ---- диктовка ---- */

/* Распознавание речи браузером: SpeechRecognition, у Safari и Chrome под
   вебкитовским именем. Своего сервера для этого не нужно — тем более что
   маршрут распознавания у нас рассчитан на приложение.

   Поведение выбрано под голосовую команду, а не под диктант: слушаем до
   паузы, показываем текст по ходу, а как человек замолчал — сразу
   отправляем. Голосом говорят «перенеси урок на субботу» и ждут, что это
   случится, а не что придётся ещё нажать кнопку.

   Чего здесь намеренно нет: постоянного слушания. Микрофон, включённый до
   закрытия вкладки, — не та цена, которую стоит платить за экономию одного
   нажатия. */
var VOICE_SEND_DELAY = 1000;
var voice = { on: false, rec: null, final: '', pending: null };

/// Отменить отложенную отправку — например, когда человек снова взялся за
/// микрофон или начал править текст руками.
function voiceCancelPending(){
  if (!voice.pending) return;
  clearTimeout(voice.pending);
  voice.pending = null;
}

/* Приложение на андроиде слушает через систему, а не через браузер.

   В WebView браузерного распознавания нет: объект SpeechRecognition объявлен,
   но при запуске отдаёт «not-allowed» при любых выданных разрешениях — и
   человек читает «браузер не дал доступ к микрофону», хотя доступ ни при чём.
   Оболочка приложения подкладывает AndroidVoice, который слушает системным
   движком и присылает распознанное обычным событием. */
function voiceNative(){
  return (window.AndroidVoice && window.AndroidVoice.available && window.AndroidVoice.available())
    ? window.AndroidVoice : null;
}

function voiceSupported(){
  return !!(voiceNative() || window.SpeechRecognition || window.webkitSpeechRecognition);
}

/* Ответы системного распознавания приходят сюда.

   Обработчик один на всё время жизни страницы, а не заводится на каждое
   слушание: два обработчика на одно событие означали бы два отправленных
   запроса на одну фразу. */
window.addEventListener('android-voice', function(event){
  var d = (event && event.detail) || {};
  if (d.kind === 'start'){
    voice.on = true;
    synRender('', '');
    return;
  }
  if (d.kind === 'partial'){
    if (voice.on) synRender(d.text || '', '');
    return;
  }
  if (d.kind === 'error'){
    voice.on = false;
    synRender($('syn-input') ? $('syn-input').value : '', d.text || 'Распознавание не сработало.');
    return;
  }
  if (d.kind === 'final'){
    voice.on = false;
    var said = (d.text || '').trim();
    if (!said){ synRender($('syn-input') ? $('syn-input').value : '', ''); return; }
    // Та же секунда на раздумье, что и у браузерного распознавания: человек
    // должен успеть нажать «стоп», если сказанное вышло не так.
    voiceCancelPending();
    voice.pending = setTimeout(function(){ voice.pending = null; synSend(said); }, VOICE_SEND_DELAY);
    synRender(said, '');
  }
});

function voiceStart(){
  if (voice.on || !voiceSupported()) return;
  voiceCancelPending();

  var родной = voiceNative();
  if (родной){
    // Разрешение на микрофон спросит сама оболочка, и после согласия слушание
    // начнётся без второго нажатия.
    родной.start();
    return;
  }

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = new Recognition();
  rec.lang = 'ru-RU';
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  voice.rec = rec;
  voice.on = true;
  voice.final = '';

  rec.onresult = function(event){
    var interim = '';
    for (var i = event.resultIndex; i < event.results.length; i++){
      var chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) voice.final += chunk;
      else interim += chunk;
    }
    // Поле правим напрямую, без перерисовки окна: перерисовка увела бы
    // курсор и оборвала бы распознавание на полуслове.
    var field = $('syn-input');
    if (!field) return;
    field.value = (voice.final + interim).trim();
    // Длинную фразу видно до конца: поле подрастает до своего предела, а
    // дальше прокручивается к последнему слову. Иначе человек говорит, а на
    // экране стоит начало фразы — и непонятно, слышат ли его до сих пор.
    growInput(field);
    field.scrollTop = field.scrollHeight;
  };

  rec.onerror = function(event){
    voice.on = false;
    voice.rec = null;
    var reason = event && event.error === 'not-allowed'
      ? 'Браузер не дал доступ к микрофону.'
      : event && event.error === 'no-speech'
        ? 'Ничего не услышал.'
        : 'Распознавание не сработало.';
    synRender($('syn-input') ? $('syn-input').value : '', reason);
  };

  rec.onend = function(){
    voice.on = false;
    voice.rec = null;
    var said = voice.final.trim();
    voice.final = '';

    if (!said){
      synRender($('syn-input') ? $('syn-input').value : '', '');
      return;
    }

    /* Замолчал — исполняем, но не в ту же секунду. Браузер объявляет конец
       речи по своей паузе, и она короче человеческой: люди останавливаются
       посреди фразы, чтобы подобрать слово. Секунда сверху даёт эту паузу
       пережить — и оставляет время нажать «стоп», если сказанное вышло не
       так. */
    voice.pending = setTimeout(function(){
      voice.pending = null;
      synSend(said);
    }, VOICE_SEND_DELAY);
    synRender(said, '');
  };

  try {
    rec.start();
  } catch (error){
    voice.on = false;
    voice.rec = null;
  }
  synRender($('syn-input') ? $('syn-input').value : '', '');
}

function voiceStop(){
  voiceCancelPending();

  var родной = voiceNative();
  if (родной && voice.on && !voice.rec){
    voice.on = false;
    родной.stop();
    return;
  }

  if (!voice.on || !voice.rec) return;
  voice.on = false;
  var rec = voice.rec;
  voice.rec = null;
  // abort, а не stop: stop досылает последний кусок и снова зовёт onend,
  // который отправил бы уже отправленное.
  try { rec.abort(); } catch (error){}
}

function synAsk(){
  return synSession().then(function(token){
    var workspace = synWorkspace();
    if (S.synIntent) workspace.assistantIntent = S.synIntent;
    if (S.synGoalCreate) workspace.assistantGoalCreate = true;
    return synFetch('/v1/synapse/reply', {
      workspace: workspace,
      workspaceContext: synContext(),
      messages: S.synChat.slice(-SYN_CHAT_SEND).map(function(item){
        return { role: item.role === 'user' ? 'user' : 'assistant', text: item.text };
      })
    }, token);
  });
}

/* ---- подписка ---- */

/* Тот же маршрут, что у приложения: код меняется на связку install id с
   аккаунтом. Ответ сервера кладём рядом с задачами — он же решает, открыты ли
   помодоро с медитацией и какая суточная квота у Syn.

   Проверять код заново на каждом запуске незачем: сервер отдал срок, и до него
   Pro считается включённым. Кнопка «Проверить» на экране тарифов есть на
   случай, когда подписку продлили или перенесли на другое устройство. */
/* Включение подписки по коду из ссылки, а не из поля ввода.

   Страница активации на сайте открывает synapse://activate?code=… — на айфоне
   это ловит приложение и включает Pro само. На андроиде оболочка теперь делает
   то же: зовёт эту функцию с кодом из ссылки. Человеку не приходится
   переписывать двенадцать знаков из браузера в приложение руками, а именно на
   этом переносе обычно и теряются покупатели. */
function activateFromLink(code){
  code = String(code || '').trim();
  if (!code) return;
  openModal(modalProCode('', true));
  proActivate(code).then(function(pro){
    if (!pro || !pro.active){
      openModal(modalProCode('Код принят, но подписка по нему неактивна.', false));
      return;
    }
    closeModal();
    commit('Подписка включена');
  }).catch(function(error){
    openModal(modalProCode((error && error.message) || 'Не получилось проверить код.', false));
  });
}

function proActivate(code){
  return synFetch('/v1/synapse/subscription/activate', {
    code: String(code || '').trim().toUpperCase(),
    installID: webInstallID()
  }).then(function(data){
    S.pro = {
      active: String(data.status || '') === 'active',
      plan: data.plan || '',
      expiresAt: data.expiresAt || '',
      code: String(code || '').trim().toUpperCase(),
      // Отметка живого подтверждения: от неё считается срок годности признака.
      checkedAt: Date.now()
    };
    save();
    return S.pro;
  });
}

/* ---- применение действий ---- */

/* Каталог действий сервера перенесён целиком: задачи, цели с этапами, списки,
   заметки, помодоро, медитация, оформление и переходы по разделам. Syn в
   браузере умеет ровно то же, что в приложении, — кроме того, чего в браузере
   не существует физически (уведомления, вибрация, папки заметок): такие
   действия не проглатываются молча, а называются в ответе.

   Три правила, из-за которых это не просто список веток:

   1. Незнакомое действие всегда попадает в «не применилось». Молчаливый
      пропуск — это Syn, который пишет «перенёс», а на экране прежнее.
   2. Платное остаётся платным и для Syn: «включи помодоро» без подписки не
      обходит замок, а объясняет его.
   3. Границы бесплатного тоже проверяются здесь, а не только на кнопках:
      иначе третью цель можно было бы завести голосом. */

function synFindTask(target){
  var needle = String(target || '').toLowerCase().trim();
  if (!needle) return null;
  var all = liveTasks();
  for (var i = 0; i < all.length; i++){
    if (all[i].title.toLowerCase() === needle) return all[i];
  }
  for (var j = 0; j < all.length; j++){
    if (all[j].title.toLowerCase().indexOf(needle) >= 0) return all[j];
  }
  return null;
}

function synFindGoal(target){
  var needle = String(target || '').toLowerCase().trim();
  if (!needle) return null;
  for (var i = 0; i < S.goals.length; i++){
    if (S.goals[i].title.toLowerCase().indexOf(needle) >= 0) return S.goals[i];
  }
  return null;
}

/// «2026-04-15 18:30» → дата и время по отдельности.
function synSplitDateTime(value){
  var raw = String(value || '').trim();
  if (!raw) return { date: null, time: null };
  var parts = raw.split(/[ T]/);
  var date = /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) ? parts[0] : null;
  var time = parts[1] && /^\d{1,2}:\d{2}/.test(parts[1])
    ? parts[1].slice(0, 5).padStart(5, '0') : null;
  if (!date && /^\d{1,2}:\d{2}/.test(parts[0])) time = parts[0].slice(0, 5);
  return { date: date, time: time };
}

/// Поиск по названию среди списков, заметок и этапов — теми же правилами, что
/// у задач: сначала точное совпадение, потом вхождение.
function synFindBy(items, target, field){
  var needle = String(target || '').toLowerCase().trim();
  if (!needle) return null;
  var key = field || 'title';
  for (var i = 0; i < items.length; i++){
    if (String(items[i][key]).toLowerCase() === needle) return items[i];
  }
  for (var j = 0; j < items.length; j++){
    if (String(items[j][key]).toLowerCase().indexOf(needle) >= 0) return items[j];
  }
  return null;
}

function synFindList(target){ return synFindBy(S.lists, target); }
function synFindNote(target){ return synFindBy(S.notes, target); }

/// Этап ищется по всем целям сразу: человек говорит «завершить этап X», не
/// называя цель, и в приложении это работает так же.
function synFindStage(target){
  for (var i = 0; i < S.goals.length; i++){
    var stage = synFindBy(S.goals[i].stages, target);
    if (stage) return { goal: S.goals[i], stage: stage };
  }
  return null;
}

/* Правило повтора сервера — набор полей (unit, interval, weekdays), в вебе же
   повтор это один из шести пресетов, как в приложении. Переводим в ближайший;
   то, чего среди пресетов нет (минуты, часы, произвольные дни недели), честно
   возвращает null и попадает в «не применилось». */
/* Правило повтора из действия сервера.

   Возвращает {repeat, rule}: либо id пресета, либо 'custom' со своим правилом.
   Округлять до пресета, как было раньше, значит подменять правило: «каждые три
   дня» становилось «каждые два», «по вторникам и четвергам» — просто
   «каждую неделю». Человек при этом видел на карточке одно, а получал другое.

   Минуты и часы по-прежнему не выражаются: у задачи в этом планировщике нет
   времени внутри дня чаще, чем раз в день, и делать вид, что есть, нельзя. */
function synRepeat(a){
  if (a.repeat && a.repeat !== CUSTOM_REPEAT && repeatPreset(a.repeat).rule){
    return { repeat: a.repeat, rule: null };
  }

  var unit = String(a.unit || '').toLowerCase();
  if (unit === 'minute' || unit === 'hour') return null;

  var interval = Math.max(1, Math.min(365, Number(a.interval) || 1));
  var weekdays = (a.weekdays || []).map(Number).filter(function(d){ return d >= 0 && d <= 7; })
    // Сервер нумерует дни с единицы от понедельника, JS — с нуля от воскресенья.
    .map(function(d){ return d === 7 ? 0 : d % 7; });
  if (!weekdays.length && a.weekday) weekdays = [Number(a.weekday) === 7 ? 0 : Number(a.weekday) % 7];
  var monthlyDays = (a.monthlyDays || []).map(Number).filter(function(d){ return d >= 1 && d <= 31; });
  var weekdaysOnly = a.weekdaysOnly === true ||
    (weekdays.length === 5 && weekdays.indexOf(0) < 0 && weekdays.indexOf(6) < 0);

  // Ровно пресет — берём пресет: на карточке он называется словами, которые
  // человек и выбирал бы руками.
  if (unit === 'day' && weekdaysOnly) return { repeat: 'weekdays', rule: null };
  if (unit === 'day' && interval === 1 && !weekdays.length) return { repeat: 'daily', rule: null };
  if (unit === 'day' && interval === 2 && !weekdays.length) return { repeat: 'every2', rule: null };
  if (unit === 'week' && interval === 1 && !weekdays.length) return { repeat: 'weekly', rule: null };
  if (unit === 'month' && interval === 1 && !monthlyDays.length) return { repeat: 'monthly', rule: null };

  if (unit === 'day' || unit === 'week' || unit === 'month'){
    return { repeat: CUSTOM_REPEAT, rule: {
      unit: unit, interval: interval,
      weekdaysOnly: weekdaysOnly || false,
      weeklyWeekdays: unit === 'week' ? weekdays : [],
      monthlyDays: unit === 'month' ? monthlyDays : []
    } };
  }

  // Единицы нет, но дни названы — это неделя.
  if (weekdays.length){
    return { repeat: CUSTOM_REPEAT, rule: { unit: 'week', interval: interval, weeklyWeekdays: weekdays, monthlyDays: [] } };
  }
  if (monthlyDays.length){
    return { repeat: CUSTOM_REPEAT, rule: { unit: 'month', interval: interval, weeklyWeekdays: [], monthlyDays: monthlyDays } };
  }
  return null;
}

/// Начало окна выполнения: «сделай между двумя и шестью» — здесь два часа.
function synWindowStart(a){
  var when = synSplitDateTime(a.executionWindowStartAt);
  if (!when.date && !when.time) return null;
  return { date: when.date, time: when.time };
}

/* Повтор из самой фразы, когда модель его не закодировала.

   Приложение делает так же: поля действия первичны, но если их нет, правило
   ищется в исходной фразе. «Тренировка каждый день» без unit — обычный ответ
   модели, и терять из-за него повтор жалко. */
function repeatFromText(text){
  var normalized = ' ' + String(text || '').toLowerCase() + ' ';
  if (/кажд[а-я]* (буднич|будн)/.test(normalized) || /по будня/.test(normalized)) return 'weekdays';
  if (/кажд[а-я]* (недел|понедельник|вторник|сред|четверг|пятниц|суббот|воскресень)/.test(normalized)) return 'weekly';
  if (/кажд[а-я]* месяц|ежемесячн/.test(normalized)) return 'monthly';
  if (/кажд[а-я]* два дня|через день/.test(normalized)) return 'every2';
  if (/кажд[а-я]* день|ежедневн/.test(normalized)) return 'daily';
  return '';
}

/* Прошедшее время — на завтра. То же правило, что при ручном вводе; сказанное
   вслух, потому что молча переехавшая дата пугает сильнее, чем просрочка. */
function synPushPast(task, source, done){
  if (!task.time || task.bucket !== 'today') return task;
  if (/(^|[^а-яa-z])сегодня([^а-яa-z]|$)/i.test(String(source || ''))) return task;

  var now = new Date();
  var parts = task.time.split(':');
  var planned = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(parts[0]), Number(parts[1]));
  if (planned >= now) return task;

  task.bucket = 'tomorrow';
  task.date = dateForBucket('tomorrow');
  if (done) done.push('время уже прошло — поставил на завтра');
  return task;
}

/// Крайний срок. Хранится отдельно от даты в плане: «стоит на завтра» и
/// «должно быть сделано до пятницы» — разные вещи, и в приложении тоже.
function synDeadline(a){
  var when = synSplitDateTime(a.deadline || a.datetime);
  if (!when.date && !when.time) return null;
  return { date: when.date, time: when.time, hard: a.hardDeadline === true };
}

/// Граница бесплатного. Проверяется и здесь, иначе третью цель можно было бы
/// завести голосом в обход кнопки.
function synRoom(kind, skipped){
  if (canAdd(kind)) return true;
  skipped.push(limitReason(kind) + ' Нужна подписка');
  return false;
}

/* Каталог. Ключ — kind сервера, значение — что с этим делать в вебе.
   Синонимы перечислены рядом, потому что сервер их правда присылает: у одного
   и того же смысла в промптах разные имена (mark_task_done и complete_task). */
var SYN_ACTS = {};

function synAct(kinds, fn){
  kinds.split(' ').forEach(function(kind){ SYN_ACTS[kind] = fn; });
}

/* ---- задачи ---- */

synAct('create_task create_task_for_goal', function(a, done, skipped){
  var when = synSplitDateTime(a.datetime);

  /* Блок дня выводится из даты, а не берётся из действия.

     Так делает приложение (bucket(forScheduledDate:)), и на то есть причина:
     модель присылает и bucket, и datetime, и они расходятся — «сегодня» с
     датой завтрашнего дня встречается регулярно. Дата конкретнее слова,
     поэтому она и решает; bucket остаётся ответом на случай, когда даты нет
     вовсе. */
  var bucket = when.date ? bucketForDate(when.date)
    : (a.bucket && bucketTitle(a.bucket) ? a.bucket : 'today');

  var fresh = {
    id: uid(), title: String(a.title || '').trim() || 'Без названия',
    bucket: bucket,
    date: when.date, time: when.time, done: false,
    // Дату и время назвал человек, если они пришли в действии: модель их не
    // выдумывает, она их вычитала из фразы.
    hasExplicitDate: !!when.date, hasExplicitTime: !!when.time,
    note: String(a.note || ''), repeat: '', rule: null, series: null,
    deadline: synDeadline(a),
    // Окно выполнения: «сделай между двумя и шестью». В приложении это
    // отдельное поле, и в вебе теперь тоже — иначе начало окна терялось.
    windowFrom: synWindowStart(a),
    goalId: null, stageId: null,
    subtasks: (a.subtasks || []).map(function(t){ return { id: uid(), title: String(t), done: false }; })
  };
  if (!fresh.date) fresh.date = dateForBucket(fresh.bucket);
  if (spansSeveralDays(fresh.bucket)) fresh.time = null;

  // Прошедшее время — на завтра, как и при ручном вводе.
  fresh = synPushPast(fresh, a.sourcePrompt || '', done);

  /* Повтор: из полей действия, а если их нет — из самой фразы человека.
     Тот же порядок, что в приложении (repeatRule(from:fallbackSourcePrompt:)):
     модель нередко пишет «каждый день» в названии и забывает про unit. */
  if (a.unit || a.interval || a.weekdays || a.weekday || a.weekdaysOnly || a.monthlyDays){
    var made = synRepeat(a);
    if (!made) skipped.push('повтор «' + (a.unit || '') + '» в вебе не выражается');
    else { fresh.repeat = made.repeat; fresh.rule = made.rule; }
  } else {
    fresh.repeat = repeatFromText(a.sourcePrompt || a.title || '');
  }

  if (a.kind === 'create_task_for_goal' || a.goalTitle){
    var goal = synFindGoal(a.goalTitle);
    if (goal){
      fresh.goalId = goal.id;
      var stage = a.stageTitle ? synFindBy(goal.stages, a.stageTitle) : null;
      if (stage) fresh.stageId = stage.id;
    } else if (a.goalTitle){
      skipped.push('цель «' + a.goalTitle + '» не нашлась, задача создана без неё');
    }
  }

  S.tasks.push(fresh);
  done.push('создана задача «' + fresh.title + '»');
});

synAct('move_task set_task_schedule', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var when = synSplitDateTime(a.datetime || a.date);
  if (!when.date && !when.time && a.bucket && bucketTitle(a.bucket)){
    task.bucket = a.bucket;
    task.date = dateForBucket(a.bucket);
  }
  if (when.date){ task.date = when.date; task.bucket = bucketForDate(when.date); }
  if (when.time) task.time = when.time;
  if (spansSeveralDays(task.bucket)) task.time = null;
  task.carriedFrom = null;
  synPushPast(task, a.sourcePrompt || '', done);
  done.push('перенесена «' + task.title + '»');
});

synAct('clear_task_schedule', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  task.time = null;
  task.bucket = 'later';
  task.date = dateForBucket('later');
  done.push('снято время у «' + task.title + '»');
});

synAct('set_task_repeat', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var made = synRepeat(a);
  if (!made) return skipped.push('такой повтор в вебе не выражается');
  task.repeat = made.repeat;
  task.rule = made.rule;
  done.push('повтор у «' + task.title + '» — ' + ruleLabel(taskRule(task)));
});

synAct('clear_task_repeat', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  task.repeat = '';
  task.rule = null;
  task.series = null;
  done.push('снят повтор у «' + task.title + '»');
});

synAct('set_task_deadline', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var deadline = synDeadline(a);
  if (!deadline) return skipped.push('не понял срок для «' + task.title + '»');
  task.deadline = deadline;
  done.push('срок у «' + task.title + '» — ' + deadlineText(deadline));
});

synAct('clear_task_deadline', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  task.deadline = null;
  done.push('снят срок у «' + task.title + '»');
});

synAct('rename_task', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  task.title = String(a.newTitle || a.title || task.title);
  done.push('переименована в «' + task.title + '»');
});

synAct('delete_task', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  // В корзину, а не в никуда: то же правило, что у кнопки на карточке. Ошибка
  // ассистента не должна стоить работы дороже, чем ошибка пальца.
  trashPut('task', task);
  S.tasks = S.tasks.filter(function(t){ return t.id !== task.id; });
  done.push('удалена «' + task.title + '» — лежит в корзине');
});

synAct('complete_task mark_task_done reopen_task uncomplete_task', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var closing = a.kind === 'complete_task' || a.kind === 'mark_task_done';
  task.done = closing;
  // Та же логика, что у галочки на карточке: закрытая повторяющаяся задача
  // ставит следующую в серии, иначе повтор кончается на первом разе.
  if (closing) spawnNextOccurrence(task);
  done.push((closing ? 'закрыта ' : 'открыта ') + '«' + task.title + '»');
});

synAct('restore_task', function(a, done, skipped){
  var target = String(a.target || '').toLowerCase().trim();

  // Сначала корзина: «верни задачу» после удаления — самый частый случай.
  for (var t = 0; t < S.trash.length; t++){
    if (S.trash[t].kind === 'task' && S.trash[t].title.toLowerCase().indexOf(target) >= 0){
      var title = trashRestore(S.trash[t].id);
      done.push('возвращена из корзины «' + title + '»');
      return;
    }
  }

  var found = null;
  for (var i = 0; i < S.tasks.length; i++){
    if (S.tasks[i].archived && S.tasks[i].title.toLowerCase().indexOf(target) >= 0){ found = S.tasks[i]; break; }
  }
  if (!found) return skipped.push('ни в корзине, ни в архиве нет «' + (a.target || '') + '»');
  found.archived = false;
  found.done = false;
  found.bucket = 'today';
  found.date = isoOf(todayDate());
  done.push('возвращена из архива «' + found.title + '»');
});

synAct('update_task_note append_task_note research_task_note', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var note = String(a.note || a.value || '');
  if (!note) return skipped.push('пустое описание для «' + task.title + '»');
  task.note = (a.kind !== 'update_task_note') && task.note ? task.note + '\n' + note : note;
  done.push('описание у «' + task.title + '»');
});

synAct('breakdown_task', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var items = a.subtasks || a.items || [];
  if (!items.length) return skipped.push('нечего добавить в «' + task.title + '»');
  items.forEach(function(item){
    task.subtasks.push({ id: uid(), title: String(item && item.title ? item.title : item), done: false });
  });
  done.push('разобрана на шаги «' + task.title + '»');
});

synAct('add_subtask', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var title = String(a.itemTitle || a.title || '').trim();
  if (!title) return skipped.push('пустой подпункт для «' + task.title + '»');
  task.subtasks.push({ id: uid(), title: title, done: false });
  done.push('подпункт «' + title + '» в «' + task.title + '»');
});

synAct('remove_subtask rename_subtask toggle_subtask', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var sub = synFindBy(task.subtasks, a.itemTitle || a.subtaskTitle || a.value);
  if (!sub) return skipped.push('в «' + task.title + '» нет подпункта «' + (a.itemTitle || '') + '»');

  if (a.kind === 'remove_subtask'){
    task.subtasks = task.subtasks.filter(function(s){ return s.id !== sub.id; });
    done.push('убран подпункт «' + sub.title + '»');
    return;
  }
  if (a.kind === 'rename_subtask'){
    sub.title = String(a.newTitle || sub.title);
    done.push('подпункт переименован в «' + sub.title + '»');
    return;
  }
  sub.done = !sub.done;
  done.push('подпункт «' + sub.title + '» ' + (sub.done ? 'отмечен' : 'снят'));
});

synAct('attach_task_to_goal link_task_to_goal', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  var goal = synFindGoal(a.goalTitle || a.value);
  if (!goal) return skipped.push('не нашёл цель «' + (a.goalTitle || '') + '»');
  task.goalId = goal.id;
  var stage = a.stageTitle ? synFindBy(goal.stages, a.stageTitle) : null;
  task.stageId = stage ? stage.id : null;
  done.push('«' + task.title + '» привязана к цели «' + goal.title + '»');
});

synAct('detach_task_from_goal unlink_task_from_goal', function(a, done, skipped){
  var task = synFindTask(a.target);
  if (!task) return skipped.push('не нашёл задачу «' + (a.target || '') + '»');
  task.goalId = null;
  task.stageId = null;
  done.push('«' + task.title + '» отвязана от цели');
});

synAct('set_task_reminder', function(a, done, skipped){
  skipped.push('напоминаний в браузере нет — только в приложении');
});

/* ---- цели и этапы ---- */

synAct('create_goal', function(a, done, skipped){
  if (!synRoom('goals', skipped)) return;
  var goal = {
    id: uid(), title: String(a.title || '').trim() || 'Без названия',
    purpose: String(a.purpose || ''), horizon: String(a.horizon || ''),
    sphere: 'personal', pinned: false,
    stages: (a.subtasks || a.stages || []).map(function(st){
      return { id: uid(), title: String(st && st.title ? st.title : st), detail: '', status: 'planned' };
    })
  };
  S.goals.push(goal);
  S.openGoal[goal.id] = true;
  done.push('создана цель «' + goal.title + '»' + (goal.stages.length ? ' с этапами' : ''));
});

synAct('rename_goal update_goal_purpose update_goal_horizon', function(a, done, skipped){
  var goal = synFindGoal(a.target);
  if (!goal) return skipped.push('не нашёл цель «' + (a.target || '') + '»');
  if (a.kind === 'rename_goal') goal.title = String(a.newTitle || goal.title);
  if (a.kind === 'update_goal_purpose') goal.purpose = String(a.purpose || a.value || '');
  if (a.kind === 'update_goal_horizon') goal.horizon = String(a.horizon || a.value || '');
  done.push('изменена цель «' + goal.title + '»');
});

synAct('delete_goal', function(a, done, skipped){
  var goal = synFindGoal(a.target);
  if (!goal) return skipped.push('не нашёл цель «' + (a.target || '') + '»');
  trashPut('goal', goal, { taskIDs: S.tasks.filter(function(t){ return t.goalId === goal.id; })
    .map(function(t){ return { id: t.id, stageId: t.stageId }; }) });
  S.goals = S.goals.filter(function(g){ return g.id !== goal.id; });
  // Задачи цели не удаляются вместе с ней, а отвязываются: удалить чужую
  // работу заодно — не то, о чём просили.
  S.tasks.forEach(function(t){
    if (t.goalId === goal.id){ t.goalId = null; t.stageId = null; }
  });
  if (S.activeGoal === goal.id) S.activeGoal = null;
  done.push('удалена цель «' + goal.title + '», задачи остались');
});

synAct('set_active_goal', function(a, done, skipped){
  var goal = synFindGoal(a.target);
  if (!goal) return skipped.push('не нашёл цель «' + (a.target || '') + '»');
  S.goals.forEach(function(g){ g.pinned = g.id === goal.id; });
  S.activeGoal = goal.id;
  done.push('главная цель — «' + goal.title + '»');
});

synAct('create_stage', function(a, done, skipped){
  var goal = synFindGoal(a.goalTitle || a.target);
  if (!goal) return skipped.push('не нашёл цель «' + (a.goalTitle || a.target || '') + '»');
  var stageWhen = synSplitDateTime(a.datetime || a.deadline || a.targetDate);
  var stage = { id: uid(), title: String(a.title || '').trim() || 'Этап',
    detail: String(a.detail || ''), targetDate: stageWhen.date || '', status: 'planned' };
  goal.stages.push(stage);
  done.push('этап «' + stage.title + '» в цели «' + goal.title + '»');
});

synAct('rename_stage delete_stage set_stage_status', function(a, done, skipped){
  var found = synFindStage(a.target);
  if (!found) return skipped.push('не нашёл этап «' + (a.target || '') + '»');

  if (a.kind === 'rename_stage'){
    found.stage.title = String(a.newTitle || found.stage.title);
    done.push('этап переименован в «' + found.stage.title + '»');
    return;
  }
  if (a.kind === 'delete_stage'){
    found.goal.stages = found.goal.stages.filter(function(st){ return st.id !== found.stage.id; });
    S.tasks.forEach(function(t){ if (t.stageId === found.stage.id) t.stageId = null; });
    done.push('удалён этап «' + found.stage.title + '»');
    return;
  }
  // «paused» в вебе отдельного вида не имеет: этап возвращается в план.
  var value = String(a.value || '');
  found.stage.status = value === 'done' ? 'done' : value === 'active' ? 'active' : 'planned';
  done.push('этап «' + found.stage.title + '» → ' + STATUS[found.stage.status]);
});

/* ---- списки ---- */

synAct('create_list', function(a, done, skipped){
  if (!synRoom('lists', skipped)) return;
  var list = { id: uid(), title: String(a.title || '').trim() || 'Новый список',
    note: String(a.note || ''), items: (a.items || []).map(function(i){
      return { id: uid(), title: String(i && i.title ? i.title : i), done: false };
    }) };
  S.lists.push(list);
  done.push('создан список «' + list.title + '»');
});

synAct('rename_list', function(a, done, skipped){
  var list = synFindList(a.target);
  if (!list) return skipped.push('не нашёл список «' + (a.target || '') + '»');
  list.title = String(a.newTitle || list.title);
  done.push('список переименован в «' + list.title + '»');
});

synAct('delete_list', function(a, done, skipped){
  var list = synFindList(a.target);
  if (!list) return skipped.push('не нашёл список «' + (a.target || '') + '»');
  trashPut('list', list);
  S.lists = S.lists.filter(function(l){ return l.id !== list.id; });
  if (S.activeList === list.id) S.activeList = null;
  done.push('удалён список «' + list.title + '»');
});

synAct('add_list_item toggle_list_item delete_list_item', function(a, done, skipped){
  var list = synFindList(a.listTitle || a.target);
  if (!list) return skipped.push('не нашёл список «' + (a.listTitle || a.target || '') + '»');

  if (a.kind === 'add_list_item'){
    var items = a.items && a.items.length ? a.items : [a.itemTitle || a.title];
    var added = 0;
    items.forEach(function(item){
      var title = String(item && item.title ? item.title : item || '').trim();
      if (!title) return;
      list.items.push({ id: uid(), title: title, done: false });
      added += 1;
    });
    if (!added) return skipped.push('пустой пункт для «' + list.title + '»');
    done.push('в список «' + list.title + '» добавлено: ' + added);
    return;
  }

  var item = synFindBy(list.items, a.itemTitle || a.value);
  if (!item) return skipped.push('в «' + list.title + '» нет пункта «' + (a.itemTitle || '') + '»');
  if (a.kind === 'delete_list_item'){
    list.items = list.items.filter(function(i){ return i.id !== item.id; });
    done.push('убран пункт «' + item.title + '»');
    return;
  }
  item.done = !item.done;
  done.push('пункт «' + item.title + '» ' + (item.done ? 'отмечен' : 'снят'));
});

/* ---- заметки ---- */

synAct('create_note research_note', function(a, done, skipped){
  if (!synRoom('notes', skipped)) return;
  var note = {
    id: uid(),
    title: String(a.title || '').trim() || 'Без названия',
    body: String(a.note || a.value || a.body || '')
  };
  S.notes.push(note);
  done.push('создана заметка «' + note.title + '»');
  if (a.folderTitle) skipped.push('папок у заметок в вебе нет, «' + a.folderTitle + '» не создана');
});

synAct('update_note append_note', function(a, done, skipped){
  var note = synFindNote(a.target || a.title);
  if (!note) return skipped.push('не нашёл заметку «' + (a.target || '') + '»');
  var body = String(a.note || a.value || a.body || '');
  if (!body) return skipped.push('пустой текст для «' + note.title + '»');
  note.body = a.kind === 'append_note' && note.body ? note.body + '\n' + body : body;
  if (a.newTitle) note.title = String(a.newTitle);
  done.push('изменена заметка «' + note.title + '»');
});

synAct('delete_note', function(a, done, skipped){
  var note = synFindNote(a.target);
  if (!note) return skipped.push('не нашёл заметку «' + (a.target || '') + '»');
  trashPut('note', note);
  S.notes = S.notes.filter(function(n){ return n.id !== note.id; });
  if (S.activeNote === note.id) S.activeNote = null;
  done.push('удалена заметка «' + note.title + '»');
});

synAct('move_note create_note_folder rename_note_folder delete_note_folder', function(a, done, skipped){
  skipped.push('папок у заметок в вебе нет');
});

/* ---- помодоро и медитация ---- */

synAct('start_pomodoro pause_pomodoro reset_pomodoro', function(a, done, skipped){
  if (a.interval && a.kind === 'start_pomodoro'){
    S.pomodoro.focus = Math.max(1, Math.min(180, Number(a.interval)));
    S.pomodoro.mode = 'focus';
    remaining = S.pomodoro.focus * 60;
  }
  if (a.kind === 'start_pomodoro'){
    S.view = 'pomodoro';
    if (!ticker) startTicker();
    done.push('помодоро запущен' + (a.interval ? ' на ' + S.pomodoro.focus + ' мин' : ''));
    return;
  }
  if (a.kind === 'pause_pomodoro'){
    stopTicker();
    done.push('помодоро на паузе');
    return;
  }
  stopTicker();
  remaining = S.pomodoro[modeOf().key] * 60;
  done.push('помодоро сброшен');
});

synAct('set_pomodoro_mode set_pomodoro_focus_minutes set_pomodoro_break_minutes set_pomodoro_daily_goal', function(a, done, skipped){
  var minutes = Math.max(1, Math.min(180, Number(a.interval || a.value) || 0));

  if (a.kind === 'set_pomodoro_mode'){
    var mode = String(a.mode || a.value || '');
    if (['focus', 'shortBreak', 'longBreak'].indexOf(mode) < 0) return skipped.push('не понял режим помодоро');
    stopTicker();
    S.pomodoro.mode = mode;
    remaining = S.pomodoro[modeOf().key] * 60;
    done.push('помодоро — ' + modeOf().title.toLowerCase());
    return;
  }
  if (!minutes) return skipped.push('не понял длительность помодоро');
  if (a.kind === 'set_pomodoro_focus_minutes'){
    S.pomodoro.focus = minutes;
    done.push('фокус — ' + minutes + ' мин');
  } else if (a.kind === 'set_pomodoro_break_minutes'){
    S.pomodoro.shortBreak = minutes;
    done.push('перерыв — ' + minutes + ' мин');
  } else {
    S.pomodoro.goal = minutes;
    done.push('цель на день — ' + minutes + ' кругов');
  }
  if (!ticker) remaining = S.pomodoro[modeOf().key] * 60;
});

synAct('start_meditation stop_meditation', function(a, done, skipped){
  if (a.kind === 'stop_meditation'){
    medStop(true);
    done.push('медитация остановлена');
    return;
  }
  if (a.interval) S.meditation.minutes = Math.max(1, Math.min(120, Number(a.interval)));
  var wanted = String(a.value || a.sound || '').toLowerCase();
  if (wanted){
    var sound = soundByAnyName(wanted);
    if (sound) S.meditation.sound = sound.title;
    else skipped.push('среды «' + wanted + '» нет, включена прежняя');
  }
  S.view = 'meditation';
  medStart();
  done.push('медитация на ' + S.meditation.minutes + ' мин, среда «' + S.meditation.sound + '»');
});

/* ---- оформление ---- */

synAct('set_theme_mode', function(a, done, skipped){
  var value = String(a.value || a.mode || '');
  // «Как в системе» сервер прислать может — в приложении такой режим есть.
  // В вебе его нет, поэтому системную превращаем в ту, что сейчас в системе:
  // это ближе к просьбе, чем отказ.
  if (value === 'system') value = systemPrefersDark() ? 'dark' : 'light';
  if (value !== 'light' && value !== 'dark') return skipped.push('не понял тему');
  S.theme = value;
  done.push('тема — ' + (value === 'dark' ? 'тёмная' : 'светлая'));
});

synAct('set_color_theme', function(a, done, skipped){
  var wanted = String(a.value || a.title || '').toLowerCase().trim();
  var found = null;
  PALETTES.forEach(function(p){
    if (!found && (p.id === wanted || p.title.toLowerCase() === wanted)) found = p;
  });
  if (!found) return skipped.push('палитры «' + wanted + '» нет');
  S.palette = found.id;
  done.push('палитра — «' + found.title + '»');
});

synAct('set_font_size', function(a, done, skipped){
  var map = { small: 'compact', regular: 'standard', large: 'large' };
  var value = map[String(a.value || '').toLowerCase()];
  if (!value) return skipped.push('не понял размер шрифта');
  S.fontSize = value;
  done.push('размер шрифта — ' + fontSizeOf(value).title);
});

synAct('set_font_style', function(a, done, skipped){
  var wanted = String(a.value || '').toLowerCase().trim();
  var found = null;
  FONTS.forEach(function(f){
    if (!found && (f.id === wanted || f.title.toLowerCase() === wanted)) found = f;
  });
  if (!found) return skipped.push('шрифта «' + wanted + '» нет');
  S.font = found.id;
  done.push('шрифт — ' + found.title);
});

synAct('set_notifications set_haptics set_sounds set_compact_tasks set_start_screen', function(a, done, skipped){
  var names = {
    set_notifications: 'уведомлений', set_haptics: 'вибрации', set_sounds: 'звуков интерфейса',
    set_compact_tasks: 'компактных карточек', set_start_screen: 'стартового экрана'
  };
  skipped.push(names[a.kind] + ' в вебе нет — только в приложении');
});

/* ---- переходы ---- */

synAct('open_screen open_utility open_settings', function(a, done, skipped){
  var map = {
    analytics: 'analytics', synapse: 'focus', coach: 'focus', goals: 'goals', tasks: 'tasks',
    lists: 'lists', notes: 'notes', pomodoro: 'pomodoro', meditation: 'meditation'
  };
  if (a.kind === 'open_settings'){
    S.view = 'settings';
    done.push('открыты настройки');
    return;
  }
  var view = map[String(a.value || a.screen || a.utility || '').toLowerCase()];
  if (!view) return skipped.push('такого раздела в вебе нет');
  if (PRO_ONLY[view] && !isPro()) return skipped.push(PRO_ONLY[view] + ' — только в подписке');
  S.view = view;
  done.push('открыт раздел «' + (VIEWS[view] || {}).title + '»');
});

/* ---- удаление пачкой ---- */

/* Сервер пропускает эти действия только по явной просьбе со словом «всё» —
   проверка там, здесь остаётся исполнение и счёт вслух. */

synAct('delete_all_tasks clear_tasks reset_tasks', function(a, done, skipped){
  var count = S.tasks.length;
  if (!count) return skipped.push('задач и так нет');
  // Пачкой — тем более в корзину: это самая дорогая ошибка из возможных.
  S.tasks.forEach(function(t){ trashPut('task', t); });
  S.tasks = [];
  done.push('удалены все задачи: ' + count + ' — лежат в корзине');
});

synAct('delete_all_goals clear_goals reset_goals', function(a, done, skipped){
  var count = S.goals.length;
  if (!count) return skipped.push('целей и так нет');
  S.goals.forEach(function(g){
    trashPut('goal', g, { taskIDs: S.tasks.filter(function(t){ return t.goalId === g.id; })
      .map(function(t){ return { id: t.id, stageId: t.stageId }; }) });
  });
  S.goals = [];
  S.tasks.forEach(function(t){ t.goalId = null; t.stageId = null; });
  S.activeGoal = null;
  done.push('удалены все цели: ' + count);
});

synAct('delete_all_goals_and_tasks clear_goals_and_tasks reset_goals_and_tasks', function(a, done, skipped){
  var count = S.tasks.length + S.goals.length;
  if (!count) return skipped.push('удалять нечего');
  S.tasks = [];
  S.goals = [];
  S.activeGoal = null;
  done.push('удалено всё: ' + count);
});

function synApplyActions(actions){
  var done = [];
  var skipped = [];

  (actions || []).forEach(function(a){
    var kind = String(a && a.kind || '').toLowerCase();
    var handler = SYN_ACTS[kind];
    if (!handler){
      skipped.push('«' + (kind || 'без вида') + '» веб пока не умеет');
      return;
    }
    // Действие, упавшее на кривых данных, не должно ронять остальные: одна
    // ошибка модели иначе съедала бы весь ответ.
    try {
      a.kind = kind;
      handler(a, done, skipped);
    } catch (error){
      skipped.push('«' + kind + '» не получилось применить');
    }
  });

  return { done: done, skipped: skipped };
}

/// Из даты в блок дня — обратное к dateForBucket.
function bucketForDate(iso){
  var target = dateOf(iso);
  if (!target) return 'later';
  var today = todayDate();
  var days = Math.round((target - today) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === 2) return 'dayAfterTomorrow';
  if (days <= 7) return 'thisWeek';
  return 'later';
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
  fresh.view = 'profile';
  fresh.lastOpened = isoOf(todayDate());
  S = fresh;
  save();
}

/* ============ МОДАЛКА ============ */

/* Страница под окном стоит на месте.

   Прокрутка «протекала» сквозь затемнение: докрутив список до низа внутри
   окна, палец продолжал двигать страницу за ним, и после закрытия человек
   оказывался не там, где был. На айфоне это же выглядит как рывок экрана.

   Фиксируем страницу на её текущем сдвиге и возвращаем всё обратно при
   закрытии — position:fixed вместо overflow:hidden, потому что второй
   способ на iOS Safari не держит. */
var scrollLock = -1;

function lockScroll(){
  if (scrollLock >= 0) return;
  scrollLock = window.pageYOffset || document.documentElement.scrollTop || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = -scrollLock + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockScroll(){
  if (scrollLock < 0) return;
  var back = scrollLock;
  scrollLock = -1;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, back);
}

/* Открытое окно — запись в истории, и вот зачем.

   На андроиде системная кнопка «назад» — главный способ закрыть что угодно.
   Пока окно не было записано в историю, нажатие уходило мимо него: окно
   оставалось на экране, а под ним втихую менялся раздел. Человек жмёт «назад»,
   видит то же окно и не понимает, что уже ушёл с экрана, на который вернётся,
   когда окно наконец закроет.

   Теперь окно кладёт свою запись. Кнопка «назад» снимает её, popstate ловит
   это и закрывает окно — ровно как ожидается. Закрытие крестиком или кнопкой
   само снимает запись обратно, чтобы в истории не копились призраки. */
var modalDepth = 0;

/* Кнопки окна собираются в подвал, который не уезжает за край.

   Форма долга набирает 638 пикселей содержимого при 548 видимых: кнопка
   «Записать» обрезалась краем окна, а «Отмена» оказывалась ниже сгиба вовсе.
   Человек видел белую полосу снизу и не понимал, что это обрезанная кнопка и
   что до неё надо долистать.

   Собираем в подвал здесь, а не в каждом из семнадцати окон: разметку они
   возвращают строкой, и вставить обёртку в каждую — семнадцать мест, которые
   разойдутся при первой же правке. */
function foldModalActions(){
  var box = $('modalIn');
  var footer = document.createElement('div');
  footer.className = 'modal-foot';

  // Берём с конца: подвал — это то, что идёт после полей, а не любая кнопка
  // действия, встреченная в середине формы.
  while (box.lastElementChild){
    var last = box.lastElementChild;
    var подвальный = last.classList.contains('acts') ||
      (last.tagName === 'BUTTON' && last.classList.contains('full'));
    if (!подвальный) break;
    footer.insertBefore(last, footer.firstChild);
  }
  if (footer.childElementCount) box.appendChild(footer);
}

function openModal(html, toInput){
  $('modalIn').innerHTML = html;
  foldModalActions();
  $('modal').classList.add('on');
  lockScroll();

  if (window.history && window.history.pushState){
    modalDepth++;
    window.history.pushState({ modal: modalDepth }, '', location.href);
  }

  // Окно ассистента перерисовывается на каждую реплику, и курсор должен
  // остаться в строке ввода: иначе после ответа нельзя дописать следующее
  // слово, не ткнув в поле.
  if (toInput){
    var input = $('syn-input');
    if (input){
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    return;
  }
  // Курсор встаёт в первое пустое поле, а не в первое подряд: когда название
  // уже введено в строке создания, начинать надо со следующего вопроса.
  var fields = $('modalIn').querySelectorAll('input, textarea, select');
  for (var i = 0; i < fields.length; i++){
    if (!fields[i].value){ fields[i].focus(); return; }
  }
  if (fields.length) fields[0].focus();
}

function closeModal(){
  var былоОткрыто = $('modal').classList.contains('on');
  hideModal();
  // Закрыли сами — снимаем свою запись из истории, иначе следующее «назад»
  // будет тратиться впустую на закрытие уже закрытого.
  if (былоОткрыто && modalDepth > 0 && window.history &&
      window.history.state && window.history.state.modal){
    modalDepth--;
    window.history.back();
  }
}

/// Убрать окно с экрана, не трогая историю. Нужно отдельно: когда окно
/// закрывает сама кнопка «назад», запись уже снята браузером.
function hideModal(){
  $('modal').classList.remove('on');
  $('modalIn').innerHTML = '';
  unlockScroll();
}

function modalOpen(){
  return $('modal') && $('modal').classList.contains('on');
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
  var g = goal || { title: draftTitle || '', purpose: '', horizon: '', targetDate: '' };
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
    /* Целевая дата — рядом с горизонтом, но не вместо него. Горизонт это
       намерение словами («год», «до защиты диплома»), дата — обязательство,
       по которому считается, успеваешь ли. В приложении это два разных поля
       (horizon и targetDate), и путать их нельзя: цель без даты нормальна,
       цель без «зачем» — нет. */
    '<div class="field"><label for="m-target">Дата цели <span class="opt">по желанию</span></label>' +
      '<input class="inp" id="m-target" type="date" value="' + esc(g.targetDate || '') + '"></div>' +
    '<button class="btn full" data-act="save-goal"' + (goal ? ' data-goal="' + goal.id + '"' : '') + '>' +
      (fresh ? 'Создать цель' : 'Сохранить') + '</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalStage(goalId, stage){
  var st = stage || { title: '', detail: '', targetDate: '' };
  return '<h3>' + (stage ? 'Редактировать этап' : 'Создать этап') + '</h3>' +
    '<p class="s">Разбей цель на понятные шаги.</p>' +
    '<div class="field"><label>Название</label><input class="inp" id="m-title" value="' + esc(st.title) + '" placeholder="Например: сдать пробный экзамен"></div>' +
    '<div class="field"><label>Описание</label><input class="inp" id="m-detail" value="' + esc(st.detail) + '" placeholder="Если нужен контекст, добавь его сюда"></div>' +
    // У этапа своя дата: «сдать экзамен к 15 мая» — это срок шага, а не цели.
    '<div class="field"><label>Дата этапа <span class="opt">по желанию</span></label>' +
      '<input class="inp" id="m-target" type="date" value="' + esc(st.targetDate || '') + '"></div>' +
    '<button class="btn full" data-act="save-stage" data-goal="' + goalId + '"' +
      (stage ? ' data-stage="' + stage.id + '"' : '') + '>' +
      (stage ? 'Сохранить' : 'Создать этап') + '</button>' +
    '<div class="acts"><button class="btn sm soft" data-act="close-modal">Отмена</button></div>';
}

function modalTask(t){
  var rule = taskRule(t) || { unit: 'day', interval: 1, weeklyWeekdays: [], monthlyDays: [] };
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
        }).join('') +
        '<option value="' + CUSTOM_REPEAT + '"' + (t.repeat === CUSTOM_REPEAT ? ' selected' : '') + '>Своё правило…</option>' +
        '</select></div>' +
      '<div class="field"><label>Связь с целью</label><select class="inp" id="m-goal">' + goalOptions + '</select></div>' +
    '</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Крайний срок</label>' +
        '<input class="inp" id="m-dl-date" type="date" value="' + esc(t.deadline && t.deadline.date || '') + '"></div>' +
      '<div class="field"><label>Время срока</label>' +
        '<input class="inp" id="m-dl-time" type="time" value="' + esc(t.deadline && t.deadline.time || '') + '"></div>' +
    '</div>' +
    /* Своё правило показывается только когда его выбрали: три поля, которые
       нужны одному человеку из десяти, не должны стоять в модалке у всех.
       Единица решает, что означают остальные поля, поэтому она первой. */
    '<div class="ruleblock' + (t.repeat === CUSTOM_REPEAT ? ' on' : '') + '" id="m-ruleblock">' +
      '<p class="lbl">Своё правило</p>' +
      '<div class="row2">' +
        '<div class="field"><label for="m-runit">Единица</label>' +
          '<select class="inp" id="m-runit">' +
            [['day', 'дни'], ['week', 'недели'], ['month', 'месяцы']].map(function(u){
              return '<option value="' + u[0] + '"' + (rule.unit === u[0] ? ' selected' : '') + '>' + u[1] + '</option>';
            }).join('') + '</select></div>' +
        '<div class="field"><label for="m-rint">Каждые</label>' +
          '<input class="inp" id="m-rint" type="number" min="1" max="365" value="' + (rule.interval || 1) + '"></div>' +
      '</div>' +
      '<div class="field"><label>Дни недели <span class="opt">для недель</span></label>' +
        '<div class="radios sm" id="m-rdays">' +
          [1, 2, 3, 4, 5, 6, 0].map(function(d){
            var on = (rule.weeklyWeekdays || []).indexOf(d) >= 0;
            return '<button class="radio" data-act="rule-day" data-day="' + d + '" aria-pressed="' + on + '">' +
              WEEKDAY_SHORT_RU[d] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="field"><label for="m-rdates">Числа месяца <span class="opt">через запятую</span></label>' +
        '<input class="inp" id="m-rdates" placeholder="5, 20" value="' +
          esc((rule.monthlyDays || []).join(', ')) + '"></div>' +
      '<p class="hint" style="margin-top:0">Сейчас: ' + esc(ruleLabel(ruleFromFields(rule)) || 'без повтора') + '</p>' +
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
        (task.bucket === b.id ? '<span class="val">сейчас здесь</span>' : '<span class="arrow">' + NAV_ICONS.chevron + '</span>') +
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

/* Замок в виде окна, а не тоста: тост уезжает, а тут человеку надо прочитать,
   что именно кончилось и что с этим делать. Две кнопки — тарифы и код, потому
   что часть людей уже купила подписку на сайте. */
/* Окно для закрытого оформления: темы, значки, звуки, режимы.

   Отдельное от лимитного: там человек упёрся в предел работы и ему важно, что
   он теряет; здесь он выбирает оформление, и разговор должен быть коротким. */
function modalLookPaywall(что){
  return '<h3>' + esc(что.charAt(0).toUpperCase() + что.slice(1)) + ' — в подписке</h3>' +
    '<p class="s">Первое из каждого набора открыто всем, остальное входит в Synapse Pro ' +
      'вместе с ассистентом и его брифингами.</p>' +
    '<div class="paywall-price">' +
      '<b>' + planPrice('pro.weekly') + '</b><span>за неделю, чтобы попробовать</span>' +
      '<b>' + planPrice('pro.monthly') + '</b><span>за месяц</span>' +
    '</div>' +
    '<button class="btn full" data-act="go" data-view="subscription">Подключить Pro</button>' +
    '<div class="acts pair">' +
      '<button class="btn soft" data-act="pro-code">У меня есть код</button>' +
      '<button class="btn soft" data-act="close-modal">Закрыть</button>' +
    '</div>';
}

function modalPaywall(kind){
  // «Не сейчас» звучало как предложение отложить, и его выбирали по инерции.
  // Отказаться можно и «Закрыть», а звать окно должно к тому, ради чего оно
  // открылось.
  return '<h3>Дальше — в подписке</h3>' +
    '<p class="s">' + esc(limitReason(kind)) + ' В Synapse Pro их сколько угодно — ' +
      'вместе с ассистентом, брифингами и памятью между разговорами.</p>' +
    '<div class="paywall-price">' +
      '<b>' + planPrice('pro.weekly') + '</b><span>за неделю, чтобы попробовать</span>' +
      '<b>' + planPrice('pro.monthly') + '</b><span>за месяц</span>' +
    '</div>' +
    '<button class="btn full" data-act="go" data-view="subscription">Подключить Pro</button>' +
    '<div class="acts pair">' +
      '<button class="btn soft" data-act="pro-code">У меня есть код</button>' +
      '<button class="btn soft" data-act="close-modal">Закрыть</button>' +
    '</div>';
}

/* Код с сайта. Проверяет его сервер — тот же маршрут, что у приложения, и та
   же связка «один код, одно устройство». Локально ничего не решается: иначе
   подписка включалась бы правкой localStorage. */
function modalProCode(error, busy){
  return '<h3>Код подписки</h3>' +
    '<p class="s">Код приходит после оплаты на сайте. Выглядит так: XXXX-XXXX-XXXX.</p>' +
    '<form class="field" data-form="pro-activate">' +
      '<label for="procode">Код</label>' +
      '<input class="inp mono" id="procode" type="text" placeholder="KBNQ-E2S5-M9BW" ' +
        'autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go">' +
    '</form>' +
    (error ? '<p class="err">' + esc(error) + '</p>' : '') +
    // Три кнопки в ряд разной ширины выглядели случайно собранными. Теперь
    // главное действие на всю ширину, а под ним пара равных: купить и уйти.
    '<button class="btn full" data-act="pro-activate"' + (busy ? ' disabled' : '') + '>' +
      (busy ? 'Проверяем…' : 'Включить подписку') + '</button>' +
    '<div class="acts pair">' +
      '<a class="btn soft" href="../checkout/">Купить на сайте</a>' +
      '<button class="btn soft" data-act="close-modal">Закрыть</button>' +
    '</div>' +
    '<p class="hint">Один код работает и здесь, и на телефоне. Записи при этом остаются раздельными.</p>';
}

function modalText(title, sub, label, act, placeholder, opts){
  // opts: value — что уже вписано в поле, cta — надпись на кнопке,
  // attrs — доп. атрибуты кнопки (например data-list). Нужны переименованию:
  // оно открывает то же окно, но со старым названием и словом «Сохранить».
  opts = opts || {};
  return '<h3>' + esc(title) + '</h3>' +
    (sub ? '<p class="s">' + esc(sub) + '</p>' : '') +
    '<div class="field"><label>' + esc(label) + '</label><input class="inp" id="m-title" placeholder="' + esc(placeholder || '') + '" value="' + esc(opts.value || '') + '"></div>' +
    '<button class="btn full" data-act="' + act + '"' + (opts.attrs || '') + '>' + esc(opts.cta || 'Создать') + '</button>' +
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

/* Готовность считается снизу вверх, а не отмечается на каждом уровне руками.

   Подпункты закрывают задачу, задачи закрывают этап, этапы закрывают цель.
   Иначе человек, отметивший последний подпункт, видит выполненный список
   внутри невыполненной задачи — и должен ставить ещё одну галочку о том, что
   и так уже видно. Считается тут, в одном месте перед сохранением, а не в
   каждом обработчике: обработчиков, меняющих подпункты и задачи, восемь, и
   забыть один из них — вопрос времени.

   Уровни, где считать нечего, не трогаем: задача без подпунктов и этап без
   задач остаются полностью ручными. */
function syncCompletion(){
  var i, j;

  for (i = 0; i < S.tasks.length; i++){
    var t = S.tasks[i];
    if (!t.subtasks || !t.subtasks.length) continue;
    t.done = t.subtasks.every(function(sub){ return sub.done; });
  }

  for (i = 0; i < S.goals.length; i++){
    var g = S.goals[i];
    if (!g.stages || !g.stages.length){ g.done = false; continue; }
    for (j = 0; j < g.stages.length; j++){
      var st = g.stages[j];
      // Этап-копилка меряется рублями, а не задачами: её готовность считает
      // finSyncJarStages, и перебивать её числом задач нельзя.
      if (st.jarId) continue;
      var own = S.tasks.filter(function(task){ return task.stageId === st.id; });
      if (!own.length) continue;              // этап без задач закрывают руками
      var all = own.every(function(task){ return task.done; });
      if (all) st.status = 'done';
      else if (st.status === 'done') st.status = 'active';
    }
    g.done = g.stages.every(function(stage){ return stage.status === 'done'; });
  }
}

function commit(message){
  finSyncJarStages();
  syncCompletion();
  if (tourCheck() && !message) message = 'Первые шаги пройдены';
  // Сообщение держим в переменной, а не в S: попав в localStorage, оно
  // всплывало бы снова при каждом открытии страницы.
  if (message) pendingToast = message;
  save();
  // Расписание пересобирается после любой правки: задача закрылась, время
  // сдвинули, цель удалили — система об этом сама не узнает.
  пересобратьНапоминания();
  render();
}

/// Сказать что-то, ничего не перерисовывая: для отказов, после которых
/// состояние не поменялось.
function toast(message){
  pendingToast = message;
  showToast();
}

/* Отказ показывается у того поля, из-за которого он случился.

   Плашка внизу экрана — правильный способ сказать «сделано», но негодный,
   чтобы сказать «не сделано»: человек смотрит в поле, куда только что писал,
   а сообщение улетает к нижнему краю и через три секунды гаснет. На телефоне
   его вдобавок закрывает нижняя панель.

   Поэтому: поле краснеет, под ним встаёт строка с причиной, и всё это
   гаснет от первого же нажатия клавиши — как только человек начал править,
   ругаться больше не на что. */
function fieldError(id, message){
  var node = $(id);
  if (!node){ toast(message); return; }

  node.classList.add('bad');
  var hint = document.getElementById(id + '-err');
  if (!hint){
    hint = document.createElement('p');
    hint.className = 'field-err';
    hint.id = id + '-err';
    var box = node.closest ? node.closest('.field') : null;
    if (box){
      box.appendChild(hint);
    } else {
      /* Поле стоит в ряду с кнопкой, а ряд — это flex. Положить подсказку
         внутрь него значит сделать её третьей колонкой: строка ввода
         сплющивается в кружок, а текст встаёт сбоку от кнопки. Кладём под
         весь ряд. */
      var row = node.parentNode;
      row.parentNode.insertBefore(hint, row.nextSibling);
    }
  }
  hint.textContent = message;

  var clear = function(){
    node.classList.remove('bad');
    if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
    node.removeEventListener('input', clear);
  };
  node.addEventListener('input', clear);
  node.focus();
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
    S.theme = isDarkNow() ? 'light' : 'dark';
    commit();
  },
  more: function(){ S.more = !S.more; commit(); },

  /* Ассистент. Строка из композера подставляется в поле — чаще всего человек
     уже начал печатать там и только потом сообразил, что это просьба к Syn. */
  ai: function(){
    // Написанное в строке создания уходит Syn как есть: «разбери мой день»
    // набирают там же, где обычную задачу, и жмут искру вместо стрелки.
    var field = $('field');
    var draft = field ? field.value.trim() : '';
    S.synIntent = '';
    S.synGoalCreate = false;
    synRender(draft, '');
    if (draft){
      S.draft = '';
      synSend(draft);
    }
  },
  /* Тот же ассистент, но разговор про цели. Намерение задаётся явно, а не
     угадывается по словам: «хочу английский» на экране задач — это задача, а
     на экране целей — цель, и различает их не текст, а место, откуда нажали. */
  'ai-goal': function(){
    var field = $('gfield');
    var draft = field ? field.value.trim() : '';
    S.synIntent = 'planning';
    // Поле создания цели уже сказало, чего человек хочет, — ему незачем
    // повторять «создай цель» словами. Без этой подсказки Syn отвечал
    // предложением и вопросом вместо готовой цели с этапами.
    S.synGoalCreate = true;
    synRender(draft, '');
    if (draft){
      S.goalDraft = '';
      synSend(draft);
    }
  },
  'syn-send': function(){
    var field = $('syn-input');
    synSend(field ? field.value.trim() : '');
  },
  briefing: function(){ briefingRun(); },
  'briefing-say': function(){
    if (speech.on){ speechStop(); render(); return; }
    // Перерисовываем по окончании: кнопка должна вернуться в «Прослушать»
    // сама, а не остаться «Остановить» на замолчавшем экране.
    speechSay(briefingSpeech(), function(){ render(); });
    render();
  },
  'syn-voice': function(){
    if (voice.on) { voiceStop(); synRender($('syn-input') ? $('syn-input').value : '', ''); }
    else voiceStart();
  },
  /* Разобрать фразу своим парсером и завести задачу. Тот же путь, что у
     строки создания: «купить корм коту завтра в 11 утра» превращается в
     задачу с датой и временем без всякого сервера. */
  'syn-local': function(d){
    var item = S.synChat[Number(d.i)];
    if (!item || !item.said) return;
    var parsed = parseSchedule(item.said, 'today');
    if (!parsed.title) return;
    S.tasks.push({
      id: uid(), title: parsed.title, bucket: parsed.bucket, date: parsed.date, done: false, note: '',
      time: parsed.time, repeat: '', series: null, goalId: null, stageId: null, subtasks: []
    });
    S.closed[parsed.bucket] = false;
    item.none = false;
    item.done = ['создана задача «' + parsed.title + '» — разобрано без Syn'];
    save();
    synRender('', '');
    render();
  },

  'syn-again': function(d){
    var item = S.synChat[Number(d.i)];
    if (!item || !item.said) return;
    // Убираем неудачную пару реплик: иначе она поедет на сервер как контекст,
    // в котором Syn уже «ответил», и он повторит тот же ответ.
    S.synChat = S.synChat.slice(0, Number(d.i) - 1);
    save();
    synSend(item.said);
  },

  'syn-clear': function(){
    S.synChat = [];
    save();
    synRender('', '');
  },
  'pro-copy': function(){
    if (!S.pro.code || !navigator.clipboard) return;
    navigator.clipboard.writeText(S.pro.code).then(function(){
      toast('Код скопирован');
    }).catch(function(){});
  },
  /* --- подписка --- */
  'pro-code': function(){ openModal(modalProCode('', false)); },

  'pro-activate': function(){
    var field = $('procode');
    var code = field ? field.value.trim() : '';
    if (!code) return;
    openModal(modalProCode('', true));

    proActivate(code).then(function(pro){
      if (!pro.active){
        openModal(modalProCode('Код принят, но подписка по нему неактивна.', false));
        return;
      }
      closeModal();
      commit('Подписка включена');
    }).catch(function(error){
      var message = error && error.message ? error.message : 'Не получилось';
      if (error && error.status === undefined) message = 'Сервер не ответил. Проверь соединение.';
      openModal(modalProCode(message, false));
    });
  },

  'pro-refresh': function(){
    if (!S.pro.code) return toast('Код не сохранён — введи его заново');
    proActivate(S.pro.code).then(function(pro){
      commit(pro.active ? 'Подписка на месте' : 'Подписка больше не активна');
    }).catch(function(){
      toast('Не удалось проверить: сервер не ответил');
    });
  },

  'pro-forget': function(){
    S.pro = { active: false, plan: '', expiresAt: '', code: '' };
    commit('Код отвязан от этого браузера');
  },

  'set-theme': function(d){ S.theme = d.theme; commit(); },
  'set-palette': function(d){
    var i = PALETTES.map(function(p){ return p.id; }).indexOf(d.palette);
    if (!lookOpen('palettes', i)) return openModal(modalLookPaywall('тема'));
    S.palette = d.palette; commit();
  },
  'set-font': function(d){ S.font = d.font; commit(); },
  'set-fontsize': function(d){ S.fontSize = d.size; commit(); },
  'set-mark-color': function(d){
    if (!isPro() && d.color !== 'default') return openModal(modalLookPaywall('цвет отметки'));
    S.markColor = d.color; commit();
  },
  'set-box': function(d){
    var i = BOXES.map(function(b){ return b.id; }).indexOf(d.box);
    if (!lookOpen('boxes', i)) return openModal(modalLookPaywall('форма отметки'));
    S.box = d.box; commit();
  },

  /* Дни недели в своём правиле переключаются на месте, без перерисовки модалки:
     перерисовка стёрла бы остальные поля, которые человек уже заполнил. */
  'rule-day': function(d){
    var button = document.querySelector('#m-rdays .radio[data-day="' + d.day + '"]');
    if (!button) return;
    button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  },

  /* Фото профиля. Кладём его в состояние как data-URI, поэтому картинку
     сначала ужимаем: снимок с телефона — это мегабайты, а весь localStorage
     обычно пять. Квадрат 256×256 умещается примерно в 30 КБ. */
  'avatar-pick': function(){
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Поле кладём в документ, а не оставляем висеть в воздухе: у Сафари на
    // айфоне не привязанное к дереву поле выбора файла бывает не отдаёт
    // change вовсе, и выбранное фото просто пропадает.
    input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
    document.body.appendChild(input);

    var cleanup = function(){ if (input.parentNode) input.parentNode.removeChild(input); };

    input.addEventListener('change', function(){
      var file = input.files && input.files[0];
      if (!file){ cleanup(); return; }
      if (!/^image\//.test(file.type)){ toast('Это не изображение'); cleanup(); return; }
      shrinkImage(file, 256, function(dataUrl){
        cleanup();
        if (!dataUrl){ toast('Не удалось прочитать файл'); return; }
        S.profile.avatar = dataUrl;
        commit('Фото обновлено');
        // Кружок в шапке обновляем и напрямую: если страница вернулась
        // снимком после выбора фото, перерисовка могла не дойти до экрана.
        var top = document.querySelector('.top .avatar');
        if (top){
          top.textContent = '';
          top.style.backgroundImage = 'url(' + dataUrl + ')';
        }
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

  /* Выход из веб-версии ведёт на главную сайта — туда, где рассказано, что это
     за продукт. Уходя, человек попадает не в пустоту и не на форму входа, а на
     страницу, с которой сюда и приходят.

     Записи не трогаем: они лежат в этом браузере, и стирать их за человека — не
     то, о чём просили. Для стирания есть «Настройки → Данные». */
  leave: function(){
    S.more = false;
    save();
    location.href = '../';
  },

  /* --- задачи --- */
  add: function(){ S.hintSeen = true; addTask(); },
  'hint-off': function(){ S.hintSeen = true; commit(); },
  /* --- финансы --- */
  'fin-tab': function(d){ S.finTab = d.tab; commit(); },
  'fin-pay-tab': function(d){ S.finPayTab = d.kind; commit(); },
  'fin-month': function(d){
    var step = Number(d.step);
    S.finMonth = step === 0 ? '' : finMonthShift(finShownMonth(), step);
    if (S.finMonth === finMonthKey()) S.finMonth = '';
    commit();
  },

  'fin-opening': function(){ openModal(modalOpening()); },
  'fin-opening-save': function(){
    var raw = mval('m-amount');
    var parsed = finParse(raw, 'spend');
    if (!parsed) return fieldError('m-amount', 'Сколько у вас сейчас? Одним числом.');
    // Минус тоже бывает: на кредитке остаток отрицательный.
    S.finance.opening = /^\s*[-−]/.test(raw) ? -parsed.amount : parsed.amount;
    closeModal();
    commit('Записано');
  },

  /* --- конверты --- */
  'fin-budget-new': function(){
    if (!canAdd('budgets')) return openModal(modalPaywall('budgets'));
    openModal(modalBudget(''));
  },
  'fin-budget-edit': function(d){ openModal(modalBudget(d.cat)); },
  'fin-budget-save': function(){
    var cat = $('m-cat') ? $('m-cat').value : '';
    var parsed = finParse(mval('m-amount'), 'spend');
    if (!parsed) return fieldError('m-amount', 'Сколько кладём на эту категорию в месяц?');
    if (!cat) return;
    var fresh = !(S.finance.budgets || {})[cat];
    if (fresh && !canAdd('budgets')) return openModal(modalPaywall('budgets'));
    S.finance.budgets[cat] = parsed.amount;
    closeModal();
    commit('Конверт «' + finCat(cat).title + '» — ' + finMoney(parsed.amount));
  },
  'fin-budget-kill': function(d){
    delete S.finance.budgets[d.cat];
    commit('Конверт убран');
  },

  /* --- свои категории --- */
  'fin-cat-new': function(){
    if (!canAdd('cats')) return openModal(modalPaywall('cats'));
    openModal(modalText('Своя категория', 'Название пойдёт в списки и в подсказки разбора.',
      'Название', 'fin-cat-save', 'Например, Дети'));
  },
  'fin-cat-save': function(){
    var title = mval('m-title');
    if (!title) return fieldError('m-title', 'Как назвать категорию?');
    if (!canAdd('cats')) return openModal(modalPaywall('cats'));
    S.finance.cats.push({
      id: 'own' + uid(), title: title,
      // Оттенок по названию: одно и то же слово всегда даёт один цвет, и
      // список не перекрашивается при каждой перезагрузке.
      hue: (title.split('').reduce(function(a, c){ return a + c.charCodeAt(0); }, 0) * 37) % 360,
      words: [title.toLowerCase()]
    });
    closeModal();
    commit('Категория добавлена');
  },
  'fin-kind': function(d){ S.finKind = d.kind; commit(); },

  'fin-add': function(){
    var field = $('finfield');
    if (!field) return;
    var parsed = finParse(field.value, S.finKind || 'spend');
    if (!parsed){
      return fieldError('finfield', field.value.trim()
        ? 'Не вижу суммы. Напишите её в той же строке: «' + field.value.trim() + ' 350»'
        : 'Напишите, что и на сколько: «кофе 350»');
    }
    var when = $('findate') ? $('findate').value : '';
    S.finance.ops.push({
      id: uid(), kind: S.finKind || 'spend', title: parsed.title,
      amount: parsed.amount, cat: parsed.cat,
      date: when || isoOf(todayDate()), at: Date.now(),
      accountId: ''
    });
    field.value = '';
    // Дата держится между записями: пачку за прошлую неделю иначе пришлось
    // бы выставлять заново на каждой строке.
    S.finDate = when || '';
    keepFocus('#finfield');
    commit();
  },
  'fin-ai': function(){
    var field = $('finfield');
    var draft = field ? field.value.trim() : '';
    if (!draft) return toast('Напишите, что записать: «вчера кофе 350 и такси 450»');
    S.synIntent = 'finance';
    S.synGoalCreate = false;
    if (field) field.value = '';
    synRender(draft, '');
    synSend(draft);
  },
  'fin-apply': function(){
    // Деньги пишутся только после подтверждения: ошибка в сумме портит и
    // сводку, и конверты, и остаток на счёте — в отличие от задачи, где
    // промах видно сразу и он ничего не ломает.
    var batch = S.finPending;
    if (!batch || !batch.length) return;
    S.finPending = null;
    var made = finApplyBatch(batch);
    commit(made.length ? made.join(', ') : 'Ничего не записалось');
  },
  'fin-drop': function(){
    S.finPending = null;
    commit('Не записано');
  },
  'fin-op-edit': function(d){
    var op = finOp(d.op);
    if (op) openModal(modalOp(op));
  },
  'fin-op-save': function(d){
    var op = finOp(d.op);
    var parsed = finParse(mval('m-amount'), 'spend');
    if (!op) return;
    if (!parsed) return fieldError('m-amount', 'Нужна сумма — одним числом');
    op.title = mval('m-title') || op.title;
    op.amount = parsed.amount;
    op.cat = $('m-cat') ? $('m-cat').value : op.cat;
    op.kind = $('m-opkind') ? $('m-opkind').value : op.kind;
    op.date = mval('m-due') || op.date;
    closeModal();
    commit('Запись изменена');
  },
  'fin-op-kill': function(d){
    S.finance.ops = S.finance.ops.filter(function(op){ return op.id !== d.op; });
    closeModal();
    commit('Запись удалена');
  },

  'fin-debt-new': function(){
    if (!canAdd('debts')) return openModal(modalPaywall('debts'));
    S.finDraftMine = true;
    openModal(modalDebt());
  },
  'fin-debt-side': function(d){
    // Переключатель внутри окна: перерисовываем только его, чтобы уже
    // набранные имя и сумма никуда не делись.
    S.finDraftMine = d.mine === '1';
    var box = document.querySelector('.sidepick');
    if (!box) return;
    var buttons = box.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++){
      buttons[i].classList.toggle('on', (buttons[i].getAttribute('data-mine') === '1') === S.finDraftMine);
    }
    var who = $('m-who-label');
    if (who) who.textContent = S.finDraftMine ? 'У кого взял' : 'Кто взял у меня';
    var when = $('m-due-label');
    if (when) when.textContent = S.finDraftMine ? 'Когда вернуть' : 'Когда должны вернуть';
  },
  'fin-debt-remind': function(d){
    var debt = finDebt(d.debt);
    if (!debt || !debt.due) return toast('Сначала поставьте срок возврата');
    finDebtTask(debt);
    commit('Задача на возврат поставлена');
  },
  'fin-debt-save': function(){
    var who = mval('m-who');
    var parsed = finParse(mval('m-amount'), 'spend');
    if (!who) return fieldError('m-who', S.finDraftMine !== false ? 'У кого вы заняли?' : 'Кто взял у вас?');
    if (!parsed) return fieldError('m-amount', 'Нужна сумма — одним числом');
    S.finance.debts.push({
      id: uid(), who: who, mine: S.finDraftMine !== false, amount: parsed.amount, paid: 0,
      due: mval('m-due'), note: mval('m-note'), closed: false, at: Date.now()
    });
    var mind = $('m-remind');
    if (mind && mind.checked) finDebtTask(S.finance.debts[S.finance.debts.length - 1]);
    closeModal();
    commit(S.finDraftMine ? 'Долг записан' : 'Записано, кто должен');
  },
  'fin-debt-pay': function(d){
    var debt = finDebt(d.debt);
    if (debt) openModal(modalDebtPay(debt));
  },
  'fin-debt-pay-all': function(d){
    var debt = finDebt(d.debt);
    var field = $('m-amount');
    if (debt && field) field.value = String(Math.round(Math.max(0, debt.amount - (debt.paid || 0)) / 100));
  },
  'fin-debt-pay-save': function(d){
    var debt = finDebt(d.debt);
    if (!debt) return;
    var parsed = finParse(mval('m-amount'), 'spend');
    if (!parsed) return fieldError('m-amount', 'Сколько отдали? Можно частью.');
    closeModal();
    debt.paid = Math.min(debt.amount, (debt.paid || 0) + parsed.amount);
    if (debt.paid >= debt.amount){
      debt.closed = true;
      if (debt.taskId) S.tasks = S.tasks.filter(function(t){ return t.id !== debt.taskId; });
      debt.taskId = '';
    }
    commit(debt.closed ? 'Долг закрыт' : 'Возврат записан');
  },
  'fin-debt-close': function(d){
    var debt = finDebt(d.debt);
    if (!debt) return;
    debt.closed = true;
    commit('Долг закрыт');
  },
  'fin-debt-open': function(d){
    var debt = finDebt(d.debt);
    if (!debt) return;
    debt.closed = false;
    commit();
  },
  'fin-debt-kill': function(d){
    var debt = finDebt(d.debt);
    if (debt && debt.taskId) S.tasks = S.tasks.filter(function(t){ return t.id !== debt.taskId; });
    S.finance.debts = S.finance.debts.filter(function(x){ return x.id !== d.debt; });
    commit('Удалено');
  },

  'fin-jar-new': function(){
    if (!canAdd('jars')) return openModal(modalPaywall('jars'));
    openModal(modalJar(null));
  },
  'fin-jar-edit': function(d){ openModal(modalJar(finJar(d.jar))); },
  'fin-jar-save': function(d){
    var title = mval('m-title');
    var parsed = finParse(mval('m-amount'), 'spend');
    if (!title) return fieldError('m-title', 'На что копим?');
    if (!parsed) return fieldError('m-amount', 'Сколько нужно собрать?');
    var jar = finJar(d.jar);
    if (jar){
      jar.title = title; jar.target = parsed.amount; jar.due = mval('m-due');
    } else {
      if (!canAdd('jars')) return openModal(modalPaywall('jars'));
      jar = { id: uid(), title: title, target: parsed.amount, saved: 0,
              due: mval('m-due'), at: Date.now(), goalId: '', stageId: '' };
      S.finance.jars.push(jar);
    }
    // Копилка как этап цели: деньги перестают жить отдельно от жизни. Ни один
    // трекер расходов так не умеет — там сумма сама по себе, а зачем она
    // нужна, человек держит в голове.
    var goalId = $('m-goal') ? $('m-goal').value : '';
    finLinkJarToGoal(jar, goalId);
    closeModal();
    commit(goalId ? 'Копилка в цели' : 'Копилка сохранена');
  },
  'fin-jar-put': function(d){ finJarMove(d.jar, 1); },
  'fin-jar-take': function(d){ finJarMove(d.jar, -1); },
  'fin-jar-kill': function(d){
    S.finance.jars = S.finance.jars.filter(function(x){ return x.id !== d.jar; });
    commit('Копилка удалена');
  },

  'fin-sub-new': function(d){
    if (!canAdd('subs')) return openModal(modalPaywall('subs'));
    S.finDraftDuty = d.duty === '1';
    S.finDraftCat = '';
    openModal(modalSub(null));
  },
  'fin-sub-edit': function(d){ openModal(modalSub(finSub(d.sub))); },
  'fin-sub-tpl': function(d){
    var tpl = FIN_SUB_TEMPLATES[Number(d.tpl)];
    if (!tpl) return;

    /* Шаблон заполняет поля, а не заводит платёж.

       Сразу заводить быстрее ровно один раз — когда всё совпало. А сумма в
       шаблоне ориентировочная, дата списания у каждого своя, и человек почти
       всегда что-то правит. Записывать за него и предлагать поправить потом —
       значит делать лишний шаг обязательным. */
    if ($('m-title')) $('m-title').value = tpl.title;
    if ($('m-amount')) $('m-amount').value = tpl.amount ? String(Math.round(tpl.amount / 100)) : '';
    if ($('m-every')) $('m-every').value = tpl.every;
    // Категорию шаблон приносит с собой, но спрашивать о ней незачем: её
    // видно только в аналитике, и угадана она верно.
    S.finDraftCat = finCat(tpl.cat || (tpl.duty ? 'home' : 'subs')).id;

    // Список закрывается: под ним поля, ради которых его и открывали.
    var pick = document.querySelector('.tplpick');
    if (pick) pick.open = false;

    var amount = $('m-amount');
    if (amount){ amount.focus(); amount.select(); }
  },
  'fin-sub-save': function(d){
    var title = mval('m-title');
    /* Сумма необязательна: без неё платёж просто ждёт первой оплаты и с неё
       же берёт цифру. Это и есть ответ для квартплаты и всего, что считают по
       счётчику, — вместо галочки «сумма каждый месяц своя», которую надо было
       сперва прочитать, потом понять, потом нажать. */
    var parsed = finParse(mval('m-amount') || '0', 'spend') || { amount: 0 };
    if (!title) return fieldError('m-title', 'За что платите?');
    var every = $('m-every') ? $('m-every').value : 'month';
    var since = mval('m-due') || isoOf(todayDate());
    var cat = $('m-cat') ? $('m-cat').value
      : (S.finDraftCat || (S.finDraftDuty ? 'home' : 'subs'));
    var duty = $('m-duty') ? $('m-duty').value === '1' : !!S.finDraftDuty;
    var sub = finSub(d.sub);
    if (sub){
      sub.title = title; sub.amount = parsed.amount; sub.every = every;
      sub.since = since; sub.cat = cat; sub.duty = duty;
    } else {
      if (!canAdd('subs')) return openModal(modalPaywall('subs'));
      sub = { id: uid(), title: title, amount: parsed.amount, every: every,
              since: since, off: false, taskId: '', cat: cat,
              duty: duty, paid: {}, ops: {} };
      S.finance.subs.push(sub);
    }

    var remind = $('m-remind');
    var want = !!(remind && remind.checked);
    if (want && !sub.taskId) finSubRemind(sub);
    if (!want && sub.taskId){
      // Галочку сняли — напоминание уходит вместе с ней.
      S.tasks = S.tasks.filter(function(t){ return t.id !== sub.taskId; });
      sub.taskId = '';
    }

    closeModal();
    commit(want ? 'Записано, напоминание стоит' : 'Записано');
  },
  /* --- регулярные операции --- */
  'fin-rec-new': function(){
    if (!canAdd('recurring')) return openModal(modalPaywall('recurring'));
    openModal(modalRecurring(null));
  },
  'fin-rec-edit': function(d){ openModal(modalRecurring(finRec(d.rec))); },
  'fin-rec-save': function(d){
    var title = mval('m-title');
    var parsed = finParse(mval('m-amount'), 'spend');
    if (!title) return fieldError('m-title', 'Как называется операция?');
    if (!parsed) return fieldError('m-amount', 'Нужна сумма — одним числом');
    var rule = finRec(d.rec);
    var patch = {
      title: title, amount: parsed.amount,
      kind: $('m-opkind') ? $('m-opkind').value : 'spend',
      cat: $('m-cat') ? $('m-cat').value : 'other',
      every: $('m-every') ? $('m-every').value : 'month',
      since: mval('m-due') || isoOf(todayDate()),
      accountId: ''
    };
    if (rule){ for (var k in patch) if (patch.hasOwnProperty(k)) rule[k] = patch[k]; }
    else {
      patch.id = uid(); patch.off = false; patch.lastRun = '';
      S.finance.recurring.push(patch);
    }
    closeModal();
    var made = finRunRecurring();
    commit(made ? 'Правило записано, добавлено операций: ' + made : 'Правило записано');
  },
  'fin-rec-toggle': function(d){
    var rule = finRec(d.rec);
    if (!rule) return;
    rule.off = !rule.off;
    commit();
  },
  'fin-rec-kill': function(d){
    S.finance.recurring = S.finance.recurring.filter(function(x){ return x.id !== d.rec; });
    commit('Правило убрано');
  },

  'fin-sub-pay': function(d){
    var sub = finSub(d.sub);
    if (!sub) return;
    var key = finShownMonth();
    if (!sub.paid) sub.paid = {};

    // Повторное нажатие снимает отметку и убирает записанную трату: отметить
    // не тот платёж — обычное дело, и откат должен быть тем же нажатием.
    if (sub.paid[key]){
      var opId = (sub.ops || {})[key];
      if (opId) S.finance.ops = S.finance.ops.filter(function(op){ return op.id !== opId; });
      delete sub.paid[key];
      if (sub.ops) delete sub.ops[key];
      return commit('Отметка снята');
    }

    var typical = finSubTypical(sub);
    var answer = prompt('Сколько заплатили за «' + sub.title + '»?',
      typical ? String(Math.round(typical / 100)) : '');
    if (answer === null) return;
    var parsed = finParse(answer, 'spend');
    if (!parsed) return toast('Нужна сумма одним числом');

    /* Платёж становится обычной тратой в ленте — иначе его не видно ни в
       сводке, ни в конвертах, ни в аналитике, и раздел платежей живёт сам по
       себе. Ради этого он тут и заведён: заплатил за свет — свет попал в
       категорию «Дом» вместе со всем остальным. */
    var op = {
      id: uid(), kind: 'spend', title: sub.title, amount: parsed.amount,
      cat: finCat(sub.cat || 'subs').id,
      date: isoOf(todayDate()), at: Date.now(),
      accountId: '',
      fromSub: sub.id
    };
    S.finance.ops.push(op);

    sub.paid[key] = parsed.amount;
    if (!sub.ops) sub.ops = {};
    sub.ops[key] = op.id;
    /* Первая оплата задаёт сумму платежу, у которого её не было: так
       квартплата перестаёт быть прочерком в таблице, а человеку не пришлось
       ничего отмечать заранее. Дальше сумма остаётся справочной — в расчёте
       всё равно участвует среднее по оплатам. */
    if (!sub.amount) sub.amount = parsed.amount;
    commit('Записано: ' + sub.title + ' — ' + finMoney(parsed.amount));
  },
  'fin-sub-toggle': function(d){
    var sub = finSub(d.sub);
    if (!sub) return;
    sub.off = !sub.off;
    commit();
  },
  'fin-sub-kill': function(d){
    var sub = finSub(d.sub);
    // Напоминание уходит вместе с подпиской: иначе оно продолжит напоминать
    // про списание, которого больше нет.
    if (sub && sub.taskId) S.tasks = S.tasks.filter(function(t){ return t.id !== sub.taskId; });
    S.finance.subs = S.finance.subs.filter(function(x){ return x.id !== d.sub; });
    commit('Удалено');
  },
  'trash-restore': function(d){
    var title = trashRestore(d.item);
    if (!title) return;
    commit('Вернули «' + title + '»');
  },
  'trash-kill': function(d){
    var item = trashFind(d.item);
    if (!item) return;
    S.trash = S.trash.filter(function(entry){ return entry.id !== d.item; });
    commit('Стёрто навсегда');
  },
  'trash-empty': function(){
    if (!S.trash.length) return;
    var count = S.trash.length;
    // Стирание насовсем — единственное действие во всём сервисе, которое
    // нечем отменить: спрашиваем, и с числом, чтобы человек видел объём.
    if (!confirm('Стереть навсегда ' + count + ' ' +
        plural(count, 'запись', 'записи', 'записей') + '? Вернуть их будет нельзя.')) return;
    S.trash = [];
    commit('Корзина пуста: стёрто ' + count);
  },
  'trash-restore-all': function(){
    if (!S.trash.length) return;
    // Идём по копии списка: trashRestore вынимает записи из S.trash по ходу.
    var ids = S.trash.map(function(entry){ return entry.id; });
    var back = 0;
    for (var i = 0; i < ids.length; i++) if (trashRestore(ids[i])) back++;
    commit(back ? 'Вернули ' + back + ' ' + plural(back, 'запись', 'записи', 'записей')
                : 'Вернуть не удалось');
  },
  'tour-hide': function(){ S.tourDone = true; commit('Первые шаги скрыты'); },
  toggle: function(d){
    var t = findTask(d.task);
    if (!t) return;
    t.done = !t.done;
    // Родитель ведёт за собой подпункты. Без этого syncCompletion пересчитал
    // бы задачу обратно по незакрытым подпунктам — нажатие выглядело бы
    // как не сработавшее.
    if (t.subtasks && t.subtasks.length){
      for (var si = 0; si < t.subtasks.length; si++) t.subtasks[si].done = t.done;
    }
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
    /* Раскрытая карточка и открытый свайп несовместимы: панель правки тянется
       на всю высоту карточки, а раскрытая вдвое выше — кнопки оказывались
       посреди подпунктов и накрывали поле ввода. Раскрываем — закрываем. */
    if (inApp()) swipeCloseAll(null);
    S.open[d.task] = !S.open[d.task];
    save();
    var card = document.querySelector('.item[data-task="' + d.task + '"]');
    if (!card){ render(); return; }
    var title = card.querySelector('.t');
    if (title) title.setAttribute('aria-expanded', String(!!S.open[d.task]));
    foldOpen(card, card.querySelector('.detail-wrap'), S.open[d.task]);
  },
  'kill-task': function(d){
    var task = findTask(d.task);
    if (!task) return;
    trashPut('task', task);
    S.tasks = S.tasks.filter(function(t){ return t.id !== d.task; });
    commit('Задача в корзине');
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
    if (t.repeat === CUSTOM_REPEAT){
      var days = [].map.call(document.querySelectorAll('#m-rdays .radio[aria-pressed="true"]'), function(b){
        return Number(b.getAttribute('data-day'));
      });
      var dates = (mval('m-rdates') || '').split(',').map(function(part){ return parseInt(part, 10); })
        .filter(function(n){ return n >= 1 && n <= 31; });
      t.rule = {
        unit: mval('m-runit') || 'day',
        interval: Math.max(1, Math.min(365, Number(mval('m-rint')) || 1)),
        weekdaysOnly: false,
        weeklyWeekdays: days,
        monthlyDays: dates
      };
      // Правило без единицы и без дней — это отсутствие правила, а не пустое
      // правило: иначе задача считалась бы повторяющейся и молча плодила копии.
      if (t.rule.unit === 'week' && !days.length && t.rule.interval === 1) t.rule.weeklyWeekdays = [];
    } else {
      t.rule = null;
    }
    var dlDate = mval('m-dl-date');
    var dlTime = mval('m-dl-time');
    // Время без даты — это «сегодня до»: срок без дня недоказуем.
    t.deadline = (dlDate || dlTime)
      ? { date: dlDate || isoOf(todayDate()), time: dlTime || null, hard: !!(t.deadline && t.deadline.hard) }
      : null;
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
  /* Сворачивание блока идёт так же плавно, как раскрытие карточки, и по той
     же причине не перерисовывает экран. Класс на секции инвертирован
     (closed вместо open), поэтому foldOpen получает уже готовое состояние. */
  fold: function(d){
    S.closed[d.bucket] = !S.closed[d.bucket];
    save();
    var group = document.querySelector('.group[data-bucket="' + d.bucket + '"]');
    if (!group){ render(); return; }
    var open = !S.closed[d.bucket];
    var head = group.querySelector('.group-h');
    if (head){
      head.classList.toggle('closed', !open);
      head.setAttribute('aria-expanded', String(open));
    }
    foldGroup(group, group.querySelector('.tasklist-wrap'), open);
  },

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
    input.value = '';
    keepFocus('[data-subadd="' + d.task + '"]');
    commit();
  },

  /* --- цели --- */
  'new-goal': function(){
    if (!canAdd('goals')) return openModal(modalPaywall('goals'));
    openModal(modalGoal(null));
  },
  'edit-goal': function(d){ openModal(modalGoal(findGoal(d.goal))); },
  'save-goal': function(d){
    var title = mval('m-title');
    if (!title) return;
    var purpose = $('m-purpose') ? $('m-purpose').value.trim() : '';
    var horizon = mval('m-horizon');
    var target = mval('m-target') || '';
    if (d.goal){
      var g = findGoal(d.goal);
      if (g){ g.title = title; g.purpose = purpose; g.horizon = horizon; g.targetDate = target; }
    } else {
      if (!canAdd('goals')) return openModal(modalPaywall('goals'));
      var fresh = { id: uid(), title: title, purpose: purpose, horizon: horizon, targetDate: target,
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
    if (!canAdd('goals')) return openModal(modalPaywall('goals'));
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
    var goal = findGoal(d.goal);
    if (!goal) return;
    // Вместе с целью её задачи не удаляются, а отвязываются: задача остаётся в
    // своём блоке дня, потому что она всё ещё дело, которое надо сделать.
    // Связи запоминаем, чтобы восстановление вернуло не только цель.
    var links = S.tasks.filter(function(t){ return t.goalId === d.goal; })
      .map(function(t){ return { id: t.id, stageId: t.stageId }; });
    trashPut('goal', goal, { taskIDs: links });
    S.goals = S.goals.filter(function(g){ return g.id !== d.goal; });
    S.tasks.forEach(function(t){ if (t.goalId === d.goal){ t.goalId = null; t.stageId = null; } });
    S.activeGoal = null;
    S.view = 'goals';
    commit('Цель в корзине, её задачи остались');
  },
  'new-stage': function(d){ openModal(modalStage(d.goal)); },
  'save-stage': function(d){
    var g = findGoal(d.goal);
    var title = mval('m-title');
    if (!g || !title) return;
    var target = mval('m-target') || '';

    if (d.stage){
      var stage = findStage(g, d.stage);
      if (stage){ stage.title = title; stage.detail = mval('m-detail'); stage.targetDate = target; }
      closeModal();
      commit('Этап сохранён');
      return;
    }

    g.stages.push({ id: uid(), title: title, detail: mval('m-detail'), targetDate: target, status: 'planned' });
    closeModal();
    commit('Этап создан');
  },
  'edit-stage': function(d){
    var g = findGoal(d.goal);
    if (!g) return;
    var stage = findStage(g, d.stage);
    if (stage) openModal(modalStage(g.id, stage));
  },
  /* Отметка этапа руками сильнее пересчёта по задачам.

     Раньше галочка на этапе с незакрытыми задачами не держалась: обработчик
     ставил «готово», следом syncCompletion видел открытую задачу и возвращал
     «в работе». Снаружи это выглядит как кнопка, которая не нажимается, —
     человек жмёт, ничего не меняется, и он жмёт ещё раз.

     Решаем в пользу человека: сказал «этап пройден» — значит и его задачи
     сделаны, закрываем их вместе с ним.

     И ровно так же в обратную сторону. Сначала я снятие галочки задач не
     трогал — и получил ту же болезнь с другого конца: этап закрыт, все его
     задачи закрыты, жмёшь ещё раз, а пересчёт видит «все задачи сделаны» и
     снова ставит «готово». Галочка не снималась.

     Поэтому жест симметричен: отметка закрывает задачи этапа, снятие их
     открывает. Это обратное действие к тому, что человек только что сделал,
     а не самостоятельное решение за него. */
  'stage-toggle': function(d){
    var st = findStage(findGoal(d.goal), d.stage);
    if (!st) return;
    var закрываем = st.status !== 'done';
    st.status = закрываем ? 'done' : 'active';
    S.tasks.forEach(function(t){
      if (t.stageId !== st.id || t.done === закрываем) return;
      t.done = закрываем;
      if (t.subtasks) t.subtasks.forEach(function(sub){ sub.done = закрываем; });
    });
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
    input.value = '';
    keepFocus('[data-goaltask="' + d.stage + '"]');
    commit('Задача в блоке «' + bucketTitle(parsed.bucket) + '»');
  },

  /* --- списки --- */
  'new-list': function(){
    if (!canAdd('lists')) return openModal(modalPaywall('lists'));
    openModal(modalText('Новый список', 'Коротко опиши, для чего этот список.', 'Название списка', 'save-list', 'Например, Купить фрукты'));
  },
  'save-list': function(){
    var title = mval('m-title');
    if (!title) return fieldError('m-title', 'Как назвать список?');
    if (!canAdd('lists')) return openModal(modalPaywall('lists'));
    var fresh = { id: uid(), title: title, note: '', items: [] };
    S.lists.push(fresh);
    S.activeList = fresh.id;
    S.view = 'list';
    closeModal();
    commit();
  },
  'open-list': function(d){ S.activeList = d.list; go('list'); },
  'rename-list': function(d){
    var list = findList(d.list);
    if (!list) return;
    openModal(modalText('Переименовать список', '', 'Название списка', 'save-list-title', 'Название списка',
      { value: list.title, cta: 'Сохранить', attrs: ' data-list="' + list.id + '"' }));
  },
  'save-list-title': function(d){
    var list = findList(d.list);
    var title = mval('m-title');
    if (!list) return;
    if (!title) return fieldError('m-title', 'Название не может быть пустым');
    list.title = title;
    closeModal();
    commit('Название изменено');
  },
  'kill-list': function(d){
    var list = findList(d.list);
    if (!list) return;
    trashPut('list', list);
    S.lists = S.lists.filter(function(l){ return l.id !== d.list; });
    S.view = 'lists';
    commit('Список в корзине');
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
    input.value = '';
    keepFocus('[data-itemadd="' + d.list + '"]');
    commit();
  },

  /* --- заметки --- */
  'new-note': function(){
    if (!canAdd('notes')) return openModal(modalPaywall('notes'));
    openModal(modalText('Новая запись', '', 'Заголовок', 'save-note', 'Название'));
  },
  'save-note': function(){
    var title = mval('m-title');
    if (!title) return fieldError('m-title', 'Как назвать запись?');
    if (!canAdd('notes')) return openModal(modalPaywall('notes'));
    var fresh = { id: uid(), title: title, body: '' };
    S.notes.push(fresh);
    S.activeNote = fresh.id;
    S.view = 'note';
    closeModal();
    commit();
  },
  'open-note': function(d){ S.activeNote = d.note; go('note'); },
  'rename-note': function(d){
    var note = findNote(d.note);
    if (!note) return;
    openModal(modalText('Переименовать запись', '', 'Заголовок', 'save-note-title', 'Название',
      { value: note.title, cta: 'Сохранить', attrs: ' data-note="' + note.id + '"' }));
  },
  'save-note-title': function(d){
    var note = findNote(d.note);
    var title = mval('m-title');
    if (!note) return;
    if (!title) return fieldError('m-title', 'Название не может быть пустым');
    note.title = title;
    closeModal();
    commit('Название изменено');
  },
  'kill-note': function(d){
    var note = findNote(d.note);
    if (!note) return;
    trashPut('note', note);
    S.notes = S.notes.filter(function(n){ return n.id !== d.note; });
    S.view = 'notes';
    commit('Запись в корзине');
  },

  /* --- напоминания --- */
  'notify-on': function(){
    if (!S.notify.on && window.AndroidNotify && !window.AndroidNotify.permitted()){
      // Спрашиваем разрешение в момент включения, а не на запуске: тут понятно,
      // за что его просят. Ответ придёт событием, там и включим.
      window.AndroidNotify.ask();
      return;
    }
    S.notify.on = !S.notify.on;
    commit(S.notify.on ? 'Напоминания включены' : 'Напоминания выключены');
  },
  'notify-tasks': function(){ S.notify.tasks = !S.notify.tasks; commit(); },
  'notify-goals': function(){ S.notify.goals = !S.notify.goals; commit(); },
  'notify-brief': function(){ S.notify.brief = !S.notify.brief; commit(); },

  /* --- помодоро --- */
  'pomo-mode': function(d){
    if (!lookOpen('pomoModes', порядковыйРежима(d.mode))) return openModal(modalLookPaywall('режим'));
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
  'med-own': function(){
    var field = $('medown');
    if (!field) return;
    var minutes = Math.max(1, Math.min(180, Math.round(Number(field.value) || 0)));
    if (!minutes) return;
    S.meditation.minutes = minutes;
    keepFocus('#medown');
    commit();
  },
  /* Нажатие на среду включает её сразу же, не уводя никуда: звук выбирают
     ушами. Повторное нажатие по уже играющей — выключает. Если идёт сеанс,
     дорожка просто меняется на лету и не останавливается. */
  'med-sound': function(d){
    var номер = SOUNDS.map(function(x){ return x.id; }).indexOf(d.sound);
    if (!lookOpen('sounds', номер)) return openModal(modalLookPaywall('звук'));
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
    var theme = S.theme, view = S.view, palette = S.palette;
    S = demoState();
    S.theme = theme;
    S.palette = palette;
    S.view = view;
    commit('Примеры на месте');
  },
  wipe: function(){
    var theme = S.theme, view = S.view, palette = S.palette;
    S = seed();
    S.view = view;
    S.palette = palette;
    S.tasks = []; S.goals = []; S.lists = []; S.notes = [];
    S.pomodoro.doneToday = 0;
    S.meditation.doneTotal = 0;
    S.theme = theme;
    commit('Пусто');
  },

  'close-modal': function(){ closeModal(); }
};

/* ============ СОБЫТИЯ ============ */

/* Один делегированный обработчик на весь документ: экраны перерисовываются
   строками, вешать слушателей на узлы бессмысленно. */
/* После переноса браузер шлёт click по тому, что было под пальцем, — а под
   ним название задачи, то есть «раскрыть карточку». Гасим по времени, а не
   флагом: click после жеста приходит не всегда, и одноразовый флаг съел бы
   следующее честное нажатие. */
var перенёсВ = 0;

document.addEventListener('click', function(event){
  if (перенёсВ && Date.now() - перенёсВ < 350){ event.preventDefault(); event.stopPropagation(); return; }
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

/* Список повторов управляет блоком своего правила: выбрал «Своё правило…» —
   блок появился. Через класс, а не перерисовкой: перерисовка стёрла бы уже
   заполненные поля модалки. */
document.addEventListener('change', function(event){
  var поле = event.target.getAttribute && event.target.getAttribute('data-notify-time');
  if (поле){ S.notify[поле] = event.target.value || S.notify[поле]; commit(); return; }
  // Своя длительность применяется, когда поле отпустили: пересчитывать на
  // каждой цифре значит менять круг с «1» на «14» по дороге к «140».
  if (event.target.id === 'medown'){ ACTS['med-own']({}); return; }
  if (event.target.id !== 'm-repeat') return;
  var block = $('m-ruleblock');
  if (block) block.classList.toggle('on', event.target.value === CUSTOM_REPEAT);
});

document.addEventListener('input', function(event){
  var t = event.target;
  // Взялись править сказанное руками — значит, отправлять пока рано.
  if (t.id === 'syn-input'){
    voiceCancelPending();
    growInput(t);
    return;
  }
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
    growNote(t);
  }
});

document.addEventListener('focusin', function(event){
  if (event.target.id === 'field' || event.target.id === 'gfield') composerFocused = true;
});
document.addEventListener('focusout', function(event){
  if (event.target.id === 'field' || event.target.id === 'gfield') composerFocused = false;
});

document.addEventListener('keydown', function(event){
  // В textarea Enter по умолчанию переносит строку и формы не отправляет.
  // Для разговора нужнее отправка: перенос остаётся на Shift+Enter.
  if (event.key === 'Enter' && !event.shiftKey && event.target.id === 'syn-input'){
    event.preventDefault();
    synSend(event.target.value.trim());
    return;
  }

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
  if (t.id === 'finfield'){ event.preventDefault(); ACTS['fin-add']({}); return; }
  if (t.id === 'medown'){ event.preventDefault(); ACTS['med-own']({}); return; }
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
   добавленная последней, оставалась последней навсегда.

   Как это выглядит теперь: соседи расступаются. Место, куда карточка сядет,
   показывает не полоска между чужими карточками, а настоящая щель — те, что
   ниже, отъезжают ровно на её высоту. Полоска требовала догадки «что будет,
   если отпустить»; щель этот вопрос снимает.

   Сдвиг делается transform'ом, а не изменением разметки: перекладывать узлы
   под пальцем нельзя — карточка, которую держат, оказалась бы вырвана из
   дерева, а весь список бы дёрнулся. */

/// Насколько элемент сейчас сдвинут нами. Хранится на самом узле: считать это
/// из getBoundingClientRect нельзя — там уже учтён сам сдвиг.
function shiftOf(node){ return node.__shift || 0; }

function setShift(node, value){
  if (shiftOf(node) === value) return;
  node.__shift = value;
  node.style.transform = value ? 'translateY(' + value + 'px)' : '';
}

function clearShifts(){
  var moved = document.querySelectorAll('.tasklist .item');
  for (var i = 0; i < moved.length; i++) setShift(moved[i], 0);
}

/* Полный сброс вида после жеста — без оглядки на то, чем он кончился.

   Прежняя уборка снимала сдвиг только с той карточки, ссылка на которую
   лежала в состоянии переноса, и стояла ЗА проверкой «а состояние ещё есть?».
   Жест, оборвавшийся не отпусканием, оставлял карточку висеть со своим
   transform: в списке дыра, а сама она уехала за нижние блоки. Владелец
   поймал это, утащив задачу ниже всех дней и отпустив там.

   Теперь чистим всё, что могло остаться, по разметке, а не по памяти. */
/// Положение карточки без нашего сдвига — для мышиного пути этого довольно:
/// там раскладка под курсором не едет, потому что карточку несёт браузер.
function baseTop(node){
  return node.getBoundingClientRect().top - shiftOf(node);
}

/// Перед какой карточкой встанет перетаскиваемая мышью. По середине соседа:
/// у курсора нет дрожания пальца, и усложнять здесь нечего.
function dropTargetIn(zone, clientY){
  var cards = zone.querySelectorAll('.item:not(.dragging)');
  for (var i = 0; i < cards.length; i++){
    if (clientY < baseTop(cards[i]) + cards[i].offsetHeight / 2) return cards[i].getAttribute('data-task');
  }
  return null;
}

/* Раздвинуть карточки так, чтобы щель оказалась там, куда сядет перенесённая.

   Внутри своего блока карточка занимает своё место, поэтому соседи не
   раздвигаются, а меняются с ней местами: те, через кого её пронесли, съезжают
   на её высоту в обратную сторону. В чужом блоке щель открывается просто —
   всё, что ниже места вставки, уезжает вниз. */
/* Плашка на месте, куда сядет карточка.

   Щели между соседями мало: она читается как «здесь чего-то не хватает», а не
   «сюда попадёт». Закрашенный прямоугольник отвечает прямо, и его видно даже
   когда карточка под пальцем закрывает пол-экрана.

   Координату не вычисляем заново, а получаем из расстановки сдвигов: там уже
   известно, между кем и кем открылась щель. Первая попытка считала её от
   текущего положения несомой карточки — то есть от пальца, — и плашка уезжала
   под соседнюю карточку, где её просто не было видно.

   position:fixed, чтобы не зависеть от того, кто в предках создал систему
   координат: у несомой карточки свой transform, а он такую систему создаёт. */
/* Раздвинуть карточки так, чтобы щель оказалась там, куда сядет перенесённая.

   Внутри своего блока карточка занимает своё место, поэтому соседи не
   раздвигаются, а меняются с ней местами: те, через кого её пронесли, съезжают
   на её высоту в обратную сторону. В чужом блоке щель открывается просто —
   всё, что ниже места вставки, уезжает вниз. */
/* Плашка на месте, куда сядет карточка.

   Щели между соседями мало: она читается как «здесь чего-то не хватает», а не
   «сюда попадёт». Закрашенный прямоугольник отвечает прямо, и его видно даже
   когда карточка под пальцем закрывает пол-экрана.

   Координату не вычисляем заново, а получаем из расстановки сдвигов: там уже
   известно, между кем и кем открылась щель. Первая попытка считала её от
   текущего положения несомой карточки — то есть от пальца, — и плашка уезжала
   под соседнюю карточку, где её просто не было видно.

   position:fixed, чтобы не зависеть от того, кто в предках создал систему
   координат: у несомой карточки свой transform, а он такую систему создаёт. */

/* Место посадки показывает сама щель между карточками, и ничего больше.

   Здесь была закрашенная плашка. Она отставала от карточки, спорила с ней за
   внимание и дважды вставала не туда из-за расчётов, которые я же и сломал.
   Владелец справедливо сказал убрать: в руке едет карточка, соседи
   расступаются — этого довольно, чтобы понять, куда она сядет. */
function markDropSpot(zone, beforeId){
  var dragged = document.querySelector('.item.dragging');
  clearShifts();
  if (!zone || !dragged) return;

  var cards = [].slice.call(zone.querySelectorAll('.item'));
  var gap = parseFloat(getComputedStyle(zone).rowGap) || 8;
  var step = dragged.offsetHeight + gap;

  var from = cards.indexOf(dragged);
  var to = cards.length;
  if (beforeId){
    for (var i = 0; i < cards.length; i++){
      if (cards[i].getAttribute('data-task') === beforeId){ to = i; break; }
    }
  }

  if (from < 0){
    for (var j = to; j < cards.length; j++) setShift(cards[j], step);
    return;
  }
  if (to > from){
    for (var k = from + 1; k < to; k++) setShift(cards[k], -step);
  } else if (to < from){
    for (var m = to; m < from; m++) setShift(cards[m], step);
  }
}

/* Пустые блоки на время жеста. Их нет в разметке — пустой день не показывается
   вовсе, — но перенести задачу в пустой день надо. Полосы добавляются прямо в
   дерево и снимаются в конце: перерисовать экран нельзя, из него вырвало бы
   карточку, которую держат. */
function openEmptyDropZones(){
  var host = $('app');
  if (!host || S.view !== 'tasks' || host.querySelector('.empty-drop')) return;

  var present = {};
  var groups = host.querySelectorAll('.group[data-bucket]');
  for (var i = 0; i < groups.length; i++) present[groups[i].getAttribute('data-bucket')] = groups[i];

  BUCKETS.forEach(function(b, index){
    if (present[b.id]) return;

    var zone = document.createElement('section');
    zone.className = 'group empty-drop';
    zone.setAttribute('data-bucket', b.id);
    zone.innerHTML = '<div class="tasklist" data-drop="' + b.id + '">' +
      '<div class="dropnote">' + esc(b.title) + '</div></div>';

    // Ставим по порядку блоков дня, а не в конец: «Завтра» между «Сегодня» и
    // «Послезавтра», иначе пустые дни собьются в кучу внизу.
    var after = null;
    for (var j = index + 1; j < BUCKETS.length && !after; j++) after = present[BUCKETS[j].id];
    if (after) host.insertBefore(zone, after);
    else host.insertBefore(zone, host.querySelector('.composer') || null);
    present[b.id] = zone;
  });
}

function closeEmptyDropZones(){
  var zones = document.querySelectorAll('.empty-drop');
  for (var i = 0; i < zones.length; i++) zones[i].parentNode.removeChild(zones[i]);
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

/// Общий конец жеста для обоих путей: снять сдвиги, убрать пустые полосы,
/// погасить подсветку.
function endDragVisuals(){
  clearShifts();
  closeEmptyDropZones();
  var over = document.querySelectorAll('.tasklist.over');
  for (var i = 0; i < over.length; i++) over[i].classList.remove('over');
}

document.addEventListener('dragstart', function(event){
  var item = event.target.closest ? event.target.closest('[data-task]') : null;
  if (!item || !item.classList.contains('item')) return;
  S.drag = item.getAttribute('data-task');
  item.classList.add('dragging');
  document.documentElement.classList.add('dragging-now');
  openEmptyDropZones();
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
});

document.addEventListener('dragend', function(event){
  var item = event.target.closest ? event.target.closest('.item') : null;
  if (item) item.classList.remove('dragging');
  document.documentElement.classList.remove('dragging-now');
  S.drag = null;
  endDragVisuals();
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

/* Написано заново, после того как правки поверх правок перестали держаться.

   Прежняя версия считала место вставки заново на каждом кадре, по живой
   раскладке. А раскладка во время жеста как раз и меняется: карточку подняли —
   список сомкнулся, соседи разъехались, всё, что ниже, уехало вверх. Расчёт
   опирался на то, что сам же и сдвигал, и получалась обратная связь: решение
   меняло картинку, картинка меняла решение. Отсюда и прыжки через две секции,
   и пропущенные дни, и карточки, уезжающие за пределы.

   Здесь принцип другой и он один: РАСКЛАДКА СНИМАЕТСЯ ОДИН РАЗ при подъёме и
   дальше не пересчитывается. Дальше это просто числа — где какой день, где
   какая карточка. Палец сравнивается с этими числами, и никакая анимация на
   них не влияет, потому что они уже сняты.

   Пять решений, без которых снова развалится:

   1. Карточка вынимается из потока (position:fixed). Её не режет обёртка
      списка, и место под ней смыкается само.
   2. pointer-events:none на ней же — иначе «что под пальцем» находит её саму,
      а через неё её родной день, и остальные дни для жеста не существуют.
   3. Координаты снимка — страничные (плюс прокрутка). Автопрокрутка у края
      тогда ничего не ломает.
   4. Прокрутку у браузера отбираем через touchmove: touch-action читается в
      начале жеста, менять её посреди поздно.
   5. Зона — весь блок дня вместе с шапкой, а не только список. У свёрнутого
      дня список нулевой высоты, попасть в него нельзя. */

/// Сколько держать палец, прежде чем карточка поднимется. Меньше — жест
/// срабатывает при обычной прокрутке; больше — кажется, что не отвечает.
var HOLD_MS = 320;

/* Единственное состояние жеста. Всё, что о нём известно, лежит здесь:
   id и узел несомой карточки, точка нажатия, снятая раскладка, текущий выбор
   и масштаб страницы. Ничего про перенос не хранится больше нигде — именно
   поэтому уборка после жеста сводится к обнулению одной переменной и проходу
   по разметке. */
var НЕСУ = null;

/* --- снимок раскладки --- */

/* Масштаб страницы. В приложении шрифт по умолчанию мелкий, и корень
   отмасштабирован через zoom — 0.88. Прямоугольники и координаты касаний
   приходят уже в масштабе, а вписанные обратно left/top/width масштабируются
   ЕЩЁ РАЗ. Из-за этого поднятая карточка становилась меньше и уезжала влево:
   ровно на те же 12%. Всё, что записываем в стиль, делим на масштаб. */
function масштаб(){
  var z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return (z && z > 0) ? z : 1;
}

/// Верх элемента в координатах страницы: прокрутка на них не влияет.
function верхНаСтранице(el){
  return el.getBoundingClientRect().top + window.scrollY;
}

/**
 * Раскладка на момент подъёма: дни и лежащие в них карточки.
 *
 * Снимается после того, как несомая карточка вынута из потока, — тогда в
 * снимке уже сомкнувшийся список, и открывать её прежнее место не нужно.
 */
function снятьРаскладку(кроме){
  var дни = [];
  var блоки = document.querySelectorAll('.group[data-bucket]');
  for (var i = 0; i < блоки.length; i++){
    var блок = блоки[i];
    var список = блок.querySelector('[data-drop]');
    if (!список) continue;

    var карточки = [];
    var узлы = список.querySelectorAll('.item[data-task]');
    for (var j = 0; j < узлы.length; j++){
      if (узлы[j] === кроме) continue;
      карточки.push({
        id: узлы[j].getAttribute('data-task'),
        узел: узлы[j],
        верх: верхНаСтранице(узлы[j]),
        высота: узлы[j].offsetHeight
      });
    }

    дни.push({
      bucket: список.getAttribute('data-drop'),
      список: список,
      блок: блок,
      // Само содержимое дня: от верха его списка до низа. Границы между днями
      // считаются ниже, по этим величинам.
      нач: верхНаСтранице(список),
      кон: верхНаСтранице(список) + список.offsetHeight,
      зазор: parseFloat(getComputedStyle(список).rowGap) || 8,
      карточки: карточки
    });
  }

  /* Граница между днями — посередине между их содержимым.

     Сперва днём считался весь блок вместе с шапкой. Но шапка высокая:
     «ПОСЛЕЗАВТРА» в две трети сантиметра плюс отступ сверху. Идя вниз,
     карточка попадала в следующий день задолго до его задач — за полсотни
     пикселей до первой из них. Вверх этого не было: снизу у блока сразу край
     списка, и граница ощущалась честной. Отсюда и «вверх нормально, вниз
     реагирует за километр».

     Теперь граница ровно посередине между низом одного дня и верхом
     следующего. Она симметрична: в какую сторону ни иди, день переключается в
     одном и том же месте. Крайние дни раздвинуты до бесконечности — промазать
     мимо всех и потерять жест нельзя. */
  for (var д = 0; д < дни.length; д++){
    дни[д].верх = (д === 0) ? -1e9 : (дни[д - 1].кон + дни[д].нач) / 2;
    дни[д].низ  = (д === дни.length - 1) ? 1e9 : (дни[д].кон + дни[д + 1].нач) / 2;
  }
  return дни;
}

/// В каком дне палец. Ниже последнего — последний, выше первого — первый:
/// промахнуться мимо всех и потерять жест нельзя.
function деньПод(дни, y, целевой){
  for (var i = 0; i < дни.length; i++){
    var сдвиг = поправка(дни, дни[i], целевой);
    if (y >= дни[i].верх + сдвиг && y < дни[i].низ + сдвиг) return дни[i];
  }
  if (!дни.length) return null;
  return y < дни[0].верх ? дни[0] : дни[дни.length - 1];
}

/**
 * Перед какой карточкой встанем — по снимку, а не по экрану.
 *
 * Сравниваем с серединами карточек: они посчитаны один раз и стоят намертво,
 * поэтому решение меняется, только когда палец действительно их пересёк.
 * Небольшой запас гасит дрожание руки на самой границе.
 */
/* Полоса нечувствительности вокруг границы, в пикселях.

   Снимок заморожен, поэтому середины карточек стоят намертво и сами по себе
   не дрожат. Но рука дрожит: палец, застывший ровно на границе, гоняет
   решение туда-сюда. Запас требует уйти от границы на шесть пикселей, чтобы
   решение поменялось, — тремор столько не набирает, осознанное движение
   набирает мгновенно. */
var ЗАПАС = 6;

function местоВДне(день, y, прежнее){
  var к = день.карточки;
  var номер = к.length;
  for (var i = 0; i < к.length; i++){
    if (y < к[i].верх + к[i].высота / 2){ номер = i; break; }
  }
  // Прежнее решение отдаём обратно, пока палец не ушёл от границы дальше
  // запаса: без этого дрожание в пиксель у самой середины переключало бы его.
  if (прежнее && прежнее.день === день && Math.abs(прежнее.номер - номер) === 1){
    var граница = номер > прежнее.номер
      ? к[прежнее.номер].верх + к[прежнее.номер].высота / 2
      : к[номер].верх + к[номер].высота / 2;
    if (Math.abs(y - граница) < ЗАПАС) номер = прежнее.номер;
  }
  return номер;
}

/**
 * Раздвинуть карточки в дне так, чтобы освободилось место под номером.
 *
 * И — главное — дать этому месту откуда взяться. Список обрезает всё, что не
 * влезло в его высоту: карточку подняли, список стал короче на неё, а мы
 * сдвигаем нижних вниз — и последние уезжали за нижний край и пропадали с
 * экрана. Владелец так это и описал: «нижние задачи куда-то вниз уехали, и их
 * не видно».
 *
 * Поэтому целевому списку добавляем поле снизу ровно в открывшуюся щель. Он
 * становится выше, и дни под ним съезжают вниз — как и должно быть на единой
 * странице: секции не стоят в жёстких рамках, а расступаются вместе с
 * содержимым.
 */
function показатьМесто(дни, день, номер, высота){
  for (var i = 0; i < дни.length; i++){
    var д = дни[i];
    var резерв = (д === день) ? высота + д.зазор : 0;
    if (д.резерв !== резерв){
      д.резерв = резерв;
      д.список.style.paddingBottom = резерв ? резерв + 'px' : '';
    }
    for (var j = 0; j < д.карточки.length; j++){
      var сдвиг = (д === день && j >= номер) ? высота + д.зазор : 0;
      if (д.карточки[j].сдвиг !== сдвиг){
        д.карточки[j].сдвиг = сдвиг;
        д.карточки[j].узел.style.transform = сдвиг ? 'translateY(' + сдвиг + 'px)' : '';
      }
    }
  }
}

/**
 * Насколько день сместился относительно снимка.
 *
 * Снимок снят один раз и не пересчитывается — в этом вся его польза. Но
 * целевой день теперь подрастает на высоту щели, и всё, что ниже него,
 * съезжает. Величина известна точно, поэтому поправку считаем арифметикой, а
 * не новым замером: замер вернул бы нас к обратной связи, из-за которой всё и
 * прыгало.
 */
function поправка(дни, день, целевой){
  if (!целевой) return 0;
  var свой = дни.indexOf(день), цель = дни.indexOf(целевой);
  return (свой > цель) ? (целевой.резерв || 0) : 0;
}

/* --- сам жест --- */

/* Начало. Здесь только запоминаем нажатие и заводим отсчёт удержания —
   поднимать рано: человек, возможно, просто листает список. */
document.addEventListener('pointerdown', function(event){
  // Только приложение и только палец: у мыши свой путь через HTML5 drag.
  if (!inApp() || event.pointerType === 'mouse') return;
  var карточка = event.target.closest ? event.target.closest('.item[data-task]') : null;
  if (!карточка) return;
  // Отказываемся только от настоящих органов управления: название задачи —
  // тоже кнопка, и именно за него карточку берут.
  if (event.target.closest('.box, .side, .btn')) return;

  НЕСУ = {
    id: карточка.getAttribute('data-task'),
    узел: карточка,
    x0: event.clientX,
    y0: event.clientY,
    активен: false,
    таймер: setTimeout(function(){ поднять(event.clientY); }, HOLD_MS)
  };
});

function поднять(y){
  if (!НЕСУ) return;
  var узел = НЕСУ.узел;
  var к = узел.getBoundingClientRect();

  НЕСУ.активен = true;
  НЕСУ.высота = к.height;
  НЕСУ.отступ = y - к.top;          // за какое место карточку держат
  document.documentElement.classList.add('dragging-now');

  // Свайп и перенос начинаются одинаково; кто первым себя опознал, тот и ведёт.
  if (typeof swipe !== 'undefined' && swipe){
    if (swipe.лицо) swipe.лицо.style.left = '';
    swipe.карточка.classList.remove('swiping');
    swipe = null;
  }
  if (typeof swipeCloseAll === 'function') swipeCloseAll(null);

  var м = масштаб();
  НЕСУ.масштаб = м;
  var вылет = 6;
  узел.style.position = 'fixed';
  узел.style.left = ((к.left - вылет * м) / м) + 'px';
  узел.style.top = (к.top / м) + 'px';
  узел.style.width = ((к.width + вылет * 2 * м) / м) + 'px';
  узел.style.margin = '0';
  узел.classList.add('dragging');

  // Снимок снимаем ПОСЛЕ выноса: список уже сомкнулся, и в снимке настоящее.
  НЕСУ.дни = снятьРаскладку(узел);
  НЕСУ.выбор = null;

  if (navigator.vibrate){ try { navigator.vibrate(18); } catch (e){} }
  вести(y);
}

/* Каждый кадр движения: подвинуть карточку и, если надо, сменить решение.

   Обрати внимание, чего здесь НЕТ: ни одного обращения к getBoundingClientRect
   и ни одного querySelector по раскладке. Всё, что нужно, посчитано при
   подъёме. Как только сюда вернётся живой замер, вернутся и прыжки. */
function вести(y){
  if (!НЕСУ || !НЕСУ.активен) return;
  var верхКарточки = y - НЕСУ.отступ;
  НЕСУ.узел.style.top = (верхКарточки / (НЕСУ.масштаб || 1)) + 'px';

  /* Решение принимаем по СЕРЕДИНЕ несомой карточки, а не по пальцу.

     Палец держит её за то место, где нажали: возьмёшь за нижний край — и он
     оказывается на полкарточки ниже её самой. Сравнение шло по пальцу, и
     соседи расступались раньше, чем карточка до них доходила. Владелец так и
     сказал: «место освобождается заранее». Середина карточки — это и есть то,
     что человек видит и чем целится. */
  var наСтранице = верхКарточки + НЕСУ.высота / 2 + window.scrollY;
  var целевой = НЕСУ.выбор ? НЕСУ.выбор.день : null;
  var день = деньПод(НЕСУ.дни, наСтранице, целевой);
  if (!день) return;
  // Внутри самого целевого дня поправки нет: щель открылась ПОД местом
  // вставки, а середины карточек выше него стоят там же, где стояли.
  var номер = местоВДне(день, наСтранице - поправка(НЕСУ.дни, день, целевой), НЕСУ.выбор);

  var прежний = НЕСУ.выбор;
  if (!прежний || прежний.день !== день || прежний.номер !== номер){
    НЕСУ.выбор = { день: день, номер: номер };
    показатьМесто(НЕСУ.дни, день, номер, НЕСУ.высота);
    /* Отклик на каждое пересечение — соседа или границы дня.

       Глазами за перестановкой не уследить: карточка под пальцем закрывает
       как раз то место, где она случается. Двенадцать миллисекунд против
       восемнадцати на подъёме: подъём надо заметить, а это отметка «прошли
       ещё одну» — она должна ощущаться, но не спорить с подъёмом. */
    if (прежний && navigator.vibrate){ try { navigator.vibrate(12); } catch (e){} }
  }

  подкрутить(y);
}

/* Подкрутка у краёв: блок, в который несут задачу, обычно ниже экрана.
   Координаты снимка страничные, поэтому прокрутка их не портит. */
/* Автопрокрутка у краёв экрана.

   Работает потому, что координаты снимка страничные: пока страница едет,
   числа остаются верными, и решение не сбивается. С экранными координатами
   каждый шаг прокрутки означал бы смену дня под пальцем. */
var таймерПрокрутки = null;
function подкрутить(y){
  var край = 110, шаг = 0;
  if (y < край) шаг = -Math.ceil((край - y) / 7);
  else if (y > window.innerHeight - край) шаг = Math.ceil((y - (window.innerHeight - край)) / 7);

  if (!шаг){
    if (таймерПрокрутки){ clearInterval(таймерПрокрутки); таймерПрокрутки = null; }
    return;
  }
  if (таймерПрокрутки) return;
  таймерПрокрутки = setInterval(function(){
    if (!НЕСУ || !НЕСУ.активен){ clearInterval(таймерПрокрутки); таймерПрокрутки = null; return; }
    window.scrollBy(0, шаг);
    вести(НЕСУ.последнийY || y);
  }, 16);
}

document.addEventListener('pointermove', function(event){
  if (!НЕСУ) return;
  if (!НЕСУ.активен){
    // Уехал пальцем до срабатывания удержания — значит, листает список.
    if (Math.abs(event.clientX - НЕСУ.x0) + Math.abs(event.clientY - НЕСУ.y0) > 12) бросить();
    return;
  }
  event.preventDefault();
  НЕСУ.последнийY = event.clientY;
  вести(event.clientY);
}, { passive: false });

/* Прокрутку отменяем на touchmove: у pointermove preventDefault её не
   останавливает, а touch-action читается в начале жеста и менять её поздно. */
document.addEventListener('touchmove', function(event){
  if (НЕСУ && НЕСУ.активен && event.cancelable) event.preventDefault();
}, { passive: false });

/* Отпускание. Решение берём то, которое человек видел щелью, а не считаем
   заново: пересчёт в последний момент давал редкое, но обидное расхождение —
   щель стояла в одном месте, карточка садилась в другое. */
document.addEventListener('pointerup', function(){
  if (!НЕСУ) return;
  var нёс = НЕСУ.активен, id = НЕСУ.id, выбор = НЕСУ.выбор;
  бросить();
  if (!нёс) return;

  // Отпустили, не выбрав дня, — просто возвращаем карточку на место.
  if (!выбор){ render(); return; }

  var перед = выбор.номер < выбор.день.карточки.length
    ? выбор.день.карточки[выбор.номер].id : null;
  if (перед === id){ render(); return; }

  var изменилось = dropTask(id, выбор.день.bucket, перед);
  // Свёрнутый день раскрываем, раз в него положили: иначе жест кончается тем,
  // что карточка исчезла, а куда — знает только счётчик в шапке.
  S.closed[выбор.день.bucket] = false;
  commit(изменилось ? 'Перенесено в «' + bucketTitle(выбор.день.bucket) + '»' : '');
});

document.addEventListener('pointercancel', function(){ if (НЕСУ){ бросить(); render(); } });

/**
 * Убрать за жестом. Чистим по разметке, а не по памяти о нём: оборвавшийся
 * жест оставлял карточку висеть со своим смещением, и в списке зияла дыра.
 */
function бросить(){
  document.documentElement.classList.remove('dragging-now');
  if (таймерПрокрутки){ clearInterval(таймерПрокрутки); таймерПрокрутки = null; }

  var следы = document.querySelectorAll('.item[style], .item.dragging');
  for (var i = 0; i < следы.length; i++){
    var э = следы[i];
    э.style.transform = ''; э.style.position = ''; э.style.left = '';
    э.style.top = ''; э.style.width = ''; э.style.margin = ''; э.style.touchAction = '';
    э.classList.remove('dragging');
  }
  var метки = document.querySelectorAll('.over');
  for (var j = 0; j < метки.length; j++) метки[j].classList.remove('over');
  var списки = document.querySelectorAll('.tasklist[style]');
  for (var k = 0; k < списки.length; k++) списки[k].style.paddingBottom = '';

  if (НЕСУ){ clearTimeout(НЕСУ.таймер); НЕСУ = null; }
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
  endDragVisuals();
  if (before === id) return;
  var changed = dropTask(id, bucket, before);
  commit(changed ? 'Перенесено в «' + bucketTitle(bucket) + '»' : '');
});

/* --- высота левой колонки --- */

/* Колонка меню на широком экране начинается на одной линии с первой строкой
   содержимого. Единственное, что для этого нужно знать, — высота липкой
   шапки: она зависит от шрифта и его размера, а их меняют в настройках,
   поэтому число не зашито, а меряется.

   Отступ 24 пикселя — тот же, что у самого содержимого сверху (padding у
   main). Совпадение здесь не случайность, а способ попасть в ту же линию. */
function railTop(){
  var top = $('top');
  var height = top ? Math.round(top.getBoundingClientRect().height) : 72;
  return height + 24;
}

function syncRail(){
  document.documentElement.style.setProperty('--rail-y', railTop() + 'px');
}

window.addEventListener('resize', syncRail);
syncRail();

/* --- нижняя панель на телефоне --- */

/* Панель и строка создания прибиты к низу окна через position:fixed. На
   телефоне этого мало: когда открывается клавиатура, Safari и Chrome не
   уменьшают окно, а сдвигают видимую его часть — «визуальный вьюпорт». Всё
   зафиксированное остаётся считаться от прежнего низа, то есть уезжает вверх
   и там же остаётся, пока страницу не тронут.

   Лечится единственным способом: спрашивать у visualViewport, где сейчас
   настоящий низ, и сдвигать панель на разницу. Ставим переменную, остальное
   делает CSS.

   На десктопе visualViewport совпадает с окном, и сдвиг всегда нулевой —
   отдельной ветки для него не нужно. */
/* Сдвиг считается только под клавиатуру — и ни под что другое.

   Первая версия брала разницу «окно минус видимая часть» как есть, и панель
   поехала скакать при обычной прокрутке. Причина в адресной строке: на
   телефоне она прячется и появляется по ходу листания, меняя ровно те же
   числа, что и клавиатура. Браузер при этом двигает position:fixed сам, и
   наш сдвиг ложился поверх — панель дёргалась вдвое.

   Отличить одно от другого можно по двум признакам сразу: клавиатура
   поднимается только когда в поле стоит курсор, и она заметно выше адресной
   строки (та 45–90 пикселей, клавиатура — 250 и больше). Требуем оба. */
var KEYBOARD_MIN_HEIGHT = 140;

function editableFocused(){
  var node = document.activeElement;
  if (!node) return false;
  var tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

function syncViewportShift(){
  var vv = window.visualViewport;
  if (!vv) return;
  var raw = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  var shift = (editableFocused() && raw >= KEYBOARD_MIN_HEIGHT) ? raw : 0;
  var root = document.documentElement;
  // Пишем, только когда значение поменялось: присвоение переменной каждый
  // кадр прокрутки заставляет браузер пересчитывать вёрстку зря.
  if (root.style.getPropertyValue('--vv-shift') !== shift + 'px'){
    root.style.setProperty('--vv-shift', shift + 'px');
  }

}

/* Панель убирается по факту ввода, а не по замеру экрана.

   Прошлая версия вешала класс, только если visualViewport отчитался о
   сжатии не меньше чем на 140 пикселей. На бумаге верно, на живом айфоне —
   нет: событие приходит с задержкой, при переходе между полями клавиатура
   не закрывается и размер не меняется вовсе, а при появлении панели
   предиктивного ввода меняется не так, как мы ждём. Панель то исчезала, то
   оставалась — ровно то, на что жаловался владелец.

   Курсор в поле — единственный признак, который не врёт и приходит сразу:
   если в поле стоит курсор, человек печатает, и панель ему мешает.
   Клавиатура при этом может быть аппаратной или ещё не выехать — не важно,
   решение то же.

   Сдвиг --vv-shift остаётся отдельно: он двигает строку создания над
   клавиатурой, и вот ему замеры нужны. */
var kbdOffTimer = 0;

function setKeyboardMode(on){
  clearTimeout(kbdOffTimer);
  if (on){
    document.documentElement.classList.add('kbd');
    return;
  }
  // Переход между двумя полями — это focusout и сразу focusin. Без паузы
  // панель успевала бы мигнуть между ними.
  kbdOffTimer = setTimeout(function(){
    if (!editableFocused()) document.documentElement.classList.remove('kbd');
  }, 120);
}

document.addEventListener('focusin', function(event){
  var node = event.target;
  if (!node || !node.tagName) return;
  var tag = node.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !node.isContentEditable) return;
  setKeyboardMode(true);

  /* Поле, в которое встали, должно быть видно.

     Окна прокручиваются внутри себя, и клавиатура закрывает нижнюю их треть.
     Встав в поле у нижнего края, человек печатал вслепую и подтягивал окно
     рукой. Браузер сам подкручивает не всегда: он смотрит на видимую область
     страницы, а не на прокручиваемую коробку окна.

     Задержка — не для красоты: клавиатура выезжает не мгновенно, и прокрутка
     до её появления промахнётся ровно на её высоту. */
  setTimeout(function(){
    if (document.activeElement !== node) return;
    var коробка = node.closest('.modal-in');
    if (!коробка){
      /* Поля бывают не только в окнах: строка подпункта в раскрытой задаче,
         поле этапа в цели, ввод в финансах. Их закрывает та же клавиатура, и
         подкручивать надо так же — только прокручивается тут вся страница.

         center, а не nearest: у нижнего края экрана «ближайшее» положение —
         это остаться под клавиатурой. */
      var видно = node.getBoundingClientRect();
      var низ = window.innerHeight - (parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--vv-shift')) || 0);
      if (видно.bottom > низ - 24 || видно.top < 80){
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    var поле = node.getBoundingClientRect();
    var окно = коробка.getBoundingClientRect();
    // Оставляем поле не впритык к краю: под ним обычно подпись или подсказка.
    var запас = 24;
    if (поле.bottom > окно.bottom - запас){
      коробка.scrollTop += поле.bottom - окно.bottom + запас;
    } else if (поле.top < окно.top + запас){
      коробка.scrollTop -= окно.top + запас - поле.top;
    }
  }, 260);
});
document.addEventListener('focusout', function(){ setKeyboardMode(false); });

/* Подписка на прокрутку — только пока открыта клавиатура.

   Вот здесь и была причина «то внизу где-то, то ездит». Панель прибита к низу
   layout-вьюпорта, а он при открытой клавиатуре не сжимается: сдвиг мы
   считаем сами. Но сдвиг зависит от visualViewport.offsetTop, а тот меняется
   при каждой прокрутке страницы с открытой клавиатурой — и панель, посчитанная
   один раз на resize, уезжает относительно клавиатуры тем сильнее, чем дальше
   человек пролистал.

   Раньше на scroll не подписывались намеренно: адресная строка меняет те же
   числа постоянно, и панель дёргалась при обычном листании. Ответ не «не
   слушать scroll», а «слушать его только когда клавиатура открыта»: пока в
   поле нет курсора, syncViewportShift всё равно вернёт нулевой сдвиг, а
   лишние пересчёты на каждом кадре прокрутки не нужны.

   rAF гасит поток событий: iOS шлёт scroll по несколько раз за кадр. */
var vvTick = 0;
function syncViewportSoon(){
  if (vvTick) return;
  vvTick = requestAnimationFrame(function(){ vvTick = 0; syncViewportShift(); });
}

if (window.visualViewport){
  var vv = window.visualViewport;
  vv.addEventListener('resize', syncViewportShift);

  vv.addEventListener('scroll', function(){
    // Курсора в поле нет — значит нет и клавиатуры, и это листание с адресной
    // строкой. Не трогаем ничего: именно на этом панель и прыгала.
    if (!editableFocused()) return;
    syncViewportSoon();
  });
  window.addEventListener('scroll', function(){
    if (!editableFocused()) return;
    syncViewportSoon();
  }, { passive: true });

  document.addEventListener('focusin', syncViewportShift);
  document.addEventListener('focusout', function(){
    // Клавиатура закрывается не мгновенно; ждём, пока браузер досчитает.
    setTimeout(syncViewportShift, 60);
  });
  syncViewportShift();
}

/* ============ СВАЙП ПО КАРТОЧКЕ ============

   Правка и удаление уходят под карточку и открываются сдвигом влево. Значки в
   каждой строке отъедали место у названия постоянно, а нужны были изредка.

   Один обработчик на весь документ, а не по одному на карточку: карточки
   перерисовываются на каждое изменение, и обработчики пришлось бы вешать
   заново после каждой перерисовки — их бы копились сотни.

   Слушаем pointer, а не touch: тот же код работает и мышью в браузере, и
   пальцем в приложении. */

var SWIPE_OPEN = 92;      // на сколько уезжает карточка, в пикселях
var SWIPE_START = 10;     // с какого сдвига считаем, что это свайп, а не тап
var swipe = null;

/// Закрыть все открытые карточки, кроме указанной.
function swipeCloseAll(кроме){
  var открытые = document.querySelectorAll('.swipe.swiped');
  for (var i = 0; i < открытые.length; i++){
    if (открытые[i] !== кроме) открытые[i].classList.remove('swiped');
  }
}

document.addEventListener('pointerdown', function(event){
  // Нажали по самим кнопкам под карточкой — это не свайп, а выбор действия.
  if (event.target.closest('.side')) return;
  var карточка = event.target.closest('.swipe');
  if (!карточка) { swipeCloseAll(null); return; }
  // Раскрытую карточку не свайпаем: панели у неё нет, и ехать было бы некуда.
  if (inApp() && карточка.classList.contains('open')) { swipeCloseAll(null); return; }

  swipe = {
    карточка: карточка,
    лицо: карточка.querySelector('.swipe-face') || карточка,
    x: event.clientX, y: event.clientY,
    сдвиг: карточка.classList.contains('swiped') ? -SWIPE_OPEN : 0,
    решено: false, это_свайп: false
  };
});

document.addEventListener('pointermove', function(event){
  if (!swipe) return;
  // Карточку уже несут — свайпу здесь делать нечего.
  // Карточку уже несут — свайпу здесь делать нечего.
  if (typeof НЕСУ !== 'undefined' && НЕСУ && НЕСУ.активен){ swipe = null; return; }
  var dx = event.clientX - swipe.x;
  var dy = event.clientY - swipe.y;

  /* Решаем один раз, что это за жест, и больше не передумываем.

     Без этого карточка дёргалась на обычной прокрутке: палец идёт вниз с
     небольшим боковым уводом, и каждый кадр менял решение. Смотрим, какая ось
     обогнала: вертикаль — уходим совсем, горизонталь — забираем жест себе. */
  if (!swipe.решено){
    if (Math.abs(dx) < SWIPE_START && Math.abs(dy) < SWIPE_START) return;
    swipe.решено = true;
    swipe.это_свайп = Math.abs(dx) > Math.abs(dy);
    if (!swipe.это_свайп){ swipe = null; return; }
    // Ушли вбок — значит это не перенос: снимаем отсчёт удержания, чтобы
    // карточка посреди свайпа вдруг не поднялась на перетаскивание.
    // Ушли вбок — значит это не перенос: снимаем отсчёт удержания.
    if (typeof бросить === 'function' && typeof НЕСУ !== 'undefined' && НЕСУ && !НЕСУ.активен) бросить();
    swipeCloseAll(swipe.карточка);
    swipe.карточка.classList.add('swiping');
  }

  // Вправо дальше нуля и влево дальше кнопок не пускаем: резинка в списке
  // выглядит поломкой, а не жестом.
  var сдвиг = Math.max(-SWIPE_OPEN, Math.min(0, swipe.сдвиг + dx));
  swipe.лицо.style.left = сдвиг + 'px';
  swipe.последний = сдвиг;
}, { passive: true });

function swipeEnd(){
  if (!swipe) return;
  var s = swipe;
  swipe = null;
  if (!s.это_свайп) return;

  s.карточка.classList.remove('swiping');
  s.лицо.style.left = '';
  // За половину — открыто. Так жест прощает недоведённое движение, а
  // случайный сдвиг на десяток пикселей карточку не открывает.
  var открыть = (s.последний || 0) < -SWIPE_OPEN / 2;
  s.карточка.classList.toggle('swiped', открыть);
}

document.addEventListener('pointerup', swipeEnd);
document.addEventListener('pointercancel', swipeEnd);

/* Нажатие по действию закрывает карточку.

   Иначе после «править» окно открывается, а под ним остаётся сдвинутая
   карточка — и, закрыв окно, человек видит её раскрытой без причины. */
document.addEventListener('click', function(event){
  if (event.target.closest('.side')) swipeCloseAll(null);
}, true);

/* Возврат на страницу перерисовывает её из состояния.

   Сафари на айфоне, открывая выбор фото, может выгрузить страницу и вернуть
   её снимком: новое фото уже лежит в localStorage, а на экране прежний
   кружок — до перезагрузки руками. Тот же снимок возвращается кнопкой
   «назад». Перерисовка из состояния лечит оба случая разом. */
window.addEventListener('pageshow', function(event){
  if (event.persisted) render();
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

  /* Обновление показывается сразу, а не со второй перезагрузки.

     Оболочка отдаётся из кэша, поэтому выложенная новая версия доезжала так:
     первое открытие — старая страница и тихая закачка новой, и только следующее
     открытие показывало свежее. Снаружи это выглядит как «ничего не
     обновилось», и человек либо жмёт Cmd+Shift+R, либо решает, что выкладка не
     сработала.

     Теперь новый service worker, забрав управление, говорит об этом странице, и
     она перезагружается один раз. Флаг нужен, чтобы это был именно один раз:
     без него claim после перезагрузки снова просил бы перезагрузиться. */
  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', function(){
    // Первая установка управления — это не обновление, а первое открытие
    // вообще: перезагружать нечего.
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', function(){
    /* В приложении service worker не нужен и вреден.

       Файлы лежат внутри apk, кэшировать их незачем. Хуже другое: sw.js я из
       сборки исключил, запрос за ним не нашёл ничего в assets и ушёл в
       настоящую сеть — приложение подтянуло service worker с живого сайта.
       То есть внутри автономного приложения поселился кэш веб-версии, который
       мог начать отдавать её файлы поверх наших. Ровно тот класс расхождений,
       который стоил нам сегодня половины дня.

       Проверять по AndroidVoice, а не по touchUI: в мобильном браузере worker
       нужен — там он и есть работа без сети. */
    if (inApp()) return;

    navigator.serviceWorker.register('sw.js').then(function(registration){
      // Проверка на свежесть при каждом открытии: браузер и сам ходит за
      // sw.js, но не обещает делать это на каждой навигации.
      registration.update().catch(function(){});
    }).catch(function(){});
  });
}

/* Признак приложения — классом на корне страницы.

   Часть отличий приложения от сайта чисто оформительская: отступ, размер,
   плотность. Городить ради каждого такого ветку в разметке дороже, чем один
   класс, по которому их разбирает CSS. Именно inApp(), а не touchUI(): сайт с
   телефона остаётся сайтом, меняется только то, что внутри apk. */
if (inApp()) document.documentElement.classList.add('in-app');

// Развёрнутая карта не переживает перезагрузку: страница, открывшаяся сразу
// поверх всего, читается как поломка, а не как выбранный экран.
if (S.mm) { S.mm.full = false; }

rolloverIfNeeded();
/* Регулярные операции догоняются при открытии, а не по таймеру: вкладку могли
   не открывать неделю, и пропущенные списания всё равно должны появиться —
   каждое своим днём. Сохраняем сразу, иначе следующий заход добавит их снова. */
if (finRunRecurring()) save();
finSyncJarStages();
render();
// При каждом открытии переставляем будильники: время прошло, задачи закрылись,
// а система про это не знает.
пересобратьНапоминания();

/* Ответ системы на просьбу о разрешении. Дали — включаем и ставим будильники,
   отказали — говорим прямо, где это переключается, и не делаем вид, что
   напоминания работают. */
window.addEventListener('android-notify', function(e){
  if (e.detail && e.detail.granted){
    S.notify.on = true;
    commit('Напоминания включены');
  } else {
    toast('Android не разрешил уведомления. Включить их можно в настройках телефона.');
  }
});
registerServiceWorker();

/* Тихая сверка подписки с сервером.

   Без шума и без окон: пока с подпиской всё в порядке, человек проверки не
   замечает. Спрашиваем не чаще раза в трое суток и только если код сохранён.
   Сервер не ответил — молчим и пробуем в следующий раз: признак живёт по
   сроку годности, и одна неудачная попытка ничего не решает. */
function сверитьПодписку(){
  if (!inApp() || !S.pro || !S.pro.active || !S.pro.code) return;
  if (S.pro.checkedAt && Date.now() - S.pro.checkedAt < ПОДТВЕРЖДАТЬ_ЧЕРЕЗ) return;
  proActivate(S.pro.code).then(function(pro){
    // Подписки больше нет — перерисовываем, чтобы замки встали на место.
    if (!pro.active) render();
  }).catch(function(){});
}

сверитьПодписку();

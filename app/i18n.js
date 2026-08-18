/* Английский для веб-приложения.

   Почему перевод сделан здесь, а не подстановкой T('…') по всему app.js:
   в app.js около полутора тысяч русских литералов, и столько же точечных
   правок в работающем коде — это риск сломать русский ради английского.
   Здесь же перевод применяется в одном месте — к уже собранной разметке,
   ровно перед тем как она попадёт на страницу (четыре точки в render()).

   Следствия, ради которых так и сделано:
     * в русском режиме функция возвращает разметку как есть, не тронув ни
       одного символа, — русский физически не может пострадать;
     * нет перевода для фразы — остаётся русская, интерфейс не ломается;
     * логика приложения не затронута вообще: разбор фраз вроде «завтра в 9
       утра», ключи хранилища и сравнения работают с русским, как и работали.

   Перевод идёт только по видимому тексту (между тегами) и по атрибутам,
   которые человек читает: placeholder, title, aria-label, alt. */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'syn.lang';
  var lang = 'ru';
  try { lang = localStorage.getItem(STORAGE_KEY) || 'ru'; } catch (e) {}

  /* Словарь. Ключ — русская фраза ровно так, как она видна на экране.
     Формы одного слова («задача», «задачи», «задач») стоят отдельными
     ключами: тогда «3 задачи» переводится само, без правил склонения. */
  var EN = {
    // — разделы, меню, шапка —
    // — месяцы и недостающие подписи —
    'Январь': 'January', 'Февраль': 'February', 'Март': 'March', 'Апрель': 'April',
    'Май': 'May', 'Июнь': 'June', 'Июль': 'July', 'Август': 'August',
    'Сентябрь': 'September', 'Октябрь': 'October', 'Ноябрь': 'November', 'Декабрь': 'December',
    'янв': 'Jan', 'фев': 'Feb', 'мар': 'Mar', 'апр': 'Apr', 'май': 'May', 'июн': 'Jun',
    'июл': 'Jul', 'авг': 'Aug', 'сен': 'Sep', 'окт': 'Oct', 'ноя': 'Nov', 'дек': 'Dec',
    'пн': 'Mon', 'вт': 'Tue', 'ср': 'Wed', 'чт': 'Thu', 'пт': 'Fri', 'сб': 'Sat', 'вс': 'Sun',
    'Сводка': 'Summary', 'Свободно': 'Available', 'Вписать': 'Enter',
    'Сначала — сколько у вас есть': 'First — how much you have',
    'Сколько у вас сейчас? Одним числом.': 'How much do you have right now? A single number.',
    'Мои траты': 'My expenses', 'Общее': 'Overview', 'Период': 'Period',
    'Все': 'All', 'все': 'all', 'Все разделы': 'All sections',
    'Название': 'Title',
    'Задачи': 'Tasks', 'Цели': 'Goals', 'Цель': 'Goal', 'Аналитика': 'Analytics',
    'Карта целей': 'Goal map', 'Карта': 'Map', 'Списки': 'Lists', 'Список': 'List',
    'Заметки': 'Notes', 'Заметка': 'Note', 'Метод Помодоро': 'Pomodoro',
    'Медитация': 'Meditation', 'Мои финансы': 'My finances', 'Корзина': 'Trash',
    'Моя подписка': 'My subscription', 'Настройки': 'Settings', 'Профиль': 'Profile',
    'О сервисе': 'About', 'Служба поддержки': 'Support', 'Выйти': 'Sign out',
    'Вид': 'Appearance', 'Данные': 'Data', 'Ещё': 'More', 'К задачам': 'Go to tasks',
    'К целям': 'Go to goals', 'Все цели': 'All goals', 'Открыть задачи': 'Open tasks',
    'Открыть цели': 'Open goals', 'Открыть ассистента': 'Open assistant',
    'Ассистент Syn': 'Syn assistant', 'Остальные разделы': 'Other sections',

    // — дни —
    'СЕГОДНЯ': 'TODAY', 'ЗАВТРА': 'TOMORROW', 'ПОСЛЕЗАВТРА': 'IN TWO DAYS',
    'НА НЕДЕЛЕ': 'THIS WEEK', 'ПОТОМ': 'LATER',
    'Сегодня': 'Today', 'Завтра': 'Tomorrow', 'Послезавтра': 'In two days',
    'На неделе': 'This week', 'Потом': 'Later', 'сегодня': 'today', 'завтра': 'tomorrow',
    'послезавтра': 'in two days', 'Неделя': 'Week', 'Месяц': 'Month', 'Год': 'Year',
    'Квартал': 'Quarter', 'Полгода': 'Six months', 'Три года': 'Three years',
    'Прошлый месяц': 'Last month', 'Следующий месяц': 'Next month',
    'Утро': 'Morning', 'День': 'Day', 'Вечер': 'Evening', 'ДЕНЬ': 'DAY',

    // — счётчики и пустые состояния —
    'задача': 'task', 'задачи': 'tasks', 'задач': 'tasks',
    'цель': 'goal', 'цели': 'goals', 'целей': 'goals',
    'этап': 'stage', 'этапа': 'stages', 'этапов': 'stages',
    'запись': 'note', 'записи': 'notes', 'записей': 'notes',
    'список': 'list', 'списка': 'lists', 'списков': 'lists',
    'пусто': 'empty', 'Пусто': 'Empty', '(пустой)': '(empty)',
    'Задач пока нет': 'No tasks yet', 'Целей пока нет': 'No goals yet',
    'Заметок пока нет': 'No notes yet', 'Записей пока нет': 'No notes yet',
    'Списков пока нет': 'No lists yet', 'Копилок пока нет': 'No savings yet',
    'Конвертов пока нет': 'No envelopes yet', 'Платежей пока нет': 'No payments yet',
    'Подписок пока нет': 'No subscriptions yet', 'Долгов нет': 'No debts',
    'На сегодня пусто': 'Nothing for today', 'Корзина пуста': 'Trash is empty',
    'Карта пока пустая': 'The map is still empty', 'Считать пока нечего': 'Nothing to count yet',
    'У цели пока нет этапов': 'This goal has no stages yet',
    'Задача без этапа': 'Task without a stage', 'Без цели': 'No goal',
    'Без названия': 'Untitled', 'Без подписки': 'No subscription',
    'Цель не найдена': 'Goal not found', 'Заметка не найдена': 'Note not found',
    'Список не найден': 'List not found',

    // — действия —
    'Готово': 'Done', 'Готово.': 'Done.', 'Отмена': 'Cancel', 'Сохранить': 'Save',
    'Удалить': 'Delete', 'Править': 'Edit', 'Редактировать': 'Edit',
    'Добавить': 'Add', 'Создать': 'Create', 'Закрыть': 'Close', 'Назад': 'Back',
    'Начать': 'Start', 'Старт': 'Start', 'Продолжить': 'Continue',
    'Восстановить': 'Restore', 'Очистить': 'Clear', 'Применить': 'Apply',
    'Выбрать': 'Choose', 'Открыть': 'Open', 'Отправить': 'Send',
    'Скопировать': 'Copy', 'Переименовать': 'Rename', 'Пропустить': 'Skip',
    'Понятно': 'Got it', 'Стереть навсегда': 'Erase permanently',
    'Стёрто навсегда': 'Erased permanently', 'Загрузить фото': 'Upload photo',
    'Сменить фото': 'Change photo', 'Продиктовать': 'Dictate',
    'Остановить диктовку': 'Stop dictation', 'Прослушать': 'Listen',
    'Остановить': 'Stop', 'Отключить': 'Turn off', 'Включить': 'Turn on',
    'Удалить задачу': 'Delete task', 'Удалить запись': 'Delete note',
    'Удалить список': 'Delete list', 'Удалить цель': 'Delete goal',
    'Удалить этап': 'Delete stage', 'Создать цель': 'Create goal',
    'Создать этап': 'Create stage', 'Править цель': 'Edit goal',
    'Править этап': 'Edit stage', 'Редактировать цель': 'Edit goal',
    'Редактировать этап': 'Edit stage', 'Редактировать задачу': 'Edit task',
    'Добавить задачу': 'Add task', 'Перенести в блок': 'Move to block',
    'Перенести в другой блок': 'Move to another block',
    'Отметить оплату': 'Mark as paid', 'Отменить отметку': 'Undo mark',
    'Вернуть в открытые': 'Reopen', 'Вернись к спискам.': 'Back to lists.',
    'Вернись к заметкам.': 'Back to notes.', 'Вернись к списку целей.': 'Back to goals.',

    // — состояния задач —
    'просрочено': 'overdue', 'ПРОСРОЧЕНО': 'OVERDUE', 'ПРОСРОЧЕНО:': 'OVERDUE:',
    'не выполнено': 'not done', 'Выполнено': 'Completed', 'В работе': 'In progress',
    'Отложено': 'Postponed', 'Осталось': 'Left', 'осталось': 'left',
    'Разложено': 'Allocated', 'Записано': 'Saved', 'Сохранено': 'Saved',
    'Удалено': 'Deleted', 'Снято': 'Cleared', 'Закрыто': 'Closed', 'закрыт': 'closed',
    'в срок': 'on time', 'Отметка снята': 'Mark removed',
    'Отметка выполнения': 'Completion mark', 'Форма отметки': 'Mark shape',
    'Цвет отметки': 'Mark colour',

    // — поля и редактор —
    'Название': 'Title', 'Имя': 'Name', 'Дата': 'Date', 'Время': 'Time',
    'Срок': 'Deadline', 'Заголовок': 'Heading', 'Текст записи': 'Note text',
    'Комментарий к задаче': 'Task comment', 'Описание': 'Description',
    'описание': 'description', 'Необязательно': 'Optional', 'необязательно': 'optional',
    'Подпункт': 'Subtask', 'Новый подпункт': 'New subtask', 'Новый пункт': 'New item',
    'Новый список': 'New list', 'Новая запись': 'New note', 'Задача этапа': 'Stage task',
    'Название списка': 'List name', 'Как назвать список?': 'Name the list?',
    'Как назвать запись?': 'Name the note?', 'Как назвать категорию?': 'Name the category?',
    'Повтор': 'Repeat', 'Без повтора': 'No repeat', 'без повтора': 'no repeat',
    'Каждый день': 'Every day', 'каждый день': 'every day',
    'Каждую неделю': 'Every week', 'каждую неделю': 'every week',
    'Каждый месяц': 'Every month', 'каждый месяц': 'every month',
    'Каждые 2 дня': 'Every 2 days', 'По будням': 'On weekdays', 'по будням': 'on weekdays',
    'Напоминать': 'Remind', 'Напоминания включены': 'Reminders on',
    'Напоминания выключены': 'Reminders off', 'Дата цели:': 'Goal date:',
    'Цель:': 'Goal:', 'Этап': 'Stage', 'Этапы': 'Stages', 'План на день': 'Day plan',

    // — тема, вид, язык —
    'Тёмная тема': 'Dark theme', 'Светлая тема': 'Light theme',
    'Тёмная': 'Dark', 'Светлая': 'Light', 'Тема': 'Theme', 'Цвет': 'Colour',
    'Оформление': 'Appearance', 'Начертание': 'Typeface', 'Размер': 'Size',
    'Крупнее': 'Larger', 'Мельче': 'Smaller', 'Как в теме': 'Match theme',
    'Включить тёмную тему': 'Switch to dark theme',
    'Включить светлую тему': 'Switch to light theme',
    'Переключить на английский': 'Switch to English',
    'Переключить на русский': 'Switch to Russian',
    'Имя и фото': 'Name and photo', 'Фото обновлено': 'Photo updated',
    'Фото убрано': 'Photo removed', 'Как к вам обращаться': 'What should we call you',

    // — финансы —
    'Финансы': 'Finances', 'Доход': 'Income', 'Трата': 'Expense', 'Мои траты': 'My expenses',
    'Сумма': 'Amount', 'Категория': 'Category', 'Своя категория': 'Custom category',
    'Категория добавлена': 'Category added', 'Итого': 'Total', 'Разница': 'Difference',
    'Баланс': 'Balance', 'Потрачено': 'Spent', 'Заработано': 'Earned',
    'Перерасход': 'Overspent', 'Долг': 'Debt', 'Долги': 'Debts',
    'Кредиты': 'Loans', 'Кредит': 'Loan', 'Кредитная карта': 'Credit card',
    'Ипотека': 'Mortgage', 'Автокредит': 'Car loan', 'Рассрочка': 'Instalments',
    'Мне должны': 'Owed to me', 'Я должен': 'I owe', 'Мне должен': 'Owes me',
    'Закрыть долг': 'Close debt', 'Долг закрыт': 'Debt closed',
    'Долг записан': 'Debt saved', 'Возврат': 'Repayment', 'Возврат долга': 'Debt repayment',
    'Возврат записан': 'Repayment saved', 'Вернуть долг:': 'Repay debt:',
    'Забрать долг:': 'Collect debt:', 'Когда вернуть': 'When to repay',
    'Когда должны вернуть': 'When it should be repaid',
    'У кого взял': 'Who I borrowed from', 'У кого вы заняли?': 'Who did you borrow from?',
    'Кто взял у вас?': 'Who borrowed from you?', 'Копилка': 'Savings jar',
    'Копилки': 'Savings jars', 'Копилка удалена': 'Savings jar deleted',
    'Копилка сохранена': 'Savings jar saved', 'Новая копилка': 'New savings jar',
    'На что копим?': 'What are we saving for?', 'Сколько отложить?': 'How much to set aside?',
    'Сколько нужно собрать?': 'How much do you need?', 'Конверт': 'Envelope',
    'Конверты': 'Envelopes', 'Новый конверт': 'New envelope', 'Конверт убран': 'Envelope removed',
    'Подписка': 'Subscription', 'Подписки': 'Subscriptions',
    'Подписки и платежи': 'Subscriptions and payments',
    'Подписки и сервисы': 'Subscriptions and services',
    'Обязательные платежи': 'Fixed payments', 'Обязательный платёж': 'Fixed payment',
    'Платёж по долгу': 'Debt payment', 'Платежи': 'Payments', 'Платёж': 'Payment',
    'Регулярная операция': 'Recurring entry', 'Регулярные операции': 'Recurring entries',
    'В месяц': 'Per month', 'в месяц': 'per month', 'В год': 'Per year', 'в год': 'per year',
    'Бюджет': 'Budget', 'Квартплата': 'Utilities', 'Жильё и ЖКХ': 'Housing and utilities',
    'Аренда жилья': 'Rent', 'Транспорт': 'Transport', 'Здоровье': 'Health',
    'Развлечения': 'Entertainment', 'Дети и учёба': 'Kids and education',
    'Детский сад': 'Kindergarten', 'Прочее': 'Other', 'Мобильная связь': 'Mobile',
    'Интернет дома': 'Home internet', 'За что платите?': 'What are you paying for?',
    'Выбрать сервис': 'Choose a service', 'Название сервиса': 'Service name',
    'Сколько отдали': 'How much you paid', 'Сколько вернули': 'How much was repaid',
    'можно частью': 'partial is fine', 'Оплатить': 'Pay', 'оплачено': 'paid',
    'всё оплачено': 'all paid', 'Всё сделано.': 'All done.',

    // — помодоро и медитация —
    'Помодоро': 'Pomodoro', 'Помодоро и медитация': 'Pomodoro and meditation',
    'Фокус': 'Focus', 'Фокус дня': 'Focus of the day', 'Работа': 'Focus',
    'Перерыв': 'Break', 'Короткий перерыв': 'Short break', 'короткий перерыв': 'short break',
    'Длинный перерыв': 'Long break', 'длинный перерыв': 'long break',
    'Пауза': 'Pause', 'Сброс': 'Reset', 'Круг': 'Round', 'Звук': 'Sound',
    'Громкость': 'Volume', 'Тишина': 'Silence', 'Дождь': 'Rain', 'Море': 'Sea',
    'Лес': 'Forest', 'Ручей': 'Stream', 'Гроза': 'Thunderstorm', 'Ветер': 'Wind',
    'Камин': 'Fireplace', 'Вдох': 'Inhale', 'Выдох': 'Exhale',
    'мин': 'min', 'минут': 'min', 'Штук': 'Count', 'Длина фокуса —': 'Focus length —',
    'Сеанс закончен': 'Session finished', 'Сеанс прерван': 'Session interrupted',
    'Сеанс засчитан': 'Session counted', 'Помидор закрыт': 'Pomodoro complete',
    'Тренировка 30 минут': '30-minute workout', 'минут в тишине': 'minutes in silence',

    // — подписка —
    'Бесплатно': 'Free', 'бесплатно': 'free', 'Бесплатный доступ': 'Free access',
    'В подписке': 'With Pro', 'Нужна подписка': 'Pro required',
    'Тарифы и подписка': 'Plans and subscription', 'Подписка на месте': 'Subscription active',
    'Подписка включена': 'Subscription enabled', 'Включить подписку': 'Enable subscription',
    'Подписка больше не активна': 'Subscription is no longer active',
    'Код': 'Code', 'Код скопирован': 'Code copied', 'без ограничений': 'unlimited',

    // — сообщения —
    'Ошибка': 'Error', 'Не получилось': 'Something went wrong',
    'Не получилось:': 'Something went wrong:', 'Вернуть не удалось': 'Could not restore',
    'Сервер ответил': 'Server replied', 'Проверяем…': 'Checking…',
    'Syn собирает…': 'Syn is working…', 'Готовим голос…': 'Preparing voice…',
    'Брифинг собран': 'Briefing ready', 'Обновить брифинг': 'Refresh briefing',
    'Собрать брифинг': 'Build briefing', 'Собрать цифры': 'Collect the numbers',
    'Утренний разбор от Syn': 'Morning review by Syn',
    'Вечерний разбор от Syn': 'Evening review by Syn',
    'Как прошёл день': 'How the day went', 'План и итог дня': 'Plan and day summary',
    'Главное на сегодня:': 'Key things today:', 'Сегодня в фокусе': 'In focus today',
    'Прогресс дня': "Today's progress", 'сделано за день': 'done today',
    'намечено на день': 'planned for the day', 'Первые шаги': 'First steps',
    'Первые шаги скрыты': 'First steps hidden', 'Первые шаги пройдены': 'First steps completed',
    'Пропустить первые шаги': 'Skip first steps', 'Пропустить знакомство': 'Skip the intro',
    'Создай первую задачу': 'Create your first task',
    'Отметь её выполненной': 'Mark it as done', 'Заведи цель': 'Set a goal',
    'Попроси Syn': 'Ask Syn', 'Придумать цель с Syn': 'Come up with a goal with Syn',
    'Записать через Syn': 'Save via Syn', 'Записано:': 'Saved:', 'Не записано': 'Not saved',

    // — подсказки в полях —
    'Купить молоко завтра в 9 утра': 'Buy milk tomorrow at 9am',
    'Например, Купить фрукты': 'For example, Buy fruit',
    'Например, Дети': 'For example, Kids',
    'Например: выйти на доход 300 000': 'For example: reach an income of 300,000',
    'Например: сдать пробный экзамен': 'For example: pass a mock exam',
    'Выучить английский за год': 'Learn English in a year',
    'Свой срок или выбери ниже': 'Your own deadline, or pick one below',
    'Перенеси урок на субботу': 'Move the lesson to Saturday',
    'зарплата 90000': 'salary 90000', 'кофе 350': 'coffee 350',
    'Нужна сумма одним числом': 'Enter the amount as a single number',
    'Нужна сумма — одним числом': 'Enter the amount as a single number',
    'Название не может быть пустым': 'The title cannot be empty'
  };


  /* Фразы с числами внутри. Множественное число в английском проще русского:
     хватает «s» после единицы, поэтому правил немного. */
  var PATTERNS = [
    [/^Пройдено (\d+) из (\d+)$/, function (m) { return m[1] + ' of ' + m[2] + ' done'; }],
    [/^(\d+) из (\d+)$/, function (m) { return m[1] + ' of ' + m[2]; }],
    [/^просрочено на (\d+) (?:день|дня|дней)$/, function (m) {
      return 'overdue by ' + m[1] + (m[1] === '1' ? ' day' : ' days');
    }],
    [/^через (\d+) (?:день|дня|дней)$/, function (m) {
      return 'in ' + m[1] + (m[1] === '1' ? ' day' : ' days');
    }],
    [/^(\d+) (?:минута|минуты|минут)$/, function (m) { return m[1] + ' min'; }],
    [/^(\d+) (?:час|часа|часов)$/, function (m) {
      return m[1] + (m[1] === '1' ? ' hour' : ' hours');
    }],
    [/^(\d+) (?:раз|раза)$/, function (m) {
      return m[1] + (m[1] === '1' ? ' time' : ' times');
    }],
    [/^Осталось (\d+)$/, function (m) { return m[1] + ' left'; }]
  ];

  /* Переводим фразу ЦЕЛИКОМ или не трогаем вовсе.

     Подстановка по кускам (искать в тексте любые знакомые слова) выглядит
     заманчиво — покрытие сразу большое, — но даёт уродство: «задачу»
     превращается в «tasksу», потому что «задач» нашлось внутри слова. Строгое
     совпадение всей фразы исключает это по устройству: либо фраза переведена
     целиком и читается как английская, либо остаётся русской. */
  function phrase(text) {
    var lead = /^\s*/.exec(text)[0];
    var tail = /\s*$/.exec(text)[0];
    var core = text.slice(lead.length, text.length - tail.length);
    if (!core) return text;
    if (EN[core]) return lead + EN[core] + tail;

    // «3 задачи» → «3 tasks»: число впереди, знакомое слово следом.
    var counted = /^(\d+)\s+(\S+)$/.exec(core);
    if (counted && EN[counted[2]]) return lead + counted[1] + ' ' + EN[counted[2]] + tail;

    // Фразы, где число внутри: их не занести в словарь целиком.
    for (var i = 0; i < PATTERNS.length; i++) {
      var hit = PATTERNS[i][0].exec(core);
      if (hit) return lead + PATTERNS[i][1](hit) + tail;
    }

    return text;
  }

  /* Перевод собранной разметки. Тронуты только видимый текст и читаемые
     атрибуты — ни имена классов, ни data-атрибуты, ни обработчики. */
  function tr(html) {
    if (lang !== 'en' || typeof html !== 'string' || !html) return html;
    if (html.indexOf('<') === -1) return phrase(html);
    html = html.replace(/(placeholder|title|aria-label|alt)="([^"]*)"/g, function (m, attr, value) {
      return attr + '="' + phrase(value) + '"';
    });
    return html.replace(/>([^<]+)</g, function (m, text) { return '>' + phrase(text) + '<'; });
  }

  global.SynI18n = {
    tr: tr,
    get: function () { return lang; },
    set: function (next) {
      lang = (next === 'en') ? 'en' : 'ru';
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
      document.documentElement.setAttribute('lang', lang);
    },
    isEnglish: function () { return lang === 'en'; }
  };
  document.documentElement.setAttribute('lang', lang);
})(window);

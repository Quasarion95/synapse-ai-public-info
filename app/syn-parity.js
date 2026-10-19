/* Syn в вебе и в андроиде умеет то же, что в айфоне.

   Сервер предлагает модели одни и те же действия для всех платформ, а
   исполняет их каждый клиент сам. Айфон исполнял всё, веб — не всё: деньги
   только записывались (траты, долги, копилки, подписки, конверты), а «удали
   вчерашнюю трату», «закрой долг Марата», «отметь Яндекс Плюс оплаченным»,
   «поставь остаток 50 000» встречали «веб пока не умеет». Так же было с
   частью настроек: валюта, язык, «открывать последний экран», «напоминать
   заранее», утренний план и вечерний итог — переключатели в вебе есть, а
   Syn до них не дотягивался.

   Файл общий для веба и андроида (подключается после app.js без условий):
   апк собирается из той же папки app/, и андроид должен уметь то же.

   Деньги идут тем же путём, что и запись трат: сначала карточка
   «что именно изменится», и только по нажатию. У денег нет корзины, и
   неверно удалённая трата разъедет и сводку, и конверты, и остаток. Опора —
   те же поля и правила, что у экранов «Моих финансов»: правка голосом и
   правка пальцем делают одно и то же. Поиск операций, долгов, копилок и
   подписок устроен как в айфоне (WorkspaceStore+AssistantFinanceControl). */

(function (global) {
  'use strict';

  function norm(s){ return String(s || '').trim().toLowerCase().replace(/ё/g, 'е'); }
  function kopecks(rubles){
    var n = Math.round(Math.abs(Number(rubles)) * 100);
    return isFinite(n) ? n : 0;
  }
  function isoDay(s){ return /^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : ''; }
  function enabledOf(a){
    if (typeof a.enabled === 'boolean') return a.enabled;
    return !/^(off|false|no|выкл|нет)/.test(norm(a.value));
  }

  /* ============ ДЕНЬГИ ============ */

  /* Операции — в том же порядке, что в срезе для модели (finContext ниже):
     новые сверху. Иначе «удали третью» у модели и у нас — разные строки. */
  function opsNewestFirst(){
    return S.finance.ops.slice().sort(function(x, y){
      if (x.date !== y.date) return x.date < y.date ? 1 : -1;
      return (y.at || 0) - (x.at || 0);
    });
  }

  /* Три пути, как в айфоне: номером из среза, названием, названием с датой
     или категорией. Ни одного условия — это не «всё», а неполный запрос. */
  function findOps(a){
    var all = opsNewestFirst();
    var index = Number(a.index);
    if (index >= 1 && index <= all.length) return [all[index - 1]];

    var query = norm(a.target || a.title);
    var day = isoDay(a.date);
    var month = norm(a.value) === 'месяц' ? finMonthKey() : '';
    var category = norm(a.category || a.cat);
    if (!query && !day && !month && !category) return [];

    return all.filter(function(op){
      if (query && norm(op.title).indexOf(query) === -1) return false;
      if (day && op.date !== day) return false;
      if (month && finMonthKey(op.date) !== month) return false;
      if (category && norm(op.cat) !== category && norm(finCat(op.cat).title) !== category) return false;
      return true;
    });
  }

  function findBy(list, a, field){
    var query = norm(a.who || a.target || a.title);
    if (!query) return null;
    for (var i = 0; i < list.length; i++){
      if (norm(list[i][field]).indexOf(query) !== -1) return list[i];
    }
    return null;
  }
  // Открытый долг важнее закрытого: про закрытые обычно не просят.
  function findDebt(a){
    var open = S.finance.debts.filter(function(d){ return !d.closed; });
    var closed = S.finance.debts.filter(function(d){ return d.closed; });
    return findBy(open.concat(closed), a, 'who');
  }
  function findJar(a){ return findBy(S.finance.jars, a, 'title'); }
  function findSub(a){ return findBy(S.finance.subs, a, 'title'); }
  function findBudgetCat(a){
    var wanted = norm(a.category || a.cat || a.target);
    if (!wanted) return '';
    var keys = Object.keys(S.finance.budgets || {});
    for (var i = 0; i < keys.length; i++){
      if (norm(keys[i]) === wanted || norm(finCat(keys[i]).title) === wanted) return keys[i];
    }
    return '';
  }

  function short(op){
    return '«' + op.title + '» · ' + finMoney(op.amount) + ' · ' + humanDate(op.date);
  }

  /* Ссылки переводятся в идентификаторы один раз — когда показываем
     карточку. Пока человек думает, список может сдвинуться, а номер в
     пересчитанном списке указал бы на другую трату. */
  function resolve(a){
    var kind = String(a.kind || '').toLowerCase();
    if (a._resolved) return;
    a._resolved = true;
    if (kind === 'fin_delete_op' || kind === 'fin_delete_ops' || kind === 'fin_update_op'){
      a._ids = findOps(a).map(function(op){ return op.id; });
    } else if (/debt$/.test(kind) && kind !== 'fin_add_debt' && kind !== 'fin_pay_debt'){
      var debt = findDebt(a); a._id = debt ? debt.id : '';
    } else if (/jar$/.test(kind) && kind !== 'fin_add_jar'){
      var jar = findJar(a); a._id = jar ? jar.id : '';
    } else if (/sub$/.test(kind) && kind !== 'fin_add_sub'){
      var sub = findSub(a); a._id = sub ? sub.id : '';
    } else if (kind === 'fin_clear_budget'){
      a._id = findBudgetCat(a);
    }
  }
  function opsOf(a){
    return (a._ids || []).map(function(id){ return finOp(id); }).filter(Boolean);
  }
  function byId(list, id){
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* Что поменяется в операции — общее для карточки и для исполнения. */
  function opChanges(op, a){
    var out = [];
    var amount = a.amount !== undefined && a.amount !== null && a.amount !== '' ? kopecks(a.amount) : 0;
    if (amount && amount !== op.amount) out.push({ field: 'amount', value: amount, said: 'сумма — ' + finMoney(amount) });
    var title = String(a.newTitle || '').trim();
    if (title && title !== op.title) out.push({ field: 'title', value: title, said: 'название — «' + title + '»' });
    var cat = a.category || a.cat;
    if (cat){
      var c = finCat(cat);
      if (c.id === 'other' && norm(cat) !== 'other'){
        // Пришло название, а не id: ищем по названию среди всех категорий.
        finAllCats().forEach(function(x){ if (norm(x.title) === norm(cat)) c = x; });
      }
      if (c.id !== op.cat) out.push({ field: 'cat', value: c.id, said: 'категория — ' + c.title });
    }
    var day = isoDay(a.datetime || a.date || a.due);
    if (day && day !== op.date) out.push({ field: 'date', value: day, said: 'дата — ' + humanDate(day) });
    return out;
  }

  var MANAGE = {
    fin_delete_op: {
      preview: function(a){
        var ops = opsOf(a);
        if (!ops.length) return 'Не нашёл такую трату — назовите её точнее или номер из списка';
        if (ops.length === 1) return 'Удалить ' + short(ops[0]);
        var sum = ops.reduce(function(s, op){ return s + op.amount; }, 0);
        return 'Удалить ' + ops.length + ' ' + plural(ops.length, 'операцию', 'операции', 'операций') +
          ' на ' + finMoney(sum) + ': ' + ops.slice(0, 5).map(function(op){ return '«' + op.title + '»'; }).join(', ') +
          (ops.length > 5 ? ' и ещё ' + (ops.length - 5) : '');
      },
      apply: function(a){
        var ids = a._ids || [];
        if (!ids.length) return 'трата не найдена';
        var before = S.finance.ops.length;
        S.finance.ops = S.finance.ops.filter(function(op){ return ids.indexOf(op.id) === -1; });
        var n = before - S.finance.ops.length;
        return 'удалено ' + n + ' ' + plural(n, 'операция', 'операции', 'операций');
      }
    },
    fin_update_op: {
      preview: function(a){
        var ops = opsOf(a);
        if (!ops.length) return 'Не нашёл такую трату — назовите её точнее или номер из списка';
        if (ops.length > 1) return 'Под описание подходит ' + ops.length + ' ' +
          plural(ops.length, 'операция', 'операции', 'операций') + ' — назовите номер из списка';
        var changes = opChanges(ops[0], a);
        if (!changes.length) return 'В «' + ops[0].title + '» нечего менять';
        return 'Изменить «' + ops[0].title + '»: ' + changes.map(function(c){ return c.said; }).join(', ');
      },
      apply: function(a){
        var ops = opsOf(a);
        if (ops.length !== 1) return 'трата не изменена: ' + (ops.length ? 'подходит несколько' : 'не найдена');
        var changes = opChanges(ops[0], a);
        if (!changes.length) return 'в «' + ops[0].title + '» нечего менять';
        changes.forEach(function(c){ ops[0][c.field] = c.value; });
        return 'изменено «' + ops[0].title + '»';
      }
    },
    fin_delete_debt: {
      preview: function(a){
        var d = byId(S.finance.debts, a._id);
        return d ? 'Удалить долг: ' + (d.mine ? 'я должен ' : 'мне должен ') + d.who + ', ' + finMoney(d.amount)
                 : 'Не нашёл долг «' + (a.who || a.target || '?') + '»';
      },
      apply: function(a){
        var d = byId(S.finance.debts, a._id);
        if (!d) return 'долг не найден';
        if (d.taskId) S.tasks = S.tasks.filter(function(t){ return t.id !== d.taskId; });
        S.finance.debts = S.finance.debts.filter(function(x){ return x.id !== d.id; });
        return 'долг «' + d.who + '» удалён';
      }
    },
    fin_close_debt: {
      preview: function(a){
        var d = byId(S.finance.debts, a._id);
        return d ? 'Закрыть долг: ' + d.who : 'Не нашёл долг «' + (a.who || a.target || '?') + '»';
      },
      apply: function(a){
        var d = byId(S.finance.debts, a._id);
        if (!d) return 'долг не найден';
        d.closed = true;
        return 'долг «' + d.who + '» закрыт';
      }
    },
    fin_reopen_debt: {
      preview: function(a){
        var d = byId(S.finance.debts, a._id);
        return d ? 'Снова открыть долг: ' + d.who : 'Не нашёл долг «' + (a.who || a.target || '?') + '»';
      },
      apply: function(a){
        var d = byId(S.finance.debts, a._id);
        if (!d) return 'долг не найден';
        d.closed = false;
        return 'долг «' + d.who + '» снова открыт';
      }
    },
    fin_delete_jar: {
      preview: function(a){
        var j = byId(S.finance.jars, a._id);
        return j ? 'Удалить копилку «' + j.title + '»' + (j.saved ? ' (в ней ' + finMoney(j.saved) + ')' : '')
                 : 'Не нашёл копилку «' + (a.target || a.title || '?') + '»';
      },
      apply: function(a){
        var j = byId(S.finance.jars, a._id);
        if (!j) return 'копилка не найдена';
        S.finance.jars = S.finance.jars.filter(function(x){ return x.id !== j.id; });
        return 'копилка «' + j.title + '» удалена';
      }
    },
    fin_update_jar: {
      preview: function(a){
        var j = byId(S.finance.jars, a._id);
        if (!j) return 'Не нашёл копилку «' + (a.target || a.title || '?') + '»';
        var parts = [];
        if (a.newTitle) parts.push('название — «' + a.newTitle + '»');
        if (kopecks(a.amount)) parts.push('цель — ' + finMoney(kopecks(a.amount)));
        if (isoDay(a.due || a.datetime)) parts.push('срок — ' + humanDate(isoDay(a.due || a.datetime)));
        return parts.length ? 'Копилка «' + j.title + '»: ' + parts.join(', ') : 'В копилке «' + j.title + '» нечего менять';
      },
      apply: function(a){
        var j = byId(S.finance.jars, a._id);
        if (!j) return 'копилка не найдена';
        if (String(a.newTitle || '').trim()) j.title = String(a.newTitle).trim();
        if (kopecks(a.amount)) j.target = kopecks(a.amount);
        if (isoDay(a.due || a.datetime)) j.due = isoDay(a.due || a.datetime);
        return 'копилка «' + j.title + '» изменена';
      }
    },
    fin_add_to_jar: {
      preview: function(a){
        var j = byId(S.finance.jars, a._id);
        if (!j) return 'Не нашёл копилку «' + (a.target || a.title || '?') + '»';
        if (!kopecks(a.amount)) return 'Сколько отложить в «' + j.title + '»? Суммы нет';
        return 'Отложить ' + finMoney(kopecks(a.amount)) + ' в «' + j.title + '»';
      },
      apply: function(a){
        var j = byId(S.finance.jars, a._id);
        var amount = kopecks(a.amount);
        if (!j || !amount) return j ? 'не отложено: нет суммы' : 'копилка не найдена';
        // То же, что кнопка «Отложить» (finJarApply), но без окна и без
        // второго commit: карточка закоммитит всё разом.
        j.saved = Math.max(0, (j.saved || 0) + amount);
        finSyncJarStages();
        return 'отложено ' + finMoney(amount) + ' в «' + j.title + '» — накоплено ' + finMoney(j.saved) +
          (j.target ? ' из ' + finMoney(j.target) : '');
      }
    },
    fin_delete_sub: {
      preview: function(a){
        var s = byId(S.finance.subs, a._id);
        return s ? 'Удалить подписку «' + s.title + '»' : 'Не нашёл подписку «' + (a.target || a.title || '?') + '»';
      },
      apply: function(a){
        var s = byId(S.finance.subs, a._id);
        if (!s) return 'подписка не найдена';
        // Напоминание уходит вместе с подпиской — как у кнопки «Удалить».
        if (s.taskId) S.tasks = S.tasks.filter(function(t){ return t.id !== s.taskId; });
        S.finance.subs = S.finance.subs.filter(function(x){ return x.id !== s.id; });
        return 'подписка «' + s.title + '» удалена';
      }
    },
    fin_toggle_sub: {
      preview: function(a){
        var s = byId(S.finance.subs, a._id);
        if (!s) return 'Не нашёл подписку «' + (a.target || a.title || '?') + '»';
        return (s.off ? 'Включить' : 'Отключить') + ' подписку «' + s.title + '»';
      },
      apply: function(a){
        var s = byId(S.finance.subs, a._id);
        if (!s) return 'подписка не найдена';
        s.off = !s.off;
        return 'подписка «' + s.title + '» ' + (s.off ? 'отключена' : 'включена');
      }
    },
    /* «Оплатил Яндекс Плюс» — та же отметка, что кнопка «Оплатить» в
       платежах месяца: трата в ленте плюс отметка за месяц. Сумма — из
       фразы, иначе та, что записана у подписки. */
    fin_pay_sub: {
      preview: function(a){
        var s = byId(S.finance.subs, a._id);
        if (!s) return 'Не нашёл подписку «' + (a.target || a.title || '?') + '»';
        if (s.off) return 'Подписка «' + s.title + '» отключена — включите её, чтобы отмечать оплату';
        if (s.paid && s.paid[finMonthKey()]) return '«' + s.title + '» за этот месяц уже отмечена оплаченной';
        var amount = kopecks(a.amount) || s.amount;
        if (!amount) return 'Сколько заплатили за «' + s.title + '»? Суммы нет';
        return 'Оплачено: «' + s.title + '» — ' + finMoney(amount) + ' за этот месяц';
      },
      apply: function(a){
        var s = byId(S.finance.subs, a._id);
        if (!s) return 'подписка не найдена';
        var key = finMonthKey();
        if (s.off) return 'подписка «' + s.title + '» отключена';
        if (s.paid && s.paid[key]) return '«' + s.title + '» уже отмечена';
        var amount = kopecks(a.amount) || s.amount;
        if (!amount) return 'не отмечено: неизвестна сумма';
        var op = {
          id: uid(), kind: 'spend', title: s.title, amount: amount,
          cat: finCat(s.cat || 'subs').id, date: isoOf(todayDate()), at: Date.now(),
          accountId: '', fromSub: s.id
        };
        S.finance.ops.push(op);
        if (!s.paid) s.paid = {};
        if (!s.ops) s.ops = {};
        s.paid[key] = amount;
        s.ops[key] = op.id;
        if (!s.amount) s.amount = amount;
        return '«' + s.title + '» оплачена — ' + finMoney(amount);
      }
    },
    fin_clear_budget: {
      preview: function(a){
        return a._id ? 'Убрать конверт «' + finCat(a._id).title + '»'
                     : 'У категории «' + (a.category || a.cat || a.target || '?') + '» нет конверта';
      },
      apply: function(a){
        if (!a._id || !(a._id in S.finance.budgets)) return 'конверта нет';
        delete S.finance.budgets[a._id];
        return 'конверт «' + finCat(a._id).title + '» убран';
      }
    },
    fin_set_opening: {
      preview: function(a){
        if (a.amount === undefined || a.amount === null || a.amount === '' || !isFinite(Number(a.amount))){
          return 'Какой поставить остаток? Суммы нет';
        }
        return 'Остаток на счёте — ' + finMoney(Math.round(Number(a.amount) * 100));
      },
      apply: function(a){
        if (a.amount === undefined || a.amount === null || a.amount === '' || !isFinite(Number(a.amount))){
          return 'остаток не изменён: нет суммы';
        }
        // Минус законен (кредитка), ноль тоже: человек начинает с нуля.
        S.finance.opening = Math.round(Number(a.amount) * 100);
        S.finance.openingHidden = true;
        return 'остаток — ' + finMoney(S.finance.opening);
      }
    }
  };
  MANAGE.fin_delete_ops = MANAGE.fin_delete_op;

  function isManage(a){ return !!MANAGE[String(a && a.kind || '').toLowerCase()]; }

  function installFinance(){
    if (typeof global.finApplyBatch !== 'function' || typeof global.finPreview !== 'function') return;

    var basePreview = global.finPreview;
    global.finPreview = function(actions){
      var mine = (actions || []).filter(isManage);
      var base = (actions || []).filter(function(a){ return !isManage(a); });
      if (!mine.length) return basePreview.apply(this, arguments);
      var out = base.length ? basePreview.call(this, base) : { head: '', rows: [] };
      mine.forEach(function(a){
        resolve(a);
        out.rows.push(MANAGE[String(a.kind).toLowerCase()].preview(a));
      });
      out.head = out.rows.length === 1 ? 'Сделать?' : 'Сделать ' + out.rows.length + ' ' +
        plural(out.rows.length, 'изменение', 'изменения', 'изменений') + '?';
      out.button = 'Применить';
      return out;
    };

    var baseApply = global.finApplyBatch;
    global.finApplyBatch = function(actions){
      var mine = (actions || []).filter(isManage);
      var said = baseApply.call(this, (actions || []).filter(function(a){ return !isManage(a); })) || [];
      mine.forEach(function(a){
        resolve(a);
        try {
          said.push(MANAGE[String(a.kind).toLowerCase()].apply(a));
        } catch (error){
          said.push('«' + a.kind + '» не получилось применить');
        }
      });
      return said;
    };

    /* Срез денег для модели — с тем, по чему она находит, что править.

       Раньше в нём были только имена: этого хватало, чтобы записать трату, и
       не хватало, чтобы её удалить. Теперь — как в айфоне: операции с
       номерами (новые сверху), конверты, все долги, копилки с накопленным,
       подписки с отметкой оплаты, остаток. Операций — последние сто: дальше
       и вспоминают редко, и токены дорожают. */
    if (typeof global.finContext === 'function'){
      var baseContext = global.finContext;
      global.finContext = function(){
        var lines = String(baseContext.apply(this, arguments)).split('\n').filter(function(line){
          return !/^(КОПИЛКИ|ПОДПИСКИ): /.test(line);
        });
        var rub = function(k){ return Math.round((k || 0) / 100) + ' руб.'; };
        lines.push('ОСТАТОК НА СЧЁТЕ (начальный): ' + rub(S.finance.opening));

        var ops = opsNewestFirst();
        if (ops.length){
          lines.push('ОПЕРАЦИИ (всего ' + ops.length + (ops.length > 100 ? ', показаны последние 100' : '') +
            ', новые сверху; номер — чтобы сослаться):');
          ops.slice(0, 100).forEach(function(op, i){
            lines.push((i + 1) + '. ' + op.date + ' · ' + (op.kind === 'income' ? 'доход' : 'трата') +
              ' · «' + op.title + '» · ' + rub(op.amount) + ' · ' + finCat(op.cat).title);
          });
        } else {
          lines.push('ОПЕРАЦИИ: пусто');
        }

        var budgets = Object.keys(S.finance.budgets || {}).filter(function(k){ return S.finance.budgets[k] > 0; });
        if (budgets.length){
          lines.push('КОНВЕРТЫ: ' + budgets.map(function(k){
            return finCat(k).title + ' ' + rub(S.finance.budgets[k]) + ' в месяц';
          }).join(', '));
        }
        var closed = S.finance.debts.filter(function(d){ return d.closed; });
        if (closed.length){
          lines.push('ЗАКРЫТЫЕ ДОЛГИ: ' + closed.map(function(d){ return d.who; }).join(', '));
        }
        if (S.finance.jars.length){
          lines.push('КОПИЛКИ: ' + S.finance.jars.map(function(j){
            return '«' + j.title + '» ' + rub(j.saved) + (j.target ? ' из ' + rub(j.target) : '');
          }).join(', '));
        }
        if (S.finance.subs.length){
          var key = finMonthKey();
          lines.push('ПОДПИСКИ И ПЛАТЕЖИ: ' + S.finance.subs.map(function(s){
            return '«' + s.title + '» ' + (s.amount ? rub(s.amount) + ' ' + (FIN_EVERY[s.every] || FIN_EVERY.month).title : 'сумма не задана') +
              (s.off ? ', отключена' : s.paid && s.paid[key] ? ', оплачена в этом месяце' : '');
          }).join('; '));
        }
        return lines.join('\n');
      };
    }
  }

  /* ============ НАСТРОЙКИ ============ */

  // Валюту называют как угодно: «доллар», «usd», «$», «dollars».
  var CURRENCY_WORDS = {
    rub: /руб|rub|₽/, kzt: /тенге|kzt|₸/, uah: /грив|uah|₴/, byn: /белорус|byn/,
    kgs: /сом|kgs/, usd: /долл|usd|dollar|\$/, eur: /евро|eur|€/
  };
  var LEADS = [0, 15, 30, 60, 180, 1440];

  function clock(s){
    var m = /(\d{1,2})[:.](\d{2})/.exec(String(s || ''));
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
    return (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2];
  }

  var SETTINGS = {
    set_currency: function(a, done, skipped){
      var wanted = norm(a.value || a.title);
      var found = null;
      ВАЛЮТЫ.forEach(function(v){
        if (found) return;
        if (v.id === wanted || norm(v.title) === wanted || (CURRENCY_WORDS[v.id] && CURRENCY_WORDS[v.id].test(wanted))) found = v;
      });
      if (!found) return skipped.push('валюты «' + (a.value || '?') + '» в списке нет');
      S.currency = found.id;
      S.currencyAsked = true;
      done.push('валюта — ' + found.title);
    },
    set_language: function(a, done, skipped){
      var wanted = norm(a.value);
      var lang = /^(en|англ|english)/.test(wanted) ? 'en' : /^(ru|рус|russian)/.test(wanted) ? 'ru' : '';
      if (!lang) return skipped.push('такого языка в веб-версии нет — есть русский и английский');
      if (typeof SynI18n === 'undefined') return skipped.push('язык здесь не переключается');
      SynI18n.set(lang);
      done.push(lang === 'en' ? 'язык — английский' : 'язык — русский');
    },
    set_opens_to_last_screen: function(a, done){
      S.openLast = enabledOf(a);
      done.push(S.openLast ? 'будет открываться последний экран' : 'будет открываться выбранный раздел');
    },
    set_reminder_lead: function(a, done){
      var minutes = Math.max(0, Number(a.interval || a.value) || 0);
      // В вебе выбор из готовых вариантов — берём ближайший.
      var nearest = LEADS.reduce(function(best, v){ return Math.abs(v - minutes) < Math.abs(best - minutes) ? v : best; }, 0);
      S.notify.заранее = nearest;
      done.push(nearest ? 'напоминать за ' + (nearest >= 60 ? nearest / 60 + ' ч' : nearest + ' мин') : 'напоминать в срок');
    },
    /* Утренний план и вечерний итог в вебе — один переключатель «План и итог
       дня» с двумя временами. Включить можно любой из них; выключить — только
       оба сразу, и это надо сказать вслух, а не молча. */
    set_daily_summary: function(a, done){ briefing(a, done, 'morning', 'утренний план'); },
    set_evening_review: function(a, done){ briefing(a, done, 'evening', 'вечерний итог'); },
    'hide_pane show_pane': function(a, done, skipped){
      skipped.push('скрывать разделы в веб-версии нельзя — только в приложении на айфоне');
    },
    set_missed_tasks: function(a, done, skipped){
      skipped.push('настройки «пропущенные задачи» в веб-версии нет — только в приложении на айфоне');
    },
    set_proactive_insights: function(a, done, skipped){
      skipped.push('подсказок Syn по своей инициативе в веб-версии нет — только в приложении на айфоне');
    }
  };

  function briefing(a, done, which, name){
    var on = enabledOf(a);
    var time = clock(a.datetime || a.time || a.value);
    if (!on){
      S.notify.brief = false;
      return done.push('план и итог дня выключены — в вебе они включаются только вместе');
    }
    S.notify.brief = true;
    if (time) S.notify[which] = time;
    done.push(name + ' включён' + (time ? ', в ' + time : ''));
  }

  /* ============ ПАЧКИ: СПИСКИ, ЗАМЕТКИ, КОРЗИНА ============ */

  /* Перенесено из web/syn-tidy.js: там это видел только браузер, а андроид
     получал «веб пока не умеет». Всё удалённое — в корзину, как и поштучное
     удаление: пачкой ошибиться дороже всего. Стереть корзину насовсем —
     только через окно подтверждения с числом. */
  function bulk(kind, list, word, extra){
    return function(a, done, skipped){
      var items = S[list] || [];
      if (!items.length) return skipped.push(word + ' и так нет');
      var n = items.length;
      items.forEach(function(x){ trashPut(kind, x); });
      S[list] = [];
      if (extra) extra();
      done.push('удалены все ' + word + ': ' + n + ' — лежат в корзине');
    };
  }
  var BULK = {
    'delete_all_lists clear_lists reset_lists delete_lists remove_all_lists':
      bulk('list', 'lists', 'списки', function(){ S.activeList = null; }),
    'delete_all_notes clear_notes reset_notes delete_notes remove_all_notes':
      bulk('note', 'notes', 'заметки', function(){ S.activeNote = null; }),
    /* В app.js «все цели и задачи» стирались мимо корзины — в отличие от
       «всех задач» и «всех целей» по отдельности. Теперь тоже в корзину. */
    'delete_all_goals_and_tasks clear_goals_and_tasks reset_goals_and_tasks': function(a, done, skipped){
      var count = S.tasks.length + S.goals.length;
      if (!count) return skipped.push('удалять нечего');
      S.goals.forEach(function(g){
        trashPut('goal', g, { taskIDs: S.tasks.filter(function(t){ return t.goalId === g.id; })
          .map(function(t){ return { id: t.id, stageId: t.stageId }; }) });
      });
      S.tasks.forEach(function(t){ trashPut('task', t); });
      S.tasks = []; S.goals = []; S.activeGoal = null;
      done.push('удалены все цели и задачи: ' + count + ' — лежат в корзине');
    },
    'restore_all_tasks restore_all restore_trash restore_all_from_trash': function(a, done, skipped){
      var ids = (S.trash || []).map(function(x){ return x.id; });
      if (!ids.length) return skipped.push('в корзине пусто');
      var n = 0;
      ids.forEach(function(id){ if (trashRestore(id)) n += 1; });
      done.push('вернули из корзины: ' + n + ' ' + plural(n, 'запись', 'записи', 'записей'));
    },
    'empty_trash clear_trash delete_trash': function(a, done, skipped){
      if (!(S.trash || []).length) return skipped.push('корзина и так пуста');
      done.push('корзину стираю только после подтверждения — открываю окно');
      // После ответа Syn: окно подтверждения заменит окно ассистента.
      setTimeout(function(){ if (ACTS['trash-empty']) ACTS['trash-empty'](); }, 700);
    }
  };

  function register(table){
    Object.keys(table).forEach(function(kinds){
      kinds.split(' ').forEach(function(k){ SYN_ACTS[k] = table[kinds]; });
    });
  }

  function install(){
    if (typeof SYN_ACTS === 'undefined') return;
    register(SETTINGS);
    register(BULK);
    installFinance();
  }

  // Для проверок без браузера: вся логика доступна снаружи.
  global.SynParity = { findOps: findOps, resolve: resolve, MANAGE: MANAGE, SETTINGS: SETTINGS, BULK: BULK };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

/* Мост форматов синхронизации: веб-состояние S ⇄ снимок айфона
   (WorkspaceSnapshot). Читать снимок айфона веб уже умеет — `изКопииПриложения`
   в app.js. Здесь обратная сторона: собрать из S снимок в форме айфона так,
   чтобы Swift-декодер его принял (все обязательные поля, валидные enum'ы,
   ISO-даты, id как UUID). Синхро в первой версии несёт задачи/цели/списки/
   заметки; финансы/помодоро на этой стороне не формируем. */
var SynSyncBridge = (function () {
  var te = new TextEncoder();

  // Стабильный UUID из строкового id веба (base36). Уже UUID — оставляем; иначе
  // SHA-256 → первые 16 байт → формат 8-4-4-4-12 (заглавный, как пишет Swift).
  var UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  async function toUUID(id) {
    var s = String(id || '');
    if (UUID_RE.test(s)) return s.toUpperCase();
    var h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('sync-id:' + s)));
    var hex = '';
    for (var i = 0; i < 16; i++) hex += ('0' + h[i].toString(16)).slice(-2);
    return (hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
            hex.slice(16, 20) + '-' + hex.slice(20, 32)).toUpperCase();
  }

  var два = function (n) { return (n < 10 ? '0' : '') + n; };
  // Дата+время веба ('YYYY-MM-DD' + 'HH:MM') → ISO-инстант локального времени.
  // Так айфон, читая её в том же поясе, покажет ту же дату и час.
  function isoFrom(dateStr, timeStr) {
    if (!dateStr) return null;
    var p = dateStr.split('-');
    var y = +p[0], m = +p[1], d = +p[2];
    var hh = 12, mm = 0;                 // без времени — полдень, чтобы не съехать через полночь
    if (timeStr) { var t = timeStr.split(':'); hh = +t[0]; mm = +t[1]; }
    var dt = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  function nowISO() { return new Date().toISOString(); }

  var LIFE_SPHERES = ['product', 'career', 'health', 'personal'];
  function sphere(v) { return LIFE_SPHERES.indexOf(String(v)) >= 0 ? String(v) : 'personal'; }
  var BUCKETS = ['today', 'tomorrow', 'dayAfterTomorrow', 'thisWeek', 'later'];
  function bucket(v) { return BUCKETS.indexOf(String(v)) >= 0 ? String(v) : 'later'; }
  var STAGE_STATUS = ['planned', 'active', 'done'];
  function stageStatus(v) { return STAGE_STATUS.indexOf(String(v)) >= 0 ? String(v) : 'planned'; }

  async function task(t) {
    var iso = isoFrom(t.date, t.time);
    var subs = [];
    for (var i = 0; i < (t.subtasks || []).length; i++) {
      var s = t.subtasks[i];
      subs.push({ id: await toUUID(s.id), title: String(s.title || ''), isDone: !!s.done });
    }
    return {
      id: await toUUID(t.id),
      title: String(t.title || ''),
      note: String(t.note || ''),
      bucket: bucket(t.bucket),
      sphere: 'personal',
      goalID: t.goalId ? await toUUID(t.goalId) : null,
      goalStageID: t.stageId ? await toUUID(t.stageId) : null,
      scheduledTime: iso,
      hasExplicitDate: !!t.date,
      hasExplicitTime: !!t.time,
      isDone: !!t.done,
      subtasks: subs
    };
  }

  async function goal(g) {
    var stages = [];
    for (var i = 0; i < (g.stages || []).length; i++) {
      var st = g.stages[i];
      stages.push({
        id: await toUUID(st.id),
        title: String(st.title || ''),
        detail: String(st.detail || ''),
        status: stageStatus(st.status),
        targetDate: st.targetDate ? isoFrom(st.targetDate, null) : null,
        linkedTaskIDs: []
      });
    }
    return {
      id: await toUUID(g.id),
      title: String(g.title || ''),
      purpose: String(g.purpose || ''),
      horizon: String(g.horizon || ''),
      progress: 0,
      sphere: sphere(g.sphere),
      isPinned: !!g.pinned,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      stages: stages
    };
  }

  async function list(l) {
    var items = [];
    for (var i = 0; i < (l.items || []).length; i++) {
      var it = l.items[i];
      items.push({ id: await toUUID(it.id), title: String(it.title || ''),
                   note: '', isDone: !!it.done, createdAt: nowISO() });
    }
    return {
      id: await toUUID(l.id), title: String(l.title || ''), note: String(l.note || ''),
      color: 'sky', icon: 'checklist', items: items, createdAt: nowISO()
    };
  }

  // У веба заметки плоские; айфону нужны папки. Кладём все в одну.
  async function noteFolder(notes) {
    var out = [];
    for (var i = 0; i < (notes || []).length; i++) {
      var n = notes[i];
      out.push({ id: await toUUID(n.id), title: String(n.title || ''), body: String(n.body || ''),
                 createdAt: nowISO(), updatedAt: nowISO() });
    }
    return { id: await toUUID('web-notes-folder'), title: '', color: 'sky', notes: out, createdAt: nowISO() };
  }

  // ── Финансы ────────────────────────────────────────────────────────────
  // Суммы ВЕЗДЕ в копейках (целые) — и на айфоне, и в вебе, — переносятся один
  // в один. Ядро (операции/долги/копилки/подписки/конверты/категории/баланс)
  // мапится чисто. Веб-«счета» (accounts) и «правила регулярных» (recurring) у
  // айфона соответствия не имеют — их на этой стороне оставляем локальными.

  // Период подписки: у веба month/year/week, у айфона month/quarter/halfYear/year.
  var PERIOD_TO_IOS = { month: 'month', year: 'year', week: 'month' };
  var PERIOD_TO_WEB = { month: 'month', year: 'year', quarter: 'month', halfYear: 'month' };
  function kop(n){ return Math.round(Number(n) || 0); }
  // web-дата 'YYYY-MM-DD' или ISO → полный ISO для айфона (.iso8601)
  function isoDate(v){
    if (!v) return null;
    var str = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return isoFrom(str, null);   // только дата → полдень
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function isoFromMs(ms){ var d = new Date(Number(ms) || Date.now()); return d.toISOString(); }
  // ISO с айфона → 'YYYY-MM-DD' для веба
  var д2 = function(n){ return (n < 10 ? '0' : '') + n; };
  function webDate(iso){ if (!iso) return null; var d = new Date(iso); return isNaN(d.getTime()) ? null : (d.getFullYear()+'-'+д2(d.getMonth()+1)+'-'+д2(d.getDate())); }
  function ms(iso){ if (!iso) return Date.now(); var d = new Date(iso); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }

  // Веб S.finance → iOS FinanceState (для отправки)
  async function financeToSnapshot(fin) {
    fin = fin || {};
    var ops = [];
    for (var i = 0; i < (fin.ops||[]).length; i++) { var o = fin.ops[i];
      ops.push({ id: await toUUID(o.id), kind: (o.kind === 'income' ? 'income' : 'spend'),
                 title: String(o.title || ''), amount: kop(o.amount), categoryID: String(o.cat || ''),
                 date: isoDate(o.date) || isoFromMs(o.at), createdAt: isoFromMs(o.at) }); }
    var debts = [];
    for (var j = 0; j < (fin.debts||[]).length; j++) { var d = fin.debts[j];
      var deb = { id: await toUUID(d.id), who: String(d.who || ''), isMine: d.mine !== false,
                  amount: kop(d.amount), paid: kop(d.paid), note: String(d.note || ''),
                  isClosed: !!d.closed, createdAt: isoFromMs(d.at) };
      if (isoDate(d.due)) deb.due = isoDate(d.due);
      debts.push(deb); }
    var jars = [];
    for (var k = 0; k < (fin.jars||[]).length; k++) { var jr = fin.jars[k];
      var jj = { id: await toUUID(jr.id), title: String(jr.title || ''), target: kop(jr.target),
                 saved: kop(jr.saved), createdAt: isoFromMs(jr.at) };
      if (isoDate(jr.due)) jj.due = isoDate(jr.due);
      jars.push(jj); }
    var subs = [];
    for (var m = 0; m < (fin.subs||[]).length; m++) { var sb = fin.subs[m];
      subs.push({ id: await toUUID(sb.id), title: String(sb.title || ''), amount: kop(sb.amount),
                  period: PERIOD_TO_IOS[sb.every] || 'month', since: isoDate(sb.since) || isoFromMs(Date.now()),
                  isOff: !!sb.off, isMandatory: !!sb.mandatory }); }
    var cats = [];
    for (var n = 0; n < (fin.cats||[]).length; n++) { var c = fin.cats[n];
      cats.push({ id: String(c.id || ''), title: String(c.title || c.id || ''),
                  hue: Number(c.hue) || 200, words: c.words || [], isCustom: c.isCustom !== false }); }
    return { ops: ops, debts: debts, jars: jars, subscriptions: subs,
             budgets: fin.budgets || {}, customCategories: cats, opening: kop(fin.opening) };
  }

  // iOS FinanceState → веб S.finance (для приёма). accounts/recurring не приходят
  // с айфона — сохраняем локальные (existing), чтобы синхро их не стёрла.
  function financeFromSnapshot(iosFin, existing) {
    iosFin = iosFin || {}; existing = existing || {};
    return {
      ops: (iosFin.ops || []).map(function(o){ return { id: String(o.id||'').toLowerCase(), kind: o.kind==='income'?'income':'spend',
        title: String(o.title||''), amount: kop(o.amount), cat: String(o.categoryID||''),
        date: webDate(o.date) || webDate(o.createdAt), at: ms(o.createdAt), accountId: '', fromRule: '' }; }),
      debts: (iosFin.debts || []).map(function(d){ return { id: String(d.id||'').toLowerCase(), who: String(d.who||''),
        mine: d.isMine !== false, amount: kop(d.amount), paid: kop(d.paid), due: webDate(d.due),
        note: String(d.note||''), closed: !!d.isClosed, at: ms(d.createdAt) }; }),
      jars: (iosFin.jars || []).map(function(j){ return { id: String(j.id||'').toLowerCase(), title: String(j.title||''),
        target: kop(j.target), saved: kop(j.saved), due: webDate(j.due), at: ms(j.createdAt), goalId: '', stageId: '' }; }),
      subs: (iosFin.subscriptions || []).map(function(sb){ return { id: String(sb.id||'').toLowerCase(), title: String(sb.title||''),
        amount: kop(sb.amount), every: PERIOD_TO_WEB[sb.period] || 'month', since: webDate(sb.since),
        off: !!sb.isOff, mandatory: !!sb.isMandatory, taskId: '' }; }),
      cats: (iosFin.customCategories || []).map(function(c){ return { id: String(c.id||''), title: String(c.title||''),
        hue: Number(c.hue)||200, words: c.words||[], isCustom: c.isCustom !== false }; }),
      budgets: iosFin.budgets || {},
      opening: kop(iosFin.opening),
      accounts: existing.accounts || [],     // веб-только, не трогаем
      recurring: existing.recurring || []    // веб-только, не трогаем
    };
  }

  // S → WorkspaceSnapshot (форма айфона)
  async function toSnapshot(S) {
    var tasks = [];
    for (var i = 0; i < (S.tasks || []).length; i++) tasks.push(await task(S.tasks[i]));
    var goals = [];
    for (var j = 0; j < (S.goals || []).length; j++) goals.push(await goal(S.goals[j]));
    var lists = [];
    for (var k = 0; k < (S.lists || []).length; k++) lists.push(await list(S.lists[k]));
    var folders = (S.notes && S.notes.length) ? [await noteFolder(S.notes)] : [];
    var finance = await financeToSnapshot(S.finance);
    // Корзина: у айфона в снимке только удалённые ЗАДАЧИ (trashedTasks). Берём из
    // веб-корзины записи kind==='task', конвертируем их данные тем же task() и
    // проставляем trashedAt из времени удаления. Цели/списки/заметки в корзине —
    // веб-только, у айфона им места в снимке нет, остаются локальными.
    var trashed = [];
    for (var ti = 0; ti < (S.trash || []).length; ti++) {
      var e = S.trash[ti];
      if (!e || e.kind !== 'task' || !e.data) continue;
      var pt = await task(e.data);
      pt.trashedAt = isoFromMs(e.at);
      trashed.push(pt);
    }
    return { tasks: tasks, goals: goals, customLists: lists, noteFolders: folders,
             finance: finance, trashedTasks: trashed };
  }

  return { toSnapshot: toSnapshot, financeToSnapshot: financeToSnapshot, financeFromSnapshot: financeFromSnapshot, toUUID: toUUID, isoFrom: isoFrom };
})();

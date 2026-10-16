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

  // ── Поля айфона, которых у веба нет ────────────────────────────────────
  // Цвет и значок списка, папки заметок, сфера задачи, связи этапов, даты
  // создания — веб их не ведёт и раньше отправлял обратно заглушками, и айфон
  // после каждой синхронизации терял их. Теперь пришедшая с сервера запись
  // запоминается на веб-записи в скрытом поле _ios (только то, что веб сам не
  // переносит), а при отправке ложится подложкой: веб пишет поверх ровно свои
  // поля. Форма на проводе та же — айфон получает назад то, что сам прислал.
  var own = Object.prototype.hasOwnProperty;
  function copyExcept(src, skip) {
    var o = {};
    if (!src || typeof src !== 'object') return o;
    for (var k in src) if (own.call(src, k) && skip.indexOf(k) < 0) o[k] = src[k];
    return o;
  }
  function under(base, top) {
    var o = copyExcept(base, []);
    for (var k in top) if (own.call(top, k)) o[k] = top[k];
    return o;
  }
  function iosOf(rec) { return (rec && rec._ios && typeof rec._ios === 'object') ? rec._ios : {}; }

  async function task(t) {
    var iso = isoFrom(t.date, t.time);
    var ios = iosOf(t), iosSubs = ios.subs || {};
    var subs = [];
    for (var i = 0; i < (t.subtasks || []).length; i++) {
      var s = t.subtasks[i];
      subs.push(under(iosSubs[s.id], { id: await toUUID(s.id), title: String(s.title || ''), isDone: !!s.done }));
    }
    return under(ios.rec, {
      id: await toUUID(t.id),
      title: String(t.title || ''),
      note: String(t.note || ''),
      bucket: bucket(t.bucket),
      sphere: (ios.rec && ios.rec.sphere) ? ios.rec.sphere : 'personal',
      goalID: t.goalId ? await toUUID(t.goalId) : null,
      goalStageID: t.stageId ? await toUUID(t.stageId) : null,
      scheduledTime: iso,
      hasExplicitDate: !!t.date,
      hasExplicitTime: !!t.time,
      isDone: !!t.done,
      subtasks: subs
    });
  }

  // links: { веб-id этапа: [UUID задач] } и taskStage: { UUID задачи: веб-id
  // этапа | null } — из задач веба (stageId). Связи, которые айфон держал
  // только на этапе, сохраняем, если задача жива и на вебе ни к чему не привязана.
  async function goal(g, links, taskStage) {
    var ios = iosOf(g), iosStages = ios.stages || {};
    links = links || {}; taskStage = taskStage || {};
    var stages = [];
    for (var i = 0; i < (g.stages || []).length; i++) {
      var st = g.stages[i];
      var base = iosStages[st.id] || {};
      var linked = (links[st.id] || []).slice();
      var прежние = Array.isArray(base.linkedTaskIDs) ? base.linkedTaskIDs : [];
      for (var p = 0; p < прежние.length; p++) {
        var u = String(прежние[p]).toUpperCase();
        if (own.call(taskStage, u) && !taskStage[u] && linked.indexOf(u) < 0) linked.push(u);
      }
      stages.push(under(base, {
        id: await toUUID(st.id),
        title: String(st.title || ''),
        detail: String(st.detail || ''),
        status: stageStatus(st.status),
        targetDate: st.targetDate ? isoFrom(st.targetDate, null) : null,
        linkedTaskIDs: linked
      }));
    }
    var rec = ios.rec || {};
    return under(rec, {
      id: await toUUID(g.id),
      title: String(g.title || ''),
      purpose: String(g.purpose || ''),
      horizon: String(g.horizon || ''),
      progress: typeof rec.progress === 'number' ? rec.progress : 0,
      sphere: sphere(g.sphere),
      isPinned: !!g.pinned,
      createdAt: rec.createdAt || nowISO(),
      updatedAt: nowISO(),
      stages: stages
    });
  }

  async function list(l) {
    var ios = iosOf(l), iosItems = ios.items || {}, rec = ios.rec || {};
    var items = [];
    for (var i = 0; i < (l.items || []).length; i++) {
      var it = l.items[i], b = iosItems[it.id] || {};
      items.push(under(b, { id: await toUUID(it.id), title: String(it.title || ''),
                   note: String(b.note || ''), isDone: !!it.done, createdAt: b.createdAt || nowISO() }));
    }
    return under(rec, {
      id: await toUUID(l.id), title: String(l.title || ''), note: String(l.note || ''),
      color: rec.color || 'sky', icon: rec.icon || 'checklist', items: items, createdAt: rec.createdAt || nowISO()
    });
  }

  // У веба заметки плоские; айфону нужны папки. Заметки, пришедшие с айфона,
  // возвращаются в свои папки (папка запомнена в _ios); новые веб-заметки — в
  // общую веб-папку. Папки айфона без заметок (iosFolders — их список с
  // последнего приёма) тоже отправляем, иначе пустая папка исчезала бы.
  async function noteFolders(notes, iosFolders) {
    var defID = await toUUID('web-notes-folder');
    var groups = {}, order = [];
    function group(key, folder) {
      if (!groups[key]) { groups[key] = { folder: folder, notes: [] }; order.push(key); }
      return groups[key];
    }
    for (var f = 0; f < (iosFolders || []).length; f++) {
      var fo = iosFolders[f];
      if (fo && fo.id) group(String(fo.id).toUpperCase(), fo);
    }
    for (var i = 0; i < (notes || []).length; i++) {
      var n = notes[i], ios = iosOf(n), folder = ios.folder && ios.folder.id ? ios.folder : null;
      var key = folder ? String(folder.id).toUpperCase() : defID;
      var g = group(key, folder);
      var title = String(n.title || '');
      // Название папки веб приписывает к заголовку при приёме — снимаем его.
      if (folder && folder.title) {
        var приставка = folder.title + ' · ';
        if (title.indexOf(приставка) === 0) title = title.slice(приставка.length);
      }
      var rec = ios.rec || {};
      g.notes.push(under(rec, { id: await toUUID(n.id), title: title, body: String(n.body || ''),
                 createdAt: rec.createdAt || nowISO(), updatedAt: nowISO() }));
    }
    var out = [];
    for (var k = 0; k < order.length; k++) {
      var gr = groups[order[k]];
      if (gr.folder) out.push(under(gr.folder, { notes: gr.notes }));
      else out.push({ id: defID, title: '', color: 'sky', notes: gr.notes, createdAt: nowISO() });
    }
    return out;
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
  function todayWeb(){ var d = new Date(); return d.getFullYear()+'-'+д2(d.getMonth()+1)+'-'+д2(d.getDate()); }
  // «Обязательный» у веба — sb.duty (как finIsDuty в app.js); поля mandatory у
  // веба не бывало, и раньше на айфон всегда уходило false.
  function isDuty(sb){
    if (typeof sb.duty === 'boolean') return sb.duty;
    if (typeof sb.mandatory === 'boolean') return sb.mandatory;
    return ['home', 'loans', 'learn'].indexOf(sb.cat) !== -1;
  }
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
      // Квартал и полгода у веба схлопываются в «месяц» — если веб период не
      // менял, возвращаем айфону его собственный.
      var sio = iosOf(sb);
      var period = (sio.period && PERIOD_TO_WEB[sio.period] === sb.every) ? sio.period : (PERIOD_TO_IOS[sb.every] || 'month');
      subs.push({ id: await toUUID(sb.id), title: String(sb.title || ''), amount: kop(sb.amount),
                  period: period, since: isoDate(sb.since) || isoFromMs(Date.now()),
                  isOff: !!sb.off, isMandatory: isDuty(sb) }); }
    var cats = [];
    for (var n = 0; n < (fin.cats||[]).length; n++) { var c = fin.cats[n];
      cats.push({ id: String(c.id || ''), title: String(c.title || c.id || ''),
                  hue: Number(c.hue) || 200, words: c.words || [], isCustom: c.isCustom !== false }); }
    return { ops: ops, debts: debts, jars: jars, subscriptions: subs,
             budgets: fin.budgets || {}, customCategories: cats, opening: kop(fin.opening) };
  }

  // iOS FinanceState → веб S.finance (для приёма). accounts/recurring не приходят
  // с айфона — сохраняем локальные (existing), чтобы синхро их не стёрла.
  //
  // Записи сливаются с местными по id: пришедшая задаёт то, что айфон
  // переносит, а веб-поля, которых у айфона нет (категория и отметки оплат
  // подписки, «переменная», привязки к задаче/цели/этапу, fromSub, счёт…),
  // берутся из местной записи. idx — { UUID: местный id } (localIndex): так
  // запись остаётся под своим веб-id, и ссылки на неё не рвутся.
  function financeFromSnapshot(iosFin, existing, idx) {
    iosFin = iosFin || {}; existing = existing || {}; idx = idx || {};
    function lid(id) { var k = String(id == null ? '' : id).toUpperCase(); return own.call(idx, k) ? idx[k] : String(id || '').toLowerCase(); }
    function byId(arr) { var m = {}; (arr || []).forEach(function (r) { if (r && r.id != null) m[String(r.id)] = r; }); return m; }
    function keep(fresh, old, carried) {
      if (!old) return fresh;
      for (var k in old) if (own.call(old, k) && carried.indexOf(k) < 0) fresh[k] = old[k];
      return fresh;
    }
    var oldOps = byId(existing.ops), oldDebts = byId(existing.debts), oldJars = byId(existing.jars),
        oldSubs = byId(existing.subs), oldCats = byId(existing.cats);
    return {
      ops: (iosFin.ops || []).map(function(o){ var id = lid(o.id);
        return keep({ id: id, kind: o.kind==='income'?'income':'spend',
        title: String(o.title||''), amount: kop(o.amount), cat: String(o.categoryID||''),
        date: webDate(o.date) || webDate(o.createdAt) || todayWeb(), at: ms(o.createdAt), accountId: '', fromRule: '' },
        oldOps[id], ['id', 'kind', 'title', 'amount', 'cat', 'date', 'at']); }),
      debts: (iosFin.debts || []).map(function(d){ var id = lid(d.id);
        return keep({ id: id, who: String(d.who||''),
        mine: d.isMine !== false, amount: kop(d.amount), paid: kop(d.paid), due: webDate(d.due),
        note: String(d.note||''), closed: !!d.isClosed, at: ms(d.createdAt) },
        oldDebts[id], ['id', 'who', 'mine', 'amount', 'paid', 'due', 'note', 'closed', 'at']); }),
      jars: (iosFin.jars || []).map(function(j){ var id = lid(j.id);
        return keep({ id: id, title: String(j.title||''),
        target: kop(j.target), saved: kop(j.saved), due: webDate(j.due), at: ms(j.createdAt), goalId: '', stageId: '' },
        oldJars[id], ['id', 'title', 'target', 'saved', 'due', 'at']); }),
      subs: (iosFin.subscriptions || []).map(function(sb){ var id = lid(sb.id), old = oldSubs[id];
        var mand = !!sb.isMandatory;
        var fresh = { id: id, title: String(sb.title||''),
          amount: kop(sb.amount), every: PERIOD_TO_WEB[sb.period] || 'month', since: webDate(sb.since),
          off: !!sb.isOff, mandatory: mand, taskId: '',
          cat: 'subs', vary: false, paid: {}, ops: {}, duty: mand,
          _ios: { period: String(sb.period || ''), isMandatory: mand } };
        if (!old) return fresh;
        keep(fresh, old, ['id', 'title', 'amount', 'every', 'since', 'off', 'mandatory', '_ios']);
        // «Неделя» уходит на айфон «месяцем»; пришёл тот же месяц — неделя остаётся.
        if (PERIOD_TO_IOS[old.every] === sb.period) fresh.every = old.every;
        // Обязательность: на вебе это duty. Меняем её, только если айфон
        // действительно переключил признак с прошлого приёма — у прежних веб-
        // отправок там всегда было false, и верить этому false нельзя.
        var прошлый = old._ios && typeof old._ios.isMandatory === 'boolean' ? old._ios.isMandatory : null;
        if (прошлый !== null && прошлый !== mand) fresh.duty = mand;
        return fresh; }),
      cats: (iosFin.customCategories || []).map(function(c){
        return keep({ id: String(c.id||''), title: String(c.title||''),
        hue: Number(c.hue)||200, words: c.words||[], isCustom: c.isCustom !== false },
        oldCats[String(c.id||'')], ['id', 'title', 'hue', 'words', 'isCustom']); }),
      budgets: iosFin.budgets || {},
      opening: kop(iosFin.opening),
      accounts: existing.accounts || [],     // веб-только, не трогаем
      recurring: existing.recurring || []    // веб-только, не трогаем
    };
  }

  // { UUID: местный id } по всем записям состояния. Веб отправляет свои id
  // через toUUID, и назад они приходят уже UUID; по этой карте пришедшая
  // запись узнаёт свою местную и остаётся под её id.
  async function localIndex(S) {
    var idx = {};
    async function add(id) {
      if (id == null || id === '') return;
      var u = await toUUID(id);
      if (!own.call(idx, u)) idx[u] = String(id);
    }
    async function tasksOf(arr) {
      for (var i = 0; i < (arr || []).length; i++) {
        var t = arr[i]; if (!t) continue;
        await add(t.id);
        for (var j = 0; j < (t.subtasks || []).length; j++) if (t.subtasks[j]) await add(t.subtasks[j].id);
      }
    }
    S = S || {};
    await tasksOf(S.tasks);
    await tasksOf((S.trash || []).filter(function (e) { return e && e.kind === 'task' && e.data; }).map(function (e) { return e.data; }));
    var gs = S.goals || [];
    for (var g = 0; g < gs.length; g++) { if (!gs[g]) continue; await add(gs[g].id);
      for (var st = 0; st < (gs[g].stages || []).length; st++) if (gs[g].stages[st]) await add(gs[g].stages[st].id); }
    var ls = S.lists || [];
    for (var l = 0; l < ls.length; l++) { if (!ls[l]) continue; await add(ls[l].id);
      for (var it = 0; it < (ls[l].items || []).length; it++) if (ls[l].items[it]) await add(ls[l].items[it].id); }
    for (var n = 0; n < (S.notes || []).length; n++) if (S.notes[n]) await add(S.notes[n].id);
    var f = S.finance || {};
    var kinds = ['ops', 'debts', 'jars', 'subs'];
    for (var k = 0; k < kinds.length; k++) for (var r = 0; r < (f[kinds[k]] || []).length; r++) if (f[kinds[k]][r]) await add(f[kinds[k]][r].id);
    return idx;
  }

  // Принятый снимок, уже переведённый в веб-форму (изКопииПриложения в app.js,
  // массивы в том же порядке, что в снимке): id — назад в местные, исходные
  // поля айфона — в _ios. Возвращает список папок заметок без самих заметок.
  function adoptIncoming(snap, conv, convTrash, idx) {
    snap = snap || {}; idx = idx || {};
    function lid(id) { if (id == null) return id; var k = String(id).toUpperCase(); return own.call(idx, k) ? idx[k] : String(id); }
    function tasks(src, out) {
      for (var i = 0; i < out.length; i++) {
        var t = out[i], o = src[i] || {};
        t.id = lid(t.id);
        if (t.goalId) t.goalId = lid(t.goalId);
        if (t.stageId) t.stageId = lid(t.stageId);
        var subs = {};
        for (var j = 0; j < (t.subtasks || []).length; j++) {
          t.subtasks[j].id = lid(t.subtasks[j].id);
          subs[t.subtasks[j].id] = copyExcept((o.subtasks || [])[j], ['id', 'title', 'isDone']);
        }
        t._ios = { rec: copyExcept(o, ['id', 'title', 'note', 'bucket', 'goalID', 'goalStageID', 'scheduledTime',
                                       'hasExplicitDate', 'hasExplicitTime', 'isDone', 'subtasks', 'trashedAt']), subs: subs };
      }
    }
    tasks(snap.tasks || [], conv.tasks || []);
    if (convTrash) tasks(snap.trashedTasks || [], convTrash.tasks || []);
    (conv.goals || []).forEach(function (g, i) {
      var o = (snap.goals || [])[i] || {}, stages = {};
      g.id = lid(g.id);
      (g.stages || []).forEach(function (st, j) { st.id = lid(st.id);
        stages[st.id] = copyExcept((o.stages || [])[j], ['id', 'title', 'detail', 'status', 'targetDate']); });
      g._ios = { rec: copyExcept(o, ['id', 'title', 'purpose', 'horizon', 'sphere', 'isPinned', 'stages', 'updatedAt']), stages: stages };
    });
    (conv.lists || []).forEach(function (l, i) {
      var o = (snap.customLists || [])[i] || {}, items = {};
      l.id = lid(l.id);
      (l.items || []).forEach(function (it, j) { it.id = lid(it.id);
        items[it.id] = copyExcept((o.items || [])[j], ['id', 'title', 'isDone']); });
      l._ios = { rec: copyExcept(o, ['id', 'title', 'note', 'items']), items: items };
    });
    var folders = [], ni = 0, notes = conv.notes || [];
    (snap.noteFolders || []).forEach(function (f) {
      var meta = copyExcept(f, ['notes']);
      folders.push(meta);
      (f.notes || []).forEach(function (n) {
        var w = notes[ni++]; if (!w) return;
        w.id = lid(w.id);
        w._ios = { folder: meta, rec: copyExcept(n, ['id', 'title', 'body', 'updatedAt']) };
      });
    });
    return folders;
  }

  // S → WorkspaceSnapshot (форма айфона)
  async function toSnapshot(S) {
    var tasks = [];
    for (var i = 0; i < (S.tasks || []).length; i++) tasks.push(await task(S.tasks[i]));
    var links = {}, taskStage = {};
    for (var li = 0; li < (S.tasks || []).length; li++) {
      var lt = S.tasks[li], lu = tasks[li].id;
      taskStage[lu] = lt.stageId || null;
      if (lt.stageId) (links[lt.stageId] = links[lt.stageId] || []).push(lu);
    }
    var goals = [];
    for (var j = 0; j < (S.goals || []).length; j++) goals.push(await goal(S.goals[j], links, taskStage));
    var lists = [];
    for (var k = 0; k < (S.lists || []).length; k++) lists.push(await list(S.lists[k]));
    var folders = ((S.notes && S.notes.length) || (S._iosFolders && S._iosFolders.length))
      ? await noteFolders(S.notes, S._iosFolders) : [];
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

  return { toSnapshot: toSnapshot, financeToSnapshot: financeToSnapshot, financeFromSnapshot: financeFromSnapshot,
           localIndex: localIndex, adoptIncoming: adoptIncoming, toUUID: toUUID, isoFrom: isoFrom };
})();

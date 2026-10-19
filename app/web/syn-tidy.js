/* Итог действий Syn — коротко и по делу. Только веб.

   synApplyActions (app.js) складывает по строке на каждое действие модели.
   На просьбе «создай 10 списков и заполни их» это давало стену:
     создан список «Продукты»
     в список «Продукты» добавлено: 1   ×3
     Без подписки можно держать 2 списка. Нужна подписка   ×9
     не нашёл список «Книги к прочтению»   ×3 на каждый не созданный список
   — одно ограничение выглядело как три десятка ошибок.

   Здесь итог причёсывается, ничего не меняя в самих действиях:
     * добавления в один список складываются и прилипают к его созданию:
       «создан список «Продукты» — 3 пункта»;
     * отказ по бесплатной норме говорится один раз и со счётом:
       «Без подписки можно держать 2 списка — ещё 9 не созданы. Нужна подписка»;
     * «не нашёл …» про то, что как раз и не дали создать, — следствие,
       а не отдельная ошибка, его не показываем;
     * остальные одинаковые строки — одной, с «×N». */

(function (global) {
  'use strict';

  function norm(s){ return String(s || '').trim().toLowerCase().replace(/ё/g, 'е'); }
  function quoted(line){ var m = /«([^»]*)»/.exec(line); return m ? m[1] : ''; }

  var CREATE = {
    create_list: 'список', create_note: 'заметк', research_note: 'заметк',
    create_goal: 'цел'
  };

  function tidy(result, actions){
    var done = result.done || [], skipped = result.skipped || [];

    // Что модель пыталась создать — по названиям.
    var tried = {};
    (actions || []).forEach(function(a){
      var kind = String(a && a.kind || '').toLowerCase();
      if (CREATE[kind] && a.title) tried[norm(a.title)] = true;
    });

    /* ---- сделанное ---- */
    var added = {}, order = [], created = {}, rest = [];
    done.forEach(function(line){
      var m = /^в список «([^»]*)» добавлено: (\d+)$/.exec(line);
      if (m){
        if (!(m[1] in added)){ added[m[1]] = 0; order.push(m[1]); }
        added[m[1]] += Number(m[2]);
        return;
      }
      var c = /^создан список «([^»]*)»$/.exec(line);
      if (c) created[c[1]] = rest.length;
      rest.push(line);
    });
    order.forEach(function(title){
      var n = added[title];
      var words = n + ' ' + plural(n, 'пункт', 'пункта', 'пунктов');
      if (title in created) rest[created[title]] = 'создан список «' + title + '» — ' + words;
      else rest.push('в список «' + title + '» добавлено: ' + words);
    });

    /* ---- непринятое ---- */
    var limits = {}, limitOrder = [], seen = {}, seenOrder = [];
    skipped.forEach(function(line){
      if (/Нужна подписка$/.test(line)){
        if (!(line in limits)){ limits[line] = 0; limitOrder.push(line); }
        limits[line] += 1;
        return;
      }
      // «Не нашёл» то, что сами же и не смогли создать из-за нормы, — молчим.
      if (limitOrder.length && /^не наш[её]л|не нашлась/.test(line) && tried[norm(quoted(line))]) return;
      if (!(line in seen)){ seen[line] = 0; seenOrder.push(line); }
      seen[line] += 1;
    });
    var out = limitOrder.map(function(line){
      var n = limits[line];
      if (n < 2) return line;
      var base = line.replace(/\.?\s*Нужна подписка$/, '');
      return base + ' — ещё ' + n + ' не ' + (/списк/.test(line) ? 'созданы' : /заметк/.test(line) ? 'созданы' : 'заведены') + '. Нужна подписка';
    });
    seenOrder.forEach(function(line){ out.push(seen[line] > 1 ? line + ' ×' + seen[line] : line); });

    return { done: rest, skipped: out };
  }

  /* Текст заметки модель кладёт в разные поля. Договор сервера — note, но
     на живом ответе 17.10 все десять create_note пришли с полем text, и веб,
     читавший только note/value/body, заводил десять пустых заметок. Принимаем
     и text, и content. */
  var NOTE_KINDS = ['create_note', 'research_note', 'update_note', 'append_note'];
  function noteText(a){
    if (a && !a.note && !a.value && !a.body) a.note = a.text || a.content || a.description || '';
    return a;
  }

  /* «Сделаю.» — а действий нет.

     Плашку «ничего не изменилось» в app.js убрали: она кричала и на вопросы,
     где действий и не должно быть. Здесь она возвращается узко — только когда
     сам ответ ОБЕЩАЕТ действие («Сделаю», «Понял, создаю», «Добавляю»), а
     действий не пришло. Так было 17.10: «создай 10 заметок» → «Сделаю.» и
     пусто, без единой строки — со стороны выглядело как «даже не думал». */
  var PROMISE = /^(сделаю|сделано|понял|поняла|принято|хорошо|готово|добавляю|добавил|создаю|создал|завожу|завёл|переношу|перенёс|удаляю|удалил|записываю|записал|отмечаю|отметил)(?![а-яё])/i;  // \b не видит границ кириллических слов
  var NOTHING = 'Ничего не изменилось: Syn ответил, но не прислал ни одного действия. ' +
    'Попробуй ещё раз — если не выйдет, нажми «Очистить» и попроси заново: длинный разговор иногда сбивает его.';

  var RETRYING = 'Syn ответил без действий — прошу его ещё раз…';

  /* История для сервера — с тем, что было на деле.

     На сервер уходят последние реплики одним текстом. Модель видела «ты:
     создай 10 заметок → Syn: Сделаю.» и не знала, что ничего не случилось;
     на повтор просьбы она решала, что всё уже сделано, и, не желая плодить
     дубли, снова отвечала «Сделаю.» без действий. 17.10 так вышло дважды
     подряд. Теперь к каждой реплике Syn в истории приписано, что вышло:
     сделанное, несделанное или «действий не было». */
  // На всякий случай: если модель всё же допишет такой хвост — срезаем.
  var ECHO = /\s*[\[(](?:на деле|сделано|не сделано|примечание приложения)[^\])]*[\])]\s*$/i;

  function outcomeOf(item){
    var done = item.done || [], skipped = (item.skipped || []).filter(function(s){ return s !== RETRYING; })
      .map(function(s){ return s === NOTHING ? 'действий не было' : s; });
    var note = '';
    if (done.length) note = 'сделано: ' + done.join('; ');
    if (skipped.length) note += (note ? '. ' : '') + 'не сделано: ' + skipped.join('; ');
    if (!note && PROMISE.test(String(item.text || '').trim())) note = 'действий не было, ничего не создано и не изменено';
    if (note.length > 400) note = note.slice(0, 397) + '…';
    return note;
  }
  /* Пометку кладём не в ответ Syn, а в СЛЕДУЮЩУЮ реплику человека — как
     примечание приложения. Первая версия дописывала её к ответу, и модель,
     увидев свои ответы с хвостом «[…]», стала дописывать такой же хвост сама —
     он всплыл прямо в окне. Чужую реплику модель так не копирует. */
  function withOutcomes(items){
    var out = [], pending = '';
    items.forEach(function(item){
      if (item.role === 'user'){
        if (pending){
          var copy = {}; for (var k in item) copy[k] = item[k];
          copy.text = '(Примечание приложения о твоём прошлом ответе: ' + pending + '.)\n' + String(item.text || '');
          out.push(copy); pending = '';
          return;
        }
        out.push(item);
        return;
      }
      pending = outcomeOf(item);
      if (ECHO.test(String(item.text || ''))){
        var clean = {}; for (var j in item) clean[j] = item[j];
        clean.text = String(item.text).replace(ECHO, '');
        out.push(clean);
        return;
      }
      out.push(item);
    });
    return out;
  }
  /* Копирование реплики. У ответа Syn копируется и сказанное, и итог —
     что сделано и что нет: это и хочется вставить в заметку или переслать. */
  var COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg>';
  function copyText(item){
    var lines = [String(item.text || '')];
    (item.done || []).forEach(function(s){ lines.push('• ' + s); });
    (item.skipped || []).forEach(function(s){ if (s !== RETRYING) lines.push('• ' + s); });
    return lines.join('\n');
  }
  function copy(d){
    var item = (S.synChat || [])[Number(d.i)];
    if (!item) return;
    var text = copyText(item), btn = document.querySelector('[data-act="syn-copy"][data-i="' + d.i + '"]');
    function ok(){
      if (!btn) return;
      btn.classList.add('ok'); btn.setAttribute('title', 'Скопировано');
      setTimeout(function(){ btn.classList.remove('ok'); btn.setAttribute('title', 'Скопировать'); }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(ok, function(){ fallback(text); ok(); });
    } else { fallback(text); ok(); }
  }
  /* Запасной путь, когда буфер обмена не дали (Safari иногда отказывает).
     Раньше здесь появлялось скрытое поле с фокусом: приложение принимало это
     за выехавшую клавиатуру и сдвигало низ экрана, а поле исчезало без
     потери фокуса — сдвиг так и оставался. Теперь выделяется обычный текст,
     без поля и без фокуса. */
  function fallback(text){
    var span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = 'position:fixed; left:-9999px; top:0; white-space:pre;';
    document.body.appendChild(span);
    var sel = window.getSelection(), saved = [];
    for (var i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i));
    var range = document.createRange();
    range.selectNodeContents(span);
    sel.removeAllRanges(); sel.addRange(range);
    try { document.execCommand('copy'); } catch (e) {}
    sel.removeAllRanges(); saved.forEach(function(r){ sel.addRange(r); });
    span.remove();
  }

  function install(){
    if (typeof global.synApplyActions !== 'function') return;
    // Пачки списков, заметок и корзины переехали в app/syn-parity.js —
    // они нужны и андроиду, а этот файл видит только браузер.
    var base = global.synApplyActions;
    global.synApplyActions = function(actions){
      (actions || []).forEach(function(a){
        if (a && NOTE_KINDS.indexOf(String(a.kind || '').toLowerCase()) !== -1) noteText(a);
      });
      var result = base.apply(this, arguments);
      try { return tidy(result, actions); } catch (e) { return result; }
    };

    if (typeof global.synChatForSending === 'function'){
      var forSending = global.synChatForSending;
      global.synChatForSending = function(){
        return withOutcomes(forSending.apply(this, arguments));
      };
    }

    /* Обещал и не сделал — один раз переспрашиваем сами.

       Неудачная пара реплик убирается, и та же просьба уходит заново — уже
       с честной историей. Действий не было, поэтому повтор ничего не
       задвоит. Не вышло и со второго раза — говорим об этом прямо. */
    var retriedFor = '';
    if (typeof global.synChatPush === 'function'){
      var push = global.synChatPush;
      global.synChatPush = function(role, text, result){
        if (role === 'assistant') text = String(text || '').replace(ECHO, '');
        // Финансовые действия не применяются сразу, а ждут подтверждения
        // карточкой (S.finPending) — это не «ничего не сделал».
        var empty = !result || (!(result.done || []).length && !(result.skipped || []).length);
        if (role === 'assistant' && empty && !(typeof S !== 'undefined' && S.finPending && S.finPending.length) &&
            PROMISE.test(String(text || '').trim())){
          var chat = S.synChat || [], said = '';
          for (var i = chat.length - 1; i >= 0; i--) if (chat[i].role === 'user'){ said = chat[i].text; break; }
          if (said && retriedFor !== said && typeof global.synSend === 'function'){
            retriedFor = said;
            result = { done: [], skipped: [RETRYING] };
            var out = push.call(this, role, text, result);
            setTimeout(function(){
              if (SYN.busy) return;
              S.synChat = S.synChat.slice(0, -2);
              global.synSend(said);
            }, 60);
            return out;
          }
          retriedFor = '';
          result = { done: [], skipped: [NOTHING] };
        } else if (role === 'assistant'){
          retriedFor = '';
        }
        return push.call(this, role, text, result);
      };
    }

    if (typeof global.synLogHTML === 'function'){
      var logHTML = global.synLogHTML;
      global.synLogHTML = function(){
        var html = logHTML.apply(this, arguments), i = -1;
        return html.replace(/<div class="syn-msg( mine)?"><span>([\s\S]*?)<\/span><\/div>/g, function(m, mine, inner){
          i += 1;
          if (!(S.synChat || [])[i]) return m;
          return '<div class="syn-msg' + (mine || '') + ' has-copy"><span>' + inner + '</span>' +
            '<button class="syn-copy" type="button" data-act="syn-copy" data-i="' + i + '" title="Скопировать" aria-label="Скопировать сообщение">' + COPY_ICON + '</button></div>';
        });
      };
    }
    if (typeof ACTS !== 'undefined') ACTS['syn-copy'] = copy;

    /* Тема разговора не прилипает.

       Окно Syn, открытое из целей или финансов, передаёт серверу тему явно
       (S.synIntent = planning / finance), и сервер даёт модели действия
       ТОЛЬКО этого раздела. Тема хранилась в состоянии и жила дальше — и
       следующая просьба уже про заметки уходила как «цели»: модель честно
       отвечала «у меня нет такого действия». Теперь, если в окне пишут про
       другой раздел, тема сбрасывается, и сервер определяет её по тексту. */
    var OTHER = { planning: /замет|списк|список|задач|напомин|помодоро|медитац|трат|расход|доход|бюджет|долг|копил/i,
                  finance:  /замет|списк|список|задач|цел[ьиеяю]|этап|напомин|помодоро|медитац/i };
    if (typeof ACTS !== 'undefined' && ACTS['syn-send']){
      var send = ACTS['syn-send'];
      ACTS['syn-send'] = function(d){
        var field = $('syn-input'), text = field ? field.value : '';
        var rule = OTHER[S.synIntent];
        if (rule && rule.test(text)){ S.synIntent = ''; S.synGoalCreate = false; }
        return send.apply(this, arguments);
      };
    }
    // Нажатие на «Скопировать» не забирает курсор из строки ввода: иначе
    // каждое копирование выключало режим ввода и дёргало раскладку.
    document.addEventListener('mousedown', function(e){
      if (e.target.closest && e.target.closest('.syn-copy')) e.preventDefault();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

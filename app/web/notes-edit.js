/* Заметки: перенос удержанием и правка внутри — название, оформление текста,
   копирование и «поделиться». Веб и андроид: этот модуль, в отличие от
   остальных в web/, подключается и в андроид-обёртке — тело заметки общее, и
   без разбора знаков андроид показывал бы звёздочки как есть. Перенос
   карточек там не включается: он привязан к сетке .ln-notes, которой в
   андроиде нет.

   Что было: заметки лежали сеткой в порядке создания, а внутри — голое поле
   textarea. Название менялось только из списка, через окно; ни выделить
   слово жирным, ни отправить заметку кому-то было нельзя.

   Что здесь:
     * карточку заметки можно взять и переставить. Пальцем — удержанием, как
       задачи; мышью — потянув с зажатой кнопкой. Порядок сохраняется;
     * внутри заметки название — само поле заголовка, его правят на месте;
     * панель оформления: жирный, курсив, подчёркнутый, зачёркнутый,
       заголовок, списки, цитата и «убрать оформление»;
     * «Копировать» кладёт в буфер заметку с оформлением (и простым текстом
       для мест, где оформление не понимают);
     * «Поделиться» отправляет текст заметки со ссылкой на synapseapp.ru —
       получатель видит, откуда она. На телефоне открывается системное меню,
       на компьютере — окно с Телеграмом, WhatsApp, ВКонтакте и почтой.

   Как хранится. Тело заметки остаётся строкой — той же, что видят
   приложения и Syn. Оформление записано знаками в духе Markdown:
     **жирный**  _курсив_  ++подчёркнутый++  ~~зачёркнутый~~
     «# » — заголовок, «- » — пункт, «1. » — нумерованный, «> » — цитата.
   Простой текст без этих знаков открывается как был. */

(function (global) {
  'use strict';

  var SITE = 'https://synapseapp.ru/';

  /* ============ ТЕКСТ: знаки ⇄ HTML ============ */

  function escH(s){
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Строчное оформление. Знак открывается перед непробелом и закрывается
     после непробела: «2 * 3 * 4» и «a_b_c» оформлением не становятся. */
  function inline(text){
    return escH(text)
      .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<b>$1</b>')
      .replace(/~~(?=\S)([^\n]*?\S)~~/g, '<s>$1</s>')
      .replace(/\+\+(?=\S)([^\n]*?\S)\+\+/g, '<u>$1</u>')
      .replace(/(^|[^\w])_(?=\S)([^\n_]*?\S)_(?!\w)/g, '$1<i>$2</i>');
  }

  /* Тело → разметка редактора. Строка — блок, подряд идущие пункты — один
     список. */
  function toHTML(body){
    body = String(body || '');
    if (!body) return '';
    var out = '', list = null;
    function close(){ if (list){ out += '</' + list + '>'; list = null; } }
    function open(tag){ if (list !== tag){ close(); out += '<' + tag + '>'; list = tag; } }
    body.split('\n').forEach(function(line){
      var m;
      if ((m = /^[-•] (.*)$/.exec(line))){ open('ul'); out += '<li>' + (inline(m[1]) || '<br>') + '</li>'; return; }
      if ((m = /^\d+[.)] (.*)$/.exec(line))){ open('ol'); out += '<li>' + (inline(m[1]) || '<br>') + '</li>'; return; }
      close();
      if ((m = /^#{1,3} (.*)$/.exec(line))){ out += '<h3>' + (inline(m[1]) || '<br>') + '</h3>'; return; }
      if ((m = /^> (.*)$/.exec(line))){ out += '<blockquote>' + (inline(m[1]) || '<br>') + '</blockquote>'; return; }
      out += '<div>' + (inline(line) || '<br>') + '</div>';
    });
    close();
    return out;
  }

  /* Разметка редактора → тело. Браузеры пишут оформление по-разному: Chrome —
     <b> и <strike>, Safari местами — span со стилем. Читаем и то и другое. */
  var BLOCK = /^(DIV|P|H[1-6]|BLOCKQUOTE|UL|OL|LI|PRE|SECTION|ARTICLE)$/;

  function marksOf(el){
    var tag = el.tagName, st = el.style || {}, m = [];
    var fw = st.fontWeight, td = (st.textDecorationLine || st.textDecoration || '');
    if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || Number(fw) >= 600) m.push('**');
    if (tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') m.push('_');
    if (tag === 'U' || tag === 'INS' || /underline/.test(td)) m.push('++');
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(td)) m.push('~~');
    return m;
  }

  // Знаки не переносятся через строку и не обнимают пробелы по краям:
  // «** слово**» уже не прочтётся как жирное.
  function wrap(text, marks){
    if (!marks.length) return text;
    var a = marks.join(''), z = marks.slice().reverse().join('');
    return text.split('\n').map(function(seg){
      var p = /^(\s*)([\s\S]*?)(\s*)$/.exec(seg);
      return p[2] ? p[1] + a + p[2] + z + p[3] : seg;
    }).join('\n');
  }

  function inlineOf(node){
    var s = '';
    for (var i = 0; i < node.childNodes.length; i++){
      var ch = node.childNodes[i];
      if (ch.nodeType === 3){ s += ch.nodeValue.replace(/ /g, ' '); continue; }
      if (ch.nodeType !== 1) continue;
      if (ch.tagName === 'BR'){ s += '\n'; continue; }
      if (BLOCK.test(ch.tagName)){ s += (s && !/\n$/.test(s) ? '\n' : '') + inlineOf(ch).replace(/\n$/, '') + '\n'; continue; }
      s += wrap(inlineOf(ch), marksOf(ch));
    }
    return s;
  }

  function fromHTML(root){
    var out = [], loose = '';
    function emit(text, prefix){
      // Последний <br> в блоке — заглушка пустой строки, а не перенос.
      text.replace(/\n$/, '').split('\n').forEach(function(line, i){
        out.push((i === 0 || prefix === '> ' ? prefix : '') + line);
      });
    }
    function flush(){ if (loose !== ''){ emit(loose, ''); loose = ''; } }
    function walk(node){
      for (var i = 0; i < node.childNodes.length; i++){
        var ch = node.childNodes[i];
        if (ch.nodeType !== 1 || !BLOCK.test(ch.tagName)){
          loose += ch.nodeType === 3 ? ch.nodeValue.replace(/ /g, ' ')
            : ch.nodeType === 1 ? (ch.tagName === 'BR' ? '\n' : wrap(inlineOf(ch), marksOf(ch))) : '';
          continue;
        }
        flush();
        var tag = ch.tagName;
        if (tag === 'UL' || tag === 'OL'){
          var n = 0;
          for (var j = 0; j < ch.children.length; j++){
            var li = ch.children[j];
            if (li.tagName !== 'LI') continue;
            n++;
            emit(inlineOf(li), tag === 'OL' ? n + '. ' : '- ');
          }
          continue;
        }
        if (/^H[1-6]$/.test(tag)){ emit(inlineOf(ch), '# '); continue; }
        // Список, всё же попавший в цитату, важнее цитаты: пункты сохраняем.
        if (tag === 'BLOCKQUOTE' && !ch.querySelector('ul, ol')){ emit(inlineOf(ch), '> '); continue; }
        var hasBlock = false;
        for (var k = 0; k < ch.children.length; k++) if (BLOCK.test(ch.children[k].tagName)) hasBlock = true;
        if (hasBlock) walk(ch); else emit(inlineOf(ch), '');
      }
      flush();
    }
    walk(root);
    return out.join('\n').replace(/\s+$/, '');
  }

  /* Простой текст — для копирования туда, где оформления не понимают, и для
     «поделиться». */
  function plain(body){
    return String(body || '').split('\n').map(function(line){
      return line.replace(/^#{1,3} /, '').replace(/^> /, '').replace(/^- /, '• ')
        .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1')
        .replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1')
        .replace(/\+\+(?=\S)([^\n]*?\S)\+\+/g, '$1')
        .replace(/(^|[^\w])_(?=\S)([^\n_]*?\S)_(?!\w)/g, '$1$2');
    }).join('\n');
  }

  /* Превью на карточке: первые строки с оформлением, без знаков заголовка и
     цитаты. Карточка сама обрезает до трёх строк. */
  function preview(body){
    var lines = String(body || '').split('\n').filter(function(l){ return l.trim(); }).slice(0, 4);
    return lines.map(function(line){
      return inline(line.replace(/^#{1,3} /, '').replace(/^> /, '').replace(/^- /, '• '));
    }).join('<br>');
  }

  /* ============ ВНУТРИ ЗАМЕТКИ ============ */

  var I = function(d){ return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; };
  var ICONS = {
    h: I('<path d="M6 5v14M18 5v14M6 12h12"/>'),
    ul: I('<circle cx="5" cy="7" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="17" r="1.2"/><path d="M9.5 7H20M9.5 12H20M9.5 17H20"/>'),
    ol: I('<path d="M4 5.5h1.5V10M4 10h3M4 14.5c0-1 2.8-1 2.8.3 0 1-2.8 2.2-2.8 3.7h3"/><path d="M10.5 7H20M10.5 12H20M10.5 17H20"/>'),
    quote: I('<path d="M5 6v12"/><path d="M9.5 8H19M9.5 12H19M9.5 16H15"/>'),
    clear: I('<path d="M6 5h12M12 5l-3.5 14"/><path d="M14.5 14.5l5 5M19.5 14.5l-5 5"/>'),
    copy: I('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>'),
    share: I('<path d="M12 15V4M8 7.5 12 3.5l4 4"/><path d="M7 10.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5.5a2 2 0 0 0-2-2h-1"/>')
  };

  var TOOLS = [
    { cmd: 'bold', label: '<b>Ж</b>', title: 'Жирный (⌘B)' },
    { cmd: 'italic', label: '<i>К</i>', title: 'Курсив (⌘I)' },
    { cmd: 'underline', label: '<u>Ч</u>', title: 'Подчёркнутый (⌘U)' },
    { cmd: 'strikeThrough', label: '<s>З</s>', title: 'Зачёркнутый (⌘⇧X)' },
    null,
    { cmd: 'h3', label: ICONS.h, title: 'Заголовок' },
    { cmd: 'insertUnorderedList', label: ICONS.ul, title: 'Список' },
    { cmd: 'insertOrderedList', label: ICONS.ol, title: 'Нумерованный список' },
    { cmd: 'blockquote', label: ICONS.quote, title: 'Цитата' },
    { cmd: 'clear', label: ICONS.clear, title: 'Убрать оформление' }
  ];

  function toolbar(n){
    var html = '<div class="ne-bar" role="toolbar" aria-label="Оформление текста"><div class="ne-fmts">';
    TOOLS.forEach(function(t){
      if (!t){ html += '<span class="ne-sep" aria-hidden="true"></span>'; return; }
      html += '<button type="button" class="ne-tool" data-act="ne-fmt" data-cmd="' + t.cmd + '" title="' + t.title +
        '" aria-label="' + t.title.replace(/ \(.*\)$/, '') + '" aria-pressed="false">' + t.label + '</button>';
    });
    html += '</div><div class="ne-out">' +
      '<button type="button" class="ne-tool ne-wide" data-act="ne-copy" data-note="' + n.id + '" title="Скопировать заметку">' +
        ICONS.copy + '<span>Копировать</span></button>' +
      '<button type="button" class="ne-tool ne-wide" data-act="ne-share" data-note="' + n.id + '" title="Поделиться заметкой">' +
        ICONS.share + '<span>Поделиться</span></button>' +
    '</div></div>';
    return html;
  }

  function vNote(base){
    return function(){
      var n = findNote(S.activeNote);
      if (!n) return base.apply(this, arguments);
      var touch = touchUI();
      return head('', '', 'notes') +
        '<section class="ne' + (touch ? ' ne-touch' : ' card') + '" data-note="' + n.id + '">' +
          '<input class="ne-title" type="text" data-notetitle="' + n.id + '" value="' + escH(n.title) + '" ' +
            'placeholder="Название" aria-label="Название заметки" autocomplete="off" maxlength="140" enterkeyhint="next">' +
          toolbar(n) +
          '<div class="ne-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Текст заметки" ' +
            'spellcheck="true" data-noteedit="' + n.id + '" data-placeholder="Текст записи">' + toHTML(n.body) + '</div>' +
          (touch ? '' : '<div class="ne-foot"><button class="btn sm soft" data-act="kill-note" data-note="' + n.id + '">Удалить запись</button></div>') +
        '</section>';
    };
  }

  function editor(){ return document.querySelector('.ne-body[data-noteedit]'); }

  function persist(){
    var ed = editor();
    if (!ed) return;
    var n = findNote(ed.getAttribute('data-noteedit'));
    if (!n) return;
    var body = fromHTML(ed);
    if (body !== n.body){ n.body = body; save(); }
  }

  function caretInside(ed){
    var sel = global.getSelection();
    return sel && sel.rangeCount && ed.contains(sel.anchorNode);
  }

  function caretToEnd(ed){
    ed.focus();
    var range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    var sel = global.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  }

  function blockNow(){
    var v = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    return v;
  }

  function fmt(d){
    var ed = editor();
    if (!ed) return;
    if (!caretInside(ed)) caretToEnd(ed);
    try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
    var c = d.cmd;
    if (c === 'h3' || c === 'blockquote'){
      document.execCommand('formatBlock', false, blockNow() === c ? '<div>' : '<' + c + '>');
    } else if (c === 'clear'){
      document.execCommand('removeFormat', false, null);
      if (blockNow() === 'h3' || blockNow() === 'blockquote') document.execCommand('formatBlock', false, '<div>');
    } else {
      // Список внутри цитаты или заголовка браузер вкладывает в них, а в
      // тексте заметки такой вложенности нет — сначала строка становится
      // обычной, потом списком.
      if (/List$/.test(c) && (blockNow() === 'h3' || blockNow() === 'blockquote')) document.execCommand('formatBlock', false, '<div>');
      document.execCommand(c, false, null);
    }
    persist();
    states();
  }

  function states(){
    var ed = editor();
    if (!ed) return;
    var inside = caretInside(ed), block = inside ? blockNow() : '';
    var tools = document.querySelectorAll('.ne-bar [data-cmd]');
    for (var i = 0; i < tools.length; i++){
      var c = tools[i].getAttribute('data-cmd'), on = false;
      if (inside && c !== 'clear'){
        if (c === 'h3' || c === 'blockquote') on = block === c;
        else { try { on = document.queryCommandState(c); } catch (e) {} }
      }
      tools[i].classList.toggle('on', on);
      tools[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* ---- копировать ---- */

  function flash(btn, text){
    if (!btn) return;
    var span = btn.querySelector('span'), was = span ? span.textContent : '';
    btn.classList.add('ok');
    if (span) span.textContent = text;
    setTimeout(function(){ btn.classList.remove('ok'); if (span) span.textContent = was; }, 1500);
  }

  function fallbackCopy(text){
    var span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = 'position:fixed; left:-9999px; top:0; white-space:pre;';
    document.body.appendChild(span);
    var sel = global.getSelection(), saved = [];
    for (var i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i));
    var range = document.createRange();
    range.selectNodeContents(span);
    sel.removeAllRanges(); sel.addRange(range);
    try { document.execCommand('copy'); } catch (e) {}
    sel.removeAllRanges(); saved.forEach(function(r){ sel.addRange(r); });
    span.remove();
  }

  function copy(d){
    persist();
    var n = findNote(d.note);
    if (!n) return;
    var btn = document.querySelector('[data-act="ne-copy"]');
    var text = (n.title ? n.title + '\n\n' : '') + plain(n.body);
    var html = (n.title ? '<h3>' + escH(n.title) + '</h3>' : '') + toHTML(n.body);
    function ok(){ flash(btn, 'Скопировано'); }
    var clip = navigator.clipboard;
    if (clip && clip.write && global.ClipboardItem){
      clip.write([new global.ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })]).then(ok, function(){
        (clip.writeText ? clip.writeText(text) : Promise.reject()).then(ok, function(){ fallbackCopy(text); ok(); });
      });
    } else if (clip && clip.writeText){
      clip.writeText(text).then(ok, function(){ fallbackCopy(text); ok(); });
    } else { fallbackCopy(text); ok(); }
  }

  /* ---- поделиться ---- */

  /* В адресе ссылки на мессенджер всё сообщение едет строкой запроса, а у
     адресов есть предел длины. Длинную заметку обрезаем — целиком её отдаёт
     «Копировать» и системное меню телефона. */
  function shareText(n, limit){
    var body = plain(n.body);
    if (limit && body.length > limit) body = body.slice(0, limit).replace(/\s+\S*$/, '') + '…';
    return (n.title ? n.title + '\n\n' : '') + body;
  }

  function share(d){
    persist();
    var n = findNote(d.note);
    if (!n) return;
    var text = shareText(n) + '\n\n— заметка из Synapse';
    if (navigator.share){
      navigator.share({ title: n.title || 'Заметка', text: text, url: SITE }).catch(function(e){
        if (e && e.name === 'AbortError') return;     // передумал — это не ошибка
        shareModal(n);
      });
      return;
    }
    shareModal(n);
  }

  function shareModal(n){
    var short = shareText(n, 1200), sign = '\n\n— заметка из Synapse: ' + SITE;
    var enc = encodeURIComponent;
    var links = [
      { t: 'Телеграм', href: 'https://t.me/share/url?url=' + enc(SITE) + '&text=' + enc(short + '\n\n— заметка из Synapse') },
      { t: 'WhatsApp', href: 'https://wa.me/?text=' + enc(short + sign) },
      { t: 'ВКонтакте', href: 'https://vk.com/share.php?url=' + enc(SITE) + '&title=' + enc(n.title || 'Заметка') + '&comment=' + enc(short) },
      { t: 'Почта', href: 'mailto:?subject=' + enc(n.title || 'Заметка') + '&body=' + enc(short + sign) }
    ];
    openModal('<h3>Поделиться заметкой</h3>' +
      '<p class="s">Получатель увидит текст заметки и ссылку на Synapse.</p>' +
      '<div class="ne-share">' + links.map(function(l){
        return '<a class="btn soft" href="' + escH(l.href) + '" target="_blank" rel="noopener">' + l.t + '</a>';
      }).join('') + '</div>' +
      '<button class="btn full" data-act="ne-copy-link" data-note="' + n.id + '">Скопировать текст со ссылкой</button>' +
      '<div class="acts"><button class="btn sm soft" data-act="close-modal">Закрыть</button></div>');
  }

  function copyLink(d){
    var n = findNote(d.note);
    if (!n) return;
    var text = shareText(n) + '\n\n— заметка из Synapse: ' + SITE;
    var btn = document.querySelector('[data-act="ne-copy-link"]');
    function ok(){ if (btn){ btn.textContent = 'Скопировано'; } setTimeout(closeModal, 700); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function(){ fallbackCopy(text); ok(); });
    else { fallbackCopy(text); ok(); }
  }

  /* ---- события редактора ---- */

  function wireEditor(){
    document.addEventListener('input', function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-notetitle')){
        var n = findNote(t.getAttribute('data-notetitle'));
        // Пустое название не сохраняем: карточка в списке осталась бы без
        // заголовка. Прежнее вернётся в поле, когда курсор уйдёт.
        if (n && t.value.trim()){ n.title = t.value.trim(); save(); }
        return;
      }
      if (t.closest && t.closest('.ne-body')) persist();
    });
    document.addEventListener('focusout', function(e){
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-notetitle') && !t.value.trim()){
        var n = findNote(t.getAttribute('data-notetitle'));
        if (n) t.value = n.title;
      }
    });
    document.addEventListener('focusin', function(e){
      if (e.target && e.target.classList && e.target.classList.contains('ne-body')){
        try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (er) {}
      }
    });
    document.addEventListener('keydown', function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      // Enter в названии — к тексту: заголовок одной строкой.
      if (t.getAttribute('data-notetitle') && e.key === 'Enter'){
        e.preventDefault();
        var ed = editor();
        if (ed) caretToEnd(ed);
        return;
      }
      if (!t.classList || !t.classList.contains('ne-body')) return;
      // Enter на пустой строке цитаты — выход из неё, как из списка. Иначе
      // браузер продолжает цитату бесконечно.
      if (e.key === 'Enter' && !e.shiftKey && blockNow() === 'blockquote'){
        var sel = global.getSelection(), node = sel && sel.anchorNode;
        var bq = node && (node.nodeType === 1 ? node : node.parentNode).closest('blockquote');
        if (bq && !bq.textContent.trim()){
          e.preventDefault();
          document.execCommand('formatBlock', false, '<div>');
          persist(); states();
          return;
        }
      }
      var mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === 'x' || e.key === 'X' || e.code === 'KeyX')){
        e.preventDefault(); fmt({ cmd: 'strikeThrough' });
      }
    });
    // Вставка — простым текстом: чужие шрифты, цвета и таблицы с сайтов в
    // заметке не нужны. Знаки оформления во вставленном тексте понимаются.
    document.addEventListener('paste', function(e){
      var ed = e.target && e.target.closest ? e.target.closest('.ne-body') : null;
      if (!ed || !e.clipboardData) return;
      var text = e.clipboardData.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      if (/\n|\*\*|~~|\+\+|(^|\s)_\S/.test(text)) document.execCommand('insertHTML', false, toHTML(text));
      else document.execCommand('insertText', false, text);
      persist();
    });
    // Кнопки панели не забирают фокус: иначе выделение в тексте теряется
    // раньше, чем до него дойдёт команда.
    document.addEventListener('mousedown', function(e){
      if (e.target && e.target.closest && e.target.closest('.ne-bar .ne-tool[data-cmd]')) e.preventDefault();
    });
    document.addEventListener('selectionchange', function(){ if (editor()) states(); });
  }

  /* ============ ПЕРЕНОС КАРТОЧЕК ============ */

  /* Сетка в несколько колонок, поэтому движок задач (он ведёт карточку по
     одной вертикали) здесь не подходит — свой, маленький. Карточка едет за
     указателем, а соседи расступаются: карточку ставим в разметке на место
     той, над которой она сейчас, и сдвиг соседей проигрываем анимацией.

     Пальцу — удержание, как у задач: так перенос не путается с прокруткой и
     свайпом. Мыши — движение с зажатой кнопкой: обычный щелчок по-прежнему
     открывает заметку. */
  var HOLD = 320, MOVE_MOUSE = 6, MOVE_TOUCH = 9;
  var drag = null, raf = 0;

  function grid(){ return document.querySelector('.ln-notes'); }
  function cardsOf(g){
    return Array.prototype.filter.call(g.children, function(c){ return c.classList.contains('row-card') && c.hasAttribute('data-note'); });
  }
  // Место карточки в сетке без учёта её сдвига: offset* transform не видят.
  function slot(c, g, gr, z){
    return { l: gr.left + c.offsetLeft * z, t: gr.top + c.offsetTop * z, w: c.offsetWidth * z, h: c.offsetHeight * z };
  }
  function zoomOf(g, gr){ return g.offsetWidth ? gr.width / g.offsetWidth : 1; }

  function lift(){
    if (!drag || drag.active) return;
    var g = grid();
    if (!g) { drag = null; return; }
    var gr = g.getBoundingClientRect(), z = zoomOf(g, gr), s = slot(drag.card, g, gr, z);
    drag.active = true;
    drag.grid = g;
    drag.gx = drag.x - s.l; drag.gy = drag.y - s.t;
    // Свайп начинается так же; кто первым себя опознал, тот и ведёт.
    if (global.swipe){ if (global.swipe.лицо) global.swipe.лицо.style.left = ''; global.swipe.карточка.classList.remove('swiping'); global.swipe = null; }
    if (typeof swipeCloseAll === 'function') swipeCloseAll(null);
    drag.card.classList.add('ne-lifted');
    document.documentElement.classList.add('ne-dragging');
    if (!drag.mouse && navigator.vibrate){ try { navigator.vibrate(18); } catch (e) {} }
    follow();
    tick();
  }

  function follow(){
    var g = drag.grid, gr = g.getBoundingClientRect(), z = zoomOf(g, gr), s = slot(drag.card, g, gr, z);
    var tx = (drag.x - drag.gx - s.l) / z, ty = (drag.y - drag.gy - s.t) / z;
    drag.card.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
  }

  function reorder(){
    var g = drag.grid, gr = g.getBoundingClientRect(), z = zoomOf(g, gr);
    var cards = cardsOf(g), over = null;
    for (var i = 0; i < cards.length; i++){
      if (cards[i] === drag.card) continue;
      var s = slot(cards[i], g, gr, z);
      if (drag.x >= s.l && drag.x <= s.l + s.w && drag.y >= s.t && drag.y <= s.t + s.h){ over = cards[i]; break; }
    }
    if (!over) return;
    // FLIP: запомнить, где соседи были, переставить, проиграть сдвиг.
    var before = cards.map(function(c){ return { c: c, l: c.offsetLeft, t: c.offsetTop }; });
    var from = cards.indexOf(drag.card), to = cards.indexOf(over);
    g.insertBefore(drag.card, from < to ? over.nextSibling : over);
    before.forEach(function(b){
      if (b.c === drag.card) return;
      var dx = b.l - b.c.offsetLeft, dy = b.t - b.c.offsetTop;
      if (!dx && !dy) return;
      b.c.classList.remove('ne-shift');
      b.c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      void b.c.offsetWidth;
      b.c.classList.add('ne-shift');
      b.c.style.transform = '';
    });
    follow();
  }

  // Каждый кадр: у края окна — прокрутка, и карточка с решением следом.
  function tick(){
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function step(){
      if (!drag || !drag.active) return;
      var edge = 70, h = global.innerHeight, v = 0;
      if (drag.y < edge) v = -Math.ceil((edge - drag.y) / 6);
      else if (drag.y > h - edge - 20) v = Math.ceil((drag.y - (h - edge - 20)) / 6);
      if (v){ global.scrollBy(0, v); follow(); reorder(); }
      raf = requestAnimationFrame(step);
    });
  }

  function drop(){
    cancelAnimationFrame(raf);
    var d = drag;
    drag = null;
    document.documentElement.classList.remove('ne-dragging');
    if (!d) return;
    clearTimeout(d.timer);
    if (!d.active) return;
    var ids = cardsOf(d.grid).map(function(c){ return c.getAttribute('data-note'); });
    d.card.classList.remove('ne-lifted');
    d.card.style.transform = '';
    // Щелчок, которым кончается перенос, заметку не открывает.
    global.перенёсВ = Date.now();
    var rank = {};
    ids.forEach(function(id, i){ rank[id] = i; });
    var moved = ids.join() !== S.notes.map(function(n){ return n.id; }).filter(function(id){ return id in rank; }).join();
    if (!moved) return;
    S.notes.sort(function(a, b){
      return (a.id in rank ? rank[a.id] : 1e9) - (b.id in rank ? rank[b.id] : 1e9);
    });
    commit();
  }

  function wireDrag(){
    document.addEventListener('pointerdown', function(e){
      if (S.view !== 'notes') return;
      var t = e.target;
      if (!t || !t.closest) return;
      var card = t.closest('.ln-notes > .row-card[data-note]');
      if (!card || t.closest('.side')) return;
      var mouse = e.pointerType === 'mouse';
      if (mouse && e.button !== 0) return;
      drag = { card: card, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, mouse: mouse, active: false,
               timer: mouse ? null : setTimeout(lift, HOLD) };
    });
    document.addEventListener('pointermove', function(e){
      if (!drag) return;
      drag.x = e.clientX; drag.y = e.clientY;
      if (!drag.active){
        var dist = Math.max(Math.abs(drag.x - drag.x0), Math.abs(drag.y - drag.y0));
        if (drag.mouse){ if (dist > MOVE_MOUSE && (e.buttons & 1)) lift(); }
        else if (dist > MOVE_TOUCH){ clearTimeout(drag.timer); drag = null; }   // это прокрутка или свайп
        return;
      }
      follow();
      reorder();
    });
    document.addEventListener('pointerup', drop);
    document.addEventListener('pointercancel', function(){ if (drag && drag.active){ drop(); } else if (drag){ clearTimeout(drag.timer); drag = null; } });
    // Пока карточку несут, страница под пальцем не прокручивается.
    document.addEventListener('touchmove', function(e){ if (drag && drag.active) e.preventDefault(); }, { passive: false });
    // Удержание на телефоне вызывает меню и выделение текста — здесь оно
    // означает «взять карточку».
    document.addEventListener('contextmenu', function(e){
      if (e.target && e.target.closest && e.target.closest('.ln-notes > .row-card') && touchUI()) e.preventDefault();
    });
  }

  /* ============ УСТАНОВКА ============ */

  function install(){
    if (typeof VIEWS === 'undefined' || typeof ACTS === 'undefined') return;
    if (VIEWS.note) VIEWS.note.render = vNote(VIEWS.note.render);
    if (VIEWS.notes){
      var baseNotes = VIEWS.notes.render;
      // Превью на карточке — с оформлением, а не со знаками. В app.js оно
      // собирается как esc(первые 120 знаков); ровно эту строку и меняем.
      VIEWS.notes.render = function(){
        var html = baseNotes.apply(this, arguments);
        (S.notes || []).forEach(function(n){
          if (!n.body) return;
          html = html.replace('<p class="sub">' + esc(n.body.slice(0, 120)) + '</p>', '<p class="sub">' + preview(n.body) + '</p>');
        });
        return html;
      };
    }
    ACTS['ne-fmt'] = fmt;
    ACTS['ne-copy'] = copy;
    ACTS['ne-share'] = share;
    ACTS['ne-copy-link'] = copyLink;
    wireEditor();
    wireDrag();
    if (S.view === 'note' || S.view === 'notes') render();
  }

  global.SynNotes = { toHTML: toHTML, fromHTML: fromHTML, plain: plain };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

/* Живое дерево в центре карты целей.

   Было: круг с иконкой дерева, который наливался цветом снизу вверх по
   общему проценту выполненного. Процент — это итог за всё время: полгода
   назад закрыл половину задач, с тех пор ничего не делаешь — а дерево всё
   так же наполовину зелёное.

   Владелец попросил игру: дерево надо поливать. Полив — сделанные дела:
   задача — одна лейка, закрытый этап — три, достигнутая цель — шесть. Вода
   испаряется: каждые три дня без дел у неё вдвое меньше силы. Отсюда
   здоровье дерева от 0 до 1, и по нему дерево:
     * засохло (меньше 0,15) — серое, голое, ветки опущены;
     * грустит (до 0,4)     — редкие жёлтые листья, и они облетают;
     * растёт (до 0,72)     — зелёное, листьев всё больше;
     * цветёт (дальше)      — густая крона и цветы.
   Крона качается, листья шевелятся. Если с прошлого взгляда на карту что-то
   сделано, на дерево падают капли и всплывает «+N» — видно, что полили.

   Когда дела сделаны, задачи не помнят: у них нет даты выполнения. Поэтому
   здесь свой журнал полива (S.tree.water): новая галочка заносится с
   отметкой времени, снятая — вычёркивается, так что на одной задаче
   туда-сюда воды не нагнать. Журнал заводится, сравнивая сохранённое
   состояние с прошлым, — в каждом месте, где задачу можно закрыть (строка,
   цель, Syn, виджет), ничего добавлять не пришлось.

   Модуль подключается и в андроид-обёртке: карта у них общая (app.js). */

(function (global) {
  'use strict';

  var HALF_LIFE_DAYS = 3;
  var W = { task: 1, stage: 3, goal: 6 };
  var DAY = 86400000;

  /* ============ ЖУРНАЛ ПОЛИВА ============ */

  function tree(){
    if (!S.tree || typeof S.tree !== 'object') S.tree = {};
    if (!S.tree.water || typeof S.tree.water !== 'object') S.tree.water = {};
    return S.tree;
  }

  /// Что сейчас закрыто: задачи, этапы, цели — по ключу, с весом.
  function closedNow(){
    var out = {};
    (S.tasks || []).forEach(function(t){ if (t && t.done) out['t:' + t.id] = W.task; });
    (S.goals || []).forEach(function(g){
      if (!g) return;
      var stages = g.stages || [];
      stages.forEach(function(st){ if (st && st.status === 'done') out['s:' + st.id] = W.stage; });
      var tasks = (S.tasks || []).filter(function(t){ return t && t.goalId === g.id; });
      var allTasks = tasks.length && tasks.every(function(t){ return t.done; });
      var allStages = stages.length && stages.every(function(st){ return st.status === 'done'; });
      if ((allTasks || allStages) && (tasks.length + stages.length) > 0) out['g:' + g.id] = W.goal;
    });
    return out;
  }

  /// Свести журнал с тем, что закрыто сейчас. Первый раз — без полива задним
  /// числом: уже сделанное раньше записывается «два дня назад», чтобы дерево
  /// у того, кто давно пользуется приложением, не начинало с засухи, но и не
  /// цвело за старое.
  function track(){
    if (typeof S === 'undefined' || !S) return;
    var t = tree();
    var now = Date.now();
    var closed = closedNow();
    var first = !t.started;
    Object.keys(closed).forEach(function(key){
      if (!t.water[key]) t.water[key] = { at: first ? now - 2 * DAY : now, w: closed[key] };
    });
    Object.keys(t.water).forEach(function(key){
      if (!closed[key]) delete t.water[key];
    });
    // Старше месяца — вода уже испарилась целиком; журнал не копит хвост.
    Object.keys(t.water).forEach(function(key){
      if (now - t.water[key].at > 30 * DAY) t.water[key].old = true;
    });
    if (first){ t.started = now; t.seen = now; }
  }

  /// Здоровье дерева 0…1 и сколько полито с прошлого взгляда.
  function health(){
    var t = tree();
    var now = Date.now();
    var water = 0, fresh = 0;
    Object.keys(t.water).forEach(function(key){
      var e = t.water[key];
      if (!e || e.old) return;
      var days = Math.max(0, (now - e.at) / DAY);
      water += e.w * Math.pow(0.5, days / HALF_LIFE_DAYS);
      if (t.seen && e.at > t.seen) fresh += e.w;
    });
    return { value: 1 - Math.exp(-water / 5), fresh: fresh };
  }

  function stageOf(h){
    if (h < 0.15) return { id: 'dry', title: 'Засохло — полей его делами' };
    if (h < 0.4) return { id: 'sad', title: 'Грустит — ему не хватает дел' };
    if (h < 0.72) return { id: 'grow', title: 'Растёт' };
    return { id: 'bloom', title: 'Цветёт!' };
  }

  /* ============ РИСУНОК ============ */

  function mix(a, b, k){
    k = Math.max(0, Math.min(1, k));
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }
  function css(c, alpha){
    var r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2]);
    return alpha === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // Детерминированный «случай»: одно и то же дерево на каждой перерисовке.
  function rnd(i){
    var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /* Места для листьев внутри кроны: овал над стволом. Порядок — от концов
     веток к середине, так что при малом здоровье листья сидят на кончиках, а
     густеет крона изнутри. */
  var LEAF_SPOTS = (function(){
    var spots = [];
    for (var i = 0; i < 46; i++){
      var a = rnd(i) * Math.PI * 2;
      var r = Math.sqrt(0.25 + 0.75 * rnd(i + 100));
      spots.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.72, r: r, rot: rnd(i + 200) * 360, s: 0.8 + rnd(i + 300) * 0.5 });
    }
    spots.sort(function(p, q){ return q.r - p.r; });
    return spots;
  })();

  function core(cx, cy, overall, colors){
    track();
    var hp = health();
    var h = hp.value;
    var stage = stageOf(h);
    var dark = typeof isDarkNow === 'function' && isDarkNow();

    // Засохшее — нейтрально-серое. Вторичный цвет текста у части тем синий
    // или фиолетовый, и сухое дерево выходило синим.
    var grey = dark ? [128, 128, 124] : [156, 153, 147];
    var bark = mix(grey, [128, 92, 62], Math.min(1, h * 1.6));
    var leafSick = [196, 168, 82];
    // Зелень своя, а не из темы: в части палитр «зелёный» тёмно-бирюзовый, и
    // здоровое дерево выглядело больным.
    var leafGood = dark ? [104, 178, 108] : [78, 156, 86];
    var leaf = h < 0.4 ? mix(mix(grey, leafSick, h / 0.4), leafSick, 0) : mix(leafSick, leafGood, (h - 0.4) / 0.32);
    var soil = mix(grey, [120, 92, 66], Math.min(1, h * 1.4));

    // Крона над серединой, ствол уходит вниз к почве.
    var crownX = cx, crownY = cy - 20, rx = 66, ry = 46;
    var baseY = cy + 62;
    // Засохшее дерево опускает ветки: концы ниже на величину «тоски».
    var droop = (1 - Math.min(1, h / 0.4)) * 14;

    var branches = [
      [cx, cy + 8, cx - 18, cy - 10, cx - 46, crownY - 6 + droop],
      [cx, cy + 2, cx + 20, cy - 14, cx + 48, crownY - 10 + droop],
      [cx, cy - 6, cx - 6, cy - 34, cx - 14, crownY - 38 + droop * 0.6],
      [cx, cy - 10, cx + 10, cy - 36, cx + 22, crownY - 34 + droop * 0.6],
      [cx - 26, cy - 8, cx - 44, cy - 20, cx - 62, crownY + 4 + droop],
      [cx + 28, cy - 12, cx + 46, cy - 22, cx + 60, crownY + 2 + droop]
    ];

    var s = '';
    s += '<g class="gt" data-stage="' + stage.id + '">' +
      '<title>' + esc('Дерево целей: ' + stage.title + '. Его поливают сделанные задачи, закрытые этапы и цели; без дел оно сохнет.') + '</title>';

    // Почва — холмик под деревом.
    s += '<ellipse cx="' + cx + '" cy="' + (baseY + 4) + '" rx="54" ry="9" fill="' + css(soil, dark ? 0.55 : 0.4) + '"/>';
    if (h >= 0.4){
      // Трава вокруг ствола у здорового дерева.
      for (var gi = 0; gi < 9; gi++){
        var gx = cx - 40 + gi * 10 + rnd(gi + 500) * 4;
        var gh = 6 + rnd(gi + 600) * 6;
        s += '<path class="gt-grass" d="M' + gx + ' ' + (baseY + 4) + ' q 2 ' + (-gh / 2) + ' ' + (rnd(gi + 700) * 4 - 2) + ' ' + (-gh) + '" ' +
          'stroke="' + css(leafGood, 0.7) + '" style="animation-delay:' + (-rnd(gi) * 3).toFixed(2) + 's"/>';
      }
    }

    s += '<g class="gt-crown" style="--sway:' + (0.6 + h * 1.6).toFixed(2) + 'deg">';
    // Ствол — сужается кверху.
    s += '<path d="M' + (cx - 9) + ' ' + baseY + ' C ' + (cx - 7) + ' ' + (cy + 30) + ' ' + (cx - 5) + ' ' + (cy + 4) + ' ' + (cx - 3) + ' ' + (cy - 14) +
      ' L ' + (cx + 3) + ' ' + (cy - 14) + ' C ' + (cx + 5) + ' ' + (cy + 4) + ' ' + (cx + 7) + ' ' + (cy + 30) + ' ' + (cx + 9) + ' ' + baseY + ' Z" fill="' + css(bark) + '"/>';
    branches.forEach(function(b, i){
      s += '<path class="gt-branch" d="M' + b[0] + ' ' + b[1] + ' Q ' + b[2] + ' ' + b[3] + ' ' + b[4] + ' ' + b[5] + '" ' +
        'stroke="' + css(bark) + '" stroke-width="' + (i < 4 ? 4.2 : 3) + '"/>';
    });

    // Листья: сколько — по здоровью.
    var count = Math.round(Math.pow(h, 0.8) * LEAF_SPOTS.length);
    for (var li = 0; li < count; li++){
      var p = LEAF_SPOTS[li];
      var lx = crownX + p.x * rx, ly = crownY + p.y * ry + droop * 0.5 * p.r;
      var shade = mix(leaf, dark ? [255, 255, 255] : [0, 0, 0], (rnd(li + 800) - 0.5) * 0.18);
      s += '<ellipse class="gt-leaf" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" rx="' + (7.5 * p.s).toFixed(1) + '" ry="' + (4.4 * p.s).toFixed(1) + '" ' +
        'transform="rotate(' + p.rot.toFixed(0) + ' ' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ')" fill="' + css(shade, 0.92) + '" ' +
        'style="animation-delay:' + (-rnd(li + 900) * 4).toFixed(2) + 's"/>';
    }

    // Цветы у цветущего.
    if (h >= 0.72){
      var flowers = Math.round((h - 0.72) / 0.28 * 9) + 3;
      for (var fi = 0; fi < flowers; fi++){
        var fp = LEAF_SPOTS[(fi * 7 + 3) % LEAF_SPOTS.length];
        var fx = crownX + fp.x * rx * 0.92, fy = crownY + fp.y * ry * 0.92;
        // Пять лепестков вокруг жёлтой серединки — цветок, а не пятно.
        var petal = fi % 3 ? '#f19bbd' : '#f7d2e1';
        var fl = '<g class="gt-flower" style="animation-delay:' + (-rnd(fi + 1000) * 3).toFixed(2) + 's">';
        for (var pi = 0; pi < 5; pi++){
          var pa = pi / 5 * Math.PI * 2 + fi;
          fl += '<circle cx="' + (fx + Math.cos(pa) * 2.6).toFixed(1) + '" cy="' + (fy + Math.sin(pa) * 2.6).toFixed(1) + '" r="2.1" fill="' + petal + '"/>';
        }
        s += fl + '<circle cx="' + fx.toFixed(1) + '" cy="' + fy.toFixed(1) + '" r="1.4" fill="#f2c94c"/></g>';
      }
    }
    s += '</g>';

    // Грустное дерево роняет листья.
    if (h >= 0.05 && h < 0.4){
      for (var di = 0; di < 3; di++){
        var dx = crownX - 30 + di * 28;
        s += '<ellipse class="gt-fall" cx="' + dx + '" cy="' + (crownY + 10) + '" rx="5" ry="3" fill="' + css(leafSick, 0.9) + '" ' +
          'style="animation-delay:' + (di * 1.9).toFixed(1) + 's"/>';
      }
    }

    // Полили с прошлого взгляда — капли и «+N».
    if (hp.fresh > 0){
      for (var ri = 0; ri < 7; ri++){
        var rx0 = crownX - 48 + ri * 16 + rnd(ri + 1100) * 6;
        s += '<path class="gt-drop" d="M' + rx0.toFixed(1) + ' ' + (crownY - 70) + ' q 3 5 0 7 q -3 -2 0 -7 z" fill="#5aa9e6" ' +
          'style="animation-delay:' + (ri * 0.18).toFixed(2) + 's"/>';
      }
      s += '<text class="gt-plus" x="' + (cx + 44) + '" y="' + (crownY - 52) + '">+' + Math.round(hp.fresh) + '</text>';
      tree().seen = Date.now();
    }

    // Подпись: как дерево и общий процент целей.
    s += '<text class="mm-core-label gt-label" x="' + cx + '" y="' + (baseY + 26) + '">' + esc(stage.title) + '</text>';
    s += '<text class="mm-label sec gt-pct" x="' + cx + '" y="' + (baseY + 42) + '">' + Math.round(overall * 100) + '% задач целей сделано</text>';
    s += '</g>';
    return s;
  }

  /* ============ БЛОКИ И СВЯЗИ КАРТЫ ============ */

  /* Блоки были прямоугольниками с волосяной обводкой, связи — серыми
     нитками. Владелец: «сами блоки тоже сделай красивее, а линии, ведущие к
     дереву, анимируй, как будто по ним нейроны текут».

     Блок теперь карточка: мягкая тень, рамка в цвет роли (цель — цвет темы,
     этап — фиолетовый Syn, задача — зелёный), у закрытого — галочка в кружке.
     Полоски роли слева и прогресса снизу были и убраны по просьбе владельца:
     «перемудрил, эти полоски не нужны».

     По каждой связи от листа к дереву бегут светящиеся импульсы: по
     сделанному — ярче и чаще, по несделанному — редкие и бледные. Сделанное
     буквально течёт к дереву и поит его. Движение — SVG-анимацией вдоль той
     же кривой, что рисует связь; при «меньше движения» в системе импульсов
     нет вовсе (goal-tree.css). */

  function roleOf(w){
    if (w >= MM.goalW) return 'goal';
    if (w >= MM.stageW) return 'stage';
    return 'task';
  }

  function node(x, y, w, text, sub, fillColor, done, colors){
    var lines = wrapLabel(text, w, 2);
    var role = roleOf(w);
    var h = lines.length * MM.lineH + (sub ? 18 : 8) + 18;
    var left = x - w / 2, top = y - h / 2;
    var first = top + 15 + MM.lineH / 2;
    var tint = role === 'goal' ? colors.accent : role === 'stage' ? (colors.synPurple || [124, 92, 214]) : (colors.focusGreen || fillColor);
    var textX = left + 12;

    var g = '<g class="mm-card mm-' + role + (done ? ' done' : '') + '">';
    g += '<rect class="mm-card-bg" x="' + left + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="13" ' +
      'fill="' + (done ? css(mix(colors.panel, tint, 0.14)) : css(colors.panel)) + '" ' +
      'stroke="' + css(tint, done ? 0.75 : 0.28) + '"/>';
    g += lines.map(function(line, i){
      return '<text class="mm-label' + (role === 'goal' ? ' strong' : '') + '" x="' + textX + '" y="' + (first + i * MM.lineH) + '">' + esc(line) + '</text>';
    }).join('');
    if (sub){
      g += '<text class="mm-label sec" x="' + textX + '" y="' + (first + lines.length * MM.lineH + 2) + '">' + esc(sub) + '</text>';
    }
    if (done){
      var bx = left + w - 13, by = top + 13;
      g += '<circle cx="' + bx + '" cy="' + by + '" r="7" fill="' + css(tint) + '"/>' +
        '<path d="M' + (bx - 3) + ' ' + by + ' l2 2.2 l4 -4.4" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return g + '</g>';
  }

  var linkSeq = 0;
  function link(x1, y1, x2, y2, colors, ratio){
    var c1 = x1 + (x2 - x1) * 0.34;
    var c2 = x1 + (x2 - x1) * 0.72;
    var d = 'M' + x1 + ' ' + y1 + ' C' + c1 + ' ' + y1 + ' ' + c2 + ' ' + y2 + ' ' + x2 + ' ' + y2;
    var done = ratio >= 1, some = ratio > 0;
    // Сделанное течёт зелёным — тем же, что листья дерева, которое оно поит.
    var glow = done ? (isDarkNow() ? [104, 178, 108] : [78, 156, 86]) : colors.accent;
    var out = '<path class="mm-link" d="' + d + '" stroke="' + css(colors.textSecondary, (0.22 + 0.3 * Math.min(1, ratio)).toFixed(3)) + '"/>';
    // Сам «нерв»: связь чуть светится, если по ней что-то сделано.
    if (some) out += '<path class="mm-nerve" d="' + d + '" stroke="' + css(glow, (0.18 + 0.32 * ratio).toFixed(3)) + '"/>';
    // Импульсы — от листа к дереву (путь рисуется от дерева, поэтому
    // keyPoints идут обратно, 1 → 0).
    var pulses = done ? 3 : some ? 2 : 1;
    var seq = linkSeq++;
    var dur = (done ? 2.2 : 3.4) + rnd(seq + 1300) * 1.4;
    for (var i = 0; i < pulses; i++){
      var r = done ? 2.6 : some ? 2.2 : 1.7;
      var alpha = done ? 0.95 : some ? 0.75 : 0.4;
      out += '<circle class="mm-pulse" r="' + r + '" fill="' + css(glow, alpha) + '" style="color:' + css(glow) + '">' +
        '<animateMotion dur="' + dur.toFixed(2) + 's" begin="' + (-(i / pulses) * dur - rnd(seq + 1400) * dur).toFixed(2) + 's" ' +
          'repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path="' + d + '"/>' +
      '</circle>';
    }
    return out;
  }

  /* ============ УСТАНОВКА ============ */

  function install(){
    if (typeof MM === 'undefined' || typeof S === 'undefined') return;
    // Дерево крупнее прежнего круга: связи к целям начинаются от края кроны,
    // а карта из одной цели не становится ниже самого дерева.
    MM.coreR = 78;
    // Блоки и связи карты — свои (см. node и link выше).
    global.mmNode = node;
    global.mmLink = link;
    // Журнал ведём на каждом сохранении: так в него попадает любая галочка,
    // откуда бы она ни пришла.
    var baseSave = global.save;
    if (typeof baseSave === 'function' && !baseSave.__tree){
      global.save = function(){
        try { track(); } catch (e) {}
        return baseSave.apply(this, arguments);
      };
      global.save.__tree = true;
    }
    track();
    if (S.view === 'analytics' && typeof global.render === 'function') global.render();
  }

  global.SynTree = { core: core, health: health, track: track };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);

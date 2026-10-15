/* Живой фон карточки медитации — только для веб-версии.

   Под каждый звук своя тихая петля: дождь идёт косыми штрихами, в лесу
   плывут пылинки в лучах, ручей течёт линиями, в камине поднимаются искры,
   ночью мигают звёзды, от чаши расходятся круги. Звук слышно, а теперь и
   видно, куда он зовёт.

   Как это устроено.

   Экран медитации во время сеанса перерисовывается каждую секунду — app.js
   заменяет разметку целиком. Холст, созданный заново на каждой отрисовке,
   начинал бы сцену сначала раз в секунду, и капли дёргались бы. Поэтому
   холст здесь один на всё время: после каждой отрисовки он переставляется в
   новую карточку (MutationObserver на #app), а сцена продолжается с того же
   места. app.js про это ничего не знает и не правится.

   Сила сцены идёт за состоянием сеанса:
     * до старта — медленно и приглушённо: фон, а не заставка;
     * во время сеанса и прослушивания звука — в полную силу;
     * на паузе — почти замирает.

   Цвета — из текущей темы (--fg, --accent, --accent-warm, --card), поэтому
   сцена своя в каждой из палитр и в тёмной теме. Огонь и рассвет тёплые
   всегда: серый огонь не читается огнём.

   Тем, у кого в системе включено «уменьшить движение», показываем один
   неподвижный кадр.

   Подключается из index.html вне андроид-обёртки, как и остальное в web/. */

(function (global) {
  'use strict';

  var canvas = null, ctx = null;
  var card = null, sizeWatch = null;
  var W = 0, H = 0, DPR = 1;
  var sceneId = '', scene = null, state = null;
  var fade = 1;                 // проявление сцены после смены звука
  var speedK = 0.45, alphaK = 0.75;
  var t = 0, last = 0, looping = false;
  var colors = null, colorsAt = 0;
  var anchor = { x: 0.5, y: 0.4, r: 120 };
  var REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');

  function rand(a, b){ return a + Math.random() * (b - a); }
  function pick(list){ return list[Math.floor(Math.random() * list.length)]; }

  /* ---- цвета темы ----

     Переменная может прийти как #rrggbb, rgb(...) или именем. Холст сам
     приводит любую запись к единому виду — им и пользуемся для разбора. */
  var probe = document.createElement('canvas').getContext('2d');
  function parseColor(value, fallback){
    probe.fillStyle = '#000';
    probe.fillStyle = (value || '').trim() || fallback;
    var c = probe.fillStyle;
    if (c.charAt(0) === '#'){
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    var m = c.match(/[\d.]+/g) || [0, 0, 0];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  function readColors(){
    var cs = getComputedStyle(card || document.documentElement);
    colors = {
      fg: parseColor(cs.getPropertyValue('--fg'), '#2a2a2a'),
      accent: parseColor(cs.getPropertyValue('--accent'), '#5d4e2e'),
      warm: parseColor(cs.getPropertyValue('--accent-warm'), '#c6a469'),
      card: parseColor(cs.getPropertyValue('--card'), '#f2efe8'),
      dark: document.documentElement.getAttribute('data-dark') === '1'
    };
    colorsAt = Date.now();
  }
  function rgba(c, a){ return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }

  /* ============ СЦЕНЫ ============

     У каждой init(w, h) — состояние, и draw(c, s, w, h, dt, t) — кадр. dt уже
     умножен на силу сцены: на паузе он почти ноль, и всё замирает само. */

  /* Дождь: косые штрихи и редкие круги на воде внизу. */
  function rainInit(w, h, heavy){
    var n = Math.min(heavy ? 260 : 150, Math.round(w * h / (heavy ? 3200 : 5500)));
    var drops = [];
    for (var i = 0; i < n; i++) drops.push(newDrop(w, h, heavy, true));
    return { drops: drops, ripples: [], heavy: heavy, flash: 0, bolt: null, next: rand(4, 9) };
  }
  function newDrop(w, h, heavy, anywhere){
    return { x: rand(-0.15 * w, w * 1.05), y: anywhere ? rand(-h, h) : rand(-h * 0.4, -10),
      len: rand(12, 30) * (heavy ? 1.3 : 1), v: rand(520, 860) * (heavy ? 1.45 : 1), a: rand(0.14, 0.34) };
  }
  function rainDraw(c, s, w, h, dt){
    var slant = s.heavy ? 0.3 : 0.14;
    c.lineCap = 'round';
    c.lineWidth = s.heavy ? 1.5 : 1.3;
    for (var i = 0; i < s.drops.length; i++){
      var d = s.drops[i];
      d.y += d.v * dt; d.x += d.v * dt * slant;
      if (d.y - d.len > h){
        if (Math.random() < 0.18 && s.ripples.length < 24){
          s.ripples.push({ x: d.x - slant * h * 0.08, y: rand(h * 0.82, h * 0.98), r: 0, life: 0 });
        }
        s.drops[i] = d = newDrop(w, h, s.heavy, false);
      }
      c.strokeStyle = rgba(colors.fg, d.a);
      c.beginPath();
      c.moveTo(d.x, d.y);
      c.lineTo(d.x - slant * d.len, d.y - d.len);
      c.stroke();
    }
    c.lineWidth = 1;
    for (var j = s.ripples.length - 1; j >= 0; j--){
      var r = s.ripples[j];
      r.life += dt * 1.3; r.r += dt * 26;
      if (r.life >= 1){ s.ripples.splice(j, 1); continue; }
      c.strokeStyle = rgba(colors.fg, (1 - r.life) * 0.32);
      c.beginPath();
      c.ellipse(r.x, r.y, r.r, r.r * 0.28, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }

  /* Гроза: ливень гуще и косее, раз в несколько секунд — молния и вспышка. */
  function stormDraw(c, s, w, h, dt, time, rdt){
    rainDraw(c, s, w, h, dt);
    if (time > s.next && speedK > 0.3){
      s.flash = 1;
      s.next = time + rand(6, 13);
      var x = rand(w * 0.15, w * 0.85), y = 0, pts = [[x, y]];
      while (y < h * rand(0.45, 0.75)){ y += rand(14, 32); x += rand(-22, 22); pts.push([x, y]); }
      s.bolt = pts;
    }
    if (s.flash > 0){
      // Вспышка гаснет по настоящему времени, а не по силе сцены: на паузе
      // молния не должна висеть на экране.
      s.flash = Math.max(0, s.flash - rdt * 2.2);
      var f = s.flash * s.flash;
      c.fillStyle = 'rgba(255,255,255,' + (f * (colors.dark ? 0.16 : 0.32)).toFixed(3) + ')';
      c.fillRect(0, 0, w, h);
      if (s.bolt && s.flash > 0.35){
        c.strokeStyle = colors.dark ? 'rgba(255,255,255,' + f.toFixed(3) + ')' : rgba(colors.fg, f * 0.55);
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(s.bolt[0][0], s.bolt[0][1]);
        for (var i = 1; i < s.bolt.length; i++) c.lineTo(s.bolt[i][0], s.bolt[i][1]);
        c.stroke();
      }
    }
  }

  /* Лес: ели в три слоя по низу, лучи сверху, пылинки в свете. */
  function forestInit(w, h){
    var layers = [];
    for (var L = 0; L < 3; L++){
      var trees = [], step = 58 - L * 12, x = rand(-20, 0);
      while (x < w + 40){
        trees.push({ x: x, h: h * rand(0.16, 0.3) * (0.75 + L * 0.2), w: rand(22, 34) * (0.8 + L * 0.2) });
        x += step * rand(0.7, 1.3);
      }
      layers.push(trees);
    }
    var motes = [];
    for (var i = 0; i < 46; i++) motes.push({ x: rand(0, w), y: rand(0, h), r: rand(0.8, 2.4), vy: rand(-18, -6), ph: rand(0, 6.28) });
    var rays = [];
    for (var k = 0; k < 4; k++) rays.push({ x: rand(0.1, 0.9) * w, top: rand(20, 50), bot: rand(90, 170), off: rand(60, 160), ph: rand(0, 6.28) });
    return { layers: layers, motes: motes, rays: rays };
  }
  function forestDraw(c, s, w, h, dt, time){
    s.rays.forEach(function(r){
      var a = 0.05 * (0.55 + 0.45 * Math.sin(time * 0.3 + r.ph));
      var g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(colors.warm, a));
      g.addColorStop(1, rgba(colors.warm, 0));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(r.x - r.top, 0); c.lineTo(r.x + r.top, 0);
      c.lineTo(r.x + r.off + r.bot, h); c.lineTo(r.x + r.off - r.bot, h);
      c.closePath(); c.fill();
    });
    s.motes.forEach(function(m){
      m.y += m.vy * dt; m.x += Math.sin(time * 0.8 + m.ph) * 8 * dt;
      if (m.y < -5){ m.y = h + 5; m.x = rand(0, w); }
      c.fillStyle = rgba(colors.warm, 0.35 * (0.4 + 0.6 * Math.abs(Math.sin(time * 1.3 + m.ph))));
      c.beginPath(); c.arc(m.x, m.y, m.r, 0, Math.PI * 2); c.fill();
    });
    s.layers.forEach(function(trees, L){
      c.fillStyle = rgba(colors.fg, 0.035 + L * 0.03);
      trees.forEach(function(tr){
        var sway = Math.sin(time * 0.6 + tr.x * 0.013) * (1 + L) * 1.2;
        var top = h - tr.h;
        c.beginPath();
        for (var tier = 0; tier < 3; tier++){
          var ty = top + tr.h * tier * 0.24, by = top + tr.h * (0.42 + tier * 0.26), hw = tr.w * (0.32 + tier * 0.17);
          c.moveTo(tr.x + sway * (1 - tier * 0.3), ty);
          c.lineTo(tr.x + hw, by); c.lineTo(tr.x - hw, by); c.closePath();
        }
        c.rect(tr.x - 2, h - tr.h * 0.16, 4, tr.h * 0.16);
        c.fill();
      });
    });
  }

  /* Ручей: волнистые линии текут слева направо, по ним бегут блики. */
  function streamInit(w, h){
    var lines = [];
    for (var i = 0; i < 10; i++){
      lines.push({ y: h * (0.3 + i * 0.065), amp: rand(4, 10), f: rand(0.007, 0.015), v: rand(1.2, 2.4), ph: rand(0, 6.28), a: rand(0.14, 0.3) });
    }
    var glints = [];
    for (var k = 0; k < 26; k++) glints.push({ line: Math.floor(rand(0, 10)), x: rand(0, w), v: rand(40, 90), life: rand(0, 1) });
    return { lines: lines, glints: glints };
  }
  function streamY(l, x){ return l.y + l.amp * Math.sin(x * l.f - l.ph) + l.amp * 0.45 * Math.sin(x * l.f * 2.3 - l.ph * 1.6); }
  function streamDraw(c, s, w, h, dt){
    c.lineWidth = 1.7;
    s.lines.forEach(function(l){
      l.ph += l.v * dt;
      c.strokeStyle = rgba(colors.accent, l.a);
      c.beginPath();
      for (var x = -10; x <= w + 10; x += 8){
        var y = streamY(l, x);
        if (x < 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    });
    s.glints.forEach(function(g){
      g.x += g.v * dt; g.life += dt * 0.5;
      if (g.x > w + 10 || g.life > 1){ g.x = rand(-10, w * 0.6); g.life = 0; g.line = Math.floor(rand(0, s.lines.length)); }
      var y = streamY(s.lines[g.line], g.x);
      c.fillStyle = rgba(colors.dark ? colors.fg : colors.card, 0.9 * Math.sin(g.life * Math.PI));
      c.beginPath(); c.ellipse(g.x, y, 5, 1.5, 0, 0, Math.PI * 2); c.fill();
    });
  }

  /* Камин: тёплое мерцающее зарево снизу и искры, которые поднимаются и гаснут. */
  function fireInit(w, h){
    var embers = [];
    for (var i = 0; i < 75; i++) embers.push(newEmber(w, h, true));
    return { embers: embers };
  }
  function newEmber(w, h, anywhere){
    return { x: w / 2 + rand(-0.28, 0.28) * w, y: anywhere ? rand(h * 0.2, h) : h + rand(0, 20),
      vy: rand(-80, -28), vx: rand(-8, 8), r: rand(1.2, 3.2), life: anywhere ? rand(0.2, 1) : 1,
      hue: rand(16, 44), ph: rand(0, 6.28) };
  }
  function fireDraw(c, s, w, h, dt, time){
    var flick = 0.62 + 0.18 * Math.sin(time * 7.1) + 0.12 * Math.sin(time * 13.7) + 0.08 * Math.sin(time * 3.3);
    var g = c.createRadialGradient(w / 2, h * 1.08, 0, w / 2, h * 1.08, Math.max(w * 0.55, h * 0.9));
    g.addColorStop(0, 'hsla(28,95%,55%,' + (0.36 * flick).toFixed(3) + ')');
    g.addColorStop(0.45, 'hsla(20,90%,50%,' + (0.13 * flick).toFixed(3) + ')');
    g.addColorStop(1, 'hsla(20,90%,50%,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    for (var i = 0; i < s.embers.length; i++){
      var e = s.embers[i];
      e.y += e.vy * dt; e.x += (e.vx + Math.sin(time * 3 + e.ph) * 14) * dt; e.life -= dt * 0.28;
      if (e.life <= 0 || e.y < -10){ s.embers[i] = newEmber(w, h, false); continue; }
      var a = e.life * (0.55 + 0.45 * Math.sin(time * 9 + e.ph));
      c.fillStyle = 'hsla(' + e.hue.toFixed(0) + ',95%,62%,' + (a * 0.22).toFixed(3) + ')';
      c.beginPath(); c.arc(e.x, e.y, e.r * 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'hsla(' + e.hue.toFixed(0) + ',100%,66%,' + (a * 0.85).toFixed(3) + ')';
      c.beginPath(); c.arc(e.x, e.y, e.r, 0, Math.PI * 2); c.fill();
    }
  }

  /* Флейта: три мягкие ленты колышутся поперёк, изредка всплывает нота. */
  function fluteInit(w, h){
    var ribbons = [];
    for (var i = 0; i < 3; i++) ribbons.push({ y: h * (0.28 + i * 0.22), amp: h * rand(0.04, 0.08), f: rand(0.004, 0.008), v: rand(0.35, 0.7), ph: rand(0, 6.28), wd: rand(22, 46) });
    return { ribbons: ribbons, notes: [], next: 0.5 };
  }
  function fluteDraw(c, s, w, h, dt, time){
    s.ribbons.forEach(function(r, i){
      r.ph += r.v * dt;
      var top = [], bot = [];
      for (var x = -10; x <= w + 10; x += 10){
        var y = r.y + r.amp * Math.sin(x * r.f + r.ph) + r.amp * 0.3 * Math.sin(x * r.f * 2.7 - r.ph * 1.3);
        var wd = r.wd * (0.45 + 0.55 * Math.abs(Math.sin(x * 0.004 + r.ph * 0.6 + i)));
        top.push([x, y]); bot.push([x, y + wd]);
      }
      c.fillStyle = rgba(i === 1 ? colors.warm : colors.accent, i === 1 ? 0.28 : 0.16);
      c.beginPath();
      c.moveTo(top[0][0], top[0][1]);
      top.forEach(function(p){ c.lineTo(p[0], p[1]); });
      for (var k = bot.length - 1; k >= 0; k--) c.lineTo(bot[k][0], bot[k][1]);
      c.closePath(); c.fill();
      c.strokeStyle = rgba(colors.accent, 0.36);
      c.lineWidth = 1.5;
      c.beginPath();
      top.forEach(function(p, n){ if (n) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
      c.stroke();
    });
    s.next -= dt;
    if (s.next <= 0 && s.notes.length < 10){
      s.notes.push({ x: rand(0.08, 0.92) * w, y: rand(0.55, 0.9) * h, life: 0, g: pick(['♪', '♫', '♩']), size: rand(18, 30), ph: rand(0, 6.28) });
      s.next = rand(0.8, 1.8);
    }
    c.textAlign = 'center';
    for (var j = s.notes.length - 1; j >= 0; j--){
      var n = s.notes[j];
      n.life += dt / 6; n.y -= 12 * dt; n.x += Math.sin(time + n.ph) * 6 * dt;
      if (n.life >= 1){ s.notes.splice(j, 1); continue; }
      c.fillStyle = rgba(colors.fg, 0.5 * Math.sin(n.life * Math.PI));
      c.font = n.size.toFixed(0) + 'px serif';
      c.fillText(n.g, n.x, n.y);
    }
  }

  /* Ветер: росчерки проносятся по карточке, кружатся редкие листья. */
  function windInit(w, h){
    var gusts = [];
    for (var i = 0; i < 22; i++) gusts.push(newGust(w, h, true));
    var leaves = [];
    for (var k = 0; k < 14; k++) leaves.push({ x: rand(0, w), y: rand(0, h), v: rand(70, 140), rot: rand(0, 6.28), vr: rand(-3, 3), s: rand(4, 7), ph: rand(0, 6.28) });
    return { gusts: gusts, leaves: leaves };
  }
  function newGust(w, h, anywhere){
    return { x: anywhere ? rand(-w * 0.3, w) : rand(-w * 0.6, -80), y: rand(0.08, 0.92) * h, len: rand(80, 240),
      v: rand(130, 280), bend: rand(-18, 18), a: rand(0.16, 0.32), ph: rand(0, 6.28) };
  }
  function windDraw(c, s, w, h, dt, time){
    c.lineCap = 'round';
    c.lineWidth = 1.7;
    for (var i = 0; i < s.gusts.length; i++){
      var g = s.gusts[i];
      g.x += g.v * dt; g.y += Math.sin(time * 0.7 + g.ph) * 10 * dt;
      if (g.x > w + 20){ s.gusts[i] = newGust(w, h, false); continue; }
      // Росчерк ярче посередине пути и гаснет к краям карточки.
      var mid = 1 - Math.abs((g.x + g.len / 2) / w - 0.5) * 1.3;
      c.strokeStyle = rgba(colors.fg, g.a * Math.max(0, mid));
      c.beginPath();
      c.moveTo(g.x, g.y);
      c.quadraticCurveTo(g.x + g.len / 2, g.y + g.bend, g.x + g.len, g.y);
      c.stroke();
    }
    s.leaves.forEach(function(l){
      l.x += l.v * dt; l.y += Math.sin(time * 1.4 + l.ph) * 22 * dt + 6 * dt; l.rot += l.vr * dt;
      if (l.x > w + 10){ l.x = -10; l.y = rand(0, h); }
      if (l.y > h + 10) l.y = -10;
      c.save();
      c.translate(l.x, l.y); c.rotate(l.rot);
      c.fillStyle = rgba(colors.warm, 0.6);
      c.beginPath(); c.ellipse(0, 0, l.s, l.s * 0.45, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    });
  }

  /* Прибой: слои волн внизу дышат приливом раз в девять секунд. */
  function surfInit(w, h){
    var layers = [];
    for (var i = 0; i < 4; i++) layers.push({ base: 0.6 + i * 0.09, amp: 7 + i * 4, f: rand(0.006, 0.011), v: rand(0.5, 0.9) * (i % 2 ? -1 : 1), ph: rand(0, 6.28) });
    return { layers: layers, tide: 0 };
  }
  function surfDraw(c, s, w, h, dt){
    s.tide += dt * (Math.PI * 2 / 9);
    s.layers.forEach(function(l, i){
      l.ph += l.v * dt;
      var lift = Math.sin(s.tide - i * 0.45) * h * 0.025 * (1 + i * 0.4);
      var base = h * l.base - lift;
      c.beginPath();
      c.moveTo(0, h);
      var crest = [];
      for (var x = 0; x <= w + 8; x += 8){
        var y = base + l.amp * Math.sin(x * l.f + l.ph) + l.amp * 0.4 * Math.sin(x * l.f * 2.1 - l.ph * 1.4);
        c.lineTo(x, y);
        crest.push([x, y]);
      }
      c.lineTo(w, h); c.closePath();
      c.fillStyle = rgba(colors.accent, 0.05 + i * 0.025);
      c.fill();
      c.strokeStyle = rgba(colors.dark ? colors.fg : colors.card, 0.35 + i * 0.1);
      c.lineWidth = 1.3;
      c.beginPath();
      crest.forEach(function(p, n){ if (n) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
      c.stroke();
    });
  }

  /* Ночь: мерцающие звёзды, месяц, падающая звезда и светлячки у земли. */
  function nightInit(w, h){
    var stars = [];
    var n = Math.min(220, Math.round(w * h / 3200));
    for (var i = 0; i < n; i++) stars.push({ x: rand(0, w), y: rand(0, h * 0.85), r: rand(0.4, 1.5), tw: rand(0.6, 2.2), ph: rand(0, 6.28) });
    var flies = [];
    for (var k = 0; k < 14; k++) flies.push({ x: rand(0, w), y: rand(h * 0.7, h * 0.97), ph: rand(0, 6.28), sp: rand(0.4, 1) });
    return { stars: stars, flies: flies, shoot: null, next: rand(3, 8) };
  }
  function nightDraw(c, s, w, h, dt, time){
    // Сумерки сверху: в светлой теме без них звёзды на бумажном фоне не
    // читались ночью вовсе. В тёмной карточка и так ночная.
    var sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgba(colors.accent, colors.dark ? 0.06 : 0.22));
    sky.addColorStop(0.75, rgba(colors.accent, 0));
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    var mx = w * 0.82, my = h * 0.22, mr = Math.max(14, Math.min(w, h) * 0.055);
    var g = c.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
    g.addColorStop(0, rgba(colors.fg, 0.08)); g.addColorStop(1, rgba(colors.fg, 0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // Месяц — диск минус смещённый диск. Вырез делается обрезкой, а не
    // закраской цветом карточки: закраска ложилась пятном поверх свечения.
    c.save();
    c.beginPath();
    c.rect(0, 0, w, h);
    c.arc(mx + mr * 0.42, my - mr * 0.18, mr * 0.92, 0, Math.PI * 2);
    c.clip('evenodd');
    c.fillStyle = rgba(colors.fg, 0.3);
    c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();
    c.restore();

    s.stars.forEach(function(st){
      c.fillStyle = rgba(colors.fg, 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(time * st.tw + st.ph)));
      c.beginPath(); c.arc(st.x, st.y, st.r, 0, Math.PI * 2); c.fill();
    });

    s.next -= dt;
    if (!s.shoot && s.next <= 0){
      s.shoot = { x: rand(w * 0.2, w * 0.9), y: rand(0, h * 0.3), life: 0 };
      s.next = rand(5, 11);
    }
    if (s.shoot){
      var sh = s.shoot;
      sh.life += dt * 1.2;
      if (sh.life >= 1) s.shoot = null;
      else {
        var hx = sh.x - sh.life * 160, hy = sh.y + sh.life * 90;
        var tr = c.createLinearGradient(hx, hy, hx + 70, hy - 40);
        tr.addColorStop(0, rgba(colors.fg, 0.5 * Math.sin(sh.life * Math.PI)));
        tr.addColorStop(1, rgba(colors.fg, 0));
        c.strokeStyle = tr; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + 70, hy - 40); c.stroke();
      }
    }

    s.flies.forEach(function(f){
      f.ph += dt * f.sp;
      var fx = f.x + Math.sin(f.ph * 1.3) * 14, fy = f.y + Math.cos(f.ph) * 8;
      var a = Math.max(0, Math.sin(f.ph * 2.2));
      c.fillStyle = 'hsla(68,90%,60%,' + (a * 0.18).toFixed(3) + ')';
      c.beginPath(); c.arc(fx, fy, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'hsla(68,95%,65%,' + (a * 0.75).toFixed(3) + ')';
      c.beginPath(); c.arc(fx, fy, 1.6, 0, Math.PI * 2); c.fill();
    });
  }

  /* Чаша: от круга с таймером расходятся кольца, как звук от удара по чаше. */
  function bowlInit(){ return { rings: [], next: 0 }; }
  function bowlDraw(c, s, w, h, dt, time){
    var cx = anchor.x * w, cy = anchor.y * h, r0 = anchor.r;
    s.next -= dt;
    if (s.next <= 0){ s.rings.push({ r: r0 * 0.95, life: 0 }); s.next = 2.8; }
    for (var i = s.rings.length - 1; i >= 0; i--){
      var ring = s.rings[i];
      ring.life += dt / 7; ring.r += dt * 42;
      if (ring.life >= 1){ s.rings.splice(i, 1); continue; }
      c.strokeStyle = rgba(colors.warm, 0.45 * (1 - ring.life));
      c.lineWidth = 2 * (1 - ring.life) + 0.4;
      c.beginPath();
      for (var a = 0; a <= 64; a++){
        var ang = a / 64 * Math.PI * 2;
        var rr = ring.r + Math.sin(ang * 6 + time * 1.8 + i) * 1.6 * (1 - ring.life);
        var x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
        if (a) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    }
  }

  /* Рассвет: тёплое зарево поднимается от нижнего края, медленные лучи и
     стайки птиц, пролетающие поперёк. */
  function dawnInit(w, h){
    var rays = [];
    for (var i = 0; i < 12; i++) rays.push({ a: -Math.PI + (i + 0.5) * Math.PI / 12, wd: rand(0.04, 0.09) });
    return { rays: rays, birds: [], next: 1.5, turn: 0 };
  }
  function dawnDraw(c, s, w, h, dt, time){
    var sx = w / 2, sy = h * 1.05, R = Math.max(w, h) * 0.95;
    var pulse = 0.85 + 0.15 * Math.sin(time * 0.25);
    var g = c.createRadialGradient(sx, sy, 0, sx, sy, R);
    g.addColorStop(0, 'hsla(36,95%,62%,' + (0.26 * pulse).toFixed(3) + ')');
    g.addColorStop(0.35, 'hsla(28,90%,62%,' + (0.1 * pulse).toFixed(3) + ')');
    g.addColorStop(1, 'hsla(28,90%,62%,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    s.turn += dt * 0.02;
    s.rays.forEach(function(r){
      var a = r.a + s.turn;
      c.fillStyle = 'hsla(40,95%,65%,0.035)';
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + Math.cos(a - r.wd) * R, sy + Math.sin(a - r.wd) * R);
      c.lineTo(sx + Math.cos(a + r.wd) * R, sy + Math.sin(a + r.wd) * R);
      c.closePath(); c.fill();
    });

    s.next -= dt;
    if (s.next <= 0){
      var n = Math.floor(rand(2, 5)), y = rand(0.15, 0.5) * h;
      for (var k = 0; k < n; k++) s.birds.push({ x: -20 - k * rand(18, 30), y: y + rand(-14, 14), v: rand(55, 80), sz: rand(5, 9), ph: rand(0, 6.28) });
      s.next = rand(6, 12);
    }
    c.lineWidth = 1.3; c.lineCap = 'round';
    for (var j = s.birds.length - 1; j >= 0; j--){
      var b = s.birds[j];
      b.x += b.v * dt; b.y += Math.sin(time * 1.5 + b.ph) * 6 * dt;
      if (b.x > w + 30){ s.birds.splice(j, 1); continue; }
      var flap = Math.sin(time * 7 + b.ph) * b.sz * 0.6;
      c.strokeStyle = rgba(colors.fg, 0.35);
      c.beginPath();
      c.moveTo(b.x - b.sz, b.y - flap);
      c.quadraticCurveTo(b.x - b.sz * 0.4, b.y - flap * 0.2, b.x, b.y);
      c.quadraticCurveTo(b.x + b.sz * 0.4, b.y - flap * 0.2, b.x + b.sz, b.y - flap);
      c.stroke();
    }
  }

  /* Вершина: горы в три слоя по низу и снег, который несёт порывами. */
  function snowInit(w, h){
    var ridges = [];
    for (var L = 0; L < 3; L++){
      var pts = [], x = -20, base = h * (0.62 + L * 0.1);
      while (x < w + 40){
        pts.push([x, base - rand(0.04, 0.22) * h * (1 - L * 0.2)]);
        x += rand(50, 110);
      }
      ridges.push(pts);
    }
    var flakes = [];
    for (var i = 0; i < 130; i++) flakes.push({ x: rand(0, w), y: rand(0, h), r: rand(1, 3), vy: rand(14, 38), d: rand(0.5, 1.2), ph: rand(0, 6.28) });
    return { ridges: ridges, flakes: flakes };
  }
  function snowDraw(c, s, w, h, dt, time){
    s.ridges.forEach(function(pts, L){
      c.fillStyle = rgba(colors.fg, 0.07 + L * 0.045);
      c.beginPath(); c.moveTo(-20, h);
      pts.forEach(function(p){ c.lineTo(p[0], p[1]); });
      c.lineTo(w + 40, h); c.closePath(); c.fill();
    });
    var wind = 25 + 45 * Math.max(0, Math.sin(time * 0.35)) + 15 * Math.sin(time * 1.1);
    s.flakes.forEach(function(f){
      f.y += f.vy * dt * f.d; f.x += (wind * f.d + Math.sin(time + f.ph) * 8) * dt;
      if (f.y > h + 4){ f.y = -4; f.x = rand(-w * 0.2, w); }
      if (f.x > w + 4){ f.x = -4; f.y = rand(0, h); }
      c.fillStyle = rgba(colors.dark ? colors.fg : colors.accent, 0.26 + 0.3 * f.d);
      c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill();
    });
  }

  var SCENES = {
    rain:      { init: function(w, h){ return rainInit(w, h, false); }, draw: rainDraw },
    storm:     { init: function(w, h){ return rainInit(w, h, true); },  draw: stormDraw },
    forest:    { init: forestInit, draw: forestDraw },
    stream:    { init: streamInit, draw: streamDraw },
    fireplace: { init: fireInit,   draw: fireDraw },
    flute:     { init: fluteInit,  draw: fluteDraw },
    wind:      { init: windInit,   draw: windDraw },
    surf:      { init: surfInit,   draw: surfDraw },
    night:     { init: nightInit,  draw: nightDraw },
    bowl:      { init: bowlInit,   draw: bowlDraw },
    dawn:      { init: dawnInit,   draw: dawnDraw },
    snow:      { init: snowInit,   draw: snowDraw }
  };

  /* ============ ЖИЗНЬ ХОЛСТА ============ */

  function currentSound(){
    try { return soundOf(S.meditation.sound).id; } catch (e){ return 'rain'; }
  }

  /// Цель силы сцены по состоянию сеанса; сама сила подтягивается к ней
  /// плавно, чтобы старт и пауза не дёргали картинку.
  function targets(){
    if (typeof med === 'undefined') return [0.45, 0.75];
    if (med.running && med.paused) return [0.08, 0.6];
    if (med.running || med.preview) return [1, 1];
    return [0.45, 0.75];
  }

  function resize(){
    if (!card) return;
    var r = card.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    var dial = card.querySelector('.med-dial');
    if (dial){
      var d = dial.getBoundingClientRect();
      anchor = { x: (d.left + d.width / 2 - r.left) / w, y: (d.top + d.height / 2 - r.top) / h, r: d.width / 2 };
    }
    if (w === W && h === H && dpr === DPR) return;
    W = w; H = h; DPR = dpr;
    canvas.width = w * dpr; canvas.height = h * dpr;
    // Новый размер — новая раскладка частиц: растянутые старые сбились бы
    // в угол или вылезли за край.
    if (scene) state = scene.init(W, H);
  }

  function step(rdt){
    if (!ctx || !W) return;
    if (!colors || Date.now() - colorsAt > 1500) readColors();

    var id = currentSound();
    if (id !== sceneId){
      sceneId = id;
      scene = SCENES[id] || SCENES.rain;
      state = scene.init(W, H);
      fade = 0;
    }

    var tg = targets();
    var ease = Math.min(1, rdt * 2.5);
    speedK += (tg[0] - speedK) * ease;
    alphaK += (tg[1] - alphaK) * ease;
    fade = Math.min(1, fade + rdt * 1.2);

    var dt = rdt * speedK;
    t += dt;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = alphaK * fade;
    scene.draw(ctx, state, W, H, dt, t, rdt);
    ctx.globalAlpha = 1;
  }

  function frame(now){
    if (!canvas || !canvas.isConnected || typeof S === 'undefined' || S.view !== 'meditation'){
      looping = false;
      return;
    }
    var rdt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    step(rdt);
    global.requestAnimationFrame(frame);
  }

  function start(){
    if (REDUCED && REDUCED.matches){
      // Один неподвижный кадр: сцену видно, движения нет.
      sceneId = '';
      step(0.016);
      for (var i = 0; i < 90; i++) step(0.05);
      return;
    }
    if (looping) return;
    looping = true;
    last = 0;
    global.requestAnimationFrame(frame);
  }

  /* После каждой отрисовки ищем карточку медитации и вставляем в неё тот же
     холст. Наблюдаем только прямых детей #app: render() заменяет их целиком,
     а тик часов внутри карточки нас не касается. */
  function mount(){
    var found = document.querySelector('#app .card.med');
    if (!found){ card = null; return; }
    if (!canvas){
      canvas = document.createElement('canvas');
      canvas.className = 'med-scene';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d');
    }
    if (found !== card){
      card = found;
      card.insertBefore(canvas, card.firstChild);
      if (global.ResizeObserver){
        if (sizeWatch) sizeWatch.disconnect();
        sizeWatch = new ResizeObserver(resize);
        sizeWatch.observe(card);
      }
      readColors();
      resize();
      if (!scene){ step(0.016); }
    }
    start();
  }

  function install(){
    var app = document.getElementById('app');
    if (!app || !global.MutationObserver) return;
    new MutationObserver(mount).observe(app, { childList: true });
    mount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  /* Для проверки руками: прокрутить сцену на n секунд вперёд. Полезно там,
     где кадры не идут (вкладка в фоне, встроенный просмотрщик). */
  global.SynMedScene = { step: function(sec){ for (var i = 0; i < Math.round((sec || 1) / 0.05); i++) step(0.05); } };
})(window);

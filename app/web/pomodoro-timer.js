/* Убывающее время на карточке помодоро — только для веб-версии.

   Цифры отсчёта говорят, сколько осталось, но не показывают этого: «14:32»
   надо прочесть и сравнить с двадцатью пятью в голове. Здесь время видно
   формой:

     * карточка налита цветом режима — томатным у фокуса, зелёным у
       перерыва, синим у длинного перерыва, — и уровень опускается вместе с
       отсчётом: полная в начале, пустая к концу. Поверхность колышется, пока
       таймер идёт по-настоящему, со дна поднимаются пузырьки;
     * под цифрами тлеет фитиль: он сгорает с обоих краёв к середине, на
       концах — искры.

   Сброс и смена режима наливают карточку заново — тоже анимацией, а не
   скачком.

   Как и фон медитации (meditation-scenes.js), app.js не правится. Время
   берётся из тех же часов, что у тикера: S.pomodoro.endsAt, пока таймер
   идёт, и remaining, пока стоит. Поэтому уровень опускается плавно, а не
   ступеньками раз в секунду, и сходится с цифрами.

   Холст один на всё время и после каждой отрисовки экрана переставляется в
   новую карточку — так же, как у медитации.

   При «уменьшить движение» в системе волна и пузырьки замирают, а уровень
   и фитиль по-прежнему убывают — это не движение ради движения, а сами
   данные. */

(function (global) {
  'use strict';

  var canvas = null, ctx = null, card = null, sizeWatch = null;
  var W = 0, H = 0, DPR = 1;
  var shown = 1;               // уровень на экране, догоняет настоящий
  var phase = 0, last = 0, looping = false;
  var bubbles = [];
  var fuse = { x: 0.5, y: 0.3, w: 200 };
  var fg = [40, 40, 40], dark = false, colorsAt = 0;
  var REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');

  /* Цвет режима. Томат у фокуса — сам знак помодоро; перерывы — спокойнее. */
  var HUES = { focus: [6, 72, 56], shortBreak: [145, 42, 46], longBreak: [205, 55, 52] };

  function toHsl(c){
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, sat = 0;
    if (max !== min){
      var d = max - min;
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    // Светлоту держим в коридоре прежнего томата: вода должна просвечивать.
    return [Math.round(h * 360), Math.round(Math.max(28, sat * 100)), Math.round(Math.min(62, Math.max(44, l * 100)))];
  }

  function hsla(c, a){ return 'hsla(' + c[0] + ',' + c[1] + '%,' + c[2] + '%,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
  function rgba(c, a){ return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }

  var probe = document.createElement('canvas').getContext('2d');
  function readColors(){
    probe.fillStyle = '#000';
    probe.fillStyle = (getComputedStyle(card || document.documentElement).getPropertyValue('--fg') || '').trim() || '#2a2a2a';
    var c = probe.fillStyle;
    if (c.charAt(0) === '#') fg = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    else { var m = c.match(/[\d.]+/g) || [40, 40, 40]; fg = [Number(m[0]), Number(m[1]), Number(m[2])]; }
    dark = document.documentElement.getAttribute('data-dark') === '1';
    /* Фокус — в цвете темы, как на айфоне: в «Закате» он оранжевый, в
       «Лесе» зелёный. Томат был знаком помодоро, но на экране, где всё
       остальное в цвете темы, он читался чужим. Перерывы остаются своими —
       зелёный и синий, — чтобы отдых не путался с работой. */
    probe.fillStyle = '#000';
    probe.fillStyle = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '').trim() || '#d9603b';
    var ac = probe.fillStyle, rgb;
    if (ac.charAt(0) === '#') rgb = [parseInt(ac.slice(1, 3), 16), parseInt(ac.slice(3, 5), 16), parseInt(ac.slice(5, 7), 16)];
    else { var am = ac.match(/[\d.]+/g) || [217, 96, 59]; rgb = [Number(am[0]), Number(am[1]), Number(am[2])]; }
    HUES.focus = toHsl(rgb);
    colorsAt = Date.now();
  }

  /* ---- сколько осталось ---- */

  function modeNow(){
    try { return modeOf(); } catch (e){ return { id: 'focus', key: 'focus' }; }
  }

  /// Доля оставшегося времени, 0…1. Пока таймер идёт — по часам с точностью
  /// до кадра; стоит — по remaining; ещё не трогали — полная.
  function fraction(){
    var m = modeNow();
    var total = (S.pomodoro[m.key] || 1) * 60;
    var left;
    if (S.pomodoro.endsAt) left = Math.max(0, (S.pomodoro.endsAt - Date.now()) / 1000);
    else left = (typeof remaining === 'number' && remaining !== null) ? remaining : total;
    return Math.max(0, Math.min(1, left / total));
  }

  function running(){ return !!S.pomodoro.endsAt; }

  /* ---- кадр ---- */

  function draw(rdt){
    if (!ctx || !W) return;
    if (Date.now() - colorsAt > 1500) readColors();

    var still = REDUCED && REDUCED.matches;
    var go = running();
    var target = fraction();
    // Наливается заметно (сброс, смена режима), убывает вровень с часами.
    var gap = target - shown;
    shown += gap > 0.002 ? Math.min(gap, rdt * 1.6) : gap;

    var hue = HUES[modeNow().id] || HUES.focus;
    var t = still ? 0 : (phase += rdt * (go ? 1.6 : 0.6));

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* Уровень. Пустая карточка — совсем без цвета; полная — до самого верха,
       с запасом под волну, чтобы гребни не обрезались краем. */
    var top = H * (1 - shown) - 4;
    var amp = still ? 0 : (go ? 6 : 3.5) * Math.min(1, shown * 6);
    if (shown > 0.001){
      var surf = [];
      for (var x = 0; x <= W + 8; x += 8){
        surf.push([x, top + amp * Math.sin(x * 0.018 + t * 2) + amp * 0.5 * Math.sin(x * 0.041 - t * 1.3)]);
      }
      var g = ctx.createLinearGradient(0, top, 0, H);
      g.addColorStop(0, hsla(hue, dark ? 0.2 : 0.17));
      g.addColorStop(1, hsla(hue, dark ? 0.32 : 0.28));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, H);
      surf.forEach(function(p){ ctx.lineTo(p[0], p[1]); });
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = hsla(hue, 0.55);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      surf.forEach(function(p, i){ if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();

      // Вторая, бледная волна чуть ниже — у жидкости появляется толща.
      ctx.strokeStyle = hsla(hue, 0.18);
      ctx.beginPath();
      for (var x2 = 0; x2 <= W + 8; x2 += 8){
        var y2 = top + 9 + amp * 0.8 * Math.sin(x2 * 0.022 - t * 1.7 + 1);
        if (x2) ctx.lineTo(x2, y2); else ctx.moveTo(x2, y2);
      }
      ctx.stroke();
    }

    /* Пузырьки — только пока время идёт: в стоящей воде их не бывает. */
    if (!still && go && shown > 0.05 && Math.random() < rdt * 5 && bubbles.length < 30){
      bubbles.push({ x: Math.random() * W, y: H + 4, r: 1.5 + Math.random() * 3, v: 25 + Math.random() * 35, ph: Math.random() * 6.28 });
    }
    for (var i = bubbles.length - 1; i >= 0; i--){
      var b = bubbles[i];
      if (!still){ b.y -= b.v * rdt; b.x += Math.sin(t * 2 + b.ph) * 10 * rdt; }
      if (b.y < top + 4 || !go){ bubbles.splice(i, 1); continue; }
      ctx.strokeStyle = hsla(hue, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    }

    /* Фитиль под цифрами: тускло — сколько было, ярко — сколько осталось. */
    var fx = fuse.x * W, fy = fuse.y * H, full = fuse.w;
    var half = full / 2 * shown;
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(fg, 0.1);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fx - full / 2, fy); ctx.lineTo(fx + full / 2, fy); ctx.stroke();
    if (half > 0.5){
      ctx.strokeStyle = hsla(hue, 0.85);
      ctx.beginPath(); ctx.moveTo(fx - half, fy); ctx.lineTo(fx + half, fy); ctx.stroke();
      if (go){
        var flick = still ? 1 : 0.7 + 0.3 * Math.sin(t * 23) * Math.sin(t * 7.3);
        [-1, 1].forEach(function(side){
          var sx = fx + side * half;
          ctx.fillStyle = 'hsla(38,100%,62%,' + (0.25 * flick).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(sx, fy, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'hsla(42,100%,70%,' + (0.95 * flick).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(sx, fy, 2.4, 0, Math.PI * 2); ctx.fill();
        });
      }
    }
  }

  function frame(now){
    if (!canvas || !canvas.isConnected || typeof S === 'undefined' || S.view !== 'pomodoro'){
      looping = false;
      return;
    }
    var rdt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    draw(rdt);
    global.requestAnimationFrame(frame);
  }

  function start(){
    if (looping) return;
    looping = true;
    last = 0;
    global.requestAnimationFrame(frame);
  }

  /* ---- размер и место фитиля ---- */

  function resize(){
    if (!card) return;
    var r = card.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    var face = document.getElementById('clockface');
    if (face){
      var f = face.getBoundingClientRect();
      // Фитиль чуть шире цифр и прямо под ними, между цифрами и подписью режима.
      fuse = { x: (f.left + f.width / 2 - r.left) / w, y: (f.bottom - r.top + 9) / h,
               w: Math.min(w * 0.8, Math.max(140, measureDigits(face) * 1.25)) };
    }
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    if (w === W && h === H && dpr === DPR) return;
    W = w; H = h; DPR = dpr;
    canvas.width = w * dpr; canvas.height = h * dpr;
  }

  /// Ширина самих цифр, а не блока: .clock растянут на всю карточку.
  function measureDigits(face){
    var range = document.createRange();
    range.selectNodeContents(face);
    var rect = range.getBoundingClientRect();
    return rect.width || 180;
  }

  /* ---- место в разметке ---- */

  function mount(){
    var face = typeof S !== 'undefined' && S.view === 'pomodoro' && document.getElementById('clockface');
    var found = face && face.closest('.card');
    if (!found){ card = null; return; }
    if (!canvas){
      canvas = document.createElement('canvas');
      canvas.className = 'pomo-live-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d');
    }
    found.classList.add('pomo-live');
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
      draw(0.016);
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

  /* Для проверки руками там, где кадры не идут: прокрутить на n секунд. */
  global.SynPomoLive = { step: function(sec){ for (var i = 0; i < Math.round((sec || 1) / 0.05); i++) draw(0.05); } };
})(window);

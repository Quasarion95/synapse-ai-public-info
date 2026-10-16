/* Цветовая система веб-версии — только веб.

   Прежние палитры (app.js, PALETTES) строились одним приёмом: бумажный фон,
   карточка на пару единиц светлее, приглушённый акцент — тёмно-зелёный,
   коричневый, винный. Все двадцать пять выходили одной и той же монотонной
   бумагой разного оттенка, и через пять минут от неё уставали глаза.

   Здесь система другая, по двум выбранным макетам:

     * светлая тема — «Чистый светлый»: белые карточки на холодном светлом
       фоне, тёмный чёткий текст, один сочный фирменный цвет;
     * тёмная тема — «Тёмный премиум»: глубокий графит, карточки чуть
       светлее, яркий фирменный цвет с градиентом.

   Палитра больше не красит бумагу, а задаёт фирменную пару цветов для
   градиента: «Бумага» — индиго с фиолетовым (основная тема), «Лес» —
   изумруд, «Бордо» — малиновый, «Море» — бирюза, «Уголь» — строгий
   монохром… Пары подобраны руками для каждой палитры и для каждой темы:
   формулой «добавить насыщенности» половина выходила грязной.

   Каждому разделу — свой цвет (задачи синие, цели фиолетовые, помодоро
   томатный, финансы зелёные…): он одинаковый во всех палитрах, чтобы раздел
   узнавался по цвету, и живёт в значке меню и акцентах раздела.

   Как встроено: applyTheme в app.js по-прежнему считает свои переменные, а
   этот файл сразу после неё переписывает их на новую систему. Сам app.js и
   андроид не тронуты. */

(function (global) {
  'use strict';

  /* Фирменная пара на палитру: [светлая тема], [тёмная тема]. Первый цвет —
     основной (кнопки, выбранное), второй — конец градиента. */
  var BRANDS = {
    paper:       [['#5B5BF6', '#8B6CFF'], ['#7C5CFF', '#3E8BFF']],
    graphite:    [['#3E6AE1', '#56A0F5'], ['#6A8CFF', '#45B4FF']],
    forest:      [['#0E9F6E', '#2BC48A'], ['#34D399', '#22C1A6']],
    brass:       [['#C98A0B', '#E8AE36'], ['#F5B83D', '#FFD36B']],
    burgundy:    [['#D6334D', '#F0567A'], ['#FF5C7A', '#FF8A9F']],
    tobacco:     [['#CF6418', '#EF8F3C'], ['#FF9550', '#FFB36B']],
    indigo:      [['#4F46E5', '#6D7BFF'], ['#7B83FF', '#5AA2FF']],
    plum:        [['#A23DD1', '#D05ADF'], ['#C77DFF', '#E879F9']],
    sea:         [['#0B95A3', '#22C3C9'], ['#2DD4D9', '#38BDF8']],
    charcoal:    [['#1C1F26', '#4A5263'], ['#F1F2F5', '#B7BCC8']],
    nightbark:   [['#0082CC', '#1FB0F2'], ['#4FB6FF', '#7FD0FF']],
    ember:       [['#EA5418', '#FF8A3D'], ['#FF7A3D', '#FFA05C']],
    slate:       [['#2F8FD8', '#4FB3F0'], ['#6CBFFF', '#8FD3FF']],
    editorial:   [['#C2522A', '#E07B45'], ['#F08B5E', '#FFAA7F']],
    neon:        [['#1E9E2C', '#46C22A'], ['#A3FF3D', '#5CFF8A']],
    kraft:       [['#EE6234', '#FF8F5C'], ['#FF8A5C', '#FFB089']],
    ultraviolet: [['#7048E8', '#9B6BFF'], ['#A78BFA', '#C4B5FD']],
    atheneum:    [['#A9822F', '#CFAA5C'], ['#D9B66B', '#EED39A']],
    cobalt:      [['#1E50E6', '#3D7BFF'], ['#6C8CFF', '#4FA3FF']],
    hunter:      [['#1C7A4C', '#2FA36A'], ['#5FD39A', '#3CC9A0']],
    wineclub:    [['#A3243B', '#C7425B'], ['#F2788E', '#FF9AAE']],
    navy:        [['#1E4C8A', '#2F6FC0'], ['#7FA8E6', '#9CC2FF']],
    camel:       [['#AA7434', '#D09A55'], ['#E0B07A', '#F2CB98']],
    ivory:       [['#5F7F50', '#8FAE7A'], ['#A9C79A', '#C3DDB5']],
    study:       [['#A27A10', '#C99A2E'], ['#E2B84A', '#F2D27A']]
  };

  /* Цвета разделов — по макетам A и B. Одни на все палитры. */
  var SECTIONS = {
    light: { tasks:'#2E90FA', goals:'#7A5AF8', focus:'#06AED4', map:'#F79009', lists:'#12B76A',
             notes:'#EAAA08', pomo:'#F04438', med:'#15B79E', fin:'#16B364', trash:'#98A2B3',
             sub:'#EE46BC', set:'#667085' },
    dark:  { tasks:'#4DA3FF', goals:'#A78BFA', focus:'#22D3EE', map:'#FBBF24', lists:'#34D399',
             notes:'#FACC15', pomo:'#FF6B6B', med:'#2DD4BF', fin:'#3DDC97', trash:'#8A93A6',
             sub:'#F472B6', set:'#94A3B8' }
  };

  /* Нейтральная основа — макеты A и B. Чуть подкрашивается фирменным цветом,
     чтобы «Лес» и «Бордо» отличались не только кнопками. */
  var BASE = {
    light: { bg:[244,245,248], card:[255,255,255], soft:[243,244,247], line:[229,231,237],
             fg:[14,20,36], fg2:[75,84,102], fg3:[134,143,160] },
    dark:  { bg:[11,13,18], card:[18,21,29], soft:[26,30,40], line:[36,41,56],
             fg:[242,244,248], fg2:[166,174,192], fg3:[112,120,138] }
  };

  var STATUS = {
    light: { ok:[18,183,106], bad:[226,59,49], warn:[226,128,8] },
    dark:  { ok:[61,220,151], bad:[255,93,115], warn:[255,181,71] }
  };

  function hex(h){ return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
  function rgb(c){ return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function rgba(c, a){ return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }
  function mix(a, b, t){ return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t]; }

  /// Относительная яркость по WCAG — для выбора текста поверх заливки и для
  /// проверки, читается ли фирменный цвет буквами на карточке.
  function lum(c){
    var f = function(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b){
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /// Фирменный цвет буквами: притемняем (или осветляем в тёмной теме), пока
  /// не наберётся 4,5 к карточке. Кнопке хватает и яркого, мелкому тексту нет.
  function readable(c, on, dark){
    var out = c.slice(), target = dark ? [255,255,255] : [0,0,0], i = 0;
    while (contrast(out, on) < 4.5 && i++ < 20) out = mix(out, target, 0.08);
    return out;
  }

  function isDark(){
    try { return typeof isDarkNow === 'function' ? isDarkNow() : document.documentElement.getAttribute('data-dark') === '1'; }
    catch (e){ return false; }
  }

  /* Смягчение фирменного цвета.

     Пары в BRANDS подобраны «на максимум» — так их проще сравнивать между
     собой. На экране таким цветом залиты кнопки, выбранное, полосы и баннер,
     и в полную силу он выходил ядовитым: владелец так и сказал — «чуть-чуть
     мягче бы». Здесь насыщенность снижается примерно на четверть, а
     светлота подтягивается в спокойный коридор: в светлой теме цвет не
     светится, в тёмной не гаснет. Оттенок не трогаем — «Лес» остаётся
     зелёным, «Бордо» — винным. */
  var SOFT_S = 0.74;
  var SOFT_L = { light: [0.44, 0.58], dark: [0.62, 0.74] };

  function toHsl(c){
    var r = c[0]/255, g = c[1]/255, b = c[2]/255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
    if (max !== min){
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l){
    if (!s) return [l*255, l*255, l*255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    var f = function(t){
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    return [f(h + 1/3) * 255, f(h) * 255, f(h - 1/3) * 255];
  }
  function soften(c, dark){
    var hsl = toHsl(c), band = SOFT_L[dark ? 'dark' : 'light'];
    // Почти серые (монохром «Уголь») не трогаем: смягчать в них нечего.
    if (hsl[1] < 0.12) return c;
    return fromHsl(hsl[0], hsl[1] * SOFT_S, Math.min(band[1], Math.max(band[0], hsl[2])));
  }

  function brandPair(id, dark){
    var b = BRANDS[id] || BRANDS.paper;
    var pair = b[dark ? 1 : 0];
    var one = soften(hex(pair[0]), dark);
    // Концы градиента ближе друг к другу: остаётся перелив, а не переход
    // между двумя разными цветами.
    var two = mix(one, soften(hex(pair[1]), dark), 0.55);
    return [one, two];
  }

  function apply(){
    if (typeof S === 'undefined') return;
    var dark = isDark();
    var mode = dark ? 'dark' : 'light';
    var base = BASE[mode], st = STATUS[mode], sec = SECTIONS[mode];
    var pair = brandPair(S.palette, dark), brand = pair[0], brand2 = pair[1];

    var bg = mix(base.bg, brand, dark ? 0.05 : 0.025);
    var card = dark ? mix(base.card, brand, 0.035) : base.card;
    var soft = mix(base.soft, brand, dark ? 0.05 : 0.03);
    var line = mix(base.line, brand, dark ? 0.06 : 0.04);
    var mid = mix(brand, brand2, 0.5);
    var onBrand = lum(mid) > 0.45 ? 'rgb(14,20,36)' : '#FFFFFF';

    var r = document.documentElement.style;
    r.setProperty('--background', rgb(bg));
    r.setProperty('--panel', rgb(card));
    r.setProperty('--panel-strong', rgb(soft));
    r.setProperty('--stroke', rgb(line));
    r.setProperty('--text', rgb(base.fg));
    r.setProperty('--text-2', rgb(base.fg2));
    r.setProperty('--fg-3', rgb(base.fg3));

    r.setProperty('--accent', rgb(brand));
    r.setProperty('--brand-2', rgb(brand2));
    r.setProperty('--grad', 'linear-gradient(135deg, ' + rgb(brand) + ', ' + rgb(brand2) + ')');
    r.setProperty('--accent-soft', rgba(brand, dark ? 0.18 : 0.1));
    r.setProperty('--accent-text', rgb(readable(brand, card, dark)));
    r.setProperty('--on-accent', onBrand);

    r.setProperty('--focus-green', rgb(st.ok));
    r.setProperty('--pos', rgb(st.ok));
    r.setProperty('--danger', rgb(st.bad));
    r.setProperty('--neg', rgb(st.bad));
    r.setProperty('--on-danger', '#FFFFFF');
    r.setProperty('--warn', rgb(st.warn));
    r.setProperty('--accent-warm', rgb(st.warn));
    r.setProperty('--ok-soft', rgba(st.ok, dark ? 0.14 : 0.1));
    r.setProperty('--bad-soft', rgba(st.bad, dark ? 0.15 : 0.09));
    r.setProperty('--warn-soft', rgba(st.warn, dark ? 0.15 : 0.1));

    r.setProperty('--shadow', dark
      ? '0 1px 0 rgba(255,255,255,.035) inset, 0 8px 24px -14px rgba(0,0,0,.7)'
      : '0 1px 2px rgba(16,24,40,.05), 0 2px 6px rgba(16,24,40,.05)');
    r.setProperty('--shadow-lift', dark
      ? '0 16px 40px -20px ' + rgba(brand, 0.32)
      : '0 12px 28px -16px ' + rgba(brand, 0.28));

    Object.keys(sec).forEach(function(k){ r.setProperty('--c-' + k, sec[k]); });
    swatches(dark);
  }

  /* Образцы палитр в настройках — фирменной парой, а не бумажным фоном с
     точкой: человек выбирает цвет, который увидит на кнопках. */
  var swatchStyle = null;
  function swatches(dark){
    if (!swatchStyle){
      swatchStyle = document.createElement('style');
      swatchStyle.id = 'syn-swatches';
      document.head.appendChild(swatchStyle);
    }
    swatchStyle.textContent = Object.keys(BRANDS).map(function(id){
      var p = brandPair(id, dark);
      return '.radio.pal[data-palette="' + id + '"] .sw{background:linear-gradient(135deg,' + rgb(p[0]) + ',' + rgb(p[1]) + ') !important; border-color:transparent !important}';
    }).join('\n') + '\n.radio.pal .sw i{display:none}';
  }

  /* Карта целей рисуется SVG, и цвета узлов вписаны в разметку из старой
     палитры. Стили их перекрывают (theme.css), но выполненная задача и
     закрытый этап отличаются только оттенком заливки — помечаем узлы
     классом по тому, каким цветом их нарисовал app.js: акцентом — этап или
     цель, иначе — задача. */
  function markMap(){
    var svg = document.querySelector('#app .mmwrap svg, .mmfull .mmwrap svg');
    if (!svg || typeof themeColors !== 'function') return;
    var accent = themeColors().accent.map(Math.round).join(',');
    svg.querySelectorAll('rect.mm-node.done').forEach(function(r){
      var stroke = (r.getAttribute('stroke') || '').replace(/\s/g, '');
      r.classList.add(stroke.indexOf('(' + accent + ',') !== -1 ? 'mm-goal' : 'mm-task');
    });
  }

  /* applyTheme объявлен в app.js, который грузится после этого файла.
     Оборачиваем его, когда страница разобрана, и сразу перекрашиваем — первая
     отрисовка уже прошла со старыми цветами, и без этого вызова новые
     появились бы только со следующей. */
  function install(){
    if (typeof global.applyTheme !== 'function') return;
    var base = global.applyTheme;
    global.applyTheme = function(){
      base.apply(this, arguments);
      try { apply(); } catch (e){}
    };
    apply();
    var app = document.getElementById('app');
    if (app && global.MutationObserver){
      new MutationObserver(markMap).observe(app, { childList: true });
      markMap();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  global.SynTheme = { apply: apply, brands: BRANDS };
})(window);

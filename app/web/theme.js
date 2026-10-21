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
   градиента: «Закат» — основная тема (как на айфоне), «Лес» —
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
     основной (кнопки, выбранное), второй — конец градиента.

     Цвета подобраны заново (21.10.2026). Темы шли парами-двойниками:
     «Индиго» и «Ультрафиолет», «Кобальт», «Графит» и «Нэви», «Бордо» и
     «Винный клуб», «Крафт» и «Эмбер», «Тёмный кабинет» и «Атенеум»,
     «Ночная кора» и «Слейт» — на плитках их было не отличить, а у
     «Графита» с «Кобальтом» в тёмной теме цвет совпадал до единицы.

     Каждой теме теперь — своё место на цветовом круге, а где оттенки
     соседние, их разводят светлота и насыщенность (контрасты Иттена: по
     тону, по светлоте, по насыщенности). Проверено расчётом: любые две темы
     расходятся в пространстве Lab не меньше, чем «Закат» с «Кораллом», и в
     светлой, и в тёмной теме. Основной цвет светлой темы держит белую
     подпись (контраст от 3,2), тёмной — тёмную.

     Пары задаются уже готовыми, без поправки формулой: прежняя «мягкость»
     сводила светлоту всех тем в один коридор, и тёмная хвоя с сочным
     изумрудом выходили одним зелёным. «Закат», «Коралл» и «Кобальт» — ровно
     те же цвета, что были. */
  var BRANDS = {
    /* «Закат» и «Коралл» — из приложения для айфона: акцент и тёплый акцент
       оттуда же, светлая и тёмная пара. */
    sunset:      [['#E05F3B', '#E68F33'], ['#FA9E7A', '#FABB71']],
    coral:       [['#E04E63', '#EF7852'], ['#F88E8D', '#FBA77F']],
    cobalt:      [['#385DCC', '#4272DE'], ['#7F97EC', '#6BA1E9']],

    /* Нейтральные: «Уголь» почти чёрный, «Графит» — серый без оттенка,
       «Атенеум» — тёплый камень. Различаются светлотой, а не цветом. */
    charcoal:    [['#232327', '#33343A'], ['#EDEDEF', '#DFDFE2']],
    graphite:    [['#5F626D', '#707180'], ['#90939F', '#A6A7B2']],
    atheneum:    [['#7E755B', '#938D6A'], ['#C8C2B2', '#D9D7CA']],

    /* Синие — от бирюзы к ночи. «Море» бирюзовое, «Ночная кора» —
       небесная, «Слейт» — приглушённый серо-голубой, «Нэви» — глубокий
       тёмный, «Кобальт» — чистый синий (прежний, не тронут). */
    sea:         [['#1C8BA1', '#2190C0'], ['#5ECDE3', '#81CAE9']],
    nightbark:   [['#177ECD', '#2177E6'], ['#5AADED', '#7EB0F1']],
    slate:       [['#5F82AA', '#768CB7'], ['#B4C4D7', '#CED6E5']],
    navy:        [['#21306C', '#2A3087'], ['#A1AEE2', '#C0C3EC']],

    /* Зелёные — по светлоте: «Лес» — сочный изумруд, «Хантер» — тёмная
       хвоя, «Тёмный кабинет» — глубокий сине-зелёный, «Слоновая кость» —
       оливковая. */
    forest:      [['#209B64', '#26B98A'], ['#50DB9C', '#72E2BE']],
    hunter:      [['#2A6037', '#35794F'], ['#81C893', '#9ED4B2']],
    study:       [['#2C6058', '#387977'], ['#80C5BA', '#9CD1D1']],
    ivory:       [['#86923A', '#8FAB44'], ['#BCC874', '#C2D491']],

    /* Тёплые: «Латунь» — золото, «Эмбер» — янтарь, «Крафт» — бумажный
       коричневый, «Винный клуб» — марсала. */
    brass:       [['#B08917', '#CFB91B'], ['#E6BC42', '#EBDB66']],
    ember:       [['#D46E12', '#EB9B1F'], ['#F09D53', '#F3C378']],
    kraft:       [['#9A6042', '#B27D4D'], ['#CEA38D', '#DAC1A9']],
    wineclub:    [['#743938', '#8C4F44'], ['#C07E7C', '#CDA098']],

    /* Красно-фиолетовые: «Бордо» — малиново-винный, «Слива» —
       пурпурная, «Ультрафиолет» — яркий фиолетовый, «Индиго» — сине-
       фиолетовый. */
    burgundy:    [['#8C2651', '#A82E51'], ['#E294B5', '#EBB4C4']],
    plum:        [['#93388C', '#AC4297'], ['#D28BCD', '#DEA8D3']],
    ultraviolet: [['#A22FE4', '#C44FE8'], ['#CA89F0', '#E4ADF4']],
    indigo:      [['#5544E4', '#7956E6'], ['#897DEC', '#B4A1F1']]
  };

  /* Цвета разделов — по макетам A и B. Одни на все палитры.

     С новым видом (21.10.2026) они больше не красят меню: по правилу
     60-30-10 на экране один цвет — цвет темы, — а радуга из одиннадцати
     значков спорила с ним за внимание. Переменные --c-* оставлены (на них
     держится разметка), но apply() кладёт в них цвет темы. */
  var SECTIONS = {
    light: { tasks:'#2E90FA', goals:'#7A5AF8', focus:'#06AED4', map:'#F79009', lists:'#12B76A',
             notes:'#EAAA08', pomo:'#F04438', med:'#15B79E', fin:'#16B364', trash:'#98A2B3',
             sub:'#EE46BC', set:'#667085' },
    dark:  { tasks:'#4DA3FF', goals:'#A78BFA', focus:'#22D3EE', map:'#FBBF24', lists:'#34D399',
             notes:'#FACC15', pomo:'#FF6B6B', med:'#2DD4BF', fin:'#3DDC97', trash:'#8A93A6',
             sub:'#F472B6', set:'#94A3B8' }
  };

  /* Нейтральная основа — по айфону (новый вид, 21.10.2026): поле — тёплый
     серый с каплей цвета темы, карточки белые и отделяются от поля тенью, а
     не рамкой (Refactoring UI: «глубина вместо обводок»). Одно правило на все
     темы: холодный серо-синий прежнего «Чистого светлого» спорил с тёплыми
     темами, а кремовый фон только у «Заката» и «Коралла» делал их другим
     приложением. */
  var BASE = {
    light: { bg:[243,241,240], card:[255,255,255], soft:[245,243,242], line:[236,232,230],
             fg:[24,19,15], fg2:[107,100,97], fg3:[143,136,133] },
    dark:  { bg:[14,14,16], card:[26,26,29], soft:[34,34,38], line:[46,46,51],
             fg:[244,240,238], fg2:[173,166,163], fg3:[127,121,118] }
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

  function brandPair(id, dark){
    var b = BRANDS[id] || BRANDS[FALLBACK];
    var pair = b[dark ? 1 : 0];
    // Концы градиента ближе друг к другу: остаётся перелив, а не переход
    // между двумя разными цветами.
    return [hex(pair[0]), mix(hex(pair[0]), hex(pair[1]), 0.7)];
  }

  function apply(){
    if (typeof S === 'undefined') return;
    var dark = isDark();
    var mode = dark ? 'dark' : 'light';
    var base = BASE[mode], st = STATUS[mode], sec = SECTIONS[mode];
    var pair = brandPair(S.palette, dark), brand = pair[0], brand2 = pair[1];

    var bg = mix(base.bg, brand, dark ? 0.035 : 0.045);
    var card = dark ? mix(base.card, brand, 0.05) : base.card;
    var soft = mix(base.soft, brand, dark ? 0.06 : 0.045);
    var line = mix(base.line, brand, dark ? 0.07 : 0.05);
    var fg = mix(base.fg, brand, dark ? 0 : 0.06);
    var fg2 = mix(base.fg2, brand, dark ? 0.04 : 0.12);
    var mid = mix(brand, brand2, 0.5);
    var onBrand = lum(mid) > 0.45 ? 'rgb(14,20,36)' : '#FFFFFF';

    var r = document.documentElement.style;
    r.setProperty('--background', rgb(bg));
    r.setProperty('--panel', rgb(card));
    r.setProperty('--panel-strong', rgb(soft));
    r.setProperty('--stroke', rgb(line));
    r.setProperty('--text', rgb(fg));
    r.setProperty('--text-2', rgb(fg2));
    r.setProperty('--fg-3', rgb(base.fg3));

    r.setProperty('--accent', rgb(brand));
    r.setProperty('--brand-2', rgb(brand2));
    r.setProperty('--grad', 'linear-gradient(135deg, ' + rgb(brand) + ', ' + rgb(brand2) + ')');
    r.setProperty('--accent-soft', rgba(brand, dark ? 0.18 : 0.1));
    /* Тихая заливка цветом темы, но непрозрачная: ею залиты вторичные
       кнопки и плашки, и полупрозрачная подложка на сером поле и на белой
       карточке давала два разных цвета. */
    r.setProperty('--accent-tint', rgb(mix(card, brand, dark ? 0.18 : 0.1)));
    r.setProperty('--on-accent-soft', onBrand === '#FFFFFF' ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.1)');
    r.setProperty('--glow', '0 10px 24px -12px ' + rgba(brand, dark ? 0.6 : 0.7));
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
      ? '0 1px 2px rgba(0,0,0,.3), 0 14px 34px -14px rgba(0,0,0,.7)'
      : '0 1px 2px rgba(30,20,10,.04), 0 12px 32px -14px rgba(30,20,10,.16)');
    r.setProperty('--shadow-lift', dark
      ? '0 2px 6px rgba(0,0,0,.4), 0 18px 44px -12px rgba(0,0,0,.8)'
      : '0 2px 6px rgba(30,20,10,.06), 0 18px 44px -12px rgba(30,20,10,.28)');

    Object.keys(sec).forEach(function(k){ r.setProperty('--c-' + k, rgb(brand)); });
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

  /* Темы, убранные из веб-версии по решению владельца. В app.js они
     остаются — он общий с андроидом, — а здесь вынимаются из списка
     PALETTES до того, как его кто-то покажет.

     «Бумага» была первой: темой по умолчанию, одной из двух бесплатных и
     запасной для неизвестного id (paletteOf отдаёт PALETTES[0]). Её место
     занимает «Индиго» — ближайшая по цвету к прежней индиго-фиолетовой
     паре «Бумаги», так что новый человек видит то же, что раньше.
     Бесплатные теперь «Закат», «Коралл», «Индиго» и «Графит»; основная —
     «Закат», как в приложении для айфона. */
  var REMOVED = ['paper', 'camel', 'editorial', 'neon', 'tobacco'];
  // Основная тема — «Закат», как на айфоне; «Коралл» сразу за ней.
  var FALLBACK = 'sunset';
  // Порядок в списке: две тёплые, затем прежние бесплатные «Индиго» и
  // «Графит» — четыре бесплатных подряд (FREE_LOOKS.palettes в app.js).
  var FIRST = ['sunset', 'coral', 'indigo', 'graphite'];

  function prunePalettes(){
    if (typeof PALETTES === 'undefined') return;
    for (var i = PALETTES.length - 1; i >= 0; i--){
      if (REMOVED.indexOf(PALETTES[i].id) !== -1) PALETTES.splice(i, 1);
    }
    for (var k = FIRST.length - 1; k >= 0; k--){
      for (var j = 0; j < PALETTES.length; j++){
        if (PALETTES[j].id === FIRST[k]){ PALETTES.unshift(PALETTES.splice(j, 1)[0]); break; }
      }
    }
  }

  /* Кто сидел на убранной теме — переезжает на основную («Закат»). Проверяем при
     каждой перекраске, а не один раз: тема может вернуться из резервной
     копии или с телефона. Сохранится со следующим изменением настроек. */
  function migratePalette(){
    if (typeof S !== 'undefined' && S && REMOVED.indexOf(S.palette) !== -1) S.palette = FALLBACK;
  }

  /* applyTheme объявлен в app.js, который грузится после этого файла.
     Оборачиваем его, когда страница разобрана, и сразу перекрашиваем — первая
     отрисовка уже прошла со старыми цветами, и без этого вызова новые
     появились бы только со следующей. */
  function install(){
    if (typeof global.applyTheme !== 'function') return;
    prunePalettes();
    migratePalette();
    var base = global.applyTheme;
    global.applyTheme = function(){
      migratePalette();
      base.apply(this, arguments);
      try { apply(); } catch (e){}
    };
    base();
    apply();
    if (typeof S !== 'undefined' && String(S.view).indexOf('settings') === 0 && typeof global.render === 'function') global.render();
    var app = document.getElementById('app');
    if (app && global.MutationObserver){
      new MutationObserver(markMap).observe(app, { childList: true });
      markMap();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  /* Цвета для образца темы в настройках — тем же расчётом, что apply():
     поле, карточка, цвет темы и текст, светлой и тёмной половиной. Образец
     обязан совпадать с тем, что человек увидит, нажав. */
  function preview(id){
    var out = {};
    [false, true].forEach(function(dark){
      var mode = dark ? 'dark' : 'light', base = BASE[mode];
      var brand = brandPair(id, dark)[0];
      var card = dark ? mix(base.card, brand, 0.05) : base.card;
      out[mode] = {
        bg: rgb(mix(base.bg, brand, dark ? 0.035 : 0.045)),
        card: rgb(card),
        accent: rgb(brand),
        fg: rgb(dark ? base.fg : mix(base.fg, brand, 0.06)),
        soft: rgb(mix(card, brand, dark ? 0.18 : 0.1))
      };
    });
    return out;
  }

  global.SynTheme = { apply: apply, brands: BRANDS, preview: preview };
})(window);

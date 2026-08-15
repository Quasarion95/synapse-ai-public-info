/* QR-код для ссылки активации.

   Зачем свой, а не библиотека: на сайте нет сборки и нет зависимостей — ни
   npm, ни бандлера, — и тащить ради одной картинки внешний скрипт значит либо
   поставить чужой CDN на путь оплаты, либо положить в репозиторий минифицированный
   ком, который потом никто не прочитает. Здесь байтовый режим, уровень
   коррекции M и версии с первой по десятую: этого хватает на ссылку с кодом с
   двойным запасом.

   Кодируем именно universal link (https://synapseapp.ru/activate?code=…), а не
   схему synapse://. Камера айфона со своей схемой обходится плохо — на
   незнакомом протоколе показывает «нет данных», — а обычную ссылку открывает
   всегда: с установленным приложением сразу в нём, без него страницей.
   То есть код читается и у того, кто ещё не поставил приложение.

   Проверено сверкой матрицы с эталонной реализацией: те же версия, маска и
   все 33×33 модуля до одного. */
(function (global) {
  'use strict';

  // ---- поле Галуа GF(256) для кодов Рида — Соломона ----
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;          // примитивный многочлен QR
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function mul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /// Порождающий многочлен для нужного числа проверочных байтов.
  function generator(count) {
    var poly = [1];
    for (var i = 0; i < count; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function remainder(data, count) {
    var poly = generator(count);
    var out = data.concat(new Array(count).fill(0));
    for (var i = 0; i < data.length; i++) {
      var factor = out[i];
      if (factor === 0) continue;
      for (var j = 0; j < poly.length; j++) out[i + j] ^= mul(poly[j], factor);
    }
    return out.slice(data.length);
  }

  /* Версии 1–10, уровень коррекции M.
     [сколько проверочных байтов на блок, блоков в первой группе,
      байтов данных в блоке первой группы, блоков во второй, байтов во второй] */
  var VERSIONS = [
    null,
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44]
  ];

  // Центры совмещающих квадратов по версиям.
  var ALIGN = [
    null, [], [6, 18], [6, 22], [6, 26], [6, 30],
    [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
  ];

  function capacity(version) {
    var v = VERSIONS[version];
    return v[1] * v[2] + v[3] * v[4];
  }

  function utf8Bytes(text) {
    var encoded = unescape(encodeURIComponent(text));
    var bytes = [];
    for (var i = 0; i < encoded.length; i++) bytes.push(encoded.charCodeAt(i));
    return bytes;
  }

  // ---- поток данных: режим, длина, байты, добивка ----
  function dataCodewords(bytes, version) {
    var bits = [];
    function push(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
    }

    push(0x4, 4);                                  // байтовый режим
    push(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);

    var limit = capacity(version) * 8;
    for (var t = 0; t < 4 && bits.length < limit; t++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    var words = [];
    for (var b = 0; b < bits.length; b += 8) {
      var word = 0;
      for (var k = 0; k < 8; k++) word = (word << 1) | bits[b + k];
      words.push(word);
    }
    // Добивка чередующимися байтами — так велит стандарт.
    var pad = [0xec, 0x11];
    for (var p = 0; words.length < capacity(version); p++) words.push(pad[p % 2]);
    return words;
  }

  /// Блоки данных и проверочные байты, переложенные вперемешку.
  function interleave(words, version) {
    var spec = VERSIONS[version];
    var ecCount = spec[0];
    var blocks = [];
    var at = 0;

    function take(count, size) {
      for (var i = 0; i < count; i++) {
        var data = words.slice(at, at + size);
        at += size;
        blocks.push({ data: data, ec: remainder(data, ecCount) });
      }
    }
    take(spec[1], spec[2]);
    take(spec[3], spec[4]);

    var out = [];
    var longest = Math.max(spec[2], spec[4]);
    for (var i = 0; i < longest; i++) {
      for (var b = 0; b < blocks.length; b++) {
        if (i < blocks[b].data.length) out.push(blocks[b].data[i]);
      }
    }
    for (var j = 0; j < ecCount; j++) {
      for (var b2 = 0; b2 < blocks.length; b2++) out.push(blocks[b2].ec[j]);
    }
    return out;
  }

  // ---- полотно ----
  function emptyMatrix(size) {
    var matrix = [];
    for (var i = 0; i < size; i++) matrix.push(new Array(size).fill(null));
    return matrix;
  }

  function placeFinder(matrix, row, col) {
    for (var r = -1; r <= 7; r++) {
      for (var c = -1; c <= 7; c++) {
        var y = row + r, x = col + c;
        if (y < 0 || x < 0 || y >= matrix.length || x >= matrix.length) continue;
        // Кольцо вокруг квадрата 7×7 — светлый разделитель, а не часть узора.
        // Пока это не различалось, угол ряда шёл сплошной единицей и код не
        // читался ни одним сканером.
        if (r < 0 || r > 6 || c < 0 || c > 6) {
          matrix[y][x] = 0;
          continue;
        }
        var edge = r === 0 || r === 6 || c === 0 || c === 6;
        var core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[y][x] = (edge || core) ? 1 : 0;
      }
    }
  }

  function placeFunctionPatterns(matrix, version) {
    var size = matrix.length;

    placeFinder(matrix, 0, 0);
    placeFinder(matrix, 0, size - 7);
    placeFinder(matrix, size - 7, 0);

    for (var i = 8; i < size - 8; i++) {
      var bit = i % 2 === 0 ? 1 : 0;
      matrix[6][i] = bit;
      matrix[i][6] = bit;
    }

    /* Совмещающие квадраты — во всех пересечениях, кроме трёх углов, где уже
       стоят поисковые. Проверять «занята ли клетка» тут нельзя: центр
       квадрата может попасть на линию синхронизации — она занята, а квадрат
       там нужен. На этом ломались версии от седьмой: код собирался, выглядел
       правильным и не читался. */
    var centers = ALIGN[version];
    var last = centers[centers.length - 1];
    for (var a = 0; a < centers.length; a++) {
      for (var b = 0; b < centers.length; b++) {
        var cy = centers[a], cx = centers[b];
        if ((cy === 6 && cx === 6) || (cy === 6 && cx === last) || (cy === last && cx === 6)) continue;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            var ring = Math.max(Math.abs(dy), Math.abs(dx));
            matrix[cy + dy][cx + dx] = (ring === 1) ? 0 : 1;
          }
        }
      }
    }

    matrix[size - 8][8] = 1;                        // тёмный модуль

    // Места под сведения о формате — заполним после выбора маски.
    for (var f = 0; f <= 8; f++) {
      if (matrix[8][f] === null) matrix[8][f] = 0;
      if (matrix[f][8] === null) matrix[f][8] = 0;
    }
    for (var g = 0; g < 8; g++) {
      if (matrix[8][size - 1 - g] === null) matrix[8][size - 1 - g] = 0;
      if (matrix[size - 1 - g][8] === null) matrix[size - 1 - g][8] = 0;
    }

    if (version >= 7) {
      var info = versionBits(version);
      for (var v = 0; v < 18; v++) {
        var bitv = (info >> v) & 1;
        matrix[Math.floor(v / 3)][size - 11 + (v % 3)] = bitv;
        matrix[size - 11 + (v % 3)][Math.floor(v / 3)] = bitv;
      }
    }
  }

  function versionBits(version) {
    var rest = version << 12;
    for (var i = 0; i < 6; i++) {
      if (rest & (1 << (17 - i))) rest ^= 0x1f25 << (5 - i);
    }
    return (version << 12) | rest;
  }

  /// Куда лечь каждому биту: змейкой снизу вверх, парами столбцов справа налево.
  function placeData(matrix, words) {
    var size = matrix.length;
    var bits = [];
    for (var i = 0; i < words.length; i++) {
      for (var b = 7; b >= 0; b--) bits.push((words[i] >> b) & 1);
    }

    var at = 0;
    var upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;                         // столбец синхронизации пропускаем
      for (var step = 0; step < size; step++) {
        var row = upward ? size - 1 - step : step;
        for (var side = 0; side < 2; side++) {
          var x = col - side;
          if (matrix[row][x] !== null) continue;
          matrix[row][x] = at < bits.length ? bits[at] : 0;
          at++;
        }
      }
      upward = !upward;
    }
  }

  function maskBit(mask, row, col) {
    switch (mask) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
      case 6: return ((((row * col) % 2) + ((row * col) % 3)) % 2) === 0;
      default: return ((((row + col) % 2) + ((row * col) % 3)) % 2) === 0;
    }
  }

  function formatBits(mask) {
    var value = (0x00 << 3) | mask;                 // 00 — уровень коррекции M
    var rest = value << 10;
    for (var i = 0; i < 5; i++) {
      if (rest & (1 << (14 - i))) rest ^= 0x537 << (4 - i);
    }
    return ((value << 10) | rest) ^ 0x5412;
  }

  /* Сведения о формате: уровень коррекции и номер маски, дважды.

     Порядок именно такой, а не зеркальный: младшие биты идут вниз по столбцу
     рядом с левым верхним квадратом, старшие — влево по восьмой строке. Перепутав
     стороны, получаешь код, который выглядит правильным и не читается ничем. */
  function applyFormat(matrix, mask) {
    var size = matrix.length;
    var bits = formatBits(mask);
    for (var i = 0; i < 15; i++) {
      var bit = (bits >> i) & 1;

      // Первая копия — вокруг левого верхнего поискового квадрата.
      if (i <= 5) matrix[i][8] = bit;
      else if (i === 6) matrix[7][8] = bit;
      else if (i === 7) matrix[8][8] = bit;
      else if (i === 8) matrix[8][7] = bit;
      else matrix[8][14 - i] = bit;

      // Вторая — разнесена по двум другим углам, чтобы пережить повреждение.
      if (i < 8) matrix[8][size - 1 - i] = bit;
      else matrix[size - 15 + i][8] = bit;
    }
  }

  /* Штраф за некрасивую картинку — четыре правила стандарта. Маска берётся
     та, что набрала меньше всех: длинные одноцветные полосы и квадраты
     сканеру мешают. */
  function penalty(matrix) {
    var size = matrix.length;
    var score = 0;

    function runs(get) {
      for (var a = 0; a < size; a++) {
        var run = 1;
        for (var b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) {
            run++;
          } else {
            if (run >= 5) score += 3 + (run - 5);
            run = 1;
          }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
    }
    runs(function (row, col) { return matrix[row][col]; });
    runs(function (col, row) { return matrix[row][col]; });

    for (var r = 0; r < size - 1; r++) {
      for (var c = 0; c < size - 1; c++) {
        var v = matrix[r][c];
        if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) score += 3;
      }
    }

    var patterns = [
      [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
    ];
    function scan(get) {
      for (var a = 0; a < size; a++) {
        for (var b = 0; b + 11 <= size; b++) {
          for (var p = 0; p < 2; p++) {
            var hit = true;
            for (var k = 0; k < 11; k++) {
              if (get(a, b + k) !== patterns[p][k]) { hit = false; break; }
            }
            if (hit) score += 40;
          }
        }
      }
    }
    scan(function (row, col) { return matrix[row][col]; });
    scan(function (col, row) { return matrix[row][col]; });

    var dark = 0;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) if (matrix[y][x]) dark++;
    }
    var percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  /// Матрица модулей: 1 — тёмный, 0 — светлый. Без белой рамки, её рисует SVG.
  function matrixFor(text, forcedMask) {
    var bytes = utf8Bytes(text);
    var version = 0;
    for (var v = 1; v <= 10; v++) {
      var header = 2 + (v < 10 ? 1 : 2);            // режим и длина в байтах
      if (bytes.length + header <= capacity(v)) { version = v; break; }
    }
    if (!version) throw new Error('строка длиннее, чем берёт версия 10');

    var words = interleave(dataCodewords(bytes, version), version);
    var size = version * 4 + 17;

    var reserved = emptyMatrix(size);
    placeFunctionPatterns(reserved, version);

    var best = null;
    for (var mask = 0; mask < 8; mask++) {
      // forcedMask — только для сверки с эталонной реализацией.
      if (forcedMask !== undefined && mask !== forcedMask) continue;
      var matrix = emptyMatrix(size);
      placeFunctionPatterns(matrix, version);
      // Служебные модули маска не трогает — помним, где они.
      var fixed = [];
      for (var r = 0; r < size; r++) {
        fixed.push([]);
        for (var c = 0; c < size; c++) fixed[r].push(reserved[r][c] !== null);
      }
      placeData(matrix, words);
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (!fixed[y][x] && maskBit(mask, y, x)) matrix[y][x] ^= 1;
        }
      }
      applyFormat(matrix, mask);
      var score = penalty(matrix);
      if (!best || score < best.score) best = { score: score, matrix: matrix, mask: mask, version: version };
    }
    return best;
  }

  /* SVG вместо canvas: код остаётся резким на любом экране и печатается, если
     кто-то решит распечатать. Фон всегда белый, а модули чёрные, независимо от
     темы страницы: инвертированный код читают не все камеры, а второй попытки
     у человека, который платит, может и не быть. */
  function svgFor(text, pixels) {
    var result = matrixFor(text);
    var matrix = result.matrix;
    var size = matrix.length;
    var quiet = 4;                                   // обязательные поля вокруг
    var total = size + quiet * 2;
    var parts = [];

    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (matrix[y][x]) parts.push('M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z');
      }
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + pixels + '" height="' + pixels +
      '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" ' +
      'aria-label="QR-код со ссылкой активации">' +
      '<rect width="' + total + '" height="' + total + '" fill="#ffffff"/>' +
      '<path d="' + parts.join('') + '" fill="#000000"/></svg>';
  }

  global.SynapseQR = { matrix: matrixFor, svg: svgFor, _rs: remainder, _words: dataCodewords };
})(window);

'use strict';

var MAX_EDGE = 1600;
var SOFT_SIGMA = 2.2;

var state = {
  id: 0,
  luma: null,
  hs: null,
  w: 0,
  h: 0,
  fileName: '',
  fileSize: 0,
  note: '',
  mapped: null,
  mappedKey: '',
  median: null,
  medianKey: ''
};

var ui = {};
var measure = {
  armed: false,
  anchor: null,
  hover: null,
  pending: null,
  surface: 'reference',
  reference: null,
  lines: [],
  pixelsPerUnit: 0,
  seq: 0,
  mirror: false
};
var picture = {
  reference: { scale: 1, x: 0, y: 0, shown: true },
  study: { scale: 1, x: 0, y: 0, shown: true }
};
var renderGen = 0;
var renderTimer = 0;
var medianSerial = 0;
var inflight = null;
var loadToken = 0;

var DEFAULTS = {
  simplify: '62',
  steps: '5',
  soften: '22',
  contrast: '38',
  mode: 'bw',
  grid: 'none',
  ink: 'light',
  gridOn: 'both'
};

function kernelFromAmount(amount, longEdge) {
  var t = Math.min(1, Math.max(0, amount / 100));
  if (t <= 0) return 1;
  var maxOdd = Math.round(longEdge / 18);
  if (maxOdd % 2 === 0) maxOdd += 1;
  if (maxOdd < 3) maxOdd = 3;
  if (maxOdd > 49) maxOdd = 49;
  var k = Math.round(1 + t * (maxOdd - 1));
  if (k < 3) k = 3;
  if (k % 2 === 0) k += 1;
  if (k > maxOdd) k = maxOdd;
  return k;
}

function percentileEnds(gray, plo, phi) {
  var hist = new Uint32Array(256);
  var i;
  for (i = 0; i < gray.length; i++) hist[gray[i]]++;
  var total = gray.length;
  var acc = 0;
  var lo = 0;
  var cLo = total * plo;
  for (var v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= cLo) { lo = v; break; }
  }
  acc = 0;
  var hi = 255;
  var cHi = total * (1 - phi);
  for (v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= cHi) { hi = v; break; }
  }
  if (hi <= lo) hi = Math.min(255, lo + 1);
  return { lo: lo, hi: hi };
}

function mapContrast(gray, amount) {
  var t = Math.min(1, Math.max(0, amount / 100));
  var out = new Uint8ClampedArray(gray.length);
  if (t <= 0) {
    out.set(gray);
    return out;
  }
  var plo = t * 0.04;
  var pad = Math.round(t * 30);
  var ends = percentileEnds(gray, plo, 1 - plo);
  var scale = (255 - pad * 2) / Math.max(1, ends.hi - ends.lo);
  for (var i = 0; i < gray.length; i++) {
    out[i] = (gray[i] - ends.lo) * scale + pad;
  }
  return out;
}

function posterize(gray, steps) {
  var out = new Uint8ClampedArray(gray.length);
  var n = steps - 1;
  for (var i = 0; i < gray.length; i++) {
    var level = Math.round((gray[i] * n) / 255);
    out[i] = Math.round((level * 255) / n);
  }
  return out;
}

function gaussianSoften(gray, w, h, sigma) {
  if (sigma <= 0.05) return new Uint8ClampedArray(gray);
  var radius = Math.max(1, Math.round(sigma * 3));
  var size = radius * 2 + 1;
  var kernel = new Float32Array(size);
  var s2 = 2 * sigma * sigma;
  var sum = 0;
  var i;
  for (i = -radius; i <= radius; i++) {
    var weight = Math.exp(-(i * i) / s2);
    kernel[i + radius] = weight;
    sum += weight;
  }
  for (i = 0; i < size; i++) kernel[i] /= sum;

  var temp = new Float32Array(w * h);
  var y, x, k, acc, xx, yy;
  for (y = 0; y < h; y++) {
    var row = y * w;
    for (x = 0; x < w; x++) {
      acc = 0;
      for (k = -radius; k <= radius; k++) {
        xx = x + k;
        if (xx < 0) xx = 0;
        else if (xx >= w) xx = w - 1;
        acc += gray[row + xx] * kernel[k + radius];
      }
      temp[row + x] = acc;
    }
  }

  var out = new Uint8ClampedArray(w * h);
  for (x = 0; x < w; x++) {
    for (y = 0; y < h; y++) {
      acc = 0;
      for (k = -radius; k <= radius; k++) {
        yy = y + k;
        if (yy < 0) yy = 0;
        else if (yy >= h) yy = h - 1;
        acc += temp[yy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

function makeMedian(src, w, h, k) {
  var out = new Uint8ClampedArray(w * h);
  if (k < 3) {
    out.set(src);
    return { out: out, y: h, step: function () { return true; } };
  }

  var r = (k - 1) >> 1;
  var W = w + r * 2;
  var H = h + r * 2;
  var pad = new Uint8Array(W * H);
  var y, x, sy, sx;
  for (y = 0; y < H; y++) {
    sy = y < r ? 0 : (y >= h + r ? h - 1 : y - r);
    var srow = sy * w;
    var drow = y * W;
    for (x = 0; x < W; x++) {
      sx = x < r ? 0 : (x >= w + r ? w - 1 : x - r);
      pad[drow + x] = src[srow + sx];
    }
  }

  var hist = new Uint32Array(256);
  var target = (k * k) >> 1;
  var job = { out: out, y: 0 };

  job.step = function (maxRows) {
    var end = Math.min(h, this.y + maxRows);
    while (this.y < end) {
      var rowY = this.y;
      hist.fill(0);
      var yy, xx;
      for (yy = 0; yy < k; yy++) {
        var prow = (rowY + yy) * W;
        for (xx = 0; xx < k; xx++) hist[pad[prow + xx]]++;
      }

      var m = 0;
      var acc = 0;
      while (m < 255 && acc + hist[m] <= target) {
        acc += hist[m];
        m++;
      }
      var lt = acc;
      out[rowY * w] = m;

      for (x = 1; x < w; x++) {
        var remX = x - 1;
        var addX = x - 1 + k;
        for (yy = 0; yy < k; yy++) {
          var slide = (rowY + yy) * W;
          var rem = pad[slide + remX];
          var add = pad[slide + addX];
          hist[rem]--;
          if (rem < m) lt--;
          hist[add]++;
          if (add < m) lt++;
        }
        while (m > 0 && lt > target) {
          m--;
          lt -= hist[m];
        }
        while (m < 255 && lt + hist[m] <= target) {
          lt += hist[m];
          m++;
        }
        out[rowY * w + x] = m;
      }
      this.y++;
    }
    return this.y >= h;
  };

  return job;
}

function medianFilterSync(src, w, h, k) {
  var job = makeMedian(src, w, h, k);
  job.step(h);
  return job.out;
}

function medianFilterAsync(src, w, h, k, isCancelled, onProgress) {
  var job = makeMedian(src, w, h, k);
  if (k < 3) {
    onProgress(1);
    return Promise.resolve(job.out);
  }
  return new Promise(function (resolve) {
    function chunk() {
      if (isCancelled()) { resolve(null); return; }
      var done = job.step(12);
      if (isCancelled()) { resolve(null); return; }
      if (done) {
        onProgress(1);
        resolve(job.out);
        return;
      }
      onProgress(job.y / h);
      setTimeout(chunk, 0);
    }
    chunk();
  });
}

function requestMedian(src, w, h, k, key, onProgress) {
  if (state.medianKey === key && state.median) return Promise.resolve(state.median);
  if (inflight && inflight.key === key) {
    inflight.onProgress = onProgress;
    return inflight.promise;
  }
  var serial = ++medianSerial;
  var holder = { key: key, onProgress: onProgress, promise: null };
  holder.promise = medianFilterAsync(
    src,
    w,
    h,
    k,
    function () { return serial !== medianSerial; },
    function (frac) {
      if (serial === medianSerial && holder.onProgress) holder.onProgress(frac);
    }
  ).then(function (out) {
    if (serial !== medianSerial) return null;
    if (out) {
      state.median = out;
      state.medianKey = key;
    }
    return out;
  });
  inflight = holder;
  return holder.promise;
}

function toLuma(rgba) {
  var n = rgba.length / 4;
  var g = new Uint8ClampedArray(n);
  for (var i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2];
  }
  return g;
}

function rgbToHsl(r, g, b) {
  var rf = r / 255, gf = g / 255, bf = b / 255;
  var max = Math.max(rf, gf, bf);
  var min = Math.min(rf, gf, bf);
  var l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  var d = max - min;
  var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  var h;
  if (max === rf) h = (gf - bf) / d + (gf < bf ? 6 : 0);
  else if (max === gf) h = (bf - rf) / d + 2;
  else h = (rf - gf) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  if (s <= 0) {
    var gray = Math.round(l * 255);
    return [gray, gray, gray];
  }
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  var p = 2 * l - q;
  function hue(t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255)
  ];
}

function toHsl(rgba) {
  var n = rgba.length / 4;
  var hs = new Float32Array(n * 2);
  for (var i = 0, p = 0; i < n; i++, p += 4) {
    var hsl = rgbToHsl(rgba[p], rgba[p + 1], rgba[p + 2]);
    hs[i * 2] = hsl[0];
    hs[i * 2 + 1] = hsl[1];
  }
  return hs;
}

function gridSpec(type) {
  var n = Number(type);
  if (Number.isInteger(n) && n >= 2) {
    var cuts = [];
    for (var i = 1; i < n; i++) cuts.push(i / n);
    return { vertical: cuts, horizontal: cuts, diagonals: false };
  }
  if (type === 'golden') {
    var major = (Math.sqrt(5) - 1) / 2;
    var minor = 1 - major;
    return { vertical: [minor, major], horizontal: [minor, major], diagonals: false };
  }
  if (type === 'diag') return { vertical: [], horizontal: [], diagonals: true };
  if (type === 'thirds-diag') {
    return { vertical: [1 / 3, 2 / 3], horizontal: [1 / 3, 2 / 3], diagonals: true };
  }
  return { vertical: [], horizontal: [], diagonals: false };
}

function currentMode() {
  var picked = document.querySelector('input[name="mode"]:checked');
  return picked ? picked.value : 'bw';
}

function toneSteps() {
  var v = +ui.steps.value;
  return v >= 17 ? 0 : v;
}

function formatSteps(v) {
  v = +v;
  if (v >= 17) return 'Full range';
  return v === 1 ? '1 tone' : v + ' tones';
}

function formatSimplify(v) {
  v = +v;
  var word = 'Off';
  if (v > 0 && v < 30) word = 'Light';
  else if (v >= 30 && v < 55) word = 'Medium';
  else if (v >= 55 && v < 80) word = 'Strong';
  else if (v >= 80) word = 'Heavy';
  if (!state.w || v <= 0) return word;
  var k = kernelFromAmount(v, Math.max(state.w, state.h));
  return word + ' · ' + k + 'px';
}

function formatSoft(v) {
  v = +v;
  if (v <= 0) return 'Crisp';
  if (v < 35) return 'Slight';
  if (v < 70) return 'Soft';
  return 'Blurred';
}

function formatContrast(v) {
  v = +v;
  if (v <= 8) return 'As shot';
  if (v < 40) return 'Gentle';
  if (v < 75) return 'Clear';
  return 'Strong';
}

function paintRange(input) {
  var pct = ((+input.value - +input.min) / (+input.max - +input.min)) * 100;
  input.style.setProperty('--pct', pct + '%');
}

function syncControls() {
  paintRange(ui.simplify);
  paintRange(ui.steps);
  paintRange(ui.soften);
  paintRange(ui.contrast);
  ui.simplifyOut.textContent = formatSimplify(ui.simplify.value);
  ui.stepsOut.textContent = formatSteps(ui.steps.value);
  ui.softenOut.textContent = formatSoft(ui.soften.value);
  ui.contrastOut.textContent = formatContrast(ui.contrast.value);
  var gridOn = ui.grid.value !== 'none';
  ui.ink.disabled = !gridOn;
  if (ui.gridOn) ui.gridOn.disabled = !gridOn;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function writeInfo(k, steps) {
  var tones = steps ? steps + ' tones' : 'full range';
  var mode = currentMode() === 'bw' ? 'black & white' : 'color';
  ui.info.textContent = state.fileName + ' · ' + formatSize(state.fileSize) + ' · ' +
    state.note + ' · ' + mode + ' · ' + tones + ' · smooth ' + k + '×' + k;
}

function showError(msg) {
  ui.error.textContent = msg;
  ui.error.hidden = false;
}

function hideError() {
  ui.error.hidden = true;
  ui.error.textContent = '';
}

function showProgress(frac) {
  ui.meter.hidden = false;
  ui.meterBar.style.width = Math.round(Math.max(0.04, Math.min(1, frac)) * 100) + '%';
  ui.status.textContent = 'Simplifying';
}

function hideProgress() {
  ui.meter.hidden = true;
  ui.meterBar.style.width = '0';
  ui.status.textContent = '';
}

function paintOriginal(rgba, w, h) {
  if (ui.orig.width !== w || ui.orig.height !== h) {
    ui.orig.width = w;
    ui.orig.height = h;
  }
  var buf = new Uint8ClampedArray(rgba);
  ui.orig.getContext('2d').putImageData(new ImageData(buf, w, h), 0, 0);
  rememberRatio(document.getElementById('orig-frame'));
}

function paintStudy(tone) {
  var w = state.w;
  var h = state.h;
  var color = currentMode() === 'color';
  var buf = new Uint8ClampedArray(w * h * 4);
  var hs = state.hs;
  for (var i = 0, p = 0; i < tone.length; i++, p += 4) {
    var v = tone[i];
    if (!color) {
      buf[p] = buf[p + 1] = buf[p + 2] = v;
    } else {
      var rgb = hslToRgb(hs[i * 2], hs[i * 2 + 1], v / 255);
      buf[p] = rgb[0];
      buf[p + 1] = rgb[1];
      buf[p + 2] = rgb[2];
    }
    buf[p + 3] = 255;
  }
  if (ui.out.width !== w || ui.out.height !== h) {
    ui.out.width = w;
    ui.out.height = h;
  }
  ui.out.getContext('2d').putImageData(new ImageData(buf, w, h), 0, 0);
  rememberRatio(document.getElementById('study-frame'));
  drawMeasures();
}

function gridShows(board) {
  if (!ui.grid || ui.grid.value === 'none') return false;
  var where = ui.gridOn ? ui.gridOn.value : 'both';
  return where === 'both' || where === board;
}

function paintGridLayer(grid, w, h) {
  if (!grid || !w || !h) return;
  if (grid.width !== w || grid.height !== h) {
    grid.width = w;
    grid.height = h;
  }
  var ctx = grid.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  var spec = gridSpec(ui.grid.value);
  if (!spec.vertical.length && !spec.horizontal.length && !spec.diagonals) return;

  var light = ui.ink.value !== 'dark';
  var ink = light ? 'rgba(255,255,255,0.92)' : 'rgba(16,12,10,0.92)';
  var halo = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.72)';
  var core = Math.max(1, Math.round(Math.min(w, h) / 400));

  function strokeAll(style, width) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    var i, x, y;
    for (i = 0; i < spec.vertical.length; i++) {
      x = Math.round(spec.vertical[i] * w) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (i = 0; i < spec.horizontal.length; i++) {
      y = Math.round(spec.horizontal[i] * h) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    if (spec.diagonals) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      ctx.moveTo(w, 0);
      ctx.lineTo(0, h);
      ctx.stroke();
    }
  }

  strokeAll(halo, core + 2);
  strokeAll(ink, core);
}

function drawGrid() {
  if (!state.w || !state.h) return;
  paintGridLayer(ui.refGrid, state.w, state.h);
  paintGridLayer(ui.gridCanvas, state.w, state.h);
  if (ui.refGrid) ui.refGrid.hidden = !gridShows('reference');
  if (ui.gridCanvas) ui.gridCanvas.hidden = !gridShows('study');
}

function markPainted() {
  var n = Number(document.documentElement.dataset.paint || 0) + 1;
  document.documentElement.dataset.paint = String(n);
}

function render() {
  if (!state.luma) return Promise.resolve();
  var gen = ++renderGen;
  var contrast = +ui.contrast.value;
  var simplify = +ui.simplify.value;
  var soften = +ui.soften.value;
  var steps = toneSteps();
  var longEdge = Math.max(state.w, state.h);
  var k = kernelFromAmount(simplify, longEdge);
  var mapKey = state.id + ':' + contrast;

  if (state.mappedKey !== mapKey) {
    state.mapped = mapContrast(state.luma, contrast);
    state.mappedKey = mapKey;
    state.medianKey = '';
  }

  var medKey = mapKey + ':' + k;

  function finish(median) {
    if (gen !== renderGen || !median) return;
    var tone = steps ? posterize(median, steps) : median;
    var sigma = (soften / 100) * SOFT_SIGMA;
    tone = gaussianSoften(tone, state.w, state.h, sigma);
    if (gen !== renderGen) return;
    paintStudy(tone);
    drawGrid();
    hideProgress();
    setSavesEnabled(true);
    writeInfo(k, steps);
    markPainted();
  }

  if (state.medianKey === medKey && state.median) {
    finish(state.median);
    return Promise.resolve();
  }

  var preview = steps ? posterize(state.mapped, steps) : state.mapped;
  paintStudy(preview);
  drawGrid();
  setSavesEnabled(false);
  showProgress(0.05);

  return requestMedian(state.mapped, state.w, state.h, k, medKey, function (frac) {
    if (gen === renderGen) showProgress(frac);
  }).then(function (median) {
    finish(median);
  });
}

function scheduleRender(ms) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, ms);
}

function decodeFile(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var long = Math.max(img.naturalWidth, img.naturalHeight);
      if (!long) {
        URL.revokeObjectURL(url);
        reject(new Error('empty'));
        return;
      }
      var scale = long > MAX_EDGE ? MAX_EDGE / long : 1;
      var w = Math.max(1, Math.round(img.naturalWidth * scale));
      var h = Math.max(1, Math.round(img.naturalHeight * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      var rgba = ctx.getImageData(0, 0, w, h).data;
      URL.revokeObjectURL(url);
      resolve({
        rgba: rgba,
        w: w,
        h: h,
        note: scale < 1 ? 'scaled to ' + w + '×' + h : w + '×' + h
      });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

var SETTINGS_KEY = 'tone-simplifier-settings';
var DB_NAME = 'tone-simplifier';
var DB_STORE = 'photo';

function readSettings() {
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch (err) {
    return null;
  }
}

function writeSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      simplify: ui.simplify.value,
      steps: ui.steps.value,
      soften: ui.soften.value,
      contrast: ui.contrast.value,
      mode: currentMode(),
      grid: ui.grid.value,
      ink: ui.ink.value,
      gridOn: ui.gridOn.value
    }));
  } catch (err) {}
}

function hasOption(select, value) {
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === String(value)) return true;
  }
  return false;
}

function clampSlider(input, value) {
  if (value == null || value === '') return;
  var n = Number(value);
  if (!isFinite(n)) return;
  var min = Number(input.min);
  var max = Number(input.max);
  if (n < min) n = min;
  if (n > max) n = max;
  input.value = String(n);
}

function applySettings(data) {
  if (!data) return;
  clampSlider(ui.simplify, data.simplify);
  clampSlider(ui.steps, data.steps);
  clampSlider(ui.soften, data.soften);
  clampSlider(ui.contrast, data.contrast);
  if (data.mode === 'bw' || data.mode === 'color') {
    var mode = document.querySelector('input[name="mode"][value="' + data.mode + '"]');
    if (mode) mode.checked = true;
  }
  if (data.grid != null && hasOption(ui.grid, data.grid)) ui.grid.value = String(data.grid);
  if (data.ink === 'light' || data.ink === 'dark') ui.ink.value = data.ink;
  if (data.gridOn && hasOption(ui.gridOn, data.gridOn)) ui.gridOn.value = data.gridOn;
}

function openDb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error('no indexedDB'));
      return;
    }
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

function withStore(mode, run) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DB_STORE, mode);
      var result;
      tx.oncomplete = function () {
        db.close();
        resolve(result);
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error);
      };
      tx.onabort = function () {
        db.close();
        reject(tx.error || new Error('abort'));
      };
      var req = run(tx.objectStore(DB_STORE));
      if (req) {
        req.onsuccess = function () { result = req.result; };
      }
    });
  });
}

function rememberFile(file) {
  return withStore('readwrite', function (store) {
    return store.put({
      blob: file,
      name: file.name || 'photo',
      type: file.type || ''
    }, 'current');
  }).catch(function () {});
}

function recallFile() {
  return withStore('readonly', function (store) {
    return store.get('current');
  }).catch(function () { return null; });
}

function restoreSession() {
  var token = loadToken;
  recallFile().then(function (record) {
    if (!record || !record.blob || token !== loadToken) return;
    var blob = record.blob;
    var name = record.name || blob.name || 'photo';
    var type = record.type || blob.type || 'image/jpeg';
    var file = blob instanceof File ? blob : new File([blob], name, { type: type });
    ui.info.textContent = 'Opening…';
    return decodeFile(file).then(function (decoded) {
      if (token !== loadToken) return;
      adoptImage(decoded, file, true);
    }).catch(function (err) {
      console.error(err);
      if (token !== loadToken) return;
      ui.info.textContent = '';
      showError('Could not open the saved photo. Try a JPG or PNG.');
    });
  }).catch(function () {});
}

function adoptImage(decoded, file, remembered) {
  state.id += 1;
  state.luma = toLuma(decoded.rgba);
  state.hs = toHsl(decoded.rgba);
  state.w = decoded.w;
  state.h = decoded.h;
  state.note = decoded.note;
  state.fileName = file.name || 'photo';
  state.fileSize = file.size || 0;
  state.mapped = null;
  state.mappedKey = '';
  state.median = null;
  state.medianKey = '';
  paintOriginal(decoded.rgba, decoded.w, decoded.h);
  dropMeasures();
  resetPictureViews();
  ui.boards.hidden = false;
  if (ui.boardSwitch) ui.boardSwitch.hidden = false;
  ui.drop.classList.add('is-loaded');
  ui.dropTitle.textContent = 'Replace photo';
  syncControls();
  render();
  if (!remembered) rememberFile(file);
}

function handleFile(file) {
  if (!file) return;
  if (file.type && file.type.indexOf('image/') !== 0) {
    showError('Could not open that file. Try a JPG or PNG, in Firefox or Chrome.');
    return;
  }
  hideError();
  var token = ++loadToken;
  var previousInfo = state.luma ? ui.info.textContent : '';
  ui.info.textContent = 'Opening…';
  decodeFile(file).then(function (decoded) {
    if (token !== loadToken) return;
    adoptImage(decoded, file);
  }).catch(function (err) {
    console.error(err);
    if (token !== loadToken) return;
    ui.info.textContent = previousInfo === 'Opening…' ? '' : previousInfo;
    showError('Could not open that file. Try a JPG or PNG, in Firefox or Chrome.');
  });
}

function downloadName(suffix) {
  var base = (state.fileName || 'artool').replace(/\.[^.]+$/, '');
  var safe = base.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '');
  return (safe || 'artool') + suffix;
}

function setSavesEnabled(on) {
  if (ui.saveReference) ui.saveReference.disabled = !on;
  if (ui.saveStudy) ui.saveStudy.disabled = !on;
  if (ui.saveBoth) ui.saveBoth.disabled = !on;
}

function composeBoard(board) {
  var base = board === 'study' ? ui.out : ui.orig;
  var grid = board === 'study' ? ui.gridCanvas : ui.refGrid;
  var lines = board === 'study' ? ui.studyMeasure : ui.measure;
  var canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0);
  if (gridShows(board) && grid && grid.width) ctx.drawImage(grid, 0, 0);
  if (lines && lines.width) ctx.drawImage(lines, 0, 0);
  return canvas;
}

function downloadCanvas(canvas, suffix) {
  var link = document.createElement('a');
  link.download = downloadName(suffix);
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function saveBoard(board) {
  var base = board === 'study' ? ui.out : ui.orig;
  if (!base || !base.width || (ui.saveBoth && ui.saveBoth.disabled)) return;
  downloadCanvas(composeBoard(board), board === 'study' ? '-study.png' : '-reference.png');
}

function saveBoth() {
  if (!ui.orig || !ui.out || !ui.orig.width || !ui.out.width) return;
  if (ui.saveBoth && ui.saveBoth.disabled) return;
  var ref = composeBoard('reference');
  var study = composeBoard('study');
  var gap = 24;
  var canvas = document.createElement('canvas');
  canvas.width = ref.width + gap + study.width;
  canvas.height = Math.max(ref.height, study.height);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12110f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(ref, 0, Math.round((canvas.height - ref.height) / 2));
  ctx.drawImage(study, ref.width + gap, Math.round((canvas.height - study.height) / 2));
  downloadCanvas(canvas, '-both.png');
}

function resetControls() {
  ui.simplify.value = DEFAULTS.simplify;
  ui.steps.value = DEFAULTS.steps;
  ui.soften.value = DEFAULTS.soften;
  ui.contrast.value = DEFAULTS.contrast;
  ui.grid.value = DEFAULTS.grid;
  ui.ink.value = DEFAULTS.ink;
  ui.gridOn.value = DEFAULTS.gridOn;
  var mode = document.querySelector('input[name="mode"][value="' + DEFAULTS.mode + '"]');
  if (mode) mode.checked = true;
  syncControls();
  if (state.luma) {
    drawGrid();
    scheduleRender(30);
  }
  writeSettings();
}

function measureDistance(a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function formatMeasure(n) {
  if (!isFinite(n)) return '—';
  var text = (Math.round(n * 100) / 100).toFixed(2);
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

function readUnit() {
  var n = parseFloat(ui.unit.value);
  if (!isFinite(n) || n <= 0) return null;
  return n;
}

function imageScale(layer) {
  var rect = layer && layer.getBoundingClientRect ? layer.getBoundingClientRect() : null;
  if (!rect || !rect.width || !state.w) return 1;
  return state.w / rect.width;
}

function newLineId() {
  measure.seq += 1;
  return 'line-' + measure.seq;
}

function selectedColor() {
  return (ui.lineColor && ui.lineColor.value) || '#f0c38a';
}

function boardLabel(board) {
  return board === 'study' ? 'Study' : 'Reference';
}

function eachMeasureLine(visit) {
  if (measure.reference) visit(measure.reference);
  if (measure.pending && measure.pending !== measure.reference) visit(measure.pending);
  for (var i = 0; i < measure.lines.length; i++) visit(measure.lines[i]);
}

function findLine(id) {
  var found = null;
  eachMeasureLine(function (line) {
    if (line.id === id) found = line;
  });
  return found;
}

function haloFor(color) {
  var hex = String(color || '').replace('#', '');
  if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
  if (hex.length !== 6) return 'rgba(0,0,0,0.62)';
  var r = parseInt(hex.slice(0, 2), 16);
  var g = parseInt(hex.slice(2, 4), 16);
  var b = parseInt(hex.slice(4, 6), 16);
  if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return 'rgba(0,0,0,0.62)';
  var y = (r * 299 + g * 587 + b * 114) / 1000;
  return y > 150 ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.82)';
}

function clampImagePoint(point) {
  return {
    x: Math.min(state.w, Math.max(0, point.x)),
    y: Math.min(state.h, Math.max(0, point.y))
  };
}

function sameMeasurePoint(a, b) {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

function snapMeasurePoint(point, ignore, board, layer) {
  var radius = 12 * imageScale(layer);
  var best = null;
  var bestD = radius;
  function consider(p) {
    if (!p || (ignore && sameMeasurePoint(p, ignore))) return;
    var d = measureDistance(point, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  eachMeasureLine(function (line) {
    if (line.board !== board) return;
    consider(line.a);
    consider(line.b);
  });
  return best ? { x: best.x, y: best.y } : point;
}

function eventImagePoint(e) {
  var rect = e.currentTarget.getBoundingClientRect();
  if (!rect.width || !rect.height || !state.w) return { x: 0, y: 0 };
  return clampImagePoint({
    x: ((e.clientX - rect.left) / rect.width) * state.w,
    y: ((e.clientY - rect.top) / rect.height) * state.h
  });
}

function lineProportion(line) {
  if (!measure.pixelsPerUnit) return null;
  return measureDistance(line.a, line.b) / measure.pixelsPerUnit;
}

function lineCaption(line) {
  var valueText = '';
  if (line === measure.reference) valueText = formatMeasure(line.value);
  else if (line === measure.pending) {
    var pendingValue = readUnit();
    valueText = pendingValue == null ? '' : formatMeasure(pendingValue);
  } else {
    var value = lineProportion(line);
    valueText = value == null ? '' : formatMeasure(value);
  }
  var name = line.name ? String(line.name).trim() : '';
  if (name && valueText) return name + '  ' + valueText;
  return name || valueText;
}

function proportionStatus() {
  if (!state.w) return 'Load a photo, then draw on either picture.';
  if (measure.pending) return 'Enter a number greater than zero for this line.';
  if (!measure.reference) {
    if (measure.anchor) return 'Click the second point.';
    if (measure.armed) return 'Click the first point on the reference or the study.';
    return 'Draw a line from point to point. It takes the value above.';
  }
  var ref = formatMeasure(measure.reference.value);
  if (measure.anchor) return 'Click the second point.';
  if (measure.armed) return 'Click the first point. New lines are measured against ' + ref + '.';
  return 'Reference is ' + ref + '. Draw another line to compare it.';
}

function proportionRow(line) {
  var li = document.createElement('li');
  var color = document.createElement('input');
  color.type = 'color';
  color.className = 'line-color';
  color.value = line.color || '#f0c38a';
  color.setAttribute('data-id', line.id);
  color.setAttribute('aria-label', 'Color');

  var copy = document.createElement('div');
  copy.className = 'line-copy';
  var board = document.createElement('span');
  board.className = 'line-board';
  board.textContent = boardLabel(line.board);
  var name = document.createElement('input');
  name.type = 'text';
  name.className = 'line-name';
  name.value = line.name || '';
  name.maxLength = 40;
  name.setAttribute('data-id', line.id);
  name.setAttribute('aria-label', 'Line name');
  copy.appendChild(board);
  copy.appendChild(name);

  var value = document.createElement('strong');
  var shown = line === measure.pending ? readUnit() : (line === measure.reference ? line.value : lineProportion(line));
  value.textContent = shown == null ? '—' : formatMeasure(shown);

  var remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'line-remove';
  remove.setAttribute('data-id', line.id);
  remove.setAttribute('aria-label', 'Remove line');
  remove.textContent = '×';

  li.appendChild(color);
  li.appendChild(copy);
  li.appendChild(value);
  li.appendChild(remove);
  return li;
}

function renderProportionList() {
  var list = ui.proportionList;
  if (!list) return;
  var items = [];
  if (measure.reference) items.push(measure.reference);
  if (measure.pending) items.push(measure.pending);
  for (var i = 0; i < measure.lines.length; i++) items.push(measure.lines[i]);
  list.textContent = '';
  if (!items.length) {
    list.hidden = true;
    return;
  }
  list.hidden = false;
  for (var n = 0; n < items.length; n++) list.appendChild(proportionRow(items[n]));
}

function syncProportions() {
  if (!ui.drawLine) return;
  var hasImage = !!state.w;
  var waiting = !!measure.pending;
  var drawing = !!(measure.armed && !waiting && hasImage);
  ui.unit.disabled = !hasImage;
  if (ui.lineColor) ui.lineColor.disabled = !hasImage;
  ui.drawLine.disabled = !hasImage || waiting;
  ui.drawLine.setAttribute('aria-pressed', drawing ? 'true' : 'false');
  ui.drawLine.textContent = drawing ? 'Stop drawing' : 'Draw line';
  if (ui.copyLines) {
    ui.copyLines.disabled = !hasImage;
    ui.copyLines.setAttribute('aria-pressed', measure.mirror ? 'true' : 'false');
  }
  ui.clearLines.disabled = !(measure.reference || measure.lines.length || waiting || measure.anchor);
  if (ui.photo) ui.photo.classList.toggle('is-drawing', drawing);
  if (ui.studyPhoto) ui.studyPhoto.classList.toggle('is-drawing', drawing);
  ui.proportionStatus.textContent = proportionStatus();
  renderProportionList();
}

function strokeMeasureLine(ctx, a, b, color, width, dashed) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.setLineDash(dashed ? [width * 4, width * 3] : []);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function strokeMeasureDot(ctx, p, color, radius) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMeasureLabel(ctx, a, b, text, color, font, bounds) {
  var mx = (a.x + b.x) / 2;
  var my = (a.y + b.y) / 2;
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var gap = font * 0.75;
  var ox = (-dy / len) * gap;
  var oy = (dx / len) * gap;
  var x = mx + ox;
  var y = my + oy;
  var pad = font * 0.65;
  if (y < pad || y > bounds.h - pad) {
    x = mx - ox;
    y = my - oy;
  }
  if (x < pad) x = pad;
  if (x > bounds.w - pad) x = bounds.w - pad;
  if (y < pad) y = pad;
  if (y > bounds.h - pad) y = bounds.h - pad;
  ctx.save();
  ctx.font = '600 ' + font + 'px "Avenir Next", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, font / 5);
  ctx.strokeStyle = haloFor(color);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function paintMeasureLine(ctx, line, color, label, width, radius, font, bounds, dashed) {
  strokeMeasureLine(ctx, line.a, line.b, haloFor(color), width + 2, dashed);
  strokeMeasureLine(ctx, line.a, line.b, color, width, dashed);
  strokeMeasureDot(ctx, line.a, color, radius);
  strokeMeasureDot(ctx, line.b, color, radius);
  if (label) drawMeasureLabel(ctx, line.a, line.b, label, color, font, bounds);
}

function drawMeasureLayer(layer, board) {
  if (!layer || !state.w || !state.h) return;
  var w = state.w;
  var h = state.h;
  if (layer.width !== w || layer.height !== h) {
    layer.width = w;
    layer.height = h;
  }
  var ctx = layer.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  var font = Math.max(14, Math.round(Math.min(w, h) / 42));
  var width = Math.max(2, Math.round(Math.min(w, h) / 280));
  var radius = Math.max(3, width + 1);
  var bounds = { w: w, h: h };

  eachMeasureLine(function (line) {
    if (!measure.mirror && line.board !== board) return;
    var dashed = line === measure.pending;
    paintMeasureLine(ctx, line, line.color || selectedColor(), lineCaption(line), width, radius, font, bounds, dashed);
  });

  if (!measure.anchor) return;
  if (!measure.mirror && measure.surface !== board) return;
  var color = selectedColor();
  if (measure.hover && !sameMeasurePoint(measure.anchor, measure.hover)) {
    var preview = { a: measure.anchor, b: measure.hover };
    var previewLabel = '';
    if (measure.reference) {
      var previewValue = lineProportion(preview);
      if (previewValue != null) previewLabel = formatMeasure(previewValue);
    }
    paintMeasureLine(ctx, preview, color, previewLabel, width, radius, font, bounds, true);
  } else {
    strokeMeasureDot(ctx, measure.anchor, color, radius);
  }
}

function drawMeasures() {
  drawMeasureLayer(ui.measure, 'reference');
  drawMeasureLayer(ui.studyMeasure, 'study');
}

function applyScale(value) {
  if (!measure.reference || !value) return;
  var px = measureDistance(measure.reference.a, measure.reference.b);
  measure.reference.value = value;
  measure.pixelsPerUnit = px / value;
}

function commitReference(value) {
  if (!measure.pending || !value) return;
  var px = measureDistance(measure.pending.a, measure.pending.b);
  measure.pending.value = value;
  measure.reference = measure.pending;
  measure.pixelsPerUnit = px / value;
  measure.pending = null;
  syncProportions();
  drawMeasures();
}

function placeMeasurePoint(raw, layer) {
  var point = snapMeasurePoint(raw, measure.anchor, measure.surface, layer);
  if (!measure.anchor) {
    measure.anchor = point;
    measure.hover = point;
    syncProportions();
    drawMeasures();
    return;
  }
  if (measureDistance(measure.anchor, point) < 4) return;
  var id = newLineId();
  var line = {
    id: id,
    a: measure.anchor,
    b: point,
    name: measure.reference ? 'Line ' + measure.seq : 'Reference',
    color: selectedColor(),
    board: measure.surface
  };
  measure.anchor = null;
  measure.hover = null;
  if (!measure.reference) {
    var value = readUnit();
    measure.pending = line;
    if (!value) {
      syncProportions();
      drawMeasures();
      ui.unit.focus();
      return;
    }
    commitReference(value);
    return;
  }
  measure.lines.push(line);
  syncProportions();
  drawMeasures();
}

function onMeasureDown(e) {
  if (!measure.armed || measure.pending || !state.w) return;
  if (e.button != null && e.button !== 0) return;
  var board = e.currentTarget.getAttribute('data-board') || 'reference';
  e.preventDefault();
  e.stopPropagation();
  if (measure.anchor && board !== measure.surface) return;
  measure.surface = board;
  if (e.currentTarget.setPointerCapture) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  }
  placeMeasurePoint(eventImagePoint(e), e.currentTarget);
}

function onMeasureMove(e) {
  if (!measure.armed || !measure.anchor || measure.pending) return;
  var board = e.currentTarget.getAttribute('data-board') || 'reference';
  if (board !== measure.surface) return;
  measure.hover = snapMeasurePoint(eventImagePoint(e), measure.anchor, board, e.currentTarget);
  drawMeasures();
}

function onProportionEdit(e) {
  var id = e.target.getAttribute('data-id');
  if (!id) return;
  var line = findLine(id);
  if (!line) return;
  if (e.target.classList.contains('line-name')) line.name = e.target.value;
  else if (e.target.classList.contains('line-color')) line.color = e.target.value;
  else return;
  drawMeasures();
}

function deleteLine(id) {
  if (measure.pending && measure.pending.id === id) measure.pending = null;
  if (measure.reference && measure.reference.id === id) {
    measure.reference = null;
    measure.pixelsPerUnit = 0;
  }
  var next = [];
  for (var i = 0; i < measure.lines.length; i++) {
    if (measure.lines[i].id !== id) next.push(measure.lines[i]);
  }
  measure.lines = next;
  syncProportions();
  drawMeasures();
}

function toggleMirror() {
  if (!state.w) return;
  measure.mirror = !measure.mirror;
  syncProportions();
  drawMeasures();
}

function onUnitInput() {
  var value = readUnit();
  if (measure.pending) {
    if (value) commitReference(value);
    else {
      syncProportions();
      drawMeasures();
    }
    return;
  }
  if (measure.reference && value) {
    applyScale(value);
    syncProportions();
    drawMeasures();
  } else if (measure.reference) {
    ui.proportionStatus.textContent = 'Enter a number greater than zero.';
  }
}

function toggleDraw() {
  if (!state.w || measure.pending) return;
  measure.armed = !measure.armed;
  if (!measure.armed) {
    measure.anchor = null;
    measure.hover = null;
  }
  syncProportions();
  drawMeasures();
}

function clearMeasureGeometry() {
  measure.armed = false;
  measure.anchor = null;
  measure.hover = null;
  measure.pending = null;
  measure.surface = 'reference';
  measure.reference = null;
  measure.lines = [];
  measure.pixelsPerUnit = 0;
}

function clearMeasures() {
  clearMeasureGeometry();
  if (ui.unit) ui.unit.value = '1';
  syncProportions();
  drawMeasures();
}

function dropMeasures() {
  clearMeasureGeometry();
  syncProportions();
  drawMeasures();
}

function rememberRatio(frame) {
  if (!frame) return;
  var canvas = frame.querySelector('canvas:not(.grid):not(.measure)');
  if (!canvas || !canvas.height) return;
  frame.style.setProperty('--ratio', String(canvas.width / canvas.height));
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function exitFullscreen() {
  var exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (exit && fullscreenElement()) {
    var pending = exit.call(document);
    if (pending && pending.catch) pending.catch(function () {});
  }
}

function openExpanded(frame) {
  frame.classList.add('is-expanded');
  frame.setAttribute('aria-expanded', 'true');
  document.body.classList.add('has-expanded');
}

function closeExpanded(frame) {
  frame.classList.remove('is-expanded');
  frame.setAttribute('aria-expanded', 'false');
  if (!document.querySelector('.frame.is-expanded')) {
    document.body.classList.remove('has-expanded');
  }
}

function toggleExpand(frame) {
  var canvas = frame.querySelector('canvas');
  if (!canvas || !canvas.width || !canvas.height) return;
  rememberRatio(frame);

  if (fullscreenElement() === frame) {
    exitFullscreen();
    return;
  }
  if (frame.classList.contains('is-expanded')) {
    closeExpanded(frame);
    return;
  }

  var open = document.querySelector('.frame.is-expanded');
  if (open) closeExpanded(open);

  var request = frame.requestFullscreen || frame.webkitRequestFullscreen;
  if (!request) {
    openExpanded(frame);
    return;
  }

  var settled = false;
  function showFallback() {
    if (settled || fullscreenElement() === frame) return;
    settled = true;
    openExpanded(frame);
  }

  var pending;
  try {
    pending = request.call(frame);
  } catch (err) {
    showFallback();
    return;
  }
  if (pending && pending.then) {
    pending.then(function () {
      if (fullscreenElement() === frame) settled = true;
      else showFallback();
    }).catch(showFallback);
  } else if (!fullscreenElement()) {
    showFallback();
  }
  setTimeout(showFallback, 250);
}

function bindExpand(frame) {
  if (!frame) return;
  frame.addEventListener('click', function (e) {
    if (frame.dataset.panned === '1') {
      delete frame.dataset.panned;
      return;
    }
    if (e.target && e.target.classList && e.target.classList.contains('measure')) return;
    toggleExpand(frame);
  });
  frame.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggleExpand(frame);
  });
}

function onExpandKey(e) {
  if (e.key !== 'Escape') return;
  if (fullscreenElement()) {
    exitFullscreen();
    return;
  }
  var open = document.querySelector('.frame.is-expanded');
  if (open) {
    closeExpanded(open);
    return;
  }
  if (!measure.anchor && !measure.pending && !measure.armed) return;
  measure.anchor = null;
  measure.hover = null;
  measure.pending = null;
  measure.armed = false;
  syncProportions();
  drawMeasures();
}

function syncExpandState() {
  var current = fullscreenElement();
  if (current) {
    var overlay = document.querySelector('.frame.is-expanded');
    if (overlay) closeExpanded(overlay);
  }
  var frames = document.querySelectorAll('[data-expand]');
  for (var i = 0; i < frames.length; i++) {
    if (frames[i].classList.contains('is-expanded')) continue;
    frames[i].setAttribute('aria-expanded', frames[i] === current ? 'true' : 'false');
  }
}

function pictureNode(board) {
  return board === 'study' ? ui.studyPhoto : ui.photo;
}

function pictureFrame(board) {
  return document.getElementById(board === 'study' ? 'study-frame' : 'orig-frame');
}

function clampPicture(board) {
  var v = picture[board];
  var frame = pictureFrame(board);
  var node = pictureNode(board);
  if (!frame || !node || !node.offsetWidth) return;
  var fw = frame.clientWidth;
  var fh = frame.clientHeight;
  var iw = node.offsetWidth * v.scale;
  var ih = node.offsetHeight * v.scale;
  var originX = node.offsetLeft;
  var originY = node.offsetTop;
  if (iw <= fw + 1) v.x = 0;
  else {
    var minX = fw - originX - iw;
    var maxX = -originX;
    if (v.x < minX) v.x = minX;
    if (v.x > maxX) v.x = maxX;
  }
  if (ih <= fh + 1) v.y = 0;
  else {
    var minY = fh - originY - ih;
    var maxY = -originY;
    if (v.y < minY) v.y = minY;
    if (v.y > maxY) v.y = maxY;
  }
}

function zoomStep(e) {
  var dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;
  else if (e.deltaMode === 2) dy *= 400;
  if (!dy) return 1;
  var now = Date.now();
  var gap = now - (zoomStep.last || 0);
  zoomStep.last = now;
  if (gap > 45 && Math.abs(dy) < 80) return dy < 0 ? 1.16 : 1 / 1.16;
  var mag = -dy * 0.004;
  if (mag > 0.28) mag = 0.28;
  if (mag < -0.28) mag = -0.28;
  return Math.exp(mag);
}

function applyPictureView(board) {
  var node = pictureNode(board);
  var frame = pictureFrame(board);
  var v = picture[board];
  if (!node || !v) return;
  node.style.transform = v.scale === 1 && v.x === 0 && v.y === 0
    ? ''
    : 'translate(' + v.x + 'px, ' + v.y + 'px) scale(' + v.scale + ')';
  if (frame) frame.classList.toggle('is-zoomed', v.scale > 1.001);
}

function resetPictureViews() {
  picture.reference = { scale: 1, x: 0, y: 0, shown: true };
  picture.study = { scale: 1, x: 0, y: 0, shown: true };
  applyPictureView('reference');
  applyPictureView('study');
  syncBoardVisibility();
}

function syncBoardVisibility() {
  if (ui.refFigure) ui.refFigure.classList.toggle('is-hidden', !picture.reference.shown);
  if (ui.studyFigure) ui.studyFigure.classList.toggle('is-hidden', !picture.study.shown);
  if (ui.showReference) {
    ui.showReference.setAttribute('aria-pressed', picture.reference.shown ? 'true' : 'false');
    ui.showReference.disabled = picture.reference.shown && !picture.study.shown;
  }
  if (ui.showStudy) {
    ui.showStudy.setAttribute('aria-pressed', picture.study.shown ? 'true' : 'false');
    ui.showStudy.disabled = picture.study.shown && !picture.reference.shown;
  }
}

function setBoardShown(board, shown) {
  var other = board === 'study' ? 'reference' : 'study';
  if (!shown && !picture[other].shown) return;
  if (!shown) {
    var frame = pictureFrame(board);
    if (frame && frame.classList.contains('is-expanded')) closeExpanded(frame);
    if (frame && fullscreenElement() === frame) exitFullscreen();
  }
  picture[board].shown = shown;
  syncBoardVisibility();
}

function zoomPicture(board, e) {
  var v = picture[board];
  var frame = pictureFrame(board);
  var node = pictureNode(board);
  if (!v || !frame || !node || !state.w) return;
  var rect = frame.getBoundingClientRect();
  var cx = e.clientX - rect.left - frame.clientLeft;
  var cy = e.clientY - rect.top - frame.clientTop;
  var factor = zoomStep(e);
  if (!isFinite(factor) || factor === 1) return;
  var next = v.scale * factor;
  if (next < 1) next = 1;
  if (next > 8) next = 8;
  var originX = node.offsetLeft;
  var originY = node.offsetTop;
  var localX = (cx - originX - v.x) / v.scale;
  var localY = (cy - originY - v.y) / v.scale;
  v.scale = next;
  v.x = cx - originX - localX * next;
  v.y = cy - originY - localY * next;
  if (v.scale <= 1.001) {
    v.scale = 1;
    v.x = 0;
    v.y = 0;
  }
  clampPicture(board);
  applyPictureView(board);
}

function bindPictureView(frame, board) {
  if (!frame) return;
  var drag = null;
  frame.addEventListener('pointerdown', function (e) {
    if (measure.armed || picture[board].scale <= 1.001 || e.button !== 0) return;
    if (e.target && e.target.classList && e.target.classList.contains('measure')) return;
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      ox: picture[board].x,
      oy: picture[board].y,
      moved: false
    };
    frame.classList.add('is-panning');
    if (frame.setPointerCapture) {
      try { frame.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  frame.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    picture[board].x = drag.ox + dx;
    picture[board].y = drag.oy + dy;
    clampPicture(board);
    applyPictureView(board);
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var moved = drag.moved;
    drag = null;
    frame.classList.remove('is-panning');
    if (moved) frame.dataset.panned = '1';
  }
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);
}

function bindMeasureLayer(layer) {
  if (!layer) return;
  layer.addEventListener('pointerdown', onMeasureDown);
  layer.addEventListener('pointermove', onMeasureMove);
  layer.addEventListener('click', function (e) {
    if (!measure.armed) return;
    e.preventDefault();
    e.stopPropagation();
  });
  layer.addEventListener('contextmenu', function (e) {
    if (measure.armed) e.preventDefault();
  });
}

function init() {
  ui.drop = document.getElementById('drop');
  ui.dropTitle = document.getElementById('drop-title');
  ui.file = document.getElementById('file');
  ui.orig = document.getElementById('orig');
  ui.out = document.getElementById('out');
  ui.gridCanvas = document.getElementById('grid-layer');
  ui.refGrid = document.getElementById('ref-grid');
  ui.boards = document.getElementById('boards');
  ui.boardSwitch = document.getElementById('board-switch');
  ui.refFigure = document.getElementById('ref-figure');
  ui.studyFigure = document.getElementById('study-figure');
  ui.showReference = document.getElementById('show-reference');
  ui.showStudy = document.getElementById('show-study');
  ui.saveReference = document.getElementById('save-reference');
  ui.saveStudy = document.getElementById('save-study');
  ui.saveBoth = document.getElementById('save-both');
  ui.reset = document.getElementById('reset');
  ui.info = document.getElementById('info');
  ui.error = document.getElementById('error');
  ui.status = document.getElementById('status');
  ui.meter = document.getElementById('meter');
  ui.meterBar = document.getElementById('meter-bar');
  ui.simplify = document.getElementById('simplify');
  ui.steps = document.getElementById('steps');
  ui.soften = document.getElementById('soften');
  ui.contrast = document.getElementById('contrast');
  ui.simplifyOut = document.getElementById('simplify-out');
  ui.stepsOut = document.getElementById('steps-out');
  ui.softenOut = document.getElementById('soften-out');
  ui.contrastOut = document.getElementById('contrast-out');
  ui.grid = document.getElementById('grid');
  ui.ink = document.getElementById('ink');
  ui.gridOn = document.getElementById('grid-on');
  ui.photo = document.getElementById('photo');
  ui.studyPhoto = document.getElementById('study-photo');
  ui.measure = document.getElementById('measure-layer');
  ui.studyMeasure = document.getElementById('study-measure');
  ui.unit = document.getElementById('unit');
  ui.lineColor = document.getElementById('line-color');
  ui.proportionStatus = document.getElementById('proportion-status');
  ui.drawLine = document.getElementById('draw-line');
  ui.copyLines = document.getElementById('copy-lines');
  ui.clearLines = document.getElementById('clear-lines');
  ui.proportionList = document.getElementById('proportion-list');

  applySettings(readSettings());
  syncControls();

  ui.drop.addEventListener('click', function () { ui.file.click(); });

  var dragDepth = 0;
  ui.drop.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dragDepth++;
    ui.drop.classList.add('is-hot');
  });
  ui.drop.addEventListener('dragover', function (e) { e.preventDefault(); });
  ui.drop.addEventListener('dragleave', function () {
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      ui.drop.classList.remove('is-hot');
    }
  });
  ui.drop.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    ui.drop.classList.remove('is-hot');
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  ui.file.addEventListener('change', function () {
    var file = ui.file.files && ui.file.files[0];
    if (file) handleFile(file);
    ui.file.value = '';
  });

  ui.simplify.addEventListener('input', function () {
    syncControls();
    writeSettings();
    scheduleRender(80);
  });
  ui.contrast.addEventListener('input', function () {
    syncControls();
    writeSettings();
    scheduleRender(80);
  });
  ui.steps.addEventListener('input', function () {
    syncControls();
    writeSettings();
    scheduleRender(40);
  });
  ui.soften.addEventListener('input', function () {
    syncControls();
    writeSettings();
    scheduleRender(40);
  });

  var modes = document.querySelectorAll('input[name="mode"]');
  for (var i = 0; i < modes.length; i++) {
    modes[i].addEventListener('change', function () {
      writeSettings();
      if (state.luma) scheduleRender(20);
    });
  }

  function redrawGridOnly() {
    syncControls();
    writeSettings();
    if (state.w) drawGrid();
  }
  ui.grid.addEventListener('change', redrawGridOnly);
  ui.ink.addEventListener('change', redrawGridOnly);
  ui.gridOn.addEventListener('change', redrawGridOnly);

  ui.saveReference.addEventListener('click', function () { saveBoard('reference'); });
  ui.saveStudy.addEventListener('click', function () { saveBoard('study'); });
  ui.saveBoth.addEventListener('click', saveBoth);
  ui.showReference.addEventListener('click', function () {
    setBoardShown('reference', !picture.reference.shown);
  });
  ui.showStudy.addEventListener('click', function () {
    setBoardShown('study', !picture.study.shown);
  });
  ui.reset.addEventListener('click', resetControls);
  ui.drawLine.addEventListener('click', toggleDraw);
  ui.copyLines.addEventListener('click', toggleMirror);
  ui.clearLines.addEventListener('click', clearMeasures);
  ui.unit.addEventListener('input', onUnitInput);
  ui.unit.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
  ui.proportionList.addEventListener('input', onProportionEdit);
  ui.proportionList.addEventListener('click', function (e) {
    var button = e.target.closest ? e.target.closest('.line-remove') : null;
    if (!button) return;
    deleteLine(button.getAttribute('data-id'));
  });
  bindMeasureLayer(ui.measure);
  bindMeasureLayer(ui.studyMeasure);
  syncProportions();

  bindExpand(document.getElementById('orig-frame'));
  bindExpand(document.getElementById('study-frame'));
  bindPictureView(document.getElementById('orig-frame'), 'reference');
  bindPictureView(document.getElementById('study-frame'), 'study');
  document.addEventListener('wheel', function (e) {
    if (!e.metaKey && !e.altKey && !e.ctrlKey) return;
    var node = e.target && e.target.closest ? e.target.closest('.frame') : null;
    if (!node || !state.w) return;
    e.preventDefault();
    zoomPicture(node.id === 'study-frame' ? 'study' : 'reference', e);
  }, { passive: false, capture: true });
  document.addEventListener('keydown', onExpandKey);
  document.addEventListener('fullscreenchange', syncExpandState);
  document.addEventListener('webkitfullscreenchange', syncExpandState);
  restoreSession();
}

if (typeof document !== 'undefined') init();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    kernelFromAmount: kernelFromAmount,
    percentileEnds: percentileEnds,
    mapContrast: mapContrast,
    posterize: posterize,
    gaussianSoften: gaussianSoften,
    medianFilterSync: medianFilterSync,
    medianFilterAsync: medianFilterAsync,
    toLuma: toLuma,
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    gridSpec: gridSpec
  };
}

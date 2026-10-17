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
  bake: false
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
  ui.bake.disabled = !gridOn;
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
}

function drawGrid() {
  var w = ui.out.width;
  var h = ui.out.height;
  var grid = ui.gridCanvas;
  if (!w || !h) return;
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
    ui.save.disabled = false;
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
  ui.save.disabled = true;
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

function adoptImage(decoded, file) {
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
  ui.boards.hidden = false;
  ui.drop.classList.add('is-loaded');
  ui.dropTitle.textContent = 'Replace photo';
  syncControls();
  render();
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

function downloadName() {
  var base = (state.fileName || 'tone-simplifier').replace(/\.[^.]+$/, '');
  var safe = base.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '');
  return (safe || 'tone-simplifier') + '-tones.png';
}

function savePng() {
  if (ui.save.disabled || !ui.out.width) return;
  var canvas = document.createElement('canvas');
  canvas.width = ui.out.width;
  canvas.height = ui.out.height;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(ui.out, 0, 0);
  if (ui.bake.checked && ui.grid.value !== 'none') ctx.drawImage(ui.gridCanvas, 0, 0);
  var link = document.createElement('a');
  link.download = downloadName();
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function resetControls() {
  ui.simplify.value = DEFAULTS.simplify;
  ui.steps.value = DEFAULTS.steps;
  ui.soften.value = DEFAULTS.soften;
  ui.contrast.value = DEFAULTS.contrast;
  ui.grid.value = DEFAULTS.grid;
  ui.ink.value = DEFAULTS.ink;
  ui.bake.checked = DEFAULTS.bake;
  var mode = document.querySelector('input[name="mode"][value="' + DEFAULTS.mode + '"]');
  if (mode) mode.checked = true;
  syncControls();
  if (state.luma) {
    drawGrid();
    scheduleRender(30);
  }
}

function init() {
  ui.drop = document.getElementById('drop');
  ui.dropTitle = document.getElementById('drop-title');
  ui.file = document.getElementById('file');
  ui.orig = document.getElementById('orig');
  ui.out = document.getElementById('out');
  ui.gridCanvas = document.getElementById('grid-layer');
  ui.boards = document.getElementById('boards');
  ui.save = document.getElementById('save');
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
  ui.bake = document.getElementById('bake');

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
    scheduleRender(80);
  });
  ui.contrast.addEventListener('input', function () {
    syncControls();
    scheduleRender(80);
  });
  ui.steps.addEventListener('input', function () {
    syncControls();
    scheduleRender(40);
  });
  ui.soften.addEventListener('input', function () {
    syncControls();
    scheduleRender(40);
  });

  var modes = document.querySelectorAll('input[name="mode"]');
  for (var i = 0; i < modes.length; i++) {
    modes[i].addEventListener('change', function () {
      if (state.luma) scheduleRender(20);
    });
  }

  function redrawGridOnly() {
    syncControls();
    if (ui.out.width) drawGrid();
  }
  ui.grid.addEventListener('change', redrawGridOnly);
  ui.ink.addEventListener('change', redrawGridOnly);

  ui.save.addEventListener('click', savePng);
  ui.reset.addEventListener('click', resetControls);
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

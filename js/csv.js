document.addEventListener('DOMContentLoaded', function () {
  var THEME_KEY = 'csv-theme';
  var menu = document.getElementById('csvMenu');
  var menuToggle = document.getElementById('csvMenuToggle');
  var themeButtons = document.querySelectorAll('[data-theme-choice]');

  function applyTheme(theme) {
    var next = theme === 'light' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    for (var i = 0; i < themeButtons.length; i++) {
      var selected = themeButtons[i].getAttribute('data-theme-choice') === next;
      themeButtons[i].classList.toggle('btn-primary', selected);
      themeButtons[i].classList.toggle('btn-outline-light', !selected);
      themeButtons[i].setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (err) {}
  }

  var storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_KEY);
  } catch (err) {}
  applyTheme(storedTheme === 'light' ? 'light' : 'dark');

  for (var t = 0; t < themeButtons.length; t++) {
    themeButtons[t].addEventListener('click', function (event) {
      applyTheme(event.currentTarget.getAttribute('data-theme-choice'));
    });
  }

  function setMenuOpen(open) {
    menu.hidden = !open;
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.textContent = open ? 'Hide menu' : 'Show menu';
  }

  menuToggle.addEventListener('click', function () {
    setMenuOpen(menu.hidden);
  });

  var fileInput = document.getElementById('csvFile');
  var fileNameLabel = document.getElementById('csvFileName');
  var newTableButton = document.getElementById('newTable');
  var newTableForm = document.getElementById('newTableForm');
  var columnNamesInput = document.getElementById('columnNames');
  var rowCountInput = document.getElementById('rowCount');
  var newTableError = document.getElementById('newTableError');
  var createTableButton = document.getElementById('createTable');
  var cancelNewTableButton = document.getElementById('cancelNewTable');
  var actions = document.getElementById('csvActions');
  var errorBox = document.getElementById('csvError');
  var tableWrap = document.getElementById('csvTableWrap');
  var emptyBox = document.getElementById('csvEmpty');
  var head = document.getElementById('csvHead');
  var body = document.getElementById('csvBody');
  var summary = document.getElementById('csvSummary');
  var addRowButton = document.getElementById('addRow');
  var addColumnButton = document.getElementById('addColumn');
  var clearButton = document.getElementById('clearCsv');
  var exportButton = document.getElementById('exportCsv');
  var copyTools = document.getElementById('csvCopyTools');
  var copyTableButton = document.getElementById('copyTable');
  var selectButton = document.getElementById('selectCells');
  var copySelectionButton = document.getElementById('copySelection');
  var fitColumnsButton = document.getElementById('fitColumns');
  var backButton = document.getElementById('historyBack');
  var forwardButton = document.getElementById('historyForward');
  var cols = document.getElementById('csvCols');
  var table = document.querySelector('.csv-table');
  var copyStatus = document.getElementById('csvCopyStatus');

  var csvData = null;
  var fileName = 'table.csv';
  var columnWidths = [];
  var cellsLocked = false;
  var selectMode = false;
  var selection = {};
  var copyTimer = null;
  var history = [];
  var historyIndex = -1;
  var activeCellKey = null;
  var historySilent = false;
  var MAX_COLUMNS = 50;
  var MAX_ROWS = 200;
  var MIN_COL_WIDTH = 28;
  var MAX_COL_WIDTH = 720;
  var GUTTER_WIDTH = 42;
  var measureCtx = null;

  function parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
      var char = line[i];
      var nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    emptyBox.hidden = true;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function showNewTableError(message) {
    newTableError.textContent = message;
    newTableError.hidden = false;
  }

  function hideNewTableError() {
    newTableError.hidden = true;
    newTableError.textContent = '';
  }

  function setNewTableFormOpen(open) {
    newTableForm.hidden = !open;
    newTableButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    emptyBox.hidden = open || !!csvData;
    if (!open) hideNewTableError();
  }

  function emptyRow(width) {
    var row = [];
    for (var i = 0; i < width; i++) row.push('');
    return row;
  }

  function fitRow(row, width) {
    var next = row.slice(0, width);
    while (next.length < width) next.push('');
    return next;
  }

  function cloneState() {
    return {
      headers: csvData.headers.slice(),
      rows: csvData.rows.map(function (row) {
        return row.slice();
      }),
      widths: columnWidths.slice()
    };
  }

  function statesEqual(a, b) {
    if (!a || !b) return false;
    if (a.headers.length !== b.headers.length || a.rows.length !== b.rows.length) return false;
    var c;
    for (c = 0; c < a.headers.length; c++) {
      if (a.headers[c] !== b.headers[c]) return false;
      if ((a.widths[c] || 0) !== (b.widths[c] || 0)) return false;
    }
    for (var r = 0; r < a.rows.length; r++) {
      if (a.rows[r].length !== b.rows[r].length) return false;
      for (c = 0; c < a.rows[r].length; c++) {
        if ((a.rows[r][c] || '') !== (b.rows[r][c] || '')) return false;
      }
    }
    return true;
  }

  function isDirty() {
    if (!csvData || historyIndex < 0 || !history[historyIndex]) return false;
    return !statesEqual(cloneState(), history[historyIndex]);
  }

  function syncControls() {
    var dirty = isDirty();
    backButton.disabled = !(historyIndex > 0 || dirty);
    forwardButton.disabled = !(!dirty && historyIndex < history.length - 1);
    clearButton.disabled = !csvData || cellsLocked;
    copyTools.hidden = !csvData || !cellsLocked;
    copySelectionButton.disabled = !Object.keys(selection).length;
    selectButton.setAttribute('aria-pressed', selectMode ? 'true' : 'false');
    selectButton.classList.toggle('btn-primary', selectMode);
    selectButton.classList.toggle('btn-outline-primary', !selectMode);
  }

  function resetHistory() {
    history = csvData ? [cloneState()] : [];
    historyIndex = csvData ? 0 : -1;
    activeCellKey = null;
    syncControls();
  }

  function pushHistory() {
    if (!csvData) return false;
    var snap = cloneState();
    if (statesEqual(snap, history[historyIndex])) return false;
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    historyIndex = history.length - 1;
    syncControls();
    return true;
  }

  function commitCellChange() {
    if (historySilent || !csvData) return;
    pushHistory();
  }

  function noteCellFocus(rowIndex, colIndex) {
    var key = rowIndex + ':' + colIndex;
    if (historySilent) {
      activeCellKey = key;
      return;
    }
    if (activeCellKey !== null && activeCellKey !== key) commitCellChange();
    activeCellKey = key;
  }

  function restoreHistory() {
    var snap = history[historyIndex];
    if (!snap || !csvData) return;
    historySilent = true;
    csvData = {
      headers: snap.headers.slice(),
      rows: snap.rows.map(function (row) {
        return row.slice();
      })
    };
    columnWidths = snap.widths.slice();
    activeCellKey = null;
    renderTable();
    historySilent = false;
    syncControls();
  }

  function undo() {
    if (!csvData) return;
    if (isDirty()) {
      restoreHistory();
      return;
    }
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restoreHistory();
  }

  function redo() {
    if (!csvData || isDirty()) return;
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    restoreHistory();
  }

  function confirmDelete(message) {
    return window.confirm(message + '\n\nYou can bring it back with Back.');
  }

  function setChosenFileName(name) {
    if (!fileNameLabel) return;
    fileNameLabel.textContent = name || '';
    fileNameLabel.hidden = !name;
  }

  function clearView() {
    csvData = null;
    fileName = 'table.csv';
    fileInput.value = '';
    setChosenFileName('');
    hideError();
    setNewTableFormOpen(false);
    actions.hidden = true;
    tableWrap.hidden = true;
    emptyBox.hidden = false;
    head.innerHTML = '';
    body.innerHTML = '';
    summary.textContent = '';
    columnWidths = [];
    cols.innerHTML = '';
    cellsLocked = false;
    selectMode = false;
    selection = {};
    table.classList.remove('csv-locked');
    table.classList.remove('csv-selecting');
    table.style.width = '';
    clearCopyStatus();
    resetHistory();
  }

  function clearCopyStatus() {
    if (copyTimer) {
      clearTimeout(copyTimer);
      copyTimer = null;
    }
    copyStatus.textContent = '';
  }

  function showCopyStatus(message) {
    copyStatus.textContent = message;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(function () {
      copyStatus.textContent = '';
      copyTimer = null;
    }, 1400);
  }

  function copyWithTextarea(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.focus();
    area.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function copyText(text, element, label) {
    var value = text == null ? '' : String(text);

    function success() {
      if (element) {
        element.classList.add('csv-copied');
        setTimeout(function () {
          element.classList.remove('csv-copied');
        }, 700);
      }
      showCopyStatus(label || (value ? 'Copied' : 'Copied empty cell'));
    }

    if (copyWithTextarea(value)) {
      success();
      return;
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(success).catch(function () {
        showCopyStatus('Could not copy');
      });
      return;
    }

    showCopyStatus('Could not copy');
  }

  function plainCell(value) {
    return value == null ? '' : String(value).trim();
  }

  function clipboardCell(value) {
    var text = plainCell(value);
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function compactRows(rows) {
    var next = rows.map(function (row) {
      var cells = row.map(plainCell);
      while (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
      return cells;
    });
    while (next.length > 1 && next[next.length - 1].every(function (cell) { return cell === ''; })) {
      next.pop();
    }
    return next;
  }

  function copyGrid(rows, element, label) {
    var text = compactRows(rows).map(function (row) {
      return row.map(clipboardCell).join(',');
    }).join('\n');
    copyText(text, element, label);
  }

  function valueAt(row, col) {
    if (!csvData) return '';
    if (row < 0) return csvData.headers[col] || '';
    return csvData.rows[row] ? csvData.rows[row][col] || '' : '';
  }

  function copyRow(index, element) {
    if (!csvData || !csvData.rows[index]) return;
    copyGrid([csvData.rows[index].slice()], element, 'Copied row');
  }

  function copyColumn(index, element) {
    if (!csvData) return;
    var lines = [[csvData.headers[index] || '']];
    csvData.rows.forEach(function (row) {
      lines.push([row[index] || '']);
    });
    copyGrid(lines, element, 'Copied column');
  }

  function copyWholeTable(element) {
    if (!csvData) return;
    var lines = [csvData.headers.slice()];
    csvData.rows.forEach(function (row) {
      lines.push(row.slice());
    });
    copyGrid(lines, element, 'Copied table');
  }

  function copySelected(element) {
    var keys = Object.keys(selection);
    if (!keys.length || !csvData) return;
    var points = keys.map(function (key) {
      var parts = key.split(':');
      return { row: parseInt(parts[0], 10), col: parseInt(parts[1], 10) };
    }).sort(function (a, b) {
      return a.row - b.row || a.col - b.col;
    });
    var lines = [];
    var line = null;
    var currentRow = null;
    points.forEach(function (point) {
      if (point.row !== currentRow) {
        line = [];
        lines.push(line);
        currentRow = point.row;
      }
      line.push(valueAt(point.row, point.col));
    });
    var count = points.length;
    copyGrid(lines, element, 'Copied ' + count + (count === 1 ? ' cell' : ' cells'));
    var marked = document.querySelectorAll('.csv-copy-cell.csv-selected');
    for (var i = 0; i < marked.length; i++) {
      marked[i].classList.add('csv-copied');
    }
    setTimeout(function () {
      for (var j = 0; j < marked.length; j++) marked[j].classList.remove('csv-copied');
    }, 700);
  }

  function setSelectMode(on) {
    selectMode = !!on && cellsLocked;
    if (!selectMode) {
      selection = {};
      var marked = document.querySelectorAll('.csv-copy-cell.csv-selected');
      for (var i = 0; i < marked.length; i++) {
        marked[i].classList.remove('csv-selected');
        marked[i].setAttribute('aria-pressed', 'false');
      }
    }
    if (table) table.classList.toggle('csv-selecting', selectMode);
    var cells = document.querySelectorAll('.csv-copy-cell');
    for (var c = 0; c < cells.length; c++) {
      cells[c].title = selectMode ? 'Select' : 'Copy';
    }
    syncControls();
  }

  function toggleSelected(rowIndex, colIndex, element) {
    var key = rowIndex + ':' + colIndex;
    if (selection[key]) {
      delete selection[key];
      element.classList.remove('csv-selected');
      element.setAttribute('aria-pressed', 'false');
    } else {
      selection[key] = true;
      element.classList.add('csv-selected');
      element.setAttribute('aria-pressed', 'true');
    }
    syncControls();
  }

  function lockIcon(locked) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    var body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    body.setAttribute('x', '3.15');
    body.setAttribute('y', '7');
    body.setAttribute('width', '9.7');
    body.setAttribute('height', '7.2');
    body.setAttribute('rx', '1.2');
    body.setAttribute('fill', locked ? 'currentColor' : 'none');
    body.setAttribute('stroke', 'currentColor');
    body.setAttribute('stroke-width', '1.4');
    var shackle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shackle.setAttribute('fill', 'none');
    shackle.setAttribute('stroke', 'currentColor');
    shackle.setAttribute('stroke-width', '1.4');
    shackle.setAttribute('stroke-linecap', 'round');
    shackle.setAttribute(
      'd',
      locked ? 'M5.15 7V4.7a2.85 2.85 0 0 1 5.7 0V7' : 'M5.15 7V4.7a2.85 2.85 0 0 1 4.9-1.95'
    );
    svg.appendChild(body);
    svg.appendChild(shackle);
    return svg;
  }

  function lockButton() {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'csv-lock';
    button.setAttribute('aria-pressed', cellsLocked ? 'true' : 'false');
    button.setAttribute('aria-label', cellsLocked ? 'Unlock cells' : 'Lock cells');
    button.setAttribute('data-key', 'L');
    button.title = cellsLocked
      ? 'Unlock cells (⌘/⌥ L). Deleting is off while locked.'
      : 'Lock cells (⌘/⌥ L). A click then copies the cell text.';
    button.appendChild(lockIcon(cellsLocked));
    button.addEventListener('click', function () {
      if (!cellsLocked) commitCellChange();
      else setSelectMode(false);
      cellsLocked = !cellsLocked;
      if (!cellsLocked) {
        selectMode = false;
        selection = {};
      }
      clearCopyStatus();
      renderTable();
    });
    return button;
  }

  function copyControl(value, rowIndex, colIndex) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'csv-copy-cell';
    var text = value == null ? '' : String(value);
    button.textContent = text;
    button.setAttribute('data-row', String(rowIndex));
    button.setAttribute('data-col', String(colIndex));
    button.title = selectMode ? 'Select' : 'Copy';
    if (selection[rowIndex + ':' + colIndex]) {
      button.classList.add('csv-selected');
      button.setAttribute('aria-pressed', 'true');
    }
    if (rowIndex < 0) {
      button.setAttribute('aria-label', 'Copy column ' + (colIndex + 1) + ' name' + (text ? ': ' + text : ''));
    } else {
      button.setAttribute(
        'aria-label',
        'Copy row ' + (rowIndex + 1) + ', column ' + (colIndex + 1) + (text ? ': ' + text : '')
      );
    }
    button.addEventListener('click', function () {
      if (selectMode) {
        toggleSelected(rowIndex, colIndex, button);
        return;
      }
      copyText(plainCell(text), button, plainCell(text) ? 'Copied' : 'Copied empty cell');
    });
    return button;
  }

  function copyIcon() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    var back = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    back.setAttribute('x', '5');
    back.setAttribute('y', '2');
    back.setAttribute('width', '9');
    back.setAttribute('height', '9');
    back.setAttribute('rx', '1.2');
    back.setAttribute('fill', 'none');
    back.setAttribute('stroke', 'currentColor');
    back.setAttribute('stroke-width', '1.4');
    var front = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    front.setAttribute('x', '2');
    front.setAttribute('y', '5');
    front.setAttribute('width', '9');
    front.setAttribute('height', '9');
    front.setAttribute('rx', '1.2');
    front.setAttribute('fill', 'none');
    front.setAttribute('stroke', 'currentColor');
    front.setAttribute('stroke-width', '1.4');
    svg.appendChild(back);
    svg.appendChild(front);
    return svg;
  }

  function copyIconButton(label, onClick) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'csv-copy-btn';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.appendChild(copyIcon());
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      onClick(button);
    });
    return button;
  }

  function cellInput(value, rowIndex, colIndex) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'csv-cell';
    input.value = value == null ? '' : String(value);
    input.setAttribute('data-row', String(rowIndex));
    input.setAttribute('data-col', String(colIndex));
    if (rowIndex < 0) {
      input.setAttribute('aria-label', 'Column ' + (colIndex + 1) + ' name');
    } else {
      input.setAttribute(
        'aria-label',
        'Row ' + (rowIndex + 1) + ', column ' + (colIndex + 1)
      );
    }
    input.addEventListener('focus', function () {
      noteCellFocus(rowIndex, colIndex);
    });
    input.addEventListener('input', function () {
      if (!csvData) return;
      if (rowIndex < 0) csvData.headers[colIndex] = input.value;
      else csvData.rows[rowIndex][colIndex] = input.value;
      syncControls();
    });
    input.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' || rowIndex < 0) return;
      event.preventDefault();
      var nextRow = rowIndex + 1;
      if (nextRow >= csvData.rows.length) {
        addRow({ row: nextRow, col: colIndex });
        return;
      }
      focusCell(nextRow, colIndex);
    });
    return input;
  }

  function removeButton(label, onClick) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'csv-remove';
    button.textContent = '×';
    button.setAttribute('aria-label', label);
    if (cellsLocked) {
      button.disabled = true;
      button.title = 'Unlock the table to delete';
    }
    button.addEventListener('click', onClick);
    return button;
  }

  function measureText(text) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = getComputedStyle(document.body).font;
    return measureCtx.measureText(String(text || '')).width;
  }

  function widthForText(text, extra) {
    var px = Math.ceil(measureText(text)) + 28 + (extra || 0);
    if (px < MIN_COL_WIDTH) px = MIN_COL_WIDTH;
    if (px > MAX_COL_WIDTH) px = MAX_COL_WIDTH;
    return px;
  }

  function fitWidth(index) {
    var header = csvData.headers[index] == null ? '' : String(csvData.headers[index]);
    var longest = '';
    csvData.rows.forEach(function (row) {
      var value = row[index] == null ? '' : String(row[index]);
      if (value.length > longest.length) longest = value;
    });
    return Math.max(widthForText(header, 32), widthForText(longest, 8));
  }

  function fitAllColumns() {
    if (!csvData) return;
    columnWidths = csvData.headers.map(function (_, index) {
      return fitWidth(index);
    });
    applyColumnWidths();
  }

  function syncWidths() {
    var next = [];
    for (var i = 0; i < csvData.headers.length; i++) {
      next[i] = columnWidths[i] || fitWidth(i);
    }
    columnWidths = next;
  }

  function applyColumnWidths() {
    cols.innerHTML = '';
    var gutter = document.createElement('col');
    gutter.className = 'csv-gutter-col';
    cols.appendChild(gutter);
    var total = GUTTER_WIDTH;
    columnWidths.forEach(function (width) {
      var next = width < MIN_COL_WIDTH ? MIN_COL_WIDTH : width;
      if (next > MAX_COL_WIDTH) next = MAX_COL_WIDTH;
      var col = document.createElement('col');
      col.style.width = next + 'px';
      cols.appendChild(col);
      total += next;
    });
    table.style.width = total + 'px';
  }

  function resizeHandle(index) {
    var handle = document.createElement('span');
    handle.className = 'csv-resize';
    handle.title = 'Drag to resize. Double-click to fit the text.';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize column ' + (index + 1));

    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      var startX = event.clientX;
      var startWidth = columnWidths[index];
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (err) {}
      document.body.classList.add('csv-resizing');

      function move(moveEvent) {
        if (moveEvent.pointerId !== event.pointerId) return;
        var next = Math.round(startWidth + (moveEvent.clientX - startX));
        if (next < MIN_COL_WIDTH) next = MIN_COL_WIDTH;
        if (next > MAX_COL_WIDTH) next = MAX_COL_WIDTH;
        columnWidths[index] = next;
        applyColumnWidths();
      }

      function end(endEvent) {
        if (endEvent.pointerId !== event.pointerId) return;
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        document.body.classList.remove('csv-resizing');
      }

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });

    handle.addEventListener('dblclick', function (event) {
      event.preventDefault();
      event.stopPropagation();
      columnWidths[index] = fitWidth(index);
      applyColumnWidths();
    });

    return handle;
  }

  function focusCell(rowIndex, colIndex) {
    var selector =
      rowIndex < 0
        ? '#csvHead [data-col="' + colIndex + '"]'
        : '#csvBody [data-row="' + rowIndex + '"][data-col="' + colIndex + '"]';
    var input = document.querySelector(selector);
    if (input) input.focus();
  }

  function cellControl(value, rowIndex, colIndex) {
    if (cellsLocked) return copyControl(value, rowIndex, colIndex);
    return cellInput(value, rowIndex, colIndex);
  }

  function renderTable(focus) {
    if (!csvData) return;

    head.innerHTML = '';
    body.innerHTML = '';
    syncWidths();
    applyColumnWidths();

    table.classList.toggle('csv-locked', cellsLocked);
    table.classList.toggle('csv-selecting', selectMode && cellsLocked);

    var headerRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'csv-row-actions';
    corner.appendChild(lockButton());
    headerRow.appendChild(corner);
    csvData.headers.forEach(function (header, index) {
      var th = document.createElement('th');
      th.scope = 'col';
      var wrap = document.createElement('div');
      wrap.className = 'csv-head-cell';
      wrap.appendChild(cellControl(header, -1, index));
      if (cellsLocked) {
        wrap.appendChild(copyIconButton('Copy column ' + (header || index + 1), function (button) {
          copyColumn(index, button);
        }));
      } else {
        var removeCol = removeButton('Remove column ' + (index + 1), function () {
          removeColumn(index);
        });
        if (csvData.headers.length < 2) removeCol.disabled = true;
        wrap.appendChild(removeCol);
      }
      th.appendChild(wrap);
      th.appendChild(resizeHandle(index));
      headerRow.appendChild(th);
    });
    head.appendChild(headerRow);

    csvData.rows.forEach(function (row, rowIndex) {
      var tr = document.createElement('tr');
      var actionCell = document.createElement('td');
      actionCell.className = 'csv-row-actions';
      if (cellsLocked) {
        actionCell.appendChild(copyIconButton('Copy row ' + (rowIndex + 1), function (button) {
          copyRow(rowIndex, button);
        }));
      } else {
        actionCell.appendChild(
          removeButton('Remove row ' + (rowIndex + 1), function () {
            removeRow(rowIndex);
          })
        );
      }
      tr.appendChild(actionCell);
      for (var i = 0; i < csvData.headers.length; i++) {
        var td = document.createElement('td');
        td.appendChild(cellControl(row[i], rowIndex, i));
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });

    var rowLabel = csvData.rows.length === 1 ? 'row' : 'rows';
    var columnLabel = csvData.headers.length === 1 ? 'column' : 'columns';
    summary.textContent =
      csvData.rows.length +
      ' ' +
      rowLabel +
      ', ' +
      csvData.headers.length +
      ' ' +
      columnLabel;

    hideError();
    emptyBox.hidden = true;
    newTableForm.hidden = true;
    newTableButton.setAttribute('aria-expanded', 'false');
    actions.hidden = false;
    tableWrap.hidden = false;

    activeCellKey = null;
    syncControls();
    if (focus) focusCell(focus.row, focus.col);
  }

  function openTable(headers, rows, name, locked) {
    cellsLocked = !!locked;
    selectMode = false;
    selection = {};
    csvData = {
      headers: headers.slice(),
      rows: rows.map(function (row) {
        return fitRow(row, headers.length);
      })
    };
    fileName = name || 'table.csv';
    columnWidths = [];
    activeCellKey = null;
    renderTable();
    resetHistory();
  }

  function parseCSV(text, name) {
    var source = text.replace(/^\uFEFF/, '');
    var lines = source.split(/\r\n|\n|\r/).filter(function (line) {
      return line.trim() !== '';
    });

    if (lines.length === 0) {
      showError('The CSV file is empty.');
      return;
    }

    var headers = parseCSVLine(lines[0]).map(function (header, index) {
      var name = header.trim();
      return name || 'Column ' + (index + 1);
    });

    if (headers.length > MAX_COLUMNS) {
      showError('This file has more than ' + MAX_COLUMNS + ' columns.');
      return;
    }

    var rows = lines.slice(1).map(function (line) {
      return parseCSVLine(line).map(function (cell) {
        return cell.trim();
      });
    });

    if (rows.length > MAX_ROWS) {
      showError('This file has more than ' + MAX_ROWS + ' rows.');
      return;
    }

    openTable(headers, rows, name, true);
  }

  function defaultHeaders() {
    return ['Column 1', 'Column 2', 'Column 3'];
  }

  function readNewTableForm() {
    var names = columnNamesInput.value
      .split(',')
      .map(function (name) {
        return name.trim();
      })
      .filter(function (name) {
        return name !== '';
      });

    if (names.length === 0) names = defaultHeaders();
    if (names.length > MAX_COLUMNS) {
      return { error: 'Use ' + MAX_COLUMNS + ' columns or fewer.' };
    }

    var rows = parseInt(rowCountInput.value, 10);
    if (!rows || rows < 1) {
      return { error: 'Enter at least 1 row.' };
    }
    if (rows > MAX_ROWS) {
      return { error: 'Use ' + MAX_ROWS + ' rows or fewer.' };
    }

    return { headers: names, rowCount: rows };
  }

  function createTable() {
    var form = readNewTableForm();
    if (form.error) {
      showNewTableError(form.error);
      return;
    }

    var rows = [];
    for (var i = 0; i < form.rowCount; i++) rows.push(emptyRow(form.headers.length));
    hideNewTableError();
    columnNamesInput.value = '';
    rowCountInput.value = '5';
    fileInput.value = '';
    setChosenFileName('');
    openTable(form.headers, rows, 'table.csv', false);
    focusCell(0, 0);
  }

  function addRow(focus) {
    if (!csvData) return;
    if (csvData.rows.length >= MAX_ROWS) {
      showError('A table can have up to ' + MAX_ROWS + ' rows.');
      return;
    }
    commitCellChange();
    csvData.rows.push(emptyRow(csvData.headers.length));
    pushHistory();
    var rowIndex = csvData.rows.length - 1;
    renderTable(focus && typeof focus.row === 'number' ? focus : { row: rowIndex, col: 0 });
  }

  function addColumn() {
    if (!csvData) return;
    if (csvData.headers.length >= MAX_COLUMNS) {
      showError('A table can have up to ' + MAX_COLUMNS + ' columns.');
      return;
    }
    commitCellChange();
    var index = csvData.headers.length;
    csvData.headers.push('Column ' + (index + 1));
    csvData.rows.forEach(function (row) {
      row.push('');
    });
    columnWidths.push(fitWidth(index));
    pushHistory();
    renderTable({ row: -1, col: index });
  }

  function removeRow(index) {
    if (!csvData || cellsLocked) return;
    if (!confirmDelete('Delete row ' + (index + 1) + '?')) return;
    commitCellChange();
    csvData.rows.splice(index, 1);
    pushHistory();
    renderTable();
  }

  function removeColumn(index) {
    if (!csvData || cellsLocked || csvData.headers.length < 2) return;
    var name = csvData.headers[index] || 'Column ' + (index + 1);
    if (!confirmDelete('Delete column "' + name + '"?')) return;
    commitCellChange();
    csvData.headers.splice(index, 1);
    csvData.rows.forEach(function (row) {
      row.splice(index, 1);
    });
    columnWidths.splice(index, 1);
    pushHistory();
    renderTable();
  }

  function escapeCell(value) {
    var text = value == null ? '' : String(value);
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function downloadCsv() {
    if (!csvData) return;

    var lines = [csvData.headers.map(escapeCell).join(',')];
    csvData.rows.forEach(function (row) {
      lines.push(csvData.headers.map(function (_, index) {
        return escapeCell(row[index]);
      }).join(','));
    });

    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = window.URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'table.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  }

  fileInput.addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (!file) return;
    setChosenFileName(file.name);

    if (file.type && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel' && !file.name.toLowerCase().endsWith('.csv')) {
      showError('Please upload a CSV file.');
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        parseCSV(String(e.target.result || ''), file.name);
      } catch (err) {
        showError('Could not read that file.');
      }
    };
    reader.onerror = function () {
      showError('Could not read that file.');
    };
    reader.readAsText(file);
  });

  newTableButton.addEventListener('click', function () {
    var open = newTableForm.hidden;
    setNewTableFormOpen(open);
    if (open) columnNamesInput.focus();
  });

  cancelNewTableButton.addEventListener('click', function () {
    setNewTableFormOpen(false);
    newTableButton.focus();
  });

  createTableButton.addEventListener('click', createTable);

  newTableForm.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && event.target !== cancelNewTableButton) {
      event.preventDefault();
      createTable();
    }
  });

  addRowButton.addEventListener('click', function () {
    addRow();
  });
  addColumnButton.addEventListener('click', addColumn);
  fitColumnsButton.addEventListener('click', fitAllColumns);
  backButton.addEventListener('click', undo);
  forwardButton.addEventListener('click', redo);
  clearButton.addEventListener('click', function () {
    if (!csvData || cellsLocked) return;
    if (!window.confirm('Clear this table? This cannot be undone.')) return;
    clearView();
  });
  exportButton.addEventListener('click', downloadCsv);
  copyTableButton.addEventListener('click', function () {
    copyWholeTable(copyTableButton);
  });
  selectButton.addEventListener('click', function () {
    if (!cellsLocked) return;
    setSelectMode(!selectMode);
  });
  copySelectionButton.addEventListener('click', function () {
    copySelected(copySelectionButton);
  });

  var shortcutHelp = document.getElementById('shortcutHelp');
  var shortcutPanel = document.getElementById('shortcutPanel');
  var shortcutClose = document.getElementById('shortcutClose');

  function setShortcutHelp(open) {
    shortcutPanel.hidden = !open;
    shortcutHelp.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) shortcutClose.focus();
  }

  shortcutHelp.addEventListener('click', function () {
    setShortcutHelp(shortcutPanel.hidden);
  });
  shortcutClose.addEventListener('click', function () {
    setShortcutHelp(false);
    shortcutHelp.focus();
  });

  function chordLetter(event) {
    var key = event.key || '';
    if (key === 'l' || key === 'L' || key === 'л' || key === 'Л') return 'l';
    if (key === 'a' || key === 'A' || key === 'а' || key === 'А') return 'a';
    if (key === 'c' || key === 'C' || key === 'с' || key === 'С') return 'c';
    if (key === 'r' || key === 'R' || key === 'р' || key === 'Р') return 'r';
    if (event.code && /^Key[A-Z]$/.test(event.code)) return event.code.charAt(3).toLowerCase();
    return '';
  }

  function typingInForm(event) {
    var target = event.target;
    return target && (target.id === 'columnNames' || target.id === 'rowCount' || target.id === 'csvFile');
  }

  function toggleLock() {
    if (!csvData) return;
    var button = document.querySelector('.csv-lock');
    if (button) button.click();
  }

  var addMenu = document.getElementById('addMenu');
  var addMenuRow = document.getElementById('addMenuRow');
  var addMenuColumn = document.getElementById('addMenuColumn');

  function setAddMenu(open) {
    if (!addMenu) return;
    if (open && csvData) {
      var rect = addRowButton.getBoundingClientRect();
      addMenu.hidden = false;
      addMenu.style.top = Math.round(rect.bottom + 4) + 'px';
      addMenu.style.left = Math.round(rect.left) + 'px';
      addMenuRow.focus();
      return;
    }
    addMenu.hidden = true;
  }

  function chooseAdd(kind) {
    setAddMenu(false);
    if (kind === 'column') addColumn();
    else addRow();
  }

  addMenuRow.addEventListener('click', function () {
    chooseAdd('row');
  });
  addMenuColumn.addEventListener('click', function () {
    chooseAdd('column');
  });
  document.addEventListener('mousedown', function (event) {
    if (!addMenu || addMenu.hidden) return;
    if (addMenu.contains(event.target)) return;
    setAddMenu(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.altKey || event.metaKey || event.key === 'Alt' || event.key === 'Meta') {
      document.body.classList.add('csv-keys');
    }

    if (addMenu && !addMenu.hidden) {
      if (event.key === 'Alt' || event.key === 'Meta' || event.key === 'Shift' || event.key === 'Control') return;
      event.preventDefault();
      if (event.repeat) return;
      var pick = chordLetter(event);
      if (pick === 'c') chooseAdd('column');
      else if (pick === 'r') chooseAdd('row');
      else setAddMenu(false);
      return;
    }

    if (event.key === 'Escape') {
      if (!shortcutPanel.hidden) {
        setShortcutHelp(false);
        shortcutHelp.focus();
        return;
      }
      if (selectMode) {
        setSelectMode(false);
        return;
      }
      if (!newTableForm.hidden) {
        setNewTableFormOpen(false);
        newTableButton.focus();
      }
      return;
    }

    if (event.repeat) return;

    var letter = chordLetter(event);
    var mod = event.altKey || event.metaKey;
    var undoMod = (event.ctrlKey || event.metaKey) && !event.altKey;

    if (undoMod && (letter === 'z' || letter === 'y') && csvData && !typingInForm(event)) {
      event.preventDefault();
      if (event.shiftKey || letter === 'y') redo();
      else undo();
      return;
    }

    if (!mod || event.ctrlKey) return;

    if (letter === 'l') {
      event.preventDefault();
      toggleLock();
      return;
    }
    if (event.key === '?' || event.key === '/') {
      event.preventDefault();
      setShortcutHelp(shortcutPanel.hidden);
      return;
    }
    if (letter === 'm') {
      event.preventDefault();
      setMenuOpen(menu.hidden);
      return;
    }
    if (letter === 'd') {
      event.preventDefault();
      applyTheme(event.shiftKey ? 'light' : 'dark');
      return;
    }
    if (letter === 'b') {
      event.preventDefault();
      fileInput.click();
      return;
    }
    if (letter === 'n') {
      event.preventDefault();
      newTableButton.click();
      return;
    }
    if (!newTableForm.hidden && event.key === 'Enter') {
      event.preventDefault();
      createTable();
      return;
    }
    if (!csvData) return;

    if (letter === 'a') {
      event.preventDefault();
      setAddMenu(addMenu.hidden);
      return;
    }
    if (letter === 'f') {
      event.preventDefault();
      fitAllColumns();
      return;
    }
    if (letter === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (letter === 'e' && !event.shiftKey) {
      event.preventDefault();
      downloadCsv();
      return;
    }
    if (event.key === 'Backspace' && !cellsLocked) {
      event.preventDefault();
      clearButton.click();
      return;
    }
    if (!cellsLocked) return;
    if (letter === 'e' && event.shiftKey) {
      event.preventDefault();
      copyWholeTable(copyTableButton);
      return;
    }
    if (letter === 's' && !event.shiftKey) {
      event.preventDefault();
      setSelectMode(!selectMode);
      return;
    }
    if (letter === 's' && event.shiftKey) {
      event.preventDefault();
      copySelected(copySelectionButton);
    }
  });

  document.addEventListener('keyup', function (event) {
    if (!event.altKey && !event.metaKey) document.body.classList.remove('csv-keys');
  });
  window.addEventListener('blur', function () {
    document.body.classList.remove('csv-keys');
  });
});

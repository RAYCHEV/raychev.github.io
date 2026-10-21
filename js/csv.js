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
  var fitColumnsButton = document.getElementById('fitColumns');
  var cols = document.getElementById('csvCols');
  var table = document.querySelector('.csv-table');
  var copyStatus = document.getElementById('csvCopyStatus');

  var csvData = null;
  var fileName = 'table.csv';
  var columnWidths = [];
  var cellsLocked = false;
  var copyTimer = null;
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

  function clearView() {
    csvData = null;
    fileName = 'table.csv';
    fileInput.value = '';
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
    table.classList.remove('csv-locked');
    table.style.width = '';
    clearCopyStatus();
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

  function copyCellText(text, element) {
    var value = text == null ? '' : String(text);

    function success() {
      element.classList.add('csv-copied');
      showCopyStatus(value ? 'Copied' : 'Copied empty cell');
      setTimeout(function () {
        element.classList.remove('csv-copied');
      }, 700);
    }

    if (copyWithTextarea(value)) {
      success();
      return;
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(success).catch(function () {
        showCopyStatus('Could not copy that cell');
      });
      return;
    }

    showCopyStatus('Could not copy that cell');
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
    button.title = cellsLocked
      ? 'Unlock cells'
      : 'Lock cells. A click then copies the cell text.';
    button.appendChild(lockIcon(cellsLocked));
    button.addEventListener('click', function () {
      cellsLocked = !cellsLocked;
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
    button.title = 'Copy';
    if (rowIndex < 0) {
      button.setAttribute('aria-label', 'Copy column ' + (colIndex + 1) + ' name' + (text ? ': ' + text : ''));
    } else {
      button.setAttribute(
        'aria-label',
        'Copy row ' + (rowIndex + 1) + ', column ' + (colIndex + 1) + (text ? ': ' + text : '')
      );
    }
    button.addEventListener('click', function () {
      copyCellText(text, button);
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
    input.addEventListener('input', function () {
      if (!csvData) return;
      if (rowIndex < 0) csvData.headers[colIndex] = input.value;
      else csvData.rows[rowIndex][colIndex] = input.value;
    });
    input.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' || rowIndex < 0) return;
      event.preventDefault();
      var nextRow = rowIndex + 1;
      if (nextRow >= csvData.rows.length) {
        if (csvData.rows.length >= MAX_ROWS) {
          showError('A table can have up to ' + MAX_ROWS + ' rows.');
          return;
        }
        csvData.rows.push(emptyRow(csvData.headers.length));
        renderTable({ row: nextRow, col: colIndex });
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
      var removeCol = removeButton('Remove column ' + (index + 1), function () {
        removeColumn(index);
      });
      if (csvData.headers.length < 2) removeCol.disabled = true;
      wrap.appendChild(removeCol);
      th.appendChild(wrap);
      th.appendChild(resizeHandle(index));
      headerRow.appendChild(th);
    });
    head.appendChild(headerRow);

    csvData.rows.forEach(function (row, rowIndex) {
      var tr = document.createElement('tr');
      var actionCell = document.createElement('td');
      actionCell.className = 'csv-row-actions';
      actionCell.appendChild(
        removeButton('Remove row ' + (rowIndex + 1), function () {
          removeRow(rowIndex);
        })
      );
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

    if (focus) focusCell(focus.row, focus.col);
  }

  function openTable(headers, rows, name) {
    csvData = {
      headers: headers.slice(),
      rows: rows.map(function (row) {
        return fitRow(row, headers.length);
      })
    };
    fileName = name || 'table.csv';
    columnWidths = [];
    renderTable();
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

    openTable(headers, rows, name);
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
    openTable(form.headers, rows, 'table.csv');
    focusCell(0, 0);
  }

  function addRow() {
    if (!csvData) return;
    if (csvData.rows.length >= MAX_ROWS) {
      showError('A table can have up to ' + MAX_ROWS + ' rows.');
      return;
    }
    csvData.rows.push(emptyRow(csvData.headers.length));
    renderTable({ row: csvData.rows.length - 1, col: 0 });
  }

  function addColumn() {
    if (!csvData) return;
    if (csvData.headers.length >= MAX_COLUMNS) {
      showError('A table can have up to ' + MAX_COLUMNS + ' columns.');
      return;
    }
    var index = csvData.headers.length;
    csvData.headers.push('Column ' + (index + 1));
    csvData.rows.forEach(function (row) {
      row.push('');
    });
    columnWidths.push(0);
    renderTable({ row: -1, col: index });
  }

  function removeRow(index) {
    if (!csvData) return;
    csvData.rows.splice(index, 1);
    renderTable();
  }

  function removeColumn(index) {
    if (!csvData || csvData.headers.length < 2) return;
    csvData.headers.splice(index, 1);
    csvData.rows.forEach(function (row) {
      row.splice(index, 1);
    });
    columnWidths.splice(index, 1);
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

  addRowButton.addEventListener('click', addRow);
  addColumnButton.addEventListener('click', addColumn);
  fitColumnsButton.addEventListener('click', fitAllColumns);
  clearButton.addEventListener('click', clearView);
  exportButton.addEventListener('click', downloadCsv);
});

document.addEventListener('DOMContentLoaded', function () {
  var fileInput = document.getElementById('csvFile');
  var actions = document.getElementById('csvActions');
  var errorBox = document.getElementById('csvError');
  var tableWrap = document.getElementById('csvTableWrap');
  var emptyBox = document.getElementById('csvEmpty');
  var head = document.getElementById('csvHead');
  var body = document.getElementById('csvBody');
  var summary = document.getElementById('csvSummary');
  var clearButton = document.getElementById('clearCsv');
  var exportButton = document.getElementById('exportCsv');

  var csvData = null;

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
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    actions.hidden = true;
    tableWrap.hidden = true;
    emptyBox.hidden = true;
  }

  function clearView() {
    csvData = null;
    fileInput.value = '';
    errorBox.hidden = true;
    errorBox.textContent = '';
    actions.hidden = true;
    tableWrap.hidden = true;
    emptyBox.hidden = false;
    head.innerHTML = '';
    body.innerHTML = '';
    summary.textContent = '';
  }

  function renderTable(headers, rows) {
    head.innerHTML = '';
    body.innerHTML = '';

    var headerRow = document.createElement('tr');
    headers.forEach(function (header, index) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = header || 'Column ' + (index + 1);
      headerRow.appendChild(th);
    });
    head.appendChild(headerRow);

    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      for (var i = 0; i < headers.length; i++) {
        var td = document.createElement('td');
        td.textContent = row[i] || '-';
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });

    var rowLabel = rows.length === 1 ? 'row' : 'rows';
    var columnLabel = headers.length === 1 ? 'column' : 'columns';
    summary.textContent = 'Showing ' + rows.length + ' ' + rowLabel + ' with ' + headers.length + ' ' + columnLabel;

    errorBox.hidden = true;
    emptyBox.hidden = true;
    actions.hidden = false;
    tableWrap.hidden = false;
  }

  function parseCSV(text) {
    var lines = text.split('\n').filter(function (line) {
      return line.trim() !== '';
    });

    if (lines.length === 0) {
      showError('CSV file is empty');
      return;
    }

    var headers = parseCSVLine(lines[0]);
    var rows = lines.slice(1).map(parseCSVLine);
    csvData = { headers: headers, rows: rows };
    renderTable(headers, rows);
  }

  fileInput.addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      showError('Please upload a CSV file');
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        parseCSV(e.target.result);
      } catch (err) {
        showError('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  clearButton.addEventListener('click', clearView);

  exportButton.addEventListener('click', function () {
    if (!csvData) return;

    var csvContent = [csvData.headers.join(',')].concat(
      csvData.rows.map(function (row) {
        return row.join(',');
      })
    ).join('\n');

    var blob = new Blob([csvContent], { type: 'text/csv' });
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'exported.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  });
});

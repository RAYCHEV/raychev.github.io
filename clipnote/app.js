(function () {
  var STORAGE_KEY = "clipnote";
  var MAX_FILE_BYTES = 2 * 1024 * 1024;
  var NOTICE_MS = 3000;

  var titleInput = document.getElementById("title");
  var source = document.getElementById("source");
  var sheet = document.getElementById("sheet");
  var hint = document.getElementById("hint");
  var lockButton = document.getElementById("lock");
  var lockLabel = document.getElementById("lockLabel");
  var openButton = document.getElementById("open");
  var saveButton = document.getElementById("save");
  var clearButton = document.getElementById("clear");
  var clearLabel = document.getElementById("clearLabel");
  var fileInput = document.getElementById("file");
  var notice = document.getElementById("notice");

  var locked = false;
  var noticeTimer = 0;
  var clearTimer = 0;

  restore();
  render();

  titleInput.addEventListener("input", save);
  source.addEventListener("input", save);
  lockButton.addEventListener("click", toggleLock);
  openButton.addEventListener("click", function () {
    fileInput.click();
  });
  saveButton.addEventListener("click", saveHtml);
  clearButton.addEventListener("click", deleteAll);
  window.addEventListener("pagehide", save);
  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (file) readFile(file);
  });

  document.addEventListener("keydown", function (event) {
    if (event.repeat || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (event.code === "KeyO") {
      event.preventDefault();
      fileInput.click();
    } else if (event.code === "KeyS") {
      event.preventDefault();
      saveHtml();
    } else if (event.code === "KeyL") {
      event.preventDefault();
      toggleLock();
    } else if (event.code === "KeyD") {
      event.preventDefault();
      deleteAll();
    }
  });

  document.addEventListener("dragover", function (event) {
    if (!droppedFile(event)) return;
    event.preventDefault();
    document.body.classList.add("dragover");
  });
  document.addEventListener("dragleave", function (event) {
    if (event.target === document.documentElement || event.target === document.body) {
      document.body.classList.remove("dragover");
    }
  });
  document.addEventListener("drop", function (event) {
    var file = droppedFile(event);
    document.body.classList.remove("dragover");
    if (!file) return;
    event.preventDefault();
    readFile(file);
  });

  function toggleLock() {
    locked = !locked;
    save();
    render();
  }

  function deleteAll() {
    if (!clearTimer) {
      clearLabel.textContent = "Confirm";
      clearButton.classList.add("armed");
      showNotice("Press Delete all again to remove the note from this browser.");
      clearTimer = window.setTimeout(disarmDelete, 3000);
      return;
    }
    disarmDelete();
    titleInput.value = "";
    source.value = "";
    locked = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* Storage may already be unavailable. */
    }
    render();
    showNotice("Deleted.");
  }

  function disarmDelete() {
    window.clearTimeout(clearTimer);
    clearTimer = 0;
    clearLabel.textContent = "Delete all";
    clearButton.classList.remove("armed");
  }

  function setText(text) {
    source.value = text;
    save();
    render();
  }

  function readFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showNotice("That file is too large to open here.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var imported = importNote(String(reader.result || ""), file.name);
      setText(imported.text);
      if (!titleInput.value.trim() && imported.title) {
        titleInput.value = imported.title.slice(0, 80);
        save();
        render();
      }
    };
    reader.onerror = function () {
      showNotice("Could not read that file.");
    };
    reader.readAsText(file);
  }

  function render() {
    var title = titleInput.value.trim();
    document.title = title ? title + " — Clipnote" : "Clipnote";
    titleInput.readOnly = locked;
    lockLabel.textContent = locked ? "Unlock" : "Lock";
    hint.textContent = locked
      ? "Tap a block to copy it."
      : "Lines that follow each other are one block. Leave one blank line between blocks.";
    source.hidden = locked;
    sheet.hidden = !locked;
    if (!locked) {
      sheet.replaceChildren();
      return;
    }
    sheet.replaceChildren();
    var blocks = blocksFrom(source.value);
    blocks.forEach(function (text, index) {
      sheet.appendChild(blockRow(index + 1, text));
    });

    if (!blocks.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Nothing to copy yet. Unlock the note and add some text.";
      sheet.appendChild(empty);
    }
  }

  function blocksFrom(text) {
    var blocks = [];
    var current = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) {
        if (current.length) {
          blocks.push(current.join("\n"));
          current = [];
        }
        return;
      }
      current.push(line.trim());
    });
    if (current.length) blocks.push(current.join("\n"));
    return blocks;
  }

  function blockRow(number, text) {
    var row = document.createElement("div");
    row.className = "line";

    var num = document.createElement("span");
    num.className = "num";
    num.textContent = number + ".";

    var copy = document.createElement("a");
    copy.href = "#";
    copy.className = "copy";
    copy.textContent = text;
    copy.addEventListener("click", function (event) {
      event.preventDefault();
      copyLine(copy, text);
    });

    row.appendChild(num);
    row.appendChild(copy);
    appendVisitButtons(row, text);
    return row;
  }

  function appendVisitButtons(row, text) {
    var urls = [];
    text.split("\n").forEach(function (line) {
      var url = safeHttpUrl(line);
      if (url && urls.indexOf(url) === -1) urls.push(url);
    });
    if (!urls.length) return;
    var visits = document.createElement("div");
    visits.className = "visits";
    urls.forEach(function (url) {
      var visit = document.createElement("button");
      visit.type = "button";
      visit.className = "visit";
      visit.textContent = "<< Visit Site >>";
      visit.addEventListener("click", function () {
        window.open(url, "_blank", "noopener,noreferrer");
      });
      visits.appendChild(visit);
    });
    row.appendChild(visits);
  }

  function copyLine(element, text) {
    if (copyFromElement(element)) {
      markCopied(element, text);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          markCopied(element, text);
        },
        function () {
          showNotice("Could not copy that block.");
        }
      );
      return;
    }
    showNotice("Could not copy that block.");
  }

  function markCopied(element, text) {
    element.classList.add("copied");
    showNotice("Copied: " + clipNotice(text));
  }

  function copyFromElement(element) {
    var selection = window.getSelection();
    if (!selection || typeof document.execCommand !== "function") return false;
    var range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    selection.removeAllRanges();
    return ok;
  }

  function droppedFile(event) {
    var files = event.dataTransfer && event.dataTransfer.files;
    return files && files.length ? files[0] : null;
  }

  function safeHttpUrl(text) {
    if (!/^https?:\/\//i.test(text)) return "";
    try {
      var url = new URL(text);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      if (url.username || url.password) return "";
      return url.href;
    } catch (error) {
      return "";
    }
  }

  function clipNotice(text) {
    return text.length > 180 ? text.slice(0, 180) + "…" : text;
  }

  function showNotice(text) {
    notice.textContent = text;
    notice.style.display = "block";
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(function () {
      notice.style.display = "none";
    }, NOTICE_MS);
  }

  function saveHtml() {
    var blocks = blocksFrom(source.value);
    if (!blocks.length) {
      showNotice("Nothing to save yet.");
      return;
    }
    var title = titleInput.value.trim() || "Clipnote";
    var blob = new Blob([buildHtml(title, blocks)], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = downloadName(title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
    showNotice("Saved " + link.download);
  }

  function downloadName(title) {
    var cleaned = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
    return (cleaned || "clipnote") + ".html";
  }

  function importNote(raw, name) {
    var parsed = parseClipnoteHtml(raw);
    if (parsed) return parsed;
    return {
      text: raw,
      title: name.replace(/\.[^.]+$/, "").slice(0, 80),
    };
  }

  function parseClipnoteHtml(raw) {
    var match = String(raw).match(/<script type="application\/json" id="clipnote-blocks">([\s\S]*?)<\/script>/);
    if (!match) return null;
    var blocks;
    try {
      blocks = JSON.parse(match[1]);
    } catch (error) {
      return null;
    }
    if (!Array.isArray(blocks)) return null;
    blocks = blocks.filter(function (block) { return typeof block === "string" && block.trim(); });
    var titleMatch = String(raw).match(/<title>([\s\S]*?)<\/title>/i);
    return {
      text: blocks.join("\n\n"),
      title: titleMatch ? decodeHtml(titleMatch[1]).slice(0, 80) : "",
    };
  }

  function decodeHtml(text) {
    return text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function embedJson(value) {
    return JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function buildHtml(title, blocks) {
    return [
      "<!DOCTYPE html>",
      "<html lang=\"en\">",
      "<head>",
      "<meta charset=\"UTF-8\">",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
      "<title>" + escapeHtml(title) + "</title>",
      "<style>",
      EXPORT_STYLE,
      "</style>",
      "</head>",
      "<body>",
      "<h1>" + escapeHtml(title) + "</h1>",
      "<p class=\"hint\">Tap a block to copy it.</p>",
      "<div id=\"sheet\"></div>",
      "<div id=\"notice\" role=\"status\"></div>",
      "<script type=\"application/json\" id=\"clipnote-blocks\">" + embedJson(blocks) + "</script>",
      "<script>",
      EXPORT_SCRIPT,
      "</script>",
      "</body>",
      "</html>",
      "",
    ].join("\n");
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          title: titleInput.value,
          text: source.value,
          locked: locked,
        })
      );
    } catch (error) {
      /* Private mode can refuse storage. The note still works for this visit. */
    }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;
      if (typeof data.title === "string") titleInput.value = data.title.slice(0, 80);
      if (typeof data.text === "string") source.value = data.text;
      locked = Boolean(data.locked);
    } catch (error) {
      locked = false;
    }
  }

  var EXPORT_STYLE = [
  "body{margin:0;padding:16px 20px 32px;background:#000;color:#fff;font-family:'Courier New',Courier,monospace;font-size:1.15rem;line-height:1.45}",
  "h1{margin:0 0 12px;font-size:1.35rem;font-weight:normal}",
  ".hint{color:#888}",
  "a{color:#fff;text-decoration:none}",
  ".line{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;padding-bottom:1.45em}",
  ".line:last-child{padding-bottom:0}",
  ".num{color:#888;min-width:3.2ch;text-align:right;flex:none}",
  ".copy{flex:1 1 14rem;min-width:0;white-space:pre-wrap;overflow-wrap:break-word}",
  ".copy:hover{text-decoration:underline}",
  ".copy.copied{color:skyblue}",
  ".visits{display:flex;flex-flow:row wrap;gap:6px;flex:1 0 auto}",
  "button{font:inherit;cursor:pointer;background:#fff;color:#000;border:0;padding:4px 10px}",
  "button:hover{background:#4caf50;color:#fff}",
  "#notice{display:none;position:fixed;top:16px;right:16px;max-width:min(420px,calc(100vw - 32px));background:#444;color:#fff;padding:10px;border-radius:5px;white-space:pre-wrap;overflow-wrap:anywhere}",
].join("\n");

var EXPORT_SCRIPT = [
  "(function () {",
  "  var blocks = JSON.parse(document.getElementById('clipnote-blocks').textContent);",
  "  var sheet = document.getElementById('sheet');",
  "  var notice = document.getElementById('notice');",
  "  var timer = 0;",
  "  blocks.forEach(function (text, index) {",
  "    var row = document.createElement('div');",
  "    row.className = 'line';",
  "    var num = document.createElement('span');",
  "    num.className = 'num';",
  "    num.textContent = (index + 1) + '.';",
  "    var copy = document.createElement('a');",
  "    copy.href = '#';",
  "    copy.className = 'copy';",
  "    copy.textContent = text;",
  "    copy.addEventListener('click', function (event) {",
  "      event.preventDefault();",
  "      copyBlock(copy, text);",
  "    });",
  "    row.appendChild(num);",
  "    row.appendChild(copy);",
  "    var urls = [];",
  "    text.split('\\n').forEach(function (line) {",
  "      var url = safeHttpUrl(line);",
  "      if (url && urls.indexOf(url) === -1) urls.push(url);",
  "    });",
  "    if (urls.length) {",
  "      var visits = document.createElement('div');",
  "      visits.className = 'visits';",
  "      urls.forEach(function (url) {",
  "        var button = document.createElement('button');",
  "        button.type = 'button';",
  "        button.textContent = '<< Visit Site >>';",
  "        button.addEventListener('click', function () {",
  "          window.open(url, '_blank', 'noopener,noreferrer');",
  "        });",
  "        visits.appendChild(button);",
  "      });",
  "      row.appendChild(visits);",
  "    }",
  "    sheet.appendChild(row);",
  "  });",
  "  function copyBlock(element, text) {",
  "    if (copyFromElement(element)) { mark(element, text); return; }",
  "    if (navigator.clipboard && navigator.clipboard.writeText) {",
  "      navigator.clipboard.writeText(text).then(function () { mark(element, text); }, function () { show('Could not copy that block.'); });",
  "      return;",
  "    }",
  "    show('Could not copy that block.');",
  "  }",
  "  function mark(element, text) {",
  "    element.classList.add('copied');",
  "    show('Copied: ' + (text.length > 180 ? text.slice(0, 180) + '\\u2026' : text));",
  "  }",
  "  function show(text) {",
  "    notice.textContent = text;",
  "    notice.style.display = 'block';",
  "    clearTimeout(timer);",
  "    timer = setTimeout(function () { notice.style.display = 'none'; }, 3000);",
  "  }",
  "  function copyFromElement(element) {",
  "    var selection = window.getSelection();",
  "    if (!selection || typeof document.execCommand !== 'function') return false;",
  "    var range = document.createRange();",
  "    range.selectNodeContents(element);",
  "    selection.removeAllRanges();",
  "    selection.addRange(range);",
  "    var ok = false;",
  "    try { ok = document.execCommand('copy'); } catch (error) { ok = false; }",
  "    selection.removeAllRanges();",
  "    return ok;",
  "  }",
  "  function safeHttpUrl(text) {",
  "    if (!/^https?:\\/\\//i.test(text)) return '';",
  "    try {",
  "      var url = new URL(text);",
  "      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';",
  "      if (url.username || url.password) return '';",
  "      return url.href;",
  "    } catch (error) { return ''; }",
  "  }",
  "})();",
].join("\n");
})();

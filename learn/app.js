/* =============================================
   HTML Учебник — app.js
   Interactive learning platform JavaScript
   ============================================= */

'use strict';

// =============================================
// PROGRESS TRACKING
// =============================================

const STORAGE_KEY = 'htmlCourseProgress';

function getProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function markVisited(chapterId) {
  const p = getProgress();
  if (!p[chapterId + '-visited']) {
    p[chapterId + '-visited'] = true;
    saveProgress(p);
  }
}

function markExerciseComplete(exerciseId) {
  const p = getProgress();
  p[exerciseId] = true;
  // Also mark chapter as done (exercise id format: "ch1-exercise")
  const chMatch = exerciseId.match(/^(ch\d+)/);
  if (chMatch) {
    p[chMatch[1] + '-exercise'] = true;
  }
  saveProgress(p);
  updateSidebarProgress();
}

function isComplete(id) {
  return !!getProgress()[id];
}

// =============================================
// SYNTAX HIGHLIGHTING
// =============================================

/**
 * Lightweight HTML syntax highlighter.
 * Processes raw HTML text and returns highlighted HTML string.
 */
function highlightHTML(code) {
  // Escape HTML entities first (for display)
  function esc(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // We'll use a token-based approach
  let result = '';
  let i = 0;
  const len = code.length;

  while (i < len) {
    // DOCTYPE
    if (code.slice(i, i + 9).toUpperCase() === '<!DOCTYPE') {
      const end = code.indexOf('>', i);
      if (end !== -1) {
        result += '<span class="hl-doctype">' + esc(code.slice(i, end + 1)) + '</span>';
        i = end + 1;
        continue;
      }
    }

    // Comment <!-- ... -->
    if (code.slice(i, i + 4) === '<!--') {
      const end = code.indexOf('-->', i + 4);
      if (end !== -1) {
        result += '<span class="hl-comment">' + esc(code.slice(i, end + 3)) + '</span>';
        i = end + 3;
        continue;
      }
    }

    // Tag < ... >
    if (code[i] === '<' && i + 1 < len && code[i + 1] !== ' ') {
      const tagStart = i;
      let j = i + 1;
      // Find end of tag (accounting for quoted attributes)
      let inQuote = false;
      let quoteChar = '';
      while (j < len) {
        if (!inQuote && (code[j] === '"' || code[j] === "'")) {
          inQuote = true;
          quoteChar = code[j];
        } else if (inQuote && code[j] === quoteChar) {
          inQuote = false;
        } else if (!inQuote && code[j] === '>') {
          j++;
          break;
        }
        j++;
      }

      const tagStr = code.slice(tagStart, j);
      result += highlightTag(tagStr);
      i = j;
      continue;
    }

    // Regular text
    result += esc(code[i]);
    i++;
  }

  return result;
}

function highlightTag(tagStr) {
  // tagStr starts with < and ends with >
  let result = '<span class="hl-tag">&lt;</span>';
  let inner = tagStr.slice(1, tagStr.endsWith('>') ? tagStr.length - 1 : tagStr.length);
  let close = tagStr.endsWith('>') ? '<span class="hl-tag">&gt;</span>' : '';

  // Closing tag
  if (inner.startsWith('/')) {
    result += '<span class="hl-tag">/</span>';
    inner = inner.slice(1);
  }

  // Self-closing
  let selfClose = '';
  if (inner.endsWith('/')) {
    selfClose = '<span class="hl-tag">/</span>';
    inner = inner.slice(0, -1).trimEnd();
  }

  // Tag name
  const nameMatch = inner.match(/^([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*)$/);
  if (!nameMatch) {
    return '<span class="hl-tag">' + escHtml(tagStr) + '</span>';
  }

  result += '<span class="hl-tagname">' + escHtml(nameMatch[1]) + '</span>';
  let attrs = nameMatch[2];

  // Parse attributes
  result += highlightAttrs(attrs);
  result += selfClose + close;
  return result;
}

function highlightAttrs(attrStr) {
  if (!attrStr.trim()) return '';
  let result = '';
  let i = 0;
  const len = attrStr.length;

  while (i < len) {
    // whitespace
    if (/\s/.test(attrStr[i])) {
      result += attrStr[i];
      i++;
      continue;
    }

    // attribute name
    let nameEnd = i;
    while (nameEnd < len && attrStr[nameEnd] !== '=' && attrStr[nameEnd] !== ' ' && attrStr[nameEnd] !== '\t' && attrStr[nameEnd] !== '\n' && attrStr[nameEnd] !== '>') {
      nameEnd++;
    }
    const attrName = attrStr.slice(i, nameEnd);
    result += '<span class="hl-attr">' + escHtml(attrName) + '</span>';
    i = nameEnd;

    if (i < len && attrStr[i] === '=') {
      result += '<span class="hl-tag">=</span>';
      i++;

      // attribute value
      if (i < len && (attrStr[i] === '"' || attrStr[i] === "'")) {
        const quote = attrStr[i];
        let valEnd = i + 1;
        while (valEnd < len && attrStr[valEnd] !== quote) valEnd++;
        valEnd++; // include closing quote
        result += '<span class="hl-value">' + escHtml(attrStr.slice(i, valEnd)) + '</span>';
        i = valEnd;
      } else {
        // unquoted value
        let valEnd = i;
        while (valEnd < len && !/\s/.test(attrStr[valEnd]) && attrStr[valEnd] !== '>') valEnd++;
        result += '<span class="hl-value">' + escHtml(attrStr.slice(i, valEnd)) + '</span>';
        i = valEnd;
      }
    }
  }
  return result;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Apply syntax highlighting to all .html-code elements.
// highlightHTML() escapes all raw text via esc()/escHtml() before wrapping
// in <span> tags, so the produced HTML string contains no user-supplied input.
function applyHighlighting() {
  document.querySelectorAll('code.html-code').forEach(el => {
    // raw is textContent (static page content), never user input.
    // Use DOMParser to parse the highlighted result into a document fragment
    // rather than assigning directly to innerHTML.
    const raw = el.textContent;
    const highlighted = highlightHTML(raw);
    const parser = new DOMParser();
    const parsed = parser.parseFromString(highlighted, 'text/html');
    const frag = document.createDocumentFragment();
    Array.from(parsed.body.childNodes).forEach(node => frag.appendChild(node.cloneNode(true)));
    el.textContent = ''; // clear existing
    el.appendChild(frag);
  });
}

// =============================================
// LIVE CODE EDITOR
// =============================================

/**
 * Run code from a textarea into an iframe using a blob URL.
 * The user's HTML is rendered in a sandboxed blob origin, isolated from this page.
 * @param {string} id - the common id prefix (e.g. "ex1" maps to "ex1-code" and "ex1-result")
 */
function runCode(id) {
  const editor = document.getElementById(id + '-code');
  const frame = document.getElementById(id + '-result');
  if (!editor || !frame) return;

  const code = editor.value;
  // Render user HTML in a blob: URL — isolated from parent page origin
  const blob = new Blob([code], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  if (frame._prevBlobUrl) URL.revokeObjectURL(frame._prevBlobUrl);
  frame._prevBlobUrl = url;
  frame.src = url;

  // Auto-resize frame to content after load
  frame.onload = () => {
    try {
      const h = frame.contentDocument.documentElement.scrollHeight;
      if (h > 60) frame.style.height = Math.min(h + 20, 400) + 'px';
    } catch (e) {}
  };
}

// Auto-run all code editors on page load
function autoRunAll() {
  document.querySelectorAll('.code-editor').forEach(editor => {
    const id = editor.id.replace('-code', '');
    runCode(id);
  });
}

// Tab key support in code editors
function setupTabSupport() {
  document.querySelectorAll('.code-editor, .exercise-code').forEach(editor => {
    editor.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
      }
    });
  });
}

// =============================================
// EXERCISE VALIDATION
// =============================================

/**
 * Exercise validation rules.
 * Each entry maps exerciseId -> array of check objects.
 * check: { test: fn(code) => bool, hint: string }
 */
const exerciseValidators = {
  'ch1-exercise': [
    {
      test: code => /<!doctype\s+html/i.test(code),
      hint: 'Добавьте объявление <!DOCTYPE html> в начало документа'
    },
    {
      test: code => /<html[\s>]/i.test(code),
      hint: 'Нужен тег <html> для обёртки всего документа'
    },
    {
      test: code => /<head[\s>]/i.test(code) && /<\/head>/i.test(code),
      hint: 'Добавьте раздел <head>...</head>'
    },
    {
      test: code => /<body[\s>]/i.test(code) && /<\/body>/i.test(code),
      hint: 'Добавьте раздел <body>...</body>'
    },
    {
      test: code => /<h1[\s>]/i.test(code),
      hint: 'Добавьте заголовок <h1> в тело страницы'
    },
    {
      test: code => /<h2[\s>]/i.test(code),
      hint: 'Добавьте подзаголовок <h2>'
    },
    {
      test: code => /<p[\s>]/i.test(code),
      hint: 'Добавьте абзац <p> с текстом'
    }
  ],

  'ch2-exercise': [
    {
      test: code => /<b[\s>]/i.test(code) || /<strong[\s>]/i.test(code),
      hint: 'Выделите какое-нибудь слово жирным — используйте <b> или <strong>'
    },
    {
      test: code => /<i[\s>]/i.test(code) || /<em[\s>]/i.test(code),
      hint: 'Добавьте курсивный текст с тегом <i> или <em>'
    },
    {
      test: code => /<u[\s>]/i.test(code),
      hint: 'Добавьте подчёркнутый текст с тегом <u>'
    }
  ],

  'ch3-exercise': [
    {
      test: code => /<a\s[^>]*href/i.test(code),
      hint: 'Создайте ссылку с тегом <a href="...">'
    },
    {
      test: code => /<img\s/i.test(code),
      hint: 'Вставьте изображение с тегом <img>'
    },
    {
      test: code => /<img[^>]*alt\s*=/i.test(code),
      hint: 'Добавьте атрибут alt к изображению — это важно для доступности!'
    },
    {
      test: code => {
        // Check that img is inside an a tag
        return /<a[^>]*>[\s\S]*<img[\s\S]*<\/a>/i.test(code);
      },
      hint: 'Поместите тег <img> внутрь тега <a>, чтобы изображение стало ссылкой'
    }
  ],

  'ch4-exercise': [
    {
      test: code => /<ul[\s>]/i.test(code),
      hint: 'Создайте маркированный список с тегом <ul>'
    },
    {
      test: code => /<ol[\s>]/i.test(code),
      hint: 'Добавьте нумерованный список с тегом <ol>'
    },
    {
      test: code => (code.match(/<li[\s>]/gi) || []).length >= 3,
      hint: 'Добавьте минимум 3 элемента <li> в списки'
    },
    {
      test: code => {
        // Check nested list: ul or ol inside an li
        return /<li[^>]*>[\s\S]*<(ul|ol)[\s\S]*<\/\1>[\s\S]*<\/li>/i.test(code);
      },
      hint: 'Создайте вложенный список — поместите <ul> или <ol> внутрь <li>'
    }
  ],

  'ch5-exercise': [
    {
      test: code => /<table[\s>]/i.test(code),
      hint: 'Создайте таблицу с тегом <table>'
    },
    {
      test: code => /<th[\s>]/i.test(code),
      hint: 'Добавьте заголовки таблицы с тегом <th>'
    },
    {
      test: code => (code.match(/<tr[\s>]/gi) || []).length >= 3,
      hint: 'В таблице должно быть минимум 3 строки <tr> (1 с заголовками + 2 с данными)'
    },
    {
      test: code => (code.match(/<td[\s>]/gi) || []).length >= 6,
      hint: 'Добавьте минимум 6 ячеек <td> для таблицы 3×3'
    }
  ],

  'ch6-exercise': [
    {
      test: code => /<form[\s>]/i.test(code),
      hint: 'Создайте форму с тегом <form>'
    },
    {
      test: code => /<input[^>]*type\s*=\s*["']?text/i.test(code),
      hint: 'Добавьте текстовое поле <input type="text">'
    },
    {
      test: code => /<input[^>]*type\s*=\s*["']?email/i.test(code),
      hint: 'Добавьте поле для email <input type="email">'
    },
    {
      test: code => /<textarea[\s>]/i.test(code),
      hint: 'Добавьте многострочное поле <textarea>'
    },
    {
      test: code => /<input[^>]*type\s*=\s*["']?submit/i.test(code) || /<button[^>]*type\s*=\s*["']?submit/i.test(code) || /<button[\s>]/i.test(code),
      hint: 'Добавьте кнопку отправки формы'
    },
    {
      test: code => /<label[\s>]/i.test(code),
      hint: 'Добавьте метки <label> к полям формы'
    }
  ],

  'ch7-exercise': [
    {
      test: code => {
        const types = (code.match(/type\s*=\s*["']?(\w+)/gi) || []);
        const unique = new Set(types.map(t => t.replace(/type\s*=\s*["']?/i, '').toLowerCase()));
        return unique.size >= 5;
      },
      hint: 'Используйте минимум 5 различных типов input (text, email, number, date, color, range...)'
    },
    {
      test: code => /<input[^>]*type\s*=\s*["']?number/i.test(code),
      hint: 'Добавьте числовое поле <input type="number">'
    },
    {
      test: code => /<input[^>]*type\s*=\s*["']?date/i.test(code),
      hint: 'Добавьте поле даты <input type="date">'
    }
  ],

  'ch8-exercise': [
    {
      test: code => /<header[\s>]/i.test(code),
      hint: 'Добавьте семантический тег <header>'
    },
    {
      test: code => /<nav[\s>]/i.test(code),
      hint: 'Добавьте навигацию с тегом <nav>'
    },
    {
      test: code => /<main[\s>]/i.test(code),
      hint: 'Добавьте основное содержимое с тегом <main>'
    },
    {
      test: code => /<article[\s>]/i.test(code) || /<section[\s>]/i.test(code),
      hint: 'Используйте <article> или <section> для структурирования контента'
    },
    {
      test: code => /<footer[\s>]/i.test(code),
      hint: 'Добавьте подвал страницы с тегом <footer>'
    }
  ],

  'ch9-exercise': [
    {
      test: code => /<iframe[\s>]/i.test(code),
      hint: 'Добавьте тег <iframe> для встраивания видео'
    },
    {
      test: code => /<iframe[^>]*src\s*=/i.test(code),
      hint: 'Укажите атрибут src в теге <iframe>'
    },
    {
      test: code => /<iframe[^>]*width\s*=/i.test(code) || /<iframe[^>]*height\s*=/i.test(code),
      hint: 'Задайте размеры iframe с помощью атрибутов width и height'
    },
    {
      test: code => /youtube\.com|youtu\.be/i.test(code),
      hint: 'Используйте ссылку на YouTube (youtube.com или youtu.be) в атрибуте src'
    }
  ]
};

/**
 * Validate an exercise by id.
 */
function checkExercise(exerciseId) {
  const textarea = document.getElementById(exerciseId + '-code');
  const feedbackEl = document.getElementById(exerciseId + '-feedback');

  if (!textarea || !feedbackEl) {
    console.warn('Exercise elements not found:', exerciseId);
    return;
  }

  const code = textarea.value.trim();
  if (!code) {
    showFeedback(feedbackEl, false, 'Напишите код!', 'Поле редактора пустое. Введите ваш HTML код.');
    return;
  }

  const validators = exerciseValidators[exerciseId];
  if (!validators) {
    console.warn('No validators for:', exerciseId);
    // If no validators, just mark as complete
    showFeedback(feedbackEl, true, 'Отличная работа! ✓', 'Ваш код принят!');
    markExerciseComplete(exerciseId);
    return;
  }

  const failures = validators.filter(v => !v.test(code));

  if (failures.length === 0) {
    showFeedback(feedbackEl, true, '🎉 Отлично! Всё правильно!', 'Задание выполнено. Вы отлично справились!');
    markExerciseComplete(exerciseId);
    // Animate card
    feedbackEl.closest('.exercise-section')?.classList.add('solved');
  } else {
    const hint = failures[0].hint;
    showFeedback(feedbackEl, false, `Не совсем верно (${validators.length - failures.length}/${validators.length} проверок пройдено)`, hint);
  }
}

function showFeedback(el, success, title, hint) {
  el.className = 'exercise-feedback show ' + (success ? 'success' : 'error');
  el.innerHTML = `
    <span class="feedback-icon">${success ? '✅' : '❌'}</span>
    <div class="feedback-text">
      <strong>${title}</strong>
      <div class="feedback-hint">${hint}</div>
    </div>
  `;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Preview exercise code in an iframe.
 */
function previewExercise(exerciseId) {
  const textarea = document.getElementById(exerciseId + '-code');
  const previewEl = document.getElementById(exerciseId + '-preview');
  const frameEl = document.getElementById(exerciseId + '-preview-frame');

  if (!textarea || !previewEl || !frameEl) return;

  const code = textarea.value;
  previewEl.classList.toggle('show');

  if (previewEl.classList.contains('show')) {
    // Render user HTML in a blob: URL — isolated from parent page origin
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    if (frameEl._prevBlobUrl) URL.revokeObjectURL(frameEl._prevBlobUrl);
    frameEl._prevBlobUrl = url;
    frameEl.src = url;
  }
}

// =============================================
// SIDEBAR NAVIGATION
// =============================================

function setupSidebar() {
  // Highlight current section on scroll
  const sections = document.querySelectorAll('.lesson-section[id]');
  const links = document.querySelectorAll('.sidebar-link[data-target]');

  if (!sections.length || !links.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          links.forEach(link => {
            link.classList.toggle('active', link.dataset.target === id);
          });
        }
      });
    },
    { rootMargin: '-20% 0% -60% 0%', threshold: 0 }
  );

  sections.forEach(sec => observer.observe(sec));

  // Click to scroll
  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
        // Close mobile sidebar
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
      }
    });
  });
}

function setupMobileSidebar() {
  const toggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');

  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  }
}

function updateSidebarProgress() {
  const progress = getProgress();
  const exerciseLinks = document.querySelectorAll('.sidebar-link[data-done]');
  exerciseLinks.forEach(link => {
    const id = link.dataset.done;
    if (progress[id]) {
      link.classList.add('done');
      const num = link.querySelector('.link-num');
      if (num) num.textContent = '✓';
    }
  });

  // Update mini progress bar
  const totalLinks = document.querySelectorAll('.sidebar-link[data-target]').length;
  const chapterId = document.body.dataset.chapter;
  if (chapterId && totalLinks) {
    const exerciseId = chapterId + '-exercise';
    const fill = document.querySelector('.progress-mini-fill');
    const text = document.querySelector('.chapter-progress-mini');
    const done = progress[exerciseId] ? 1 : 0;
    if (fill) fill.style.width = (done / 1 * 100) + '%';
    if (text) text.textContent = done ? '✓ Глава выполнена' : 'Упражнение не выполнено';
  }
}

// =============================================
// CHAPTER VISITED TRACKING
// =============================================

function trackVisit() {
  const chapterId = document.body.dataset.chapter;
  if (chapterId) {
    markVisited(chapterId);
  }
}

// =============================================
// KEYBOARD SHORTCUTS
// =============================================

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // Ctrl+Enter or Cmd+Enter to run focused editor
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const active = document.activeElement;
      if (active && (active.classList.contains('code-editor') || active.classList.contains('exercise-code'))) {
        e.preventDefault();
        const id = active.id.replace('-code', '');
        runCode(id);
      }
    }
  });
}

// =============================================
// INIT
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  applyHighlighting();
  autoRunAll();
  setupTabSupport();
  setupSidebar();
  setupMobileSidebar();
  updateSidebarProgress();
  trackVisit();
  setupKeyboardShortcuts();

  // Restore completed exercise indicators
  const progress = getProgress();
  document.querySelectorAll('[data-exercise-id]').forEach(btn => {
    const exId = btn.dataset.exerciseId;
    if (progress[exId]) {
      const feedbackEl = document.getElementById(exId + '-feedback');
      if (feedbackEl) {
        showFeedback(feedbackEl, true, '✓ Упражнение уже выполнено!', 'Вы уже решили это задание. Можете попробовать ещё раз.');
      }
    }
  });
});

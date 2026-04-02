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
 * Highlight HTML source text in-place on a DOM element.
 * Builds a DocumentFragment using textNode + createElement — no HTML string parsing.
 * @param {string} code - raw HTML source text to highlight
 * @param {DocumentFragment} frag - fragment to append highlighted nodes into
 */
function highlightToFragment(code, frag) {
  function span(cls, text) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text; // textContent safely sets text without HTML parsing
    return s;
  }
  function text(str) {
    return document.createTextNode(str);
  }

  let i = 0;
  const len = code.length;

  while (i < len) {
    // DOCTYPE
    if (code.slice(i, i + 9).toUpperCase() === '<!DOCTYPE') {
      const end = code.indexOf('>', i);
      if (end !== -1) {
        frag.appendChild(span('hl-doctype', code.slice(i, end + 1)));
        i = end + 1;
        continue;
      }
    }

    // Comment <!-- ... -->
    if (code.slice(i, i + 4) === '<!--') {
      const end = code.indexOf('-->', i + 4);
      if (end !== -1) {
        frag.appendChild(span('hl-comment', code.slice(i, end + 3)));
        i = end + 3;
        continue;
      }
    }

    // Tag < ... >
    if (code[i] === '<' && i + 1 < len && code[i + 1] !== ' ') {
      const tagStart = i;
      let j = i + 1;
      let inQuote = false;
      let quoteChar = '';
      while (j < len) {
        if (!inQuote && (code[j] === '"' || code[j] === "'")) {
          inQuote = true; quoteChar = code[j];
        } else if (inQuote && code[j] === quoteChar) {
          inQuote = false;
        } else if (!inQuote && code[j] === '>') {
          j++; break;
        }
        j++;
      }
      appendTagNodes(frag, code.slice(tagStart, j), span, text);
      i = j;
      continue;
    }

    // Regular text character — always create a new text node (no data mutation)
    frag.appendChild(text(code[i]));
    i++;
  }
}

function appendTagNodes(frag, tagStr, span, text) {
  frag.appendChild(span('hl-tag', '<'));
  let inner = tagStr.slice(1, tagStr.endsWith('>') ? tagStr.length - 1 : tagStr.length);

  if (inner.startsWith('/')) {
    frag.appendChild(span('hl-tag', '/'));
    inner = inner.slice(1);
  }

  let selfClose = false;
  if (inner.endsWith('/')) {
    selfClose = true;
    inner = inner.slice(0, -1).trimEnd();
  }

  const nameMatch = inner.match(/^([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*)$/);
  if (!nameMatch) {
    // Fallback: treat whole thing as tag text
    frag.appendChild(text(inner));
  } else {
    frag.appendChild(span('hl-tagname', nameMatch[1]));
    appendAttrNodes(frag, nameMatch[2], span, text);
  }

  if (selfClose) frag.appendChild(span('hl-tag', '/'));
  if (tagStr.endsWith('>')) frag.appendChild(span('hl-tag', '>'));
}

function appendAttrNodes(frag, attrStr, span, text) {
  let i = 0;
  const len = attrStr.length;
  while (i < len) {
    if (/\s/.test(attrStr[i])) {
      frag.appendChild(text(attrStr[i]));
      i++; continue;
    }
    let nameEnd = i;
    while (nameEnd < len && attrStr[nameEnd] !== '=' && !/[\s>]/.test(attrStr[nameEnd])) nameEnd++;
    frag.appendChild(span('hl-attr', attrStr.slice(i, nameEnd)));
    i = nameEnd;

    if (i < len && attrStr[i] === '=') {
      frag.appendChild(span('hl-tag', '='));
      i++;
      if (i < len && (attrStr[i] === '"' || attrStr[i] === "'")) {
        const quote = attrStr[i];
        let valEnd = i + 1;
        while (valEnd < len && attrStr[valEnd] !== quote) valEnd++;
        valEnd++;
        frag.appendChild(span('hl-value', attrStr.slice(i, valEnd)));
        i = valEnd;
      } else {
        let valEnd = i;
        while (valEnd < len && !/\s/.test(attrStr[valEnd]) && attrStr[valEnd] !== '>') valEnd++;
        frag.appendChild(span('hl-value', attrStr.slice(i, valEnd)));
        i = valEnd;
      }
    }
  }
}

// Apply syntax highlighting to all static .html-code elements on the page.
function applyHighlighting() {
  document.querySelectorAll('code.html-code').forEach(el => {
    const raw = el.textContent;
    const frag = document.createDocumentFragment();
    highlightToFragment(raw, frag); // builds DOM nodes, no HTML string parsing
    el.replaceChildren(frag);
  });
}

// Keep highlightHTML as a utility for any string-based callers (unused on this page).
function highlightHTML(code) {
  const frag = document.createDocumentFragment();
  highlightToFragment(code, frag);
  const tmp = document.createElement('span');
  tmp.appendChild(frag);
  return tmp.innerHTML;
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
  const blob = new Blob([code], { type: 'text/html; charset=utf-8' });
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
  ],

  'ch10-exercise': [
    {
      test: code => /<style[\s>]/i.test(code),
      hint: 'Добавьте тег <style> с CSS-правилами в раздел <head>'
    },
    {
      test: code => /color\s*:/i.test(code),
      hint: 'Используйте свойство color для цвета текста'
    },
    {
      test: code => /background(-color)?\s*:/i.test(code),
      hint: 'Используйте свойство background-color для фона элемента'
    },
    {
      test: code => /\.[a-z_-]+\s*\{/i.test(code),
      hint: 'Добавьте стиль через класс (например: .myclass { ... })'
    },
    {
      test: code => /#[a-z_-]+\s*\{/i.test(code),
      hint: 'Добавьте стиль через ID (например: #myid { ... })'
    }
  ],

  'ch11-exercise': [
    {
      test: code => /padding\s*:/i.test(code),
      hint: 'Добавьте свойство padding для внутреннего отступа'
    },
    {
      test: code => /margin\s*:/i.test(code),
      hint: 'Добавьте свойство margin для внешнего отступа'
    },
    {
      test: code => /border\s*:/i.test(code),
      hint: 'Добавьте свойство border для рамки (например: border: 2px solid black)'
    },
    {
      test: code => /border-radius\s*:/i.test(code),
      hint: 'Добавьте свойство border-radius для скруглённых углов'
    },
    {
      test: code => /width\s*:|max-width\s*:/i.test(code),
      hint: 'Задайте ширину элемента с помощью width или max-width'
    }
  ],

  'ch12-exercise': [
    {
      test: code => /color\s*:/i.test(code),
      hint: 'Используйте свойство color для цвета текста'
    },
    {
      test: code => /background(-color)?\s*:/i.test(code),
      hint: 'Добавьте свойство background-color для фона'
    },
    {
      test: code => /font-size\s*:/i.test(code),
      hint: 'Используйте свойство font-size для размера шрифта'
    },
    {
      test: code => /font-weight\s*:/i.test(code),
      hint: 'Добавьте свойство font-weight (bold или число)'
    },
    {
      test: code => /text-align\s*:/i.test(code),
      hint: 'Используйте свойство text-align для выравнивания текста'
    },
    {
      test: code => /line-height\s*:/i.test(code),
      hint: 'Добавьте свойство line-height для межстрочного интервала'
    }
  ],

  'ch13-exercise': [
    {
      test: code => /display\s*:\s*block/i.test(code),
      hint: 'Добавьте элемент с display: block'
    },
    {
      test: code => /display\s*:\s*inline-block/i.test(code),
      hint: 'Добавьте элемент с display: inline-block'
    },
    {
      test: code => /position\s*:\s*relative/i.test(code),
      hint: 'Добавьте элемент с position: relative'
    },
    {
      test: code => /position\s*:\s*absolute/i.test(code),
      hint: 'Добавьте элемент с position: absolute внутри родителя с position: relative'
    }
  ],

  'ch14-exercise': [
    {
      test: code => /display\s*:\s*flex/i.test(code),
      hint: 'Добавьте контейнер с display: flex'
    },
    {
      test: code => /justify-content\s*:/i.test(code),
      hint: 'Используйте свойство justify-content для выравнивания по главной оси'
    },
    {
      test: code => /align-items\s*:/i.test(code),
      hint: 'Используйте свойство align-items для выравнивания по поперечной оси'
    },
    {
      test: code => /gap\s*:/i.test(code),
      hint: 'Добавьте свойство gap для отступов между элементами'
    },
    {
      test: code => /flex-wrap\s*:\s*wrap/i.test(code),
      hint: 'Используйте flex-wrap: wrap для переноса элементов на новую строку'
    }
  ],

  'ch15-exercise': [
    {
      test: code => /display\s*:\s*grid/i.test(code),
      hint: 'Добавьте контейнер с display: grid'
    },
    {
      test: code => /grid-template-columns\s*:/i.test(code),
      hint: 'Используйте grid-template-columns для определения колонок'
    },
    {
      test: code => /gap\s*:/i.test(code),
      hint: 'Добавьте свойство gap для промежутков между ячейками'
    },
    {
      test: code => /grid-column\s*:\s*span|grid-row\s*:\s*span/i.test(code),
      hint: 'Растяните элемент на несколько ячеек с помощью grid-column: span N или grid-row: span N'
    }
  ],

  'ch16-exercise': [
    {
      test: code => /name\s*=\s*["']viewport["']/i.test(code),
      hint: 'Добавьте мета-тег viewport: <meta name="viewport" content="width=device-width, initial-scale=1.0">'
    },
    {
      test: code => /@media\s*\(/i.test(code),
      hint: 'Используйте media query: @media (max-width: 768px) { ... }'
    },
    {
      test: code => /[0-9]+(em|rem|vw|vh|%)/i.test(code),
      hint: 'Используйте относительные единицы: em, rem, vw, vh или %'
    },
    {
      test: code => /max-width\s*:/i.test(code),
      hint: 'Ограничьте ширину контейнера с помощью max-width'
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
    const blob = new Blob([code], { type: 'text/html; charset=utf-8' });
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

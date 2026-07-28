export const activeEditors = new Map();

export function formatJavaScriptText(source = '') {
  const text = String(source || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return '';

  const lines = text.split('\n');
  const formatted = [];
  let indent = 0;
  let inString = false;
  let stringQuote = '';
  let inBlockComment = false;
  const unit = '  ';

  const countStructuralTokens = (line) => {
    let opens = 0;
    let closes = 0;
    let localString = inString;
    let localQuote = stringQuote;
    let localBlockComment = inBlockComment;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (localBlockComment) {
        if (char === '*' && next === '/') {
          localBlockComment = false;
          i++;
        }
        continue;
      }

      if (localString) {
        if (char === '\\' && i + 1 < line.length) {
          i++;
          continue;
        }
        if (char === localQuote) localString = false;
        continue;
      }

      if (char === '/' && next === '/') break;
      if (char === '/' && next === '*') {
        localBlockComment = true;
        i++;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        localString = true;
        localQuote = char;
        continue;
      }
      if (char === '{' || char === '[') opens++;
      if (char === '}' || char === ']') closes++;
    }

    inString = localString;
    stringQuote = localQuote;
    inBlockComment = localBlockComment;
    return { opens, closes };
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (formatted[formatted.length - 1] !== '') formatted.push('');
      continue;
    }

    const startsWithClose = /^[}\]]/.test(trimmed);
    if (startsWithClose) indent = Math.max(0, indent - 1);

    formatted.push(unit.repeat(Math.max(indent, 0)) + trimmed);

    const { opens, closes } = countStructuralTokens(trimmed);
    indent = Math.max(0, indent + opens - closes - (startsWithClose ? -1 : 0));
  }

  return formatted
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatCodeMirrorEditor(editor, fallbackTextarea = null) {
  const current = editor ? editor.getValue() : fallbackTextarea?.value || '';
  const formatted = formatJavaScriptText(current);
  if (editor) editor.setValue(formatted);
  else if (fallbackTextarea) {
    fallbackTextarea.value = formatted;
    fallbackTextarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return formatted;
}

export function createCodeMirrorEditor(textarea, initialValue = '', mode = 'javascript', height = '180px') {
  const editorValue = initialValue == null || initialValue === 'undefined' ? '' : String(initialValue);
  textarea.value = editorValue;
  const wrapper = document.createElement('div');
  wrapper.className = 'cm-wrapper';
  if (typeof CodeMirror === 'undefined') {
    textarea.style.display = '';
    wrapper.appendChild(textarea);
    return { wrapper, editor: null };
  }
  const currentTheme = localStorage.getItem('ab-runner-theme') || 'dark';
  const editor = CodeMirror(wrapper, {
    value: editorValue,
    mode: mode,
    theme: 'default',
    lineNumbers: true,
    lineWrapping: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    styleActiveLine: true,
    tabSize: 2,
    indentUnit: 2,
    indentWithTabs: false,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    extraKeys: {
      'Ctrl-/': (cm) => {
        cm.toggleComment({ line: '//', block: ['/*', '*/'], indent: false, padding: ' ', fullLines: true });
        return false;
      },
      'Cmd-/': (cm) => {
        cm.toggleComment({ line: '//', block: ['/*', '*/'], indent: false, padding: ' ', fullLines: true });
        return false;
      },
      'Ctrl-F': (cm) => {
        const field = cm.getWrapperElement()?.closest('.field');
        const bodySearch = field?.querySelector('.body-search-input');
        if (bodySearch) {
          bodySearch.focus();
          bodySearch.select();
          return false;
        }
        return CodeMirror.Pass;
      },
      'Cmd-F': (cm) => {
        const field = cm.getWrapperElement()?.closest('.field');
        const bodySearch = field?.querySelector('.body-search-input');
        if (bodySearch) {
          bodySearch.focus();
          bodySearch.select();
          return false;
        }
        return CodeMirror.Pass;
      },
    },
  });
  editor.on('change', () => {
    textarea.value = editor.getValue();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  editor.setSize('100%', height);
  textarea.style.display = 'none';
  wrapper.appendChild(textarea);
  wrapper.classList.add('theme-' + currentTheme);
  return { wrapper, editor };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchMatches(text, query, matchCase) {
  if (!query) return [];
  const flags = matchCase ? 'g' : 'gi';
  const regex = new RegExp(escapeRegExp(query), flags);
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ from: match.index, to: match.index + match[0].length });
    if (match[0].length === 0) regex.lastIndex++;
  }
  return matches;
}

export function createBodySearchPanel(editor, onChange, onToast = () => {}) {
  const state = { marks: [], matches: [], currentIndex: -1 };
  const panel = document.createElement('div');
  panel.className = 'body-search-panel';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Найти в Body';
  searchInput.className = 'body-search-input';

  const counter = document.createElement('span');
  counter.className = 'body-search-count';
  counter.textContent = '0/0';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'secondary body-search-nav';
  prevBtn.textContent = '↑';
  prevBtn.title = 'Предыдущее совпадение';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'secondary body-search-nav';
  nextBtn.textContent = '↓';
  nextBtn.title = 'Следующее совпадение';

  const matchMode = document.createElement('select');
  matchMode.className = 'body-search-mode';
  matchMode.title = 'Строгость совпадения';
  matchMode.innerHTML = `
    <option value="loose">Без учета регистра</option>
    <option value="case">С учетом регистра</option>
  `;

  const replaceInput = document.createElement('input');
  replaceInput.type = 'text';
  replaceInput.placeholder = 'Заменить на';
  replaceInput.className = 'body-search-input body-search-replace';

  const replaceAllBtn = document.createElement('button');
  replaceAllBtn.type = 'button';
  replaceAllBtn.className = 'secondary body-search-replace-btn';
  replaceAllBtn.textContent = 'Заменить все';

  panel.append(searchInput, counter, prevBtn, nextBtn, matchMode, replaceInput, replaceAllBtn);

  const clearMarks = () => {
    state.marks.forEach((mark) => mark.clear());
    state.marks = [];
  };
  const updateCounter = () => {
    const total = state.matches.length;
    counter.textContent = total ? `${state.currentIndex + 1}/${total}` : '0/0';
    prevBtn.disabled = total === 0;
    nextBtn.disabled = total === 0;
    replaceAllBtn.disabled = total === 0;
  };
  const jumpToCurrent = () => {
    if (!editor || state.currentIndex < 0 || !state.matches[state.currentIndex]) return;
    const match = state.matches[state.currentIndex];
    const from = editor.posFromIndex(match.from);
    const to = editor.posFromIndex(match.to);
    editor.setSelection(from, to);
    editor.scrollIntoView({ from, to }, 80);
    editor.focus();
  };
  const refresh = (keepIndex = false) => {
    if (!editor) return;
    clearMarks();
    const query = searchInput.value;
    const matchCase = matchMode.value === 'case';
    state.matches = getSearchMatches(editor.getValue(), query, matchCase);
    state.currentIndex = keepIndex && state.matches.length ? Math.min(state.currentIndex, state.matches.length - 1) : state.matches.length ? 0 : -1;
    state.matches.forEach((match, index) => {
      const markClass = index === state.currentIndex ? 'body-search-match current' : 'body-search-match';
      state.marks.push(editor.markText(editor.posFromIndex(match.from), editor.posFromIndex(match.to), { className: markClass }));
    });
    updateCounter();
  };
  const go = (direction) => {
    if (!state.matches.length) return;
    state.currentIndex = (state.currentIndex + direction + state.matches.length) % state.matches.length;
    refresh(true);
    jumpToCurrent();
  };

  searchInput.addEventListener('input', () => refresh());
  matchMode.addEventListener('change', () => refresh());
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  replaceAllBtn.addEventListener('click', () => {
    const query = searchInput.value;
    if (!query) return;
    const replacement = replaceInput.value;
    const matchCase = matchMode.value === 'case';
    const regex = new RegExp(escapeRegExp(query), matchCase ? 'g' : 'gi');
    const before = editor.getValue();
    const next = before.replace(regex, replacement);
    const changed = getSearchMatches(before, query, matchCase).length;
    if (!changed) return;
    editor.setValue(next);
    if (typeof onChange === 'function') onChange(next);
    refresh();
    onToast(`Заменено: ${changed}`, 'success', 1800);
  });
  editor.on('change', () => refresh(true));
  updateCounter();
  return panel;
}

export function destroyAllEditors() {
  activeEditors.forEach(({ editor }) => {
    if (editor && typeof editor.toTextArea === 'function') {
      const wrapper = editor.getWrapperElement();
      if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
  });
  activeEditors.clear();
}

export function updateEditorsTheme() {
  const currentTheme = localStorage.getItem('ab-runner-theme') || 'dark';
  activeEditors.forEach(({ editor, wrapper }) => {
    if (!editor) return;
    editor.setOption('theme', 'default');
    wrapper.classList.remove('theme-dark', 'theme-light', 'theme-red-white', 'theme-red-black');
    wrapper.classList.add('theme-' + currentTheme);
    editor.refresh();
  });
}

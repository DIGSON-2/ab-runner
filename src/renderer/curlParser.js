// cURL command parser. Pure: returns { method, url, headers, body, urlEncodedParams }.

export function parseCurl(cmd) {
  // Вспомогательная функция очистки невидимых символов
  const cleanInvisibleChars = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/^\uFEFF/, '') // BOM
      .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '') // Zero-width и control
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
      .replace(/[\u200C\u200D\u2060\u2061\u2062\u2063\u2064]/g, '') // Zero-width joiners/non-joiners
      .replace(/[\uFFF0-\uFFFF]/g, '') // Specials
      .replace(/[\u00AD]/g, '') // Soft hyphen
      .replace(/[\u180E]/g, ''); // Mongolian vowel separator
  };

  // Очищаем саму команду от невидимых символов
  let c = cleanInvisibleChars(cmd)
    .replace(/\r?\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!c.startsWith('curl ')) return null;
  c = c.substring(5);

  // Токенизация с учетом кавычек и экранирования
  const tokens = [];
  let cur = '',
    st = 0;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (st === 0) {
      if (ch === ' ') {
        if (cur) {
          tokens.push(cur);
          cur = '';
        }
      } else if (ch === "'") st = 1;
      else if (ch === '"') st = 2;
      else if (ch === '\\' && i + 1 < c.length) cur += c[++i];
      else cur += ch;
    } else if (st === 1) {
      if (ch === "'") {
        if (i + 1 < c.length && c[i + 1] === "'") {
          cur += "'";
          i++;
        } else st = 0;
      } else cur += ch;
    } else if (st === 2) {
      if (ch === '\\' && i + 1 < c.length) cur += c[++i];
      else if (ch === '"') st = 0;
      else cur += ch;
    }
  }
  if (cur) tokens.push(cur);

  const res = { method: 'GET', url: '', headers: {}, body: null, urlEncodedParams: [] };
  const flags = [
    '-X',
    '--request',
    '-H',
    '--header',
    '-d',
    '--data',
    '--data-raw',
    '--data-binary',
    '--data-ascii',
    '--data-urlencode',
    '-u',
    '--user',
    '-o',
    '--output',
    '-e',
    '--referer',
    '-b',
    '--cookie',
  ];
  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i];

    if (['--location', '-L', '--compressed', '--silent', '-s', '--insecure', '-k', '--show-error'].includes(t)) {
      i++;
      continue;
    }

    if (t === '-X' || t === '--request') {
      if (i + 1 < tokens.length) res.method = tokens[++i].toUpperCase();
      i++;
      continue;
    }

    if (t === '-H' || t === '--header') {
      if (i + 1 < tokens.length) {
        const h = cleanInvisibleChars(tokens[++i]);
        const ci = h.indexOf(':');
        if (ci > 0) {
          const k = h.substring(0, ci).trim();
          const v = h.substring(ci + 1).trim();
          if (k) res.headers[k] = v;
        }
      }
      i++;
      continue;
    }

    if (t === '-b' || t === '--cookie') {
      if (i + 1 < tokens.length) {
        const cookieValue = cleanInvisibleChars(tokens[++i]);
        res.headers['Cookie'] = cookieValue;
      }
      i++;
      continue;
    }

    if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-ascii') {
      if (i + 1 < tokens.length) {
        // КРИТИЧНО: очищаем тело от невидимых символов
        res.body = cleanInvisibleChars(tokens[++i]);
        if (!res.headers['Content-Type'] && !res.headers['content-type']) {
          res.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }
      i++;
      continue;
    }

    if (t === '--data-urlencode') {
      if (i + 1 < tokens.length) {
        res.urlEncodedParams.push(cleanInvisibleChars(tokens[++i]));
        if (!res.headers['Content-Type'] && !res.headers['content-type']) {
          res.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }
      i++;
      continue;
    }

    if (t === '-u' || t === '--user') {
      if (i + 1 < tokens.length) {
        res.headers['Authorization'] = 'Basic ' + btoa(tokens[++i]);
      }
      i++;
      continue;
    }

    if (flags.includes(t)) {
      i += 2;
      continue;
    }

    if (!t.startsWith('-') && !res.url) {
      res.url = cleanInvisibleChars(t);
    }
    i++;
  }

  if (res.urlEncodedParams.length && !res.body) {
    res.body = res.urlEncodedParams.join('&');
  }
  if (res.body && res.method === 'GET') res.method = 'POST';

  // Дополнительная очистка URL и заголовков
  res.url = cleanInvisibleChars(res.url);
  for (const key in res.headers) {
    res.headers[key] = cleanInvisibleChars(res.headers[key]);
  }

  return res;
}

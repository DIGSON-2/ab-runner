// Pure fuzzy-search scoring helpers for collections.

export function getTrigrams(s) {
  const str = '  ' + s.toLowerCase() + ' ';
  const t = [];
  for (let i = 0; i < str.length - 2; i++) t.push(str.substring(i, i + 3));
  return t;
}

export function trigramSimilarity(a, b) {
  if (!a || !b) return 0;
  const ta = getTrigrams(a);
  const tb = getTrigrams(b);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta);
  let i = 0;
  for (const x of tb) if (sa.has(x)) i++;
  return i / (ta.length + tb.length - i);
}

export function getSearchText(col) {
  const p = [col.name || ''];
  if (col.steps) col.steps.forEach((s) => p.push(s.name || '', s.method || '', s.url || ''));
  return p.join(' ').toLowerCase();
}

export function collectionRelevance(col, q) {
  if (!q) return 1;
  const searchText = getSearchText(col);
  const colName = (col.name || '').toLowerCase();
  const queryLower = q.toLowerCase();
  let score = 0;
  if (colName === queryLower) score += 1000;
  else if (colName.startsWith(queryLower)) score += 500;
  else if (colName.includes(queryLower)) score += 200;
  if (col.steps && Array.isArray(col.steps)) {
    col.steps.forEach((step) => {
      const stepName = (step.name || '').toLowerCase();
      const stepUrl = (step.url || '').toLowerCase();
      if (stepName.includes(queryLower)) {
        score += 50;
        const position = stepName.indexOf(queryLower);
        score += Math.max(0, 20 - position);
      }
      if (stepUrl.includes(queryLower)) {
        score += 30;
        const position = stepUrl.indexOf(queryLower);
        score += Math.max(0, 15 - position);
      }
    });
  }
  if (searchText.includes(queryLower)) score += 10;
  const trigramScore = trigramSimilarity(queryLower, searchText);
  score += trigramScore * 50;
  return score;
}

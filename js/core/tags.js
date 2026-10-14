// Etiquetas: agrupan movimientos por motivo (#vacaciones, #boda), por encima de las categorías.
// Se guardan tal como se escriben (sin «#») y se comparan sin mayúsculas ni tildes.
import { norm } from './util.js';

export const MAX_TAGS = 20;
export const cleanTag = (s) => String(s || '').trim().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[,;#]/g, '').slice(0, 40);
export const tagKey = (s) => norm(cleanTag(s));
export const hasTag = (t, tag) => !tag || (t.tags || []).some((x) => tagKey(x) === tagKey(tag));

// Añade sin duplicados (comparando sin mayúsculas ni tildes).
export function addTag(tags, tag) {
  const c = cleanTag(tag);
  if (!c || tags.some((x) => tagKey(x) === tagKey(c)) || tags.length >= MAX_TAGS) return tags;
  return [...tags, c];
}
export const uniqueTags = (list) => (Array.isArray(list) ? list : []).reduce((acc, t) => addTag(acc, t), []);

// Todas las etiquetas usadas, con el nombre más reciente y cuántos movimientos las llevan.
export function allTags(S) {
  const map = new Map();
  const seen = (name, date) => {
    const k = tagKey(name);
    const cur = map.get(k);
    if (!cur) map.set(k, { key: k, name, count: 1, last: date || '' });
    else { cur.count++; if ((date || '') >= cur.last) { cur.last = date || ''; cur.name = name; } }
  };
  for (const t of S.transactions) (t.tags || []).forEach((g) => seen(g, t.date));
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function mapTags(S, fn) {
  let changed = 0;
  const apply = (o) => {
    if (!o.tags || !o.tags.length) return;
    const next = uniqueTags(o.tags.map(fn).filter(Boolean));
    if (next.join('\u0000') !== o.tags.join('\u0000')) { o.tags = next; changed++; }
  };
  S.transactions.forEach(apply);
  S.recurring.forEach((r) => apply(r.template));
  return changed;
}
// Renombrar a un nombre que ya existe fusiona ambas etiquetas.
export const renameTag = (S, from, to) => mapTags(S, (g) => (tagKey(g) === tagKey(from) ? cleanTag(to) : g));
export const deleteTag = (S, tag) => mapTags(S, (g) => (tagKey(g) === tagKey(tag) ? null : g));

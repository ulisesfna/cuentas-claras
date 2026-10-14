// Combina una copia validada con los datos actuales: no sobrescribe nada; añade lo que falta.
import { norm } from './util.js';

// Las cuentas y categorías con el mismo nombre se consideran la misma, aunque vengan de otro
// dispositivo con otros identificadores. Los movimientos se reconocen por su identificador.
export function mergeData(cur, inc) {
  const out = JSON.parse(JSON.stringify(cur));
  if (!Array.isArray(out.rules)) out.rules = [];
  const st = { accounts: 0, categories: 0, transactions: 0, recurring: 0, rules: 0, existing: 0, rates: 0, ratesSkipped: false };
  const same = (a, b) => norm(a).trim() === norm(b).trim();
  const accMap = new Map(), catMap = new Map();
  for (const a of inc.accounts) {
    let m = out.accounts.find((x) => x.id === a.id) || out.accounts.find((x) => same(x.name, a.name) && x.currency === a.currency);
    if (!m) { m = { ...a }; out.accounts.push(m); st.accounts++; }
    accMap.set(a.id, m.id);
  }
  for (const c of inc.categories) {
    let m = out.categories.find((x) => x.id === c.id) || out.categories.find((x) => x.type === c.type && same(x.name, c.name));
    if (!m) {
      m = { ...c, order: out.categories.filter((x) => x.type === c.type).reduce((mx, x) => Math.max(mx, x.order), -1) + 1 };
      out.categories.push(m);
      st.categories++;
    }
    catMap.set(c.id, m.id);
  }
  const remap = (t) => {
    const r = {
      ...t, accountId: accMap.get(t.accountId), toAccountId: t.toAccountId ? accMap.get(t.toAccountId) : null,
      categoryId: t.categoryId ? catMap.get(t.categoryId) : null, tags: [...(t.tags || [])],
    };
    if (Array.isArray(t.splits)) r.splits = t.splits.map((p) => ({ ...p, categoryId: catMap.get(p.categoryId) }));
    return r;
  };
  const ruleIds = new Set(out.recurring.map((r) => r.id));
  for (const r of inc.recurring) {
    if (ruleIds.has(r.id)) continue;
    out.recurring.push({ ...r, skips: [...(r.skips || [])], template: remap(r.template) });
    st.recurring++;
  }
  const txIds = new Set(out.transactions.map((t) => t.id));
  for (const t of inc.transactions) {
    if (txIds.has(t.id)) { st.existing++; continue; }
    out.transactions.push(remap(t));
    st.transactions++;
  }
  for (const r of inc.rules || []) {
    const categoryId = catMap.get(r.categoryId);
    if (out.rules.some((x) => same(x.pattern, r.pattern) && x.categoryId === categoryId)) continue;
    out.rules.push({ ...r, categoryId });
    st.rules++;
  }
  // Tipos de cambio que falten, convertidos a la moneda principal actual.
  const incBase = inc.settings.currency, curBase = out.settings.currency;
  const incRate = (c) => (c === incBase ? 1 : inc.rates[c]);
  const toCur = incRate(curBase);
  for (const c of new Set([...Object.keys(inc.rates), incBase])) {
    if (c === curBase || out.rates[c]) continue;
    if (!(toCur > 0) || !(incRate(c) > 0)) { st.ratesSkipped = true; continue; }
    out.rates[c] = incRate(c) / toCur;
    st.rates++;
  }
  return { data: out, stats: st };
}

// Cálculos contables sobre el estado `S`: búsquedas, conversión, totales de la vista y saldos.
import { ACCOUNT_KINDS, PSEUDO, UNKNOWN_CAT, kindOf } from './constants.js';
import { fromISO, toISO, todayISO, onOrBefore, after } from './util.js';
import { periodISO } from './periods.js';
import { hasTag, tagKey } from './tags.js';

export const getAccount = (S, id) => S.accounts.find((a) => a.id === id);
export const accName = (S, id) => { const a = getAccount(S, id); return a ? a.name : '—'; };
export const getCategory = (S, id) => PSEUDO[id] || S.categories.find((c) => c.id === id) || UNKNOWN_CAT;
export const accCur = (S, id) => { const a = getAccount(S, id); return a ? a.currency : S.settings.currency; };
// Tipos de cambio: S.rates[c] = cuánto vale 1 unidad de c en la moneda principal.
export const rateOf = (S, cur) => (cur === S.settings.currency ? 1 : (S.rates[cur] > 0 ? S.rates[cur] : 1));
export const convert = (S, amt, from, to) => (from === to ? amt : (amt * rateOf(S, from)) / rateOf(S, to));
export const sortedCats = (S, type) => S.categories.filter((c) => c.type === type && !c.archived).sort((a, b) => a.order - b.order);
export const isIncluded = (S, id) => { const a = getAccount(S, id); return !!a && a.includeInTotal !== false; };
export const inScope = (S, id, acc) => (acc === 'all' ? isIncluded(S, id) : id === acc);
export const touches = (S, t, acc) => (t.type === 'transfer' ? inScope(S, t.accountId, acc) || inScope(S, t.toAccountId, acc) : inScope(S, t.accountId, acc));
export const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0));
export const viewCurrency = (S, view) => { const a = getAccount(S, view.account); return a ? a.currency : S.settings.currency; };

// Partes de un movimiento: una por categoría si está dividido, o una sola.
export const isSplit = (t) => Array.isArray(t.splits) && t.splits.length > 1;
export const txParts = (t) => (isSplit(t) ? t.splits : [{ categoryId: t.categoryId, amount: t.amount }]);

// Convierte un movimiento en "apuntes" de ingreso/gasto vistos desde una cuenta (o todas).
export function txEntries(S, t, acc) {
  if (t.type === 'transfer') {
    const out = inScope(S, t.accountId, acc);
    const inn = inScope(S, t.toAccountId, acc);
    const res = [];
    if (out && !inn) res.push({ type: 'expense', amount: t.amount, currency: accCur(S, t.accountId), key: '__transfer_out' });
    if (inn && !out) res.push({ type: 'income', amount: t.toAmount, currency: accCur(S, t.toAccountId), key: '__transfer_in' });
    return res;
  }
  if (!inScope(S, t.accountId, acc)) return [];
  const currency = accCur(S, t.accountId);
  const split = isSplit(t);
  return txParts(t).map((p) => ({ type: t.type, amount: p.amount, currency, key: p.categoryId, split }));
}

// Totales del período por categoría. Con `view.tag`, solo los movimientos con esa etiqueta.
// Los movimientos divididos aportan cada parte a su categoría, así que el gráfico sigue sumando el total.
export function computeView(S, view) {
  const { from, to } = periodISO(view, S.settings);
  const acc = view.account;
  const tag = view.tag || null;
  const cur = viewCurrency(S, view);
  const carryOn = S.settings.carryOver && !tag; // el saldo arrastrado no tiene sentido dentro de una etiqueta
  const groups = new Map();
  const transfers = [];
  let income = 0, expense = 0, carry = 0;

  for (const t of S.transactions) {
    if (to && t.date > to) continue;
    if (tag && !hasTag(t, tag)) continue;
    const before = !!from && t.date < from;
    if (before && !carryOn) continue;
    if (!before && acc === 'all' && t.type === 'transfer' && inScope(S, t.accountId, acc) && inScope(S, t.toAccountId, acc)) transfers.push(t);
    for (const e of txEntries(S, t, acc)) {
      const v = convert(S, e.amount, e.currency, cur);
      if (before) { carry += e.type === 'income' ? v : -v; continue; }
      if (e.type === 'income') income += v; else expense += v;
      const gk = e.type + ':' + e.key;
      let g = groups.get(gk);
      if (!g) { g = { gk, key: e.key, cat: getCategory(S, e.key), type: e.type, total: 0, items: [] }; groups.set(gk, g); }
      g.total += v;
      g.items.push({ t, amount: e.amount, split: !!e.split, categoryId: e.key });
    }
  }
  if (carryOn) for (const a of S.accounts) if (inScope(S, a.id, acc)) carry += convert(S, a.initial || 0, a.currency, cur);

  const all = [...groups.values()];
  const exp = all.filter((g) => g.type === 'expense').sort((a, b) => b.total - a.total);
  const inc = all.filter((g) => g.type === 'income').sort((a, b) => b.total - a.total);
  return { view, from, to, cur, income, expense, carry, balance: income - expense + (carryOn ? carry : 0), exp, inc, transfers };
}

// Totales por etiqueta en el período de `view` (sin aplicar su filtro de etiqueta).
// Un movimiento con varias etiquetas cuenta en todas: los totales no se suman entre sí.
export function tagStats(S, view) {
  const { from, to } = periodISO(view, S.settings);
  const cur = viewCurrency(S, view);
  const map = new Map();
  for (const t of S.transactions) {
    if (!t.tags || !t.tags.length) continue;
    if ((from && t.date < from) || (to && t.date > to)) continue;
    if (!touches(S, t, view.account)) continue;
    let inc = 0, exp = 0;
    for (const e of txEntries(S, t, view.account)) {
      const v = convert(S, e.amount, e.currency, cur);
      if (e.type === 'income') inc += v; else exp += v;
    }
    for (const name of t.tags) {
      const k = tagKey(name);
      let s = map.get(k);
      if (!s) { s = { key: k, name, count: 0, income: 0, expense: 0, last: '' }; map.set(k, s); }
      s.count++; s.income += inc; s.expense += exp;
      if (t.date >= s.last) { s.last = t.date; s.name = name; }
    }
  }
  return { cur, tags: [...map.values()].sort((a, b) => b.expense - a.expense || b.income - a.income || b.count - a.count) };
}

export function balanceAt(S, a, iso = null) {
  let b = a.initial || 0;
  for (const t of S.transactions) {
    if (iso && t.date > iso) continue;
    if (t.type === 'transfer') {
      if (t.accountId === a.id) b -= t.amount;
      if (t.toAccountId === a.id) b += t.toAmount;
    } else if (t.accountId === a.id) b += t.type === 'income' ? t.amount : -t.amount;
  }
  return b;
}
export const accountBalance = (S, a) => balanceAt(S, a, null);
export const totalBalance = (S) => S.accounts.filter((a) => a.includeInTotal !== false)
  .reduce((s, a) => s + convert(S, accountBalance(S, a), a.currency, S.settings.currency), 0);

// Patrimonio neto = liquidez + ahorro + deudas (las deudas tienen saldo negativo).
export function netWorth(S) {
  const r = { liquid: 0, savings: 0, debt: 0, total: 0 };
  for (const a of S.accounts) {
    if (a.includeInTotal === false) continue;
    const v = convert(S, accountBalance(S, a), a.currency, S.settings.currency);
    r[ACCOUNT_KINDS[kindOf(a)].group] += v;
    r.total += v;
  }
  return r;
}

// Tarjeta de crédito: ciclo en curso, saldo del último cierre, lo pendiente y el próximo cargo.
export function creditInfo(S, a, today = todayISO()) {
  if (kindOf(a) !== 'credit') return null;
  const info = { balance: accountBalance(S, a), limit: a.limit || 0 };
  info.available = info.limit ? info.limit + info.balance : null;
  if (!a.closingDay) return info;
  const lastClose = onOrBefore(a.closingDay, fromISO(today));
  const lc = toISO(lastClose);
  info.lastClose = lc;
  info.nextClose = toISO(after(a.closingDay, fromISO(today)));
  let cycle = 0, paid = 0;
  for (const t of S.transactions) {
    if (t.date <= lc || t.date > today) continue;
    if (t.type === 'transfer') { if (t.toAccountId === a.id) paid += t.toAmount; }
    else if (t.accountId === a.id) cycle += t.type === 'expense' ? t.amount : -t.amount;
  }
  info.cycleSpend = cycle;
  info.statement = Math.max(0, -balanceAt(S, a, lc));
  info.pending = Math.max(0, info.statement - paid);
  if (a.paymentDay) info.due = toISO(after(a.paymentDay, lastClose));
  return info;
}

// Préstamo o deuda: cuánto se ha devuelto respecto a la deuda inicial.
export function loanInfo(S, a) {
  if (kindOf(a) !== 'loan' || !(a.initial < 0)) return null;
  const original = -a.initial;
  const remaining = Math.max(0, -accountBalance(S, a));
  return { original, remaining, paid: original - remaining, pct: Math.min(100, Math.max(0, ((original - remaining) / original) * 100)) };
}

// Movimientos recurrentes: fechas, generación automática, omisiones puntuales y previsión.
import { addDays, addMonths, fromISO, toISO, todayISO, uid } from './util.js';
import { convert, creditInfo, inScope, touches, txEntries, viewCurrency } from './ledger.js';

// Fecha de la repetición n (0 = la primera). Las mensuales y anuales conservan el día de inicio:
// si el mes es más corto se usa su último día y se vuelve al día original cuando el mes lo tiene.
export function occurrenceDate(rule, n) {
  const s = fromISO(rule.startDate);
  switch (rule.freq) {
    case 'daily': return toISO(addDays(s, n));
    case 'weekly': return toISO(addDays(s, 7 * n));
    case 'yearly': return toISO(addMonths(s, 12 * n));
    default: return toISO(addMonths(s, n));
  }
}

// Copia independiente de la plantilla (las etiquetas y partes no se comparten entre movimientos).
export function cloneTemplate(tpl) {
  const c = { ...tpl, tags: [...(tpl.tags || [])] };
  if (Array.isArray(tpl.splits)) c.splits = tpl.splits.map((p) => ({ ...p }));
  else delete c.splits;
  return c;
}

// Crea los movimientos vencidos hasta `today`. Las fechas de `skips` se saltan una sola vez.
// Devuelve cuántos cambios hubo (el llamador decide si guardar).
export function generateRecurring(S, today = todayISO()) {
  let changed = 0;
  for (const r of S.recurring) {
    if (!Array.isArray(r.skips)) r.skips = [];
    if (!r.active) continue;
    let guard = 0;
    while (guard++ < 3000) {
      const date = occurrenceDate(r, r.n);
      if (date > today) break;
      if (!r.skips.includes(date)) S.transactions.push({ ...cloneTemplate(r.template), id: uid(), date, recurringId: r.id, createdAt: Date.now() });
      r.n++;
      changed++;
    }
    const left = r.skips.filter((d) => d > today);
    if (left.length !== r.skips.length) { r.skips = left; changed++; }
  }
  return changed;
}

// Próxima fecha que sí se apuntará y las omitidas antes de ella.
export function nextOccurrence(r) {
  const skipped = [];
  for (let n = r.n, g = 0; g < 500; n++, g++) {
    const date = occurrenceDate(r, n);
    if ((r.skips || []).includes(date)) skipped.push(date); else return { date, skipped };
  }
  return { date: null, skipped };
}
// Alterna la omisión de una fecha. Devuelve true si ha quedado omitida.
export function toggleSkip(r, date) {
  if (!Array.isArray(r.skips)) r.skips = [];
  const i = r.skips.indexOf(date);
  if (i >= 0) r.skips.splice(i, 1); else r.skips.push(date);
  return i < 0;
}
// Al reanudar una regla no se rellenan las fechas que pasaron mientras estaba en pausa.
export function resumeRule(r, today = todayISO()) {
  r.active = true;
  while (occurrenceDate(r, r.n) < today) r.n++;
}

// Lo que viene en los próximos `days` días: reglas recurrentes, movimientos con fecha futura
// y cargos estimados de tarjetas de crédito. `value` es el efecto con signo en la moneda de la vista.
export function upcoming(S, days, acc = 'all', today = todayISO()) {
  const end = toISO(addDays(fromISO(today), days));
  const cur = viewCurrency(S, { account: acc });
  const items = [];
  const net = (t) => txEntries(S, t, acc).reduce((s, e) => s + (e.type === 'income' ? 1 : -1) * convert(S, e.amount, e.currency, cur), 0);
  for (const r of S.recurring) {
    if (!r.active || !touches(S, r.template, acc)) continue;
    for (let n = r.n, g = 0; g < 400; n++, g++) {
      const date = occurrenceDate(r, n);
      if (date > end) break;
      if (date <= today) continue;
      items.push({ kind: 'rule', rule: r, date, t: r.template, skipped: (r.skips || []).includes(date), value: net(r.template) });
    }
  }
  for (const t of S.transactions) {
    if (t.date > today && t.date <= end && touches(S, t, acc)) items.push({ kind: 'tx', tx: t, t, date: t.date, value: net(t) });
  }
  for (const a of S.accounts) {
    if (acc !== 'all' && acc !== a.id) continue;
    if (acc === 'all' && !inScope(S, a.id, acc)) continue;
    const ci = creditInfo(S, a, today);
    if (ci && ci.due && ci.pending > 0.004 && ci.due <= end) {
      items.push({ kind: 'card', account: a, date: ci.due, overdue: ci.due < today, amount: ci.pending, value: -convert(S, ci.pending, a.currency, cur) });
    }
  }
  items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const live = items.filter((i) => !i.skipped);
  const sum = (f) => live.filter(f).reduce((s, i) => s + i.value, 0);
  return {
    items, cur,
    out: -sum((i) => i.kind !== 'card' && i.value < 0),
    in: sum((i) => i.value > 0),
    cards: -sum((i) => i.kind === 'card'),
  };
}

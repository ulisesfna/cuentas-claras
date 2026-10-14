// Presupuestos mensuales (total y por categoría), escalados al período visible.
import { BUDGET_WARN } from './constants.js';
import { daysBetween, todayISO } from './util.js';
import { fmt } from './format.js';
import { accCur, computeView, convert, isIncluded, sortedCats, txParts } from './ledger.js';

// Importe mensual (moneda principal) escalado al período de `d` y convertido a su moneda.
export function scaleMonthly(S, amount, d, today = todayISO()) {
  const monthly = convert(S, amount, S.settings.currency, d.cur);
  const perDay = (monthly * 12) / 365;
  switch (d.view.type) {
    case 'month': return monthly;
    case 'year': return monthly * 12;
    case 'week': return perDay * 7;
    case 'day': return perDay;
    case 'range': return perDay * daysBetween(d.from, d.to);
    default: {
      const first = S.transactions.reduce((m, t) => (t.date < m ? t.date : m), today);
      return perDay * daysBetween(first, today);
    }
  }
}
export const categoryBudgetSum = (S) => sortedCats(S, 'expense').reduce((s, c) => s + (c.budget > 0 ? c.budget : 0), 0);
// El presupuesto total es el fijado a mano o, si no hay, la suma de los de cada categoría.
export const monthlyBudget = (S) => (S.settings.budget > 0 ? S.settings.budget : categoryBudgetSum(S));
export function periodBudget(S, d) {
  if (!S.settings.budgetEnabled || !(monthlyBudget(S) > 0) || d.view.tag) return null;
  return scaleMonthly(S, monthlyBudget(S), d);
}
export const catBudget = (S, c, d) => (c && c.budget > 0 && c.type === 'expense' && !d.view.tag ? scaleMonthly(S, c.budget, d) : null);
export const budgetLevel = (spent, budget) => (!budget ? '' : spent > budget + 0.004 ? 'over' : spent >= budget * BUDGET_WARN ? 'warn' : 'ok');

// Tras guardar un gasto, devuelve un aviso si cruza el 80 % o el 100 % del presupuesto de su mes
// (de alguna de sus categorías, si está dividido, o del total). Cadena vacía si no hay nada que avisar.
export function budgetAlert(S, tx) {
  if (!tx || tx.type !== 'expense' || !isIncluded(S, tx.accountId)) return '';
  const d = computeView(S, { type: 'month', anchor: tx.date, account: 'all', tag: null });
  const toCur = (amt) => convert(S, amt, accCur(S, tx.accountId), d.cur);
  const crossed = (spent, mine, budget) => {
    const now = budgetLevel(spent, budget), before = budgetLevel(spent - mine, budget);
    return now !== before && (now === 'warn' || now === 'over') ? now : '';
  };
  const byCat = new Map();
  for (const p of txParts(tx)) byCat.set(p.categoryId, (byCat.get(p.categoryId) || 0) + toCur(p.amount));
  for (const [catId, mine] of byCat) {
    const c = S.categories.find((x) => x.id === catId);
    const cb = catBudget(S, c, d);
    if (!cb) continue;
    const g = d.exp.find((x) => x.key === catId);
    const spent = g ? g.total : 0;
    const lv = crossed(spent, mine, cb);
    if (lv === 'over') return `Has superado el presupuesto de ${c.name}: ${fmt(spent, d.cur)} de ${fmt(cb, d.cur)}`;
    if (lv === 'warn') return `${c.name} va por el ${Math.round((spent / cb) * 100)} % de su presupuesto (${fmt(spent, d.cur)} de ${fmt(cb, d.cur)})`;
  }
  const tb = monthlyBudget(S) > 0 ? scaleMonthly(S, monthlyBudget(S), d) : null;
  if (tb) {
    const lv = crossed(d.expense, toCur(tx.amount), tb);
    if (lv === 'over') return `Has superado el presupuesto del mes: ${fmt(d.expense, d.cur)} de ${fmt(tb, d.cur)}`;
    if (lv === 'warn') return `Llevas el ${Math.round((d.expense / tb) * 100)} % del presupuesto del mes`;
  }
  return '';
}

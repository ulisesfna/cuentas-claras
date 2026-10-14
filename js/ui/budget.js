// Presupuestos: total mensual y por categoría.
import { BUDGET_WARN } from '../core/constants.js';
import { esc, parseNum, plain, round2, todayISO } from '../core/util.js';
import { fmt } from '../core/format.js';
import { periodLabel } from '../core/periods.js';
import { computeView, sortedCats } from '../core/ledger.js';
import { budgetLevel, categoryBudgetSum, monthlyBudget } from '../core/budget.js';
import { $, catIcon, openSheet, stack } from './dom.js';
import { S, save } from './store.js';
import { render } from './screen.js';

// Barra de progreso de un presupuesto con su estado en texto (no solo color).
export function budgetMeter(spent, budget, cur) {
  const lv = budgetLevel(spent, budget);
  const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
  const left = budget - spent;
  const state = lv === 'over' ? `⚠ Superado en ${fmt(-left, cur)}` : lv === 'warn' ? `Cerca del límite · quedan ${fmt(left, cur)}` : `Quedan ${fmt(left, cur)}`;
  return `<div class="meter ${lv}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct}%"></i></div>
    <div class="meter-legend"><span>${fmt(spent, cur)} de ${fmt(budget, cur)} · ${Math.round(budget ? (spent / budget) * 100 : 0)} %</span><span class="lvl ${lv}">${state}</span></div>`;
}

export function openBudget() {
  const sh = openSheet({ title: 'Presupuestos', cls: 'sheet-tall' });
  const draw = () => {
    const s = S.settings;
    const base = s.currency;
    const today = todayISO();
    const d = computeView(S, { type: 'month', anchor: today, account: 'all', tag: null });
    const spentBy = new Map(d.exp.map((g) => [g.key, g.total]));
    const sum = categoryBudgetSum(S);
    const total = monthlyBudget(S);
    const cats = sortedCats(S, 'expense');
    sh.body.innerHTML = `
      <p class="muted">Fija cuánto quieres gastar al mes en total y, si quieres, en cada categoría. Te avisaremos al llegar al ${Math.round(BUDGET_WARN * 100)} % y al superarlo, y las categorías cerca del límite se marcan alrededor del gráfico.</p>
      <label class="switch-row"><span><b>Mostrar en el gráfico</b><small>El centro del gráfico enseña lo que te queda del presupuesto total.</small></span><input type="checkbox" class="switch" data-en ${s.budgetEnabled ? 'checked' : ''}></label>
      <h4 class="sub-h">Total del mes · ${esc(periodLabel({ type: 'month', anchor: today }, S.settings))}</h4>
      <label class="field"><span>Presupuesto mensual total (${esc(base)})</span><input data-amt inputmode="decimal" value="${s.budget ? plain(s.budget) : ''}" placeholder="${sum ? `Suma de categorías: ${plain(sum)}` : 'p. ej. 1200'}">
        <small class="muted">${s.budget ? 'Déjalo vacío para usar la suma de las categorías.' : sum ? 'Vacío: se usa la suma de los presupuestos por categoría.' : 'Opcional si pones presupuestos por categoría.'}</small></label>
      ${total ? `<div class="budget-card">${budgetMeter(d.expense, total, base)}</div>` : ''}
      <h4 class="sub-h">Por categoría</h4>
      <div class="list">${cats.map((c) => {
        const spent = spentBy.get(c.id) || 0;
        return `<div class="list-row bud-row">${catIcon(c)}<div class="grow">
            <div class="row-between"><span class="t">${esc(c.name)}</span>
              <span class="bud-input"><input data-cat-budget="${c.id}" inputmode="decimal" value="${c.budget > 0 ? plain(c.budget) : ''}" placeholder="Sin límite" aria-label="Presupuesto mensual de ${esc(c.name)}"> ${esc(base)}</span></div>
            ${c.budget > 0 ? budgetMeter(spent, c.budget, base) : spent ? `<span class="s">Este mes: ${fmt(spent, base)}</span>` : ''}
          </div></div>`;
      }).join('')}</div>
      ${sum && s.budget && sum > s.budget ? `<p class="tip mt">⚠ La suma de las categorías (${fmt(sum)}) supera el presupuesto total (${fmt(s.budget)}).</p>` : ''}`;
  };
  sh.refresh = draw;
  draw();
  // Redibuja cuando dejas de escribir, para no quitarte el foco al pasar de una casilla a otra.
  let dirty = false;
  const settle = () => setTimeout(() => {
    const a = document.activeElement;
    if (!dirty || (a && sh.body.contains(a) && a.matches('input[inputmode]'))) return;
    dirty = false;
    draw();
  }, 0);
  sh.body.addEventListener('focusout', settle);
  sh.body.addEventListener('change', (e) => {
    if (e.target.matches('[data-en]')) {
      S.settings.budgetEnabled = e.target.checked;
      if (e.target.checked && !(monthlyBudget(S) > 0)) setTimeout(() => $('[data-amt]', sh.body).focus(), 50);
    }
    if (e.target.matches('[data-amt]')) S.settings.budget = Math.max(0, round2(parseNum(e.target.value)));
    const cb = e.target.dataset.catBudget;
    if (cb) { const c = S.categories.find((x) => x.id === cb); if (c) c.budget = Math.max(0, round2(parseNum(e.target.value))); }
    save();
    render();
    stack.forEach((s) => s !== sh && s.refresh && s.refresh());
    dirty = true;
    settle();
  });
}

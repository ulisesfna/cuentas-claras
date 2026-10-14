import { describe, test, assert } from './harness.js';
import { budgetAlert, budgetLevel, monthlyBudget, scaleMonthly } from '../js/core/budget.js';
import { computeView } from '../js/core/ledger.js';
import { makeState, tx } from './fixtures.js';

describe('Presupuestos', () => {
  test('niveles: aviso desde el 80 %, superado por encima del 100 %', () => {
    assert.equal(budgetLevel(79, 100), 'ok');
    assert.equal(budgetLevel(80, 100), 'warn');
    assert.equal(budgetLevel(100, 100), 'warn');
    assert.equal(budgetLevel(100.01, 100), 'over');
    assert.equal(budgetLevel(50, 0), '');
  });
  test('el mensual se escala al período visible', () => {
    const S = makeState();
    const d = (type) => computeView(S, { type, anchor: '2026-10-14', account: 'all', tag: null });
    assert.close(scaleMonthly(S, 365, d('month')), 365);
    assert.close(scaleMonthly(S, 365, d('year')), 4380);
    assert.close(scaleMonthly(S, 365, d('week')), 84);
    assert.close(scaleMonthly(S, 365, d('day')), 12);
  });
  test('el total es el fijado o, si no hay, la suma de las categorías', () => {
    const S = makeState();
    S.categories[0].budget = 300;
    S.categories[1].budget = 100;
    assert.equal(monthlyBudget(S), 400);
    S.settings.budget = 1000;
    assert.equal(monthlyBudget(S), 1000);
  });
  test('avisa solo al cruzar el 80 % y al superar el 100 %', () => {
    const S = makeState({ transactions: [tx({ amount: 70 })] });
    S.categories[0].budget = 100;
    const a = tx({ amount: 15 });
    S.transactions.push(a);
    assert.ok(/85 %/.test(budgetAlert(S, a)), 'cruza el 80 %');
    const b = tx({ amount: 5 });
    S.transactions.push(b);
    assert.equal(budgetAlert(S, b), '', 'ya estaba por encima del 80 %');
    const c = tx({ amount: 20 });
    S.transactions.push(c);
    assert.ok(/superado/.test(budgetAlert(S, c)));
  });
  test('en un gasto dividido avisa por la categoría de la parte', () => {
    const S = makeState();
    S.categories[2].budget = 10; // Limpieza
    const t = tx({ amount: 57, splits: [{ categoryId: 'food', amount: 45 }, { categoryId: 'home', amount: 12 }] });
    S.transactions.push(t);
    assert.ok(/Limpieza/.test(budgetAlert(S, t)) && /superado/.test(budgetAlert(S, t)));
  });
  test('los ingresos y las cuentas excluidas no avisan', () => {
    const S = makeState();
    S.categories[0].budget = 1;
    const inc = tx({ type: 'income', categoryId: 'salary', amount: 100 });
    assert.equal(budgetAlert(S, inc), '');
    S.accounts[1].includeInTotal = false;
    const e = tx({ amount: 100 });
    S.transactions.push(e);
    assert.equal(budgetAlert(S, e), '');
  });
});

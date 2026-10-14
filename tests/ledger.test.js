import { describe, test, assert } from './harness.js';
import { accountBalance, computeView, convert, loanInfo, netWorth, tagStats } from '../js/core/ledger.js';
import { makeState, tx } from './fixtures.js';

const OCT = { type: 'month', anchor: '2026-10-14', account: 'all', tag: null };

describe('Conversión de monedas', () => {
  test('a la moneda principal, desde ella y entre dos extranjeras', () => {
    const S = makeState({ rates: { USD: 0.9, GBP: 1.2 } });
    assert.close(convert(S, 100, 'USD', 'EUR'), 90);
    assert.close(convert(S, 90, 'EUR', 'USD'), 100);
    assert.close(convert(S, 100, 'GBP', 'USD'), 133.33);
    assert.equal(convert(S, 5, 'EUR', 'EUR'), 5);
  });
  test('sin tipo de cambio se usa 1 (no rompe los totales)', () => {
    assert.equal(convert(makeState({ rates: {} }), 10, 'JPY', 'EUR'), 10);
  });
});

describe('Totales de la vista', () => {
  test('ingresos, gastos y saldo del mes', () => {
    const S = makeState({ transactions: [
      tx({ amount: 10 }), tx({ amount: 20, categoryId: 'fun' }), tx({ type: 'income', amount: 500, categoryId: 'salary' }),
      tx({ amount: 999, date: '2026-09-30' }), tx({ amount: 999, date: '2026-11-01' }),
    ] });
    const d = computeView(S, OCT);
    assert.close(d.expense, 30);
    assert.close(d.income, 500);
    assert.close(d.balance, 470);
    assert.deepEqual(d.exp.map((g) => g.key), ['fun', 'food'], 'ordenados de mayor a menor');
  });
  test('una transferencia entre cuentas propias no es gasto, salvo viendo una sola cuenta', () => {
    const t = tx({ type: 'transfer', accountId: 'bank', toAccountId: 'cash', amount: 50, toAmount: 50, categoryId: null });
    const S = makeState({ transactions: [t] });
    const all = computeView(S, OCT);
    assert.equal(all.expense, 0);
    assert.equal(all.transfers.length, 1);
    const bank = computeView(S, { ...OCT, account: 'bank' });
    assert.close(bank.expense, 50);
    assert.equal(bank.exp[0].key, '__transfer_out');
    const cash = computeView(S, { ...OCT, account: 'cash' });
    assert.close(cash.income, 50);
  });
  test('una transferencia a una cuenta excluida del total cuenta como gasto', () => {
    const S = makeState({ transactions: [tx({ type: 'transfer', accountId: 'bank', toAccountId: 'cash', amount: 50, toAmount: 50, categoryId: null })] });
    S.accounts[0].includeInTotal = false;
    assert.close(computeView(S, OCT).expense, 50);
  });
  test('los gastos en otra moneda se convierten; viendo esa cuenta, no', () => {
    const S = makeState({ transactions: [tx({ accountId: 'usd', amount: 100 })] });
    assert.close(computeView(S, OCT).expense, 90);
    const d = computeView(S, { ...OCT, account: 'usd' });
    assert.equal(d.cur, 'USD');
    assert.close(d.expense, 100);
  });
  test('un gasto dividido aporta cada parte a su categoría y el total cuadra', () => {
    const S = makeState({ transactions: [tx({ amount: 57, splits: [{ categoryId: 'food', amount: 45 }, { categoryId: 'home', amount: 12 }] })] });
    const d = computeView(S, OCT);
    assert.close(d.expense, 57);
    const by = Object.fromEntries(d.exp.map((g) => [g.key, g.total]));
    assert.deepEqual(by, { food: 45, home: 12 });
    assert.equal(d.exp.find((g) => g.key === 'home').items[0].amount, 12);
    assert.equal(d.exp.find((g) => g.key === 'home').items[0].split, true);
  });
  test('filtro por etiqueta (sin distinguir mayúsculas ni tildes)', () => {
    const S = makeState({ transactions: [
      tx({ amount: 20, categoryId: 'fun', tags: ['Cumpleaños-Ana'] }), tx({ amount: 10 }),
      tx({ amount: 5, tags: ['cumpleanos-ana', 'otra'] }),
    ] });
    const d = computeView(S, { ...OCT, tag: 'cumpleaños-ana' });
    assert.close(d.expense, 25);
  });
  test('saldo arrastrado: incluye lo anterior y los saldos iniciales; no con una etiqueta', () => {
    const S = makeState({ settings: { carryOver: true }, transactions: [
      tx({ type: 'income', amount: 200, categoryId: 'salary', date: '2026-09-15' }), tx({ amount: 30 }),
    ] });
    const d = computeView(S, OCT);
    assert.close(d.carry, 1100 + 200, 0.005, 'iniciales 100 + 1000 + 0 USD');
    assert.close(d.balance, 1300 - 30);
    assert.close(computeView(S, { ...OCT, tag: 'x' }).balance, 0);
  });
});

describe('Saldos, deudas y patrimonio', () => {
  test('saldo de cuenta con transferencias', () => {
    const S = makeState({ transactions: [
      tx({ accountId: 'cash', amount: 30 }), tx({ type: 'transfer', accountId: 'bank', toAccountId: 'cash', amount: 50, toAmount: 50, categoryId: null }),
    ] });
    assert.close(accountBalance(S, S.accounts[0]), 100 - 30 + 50);
    assert.close(accountBalance(S, S.accounts[1]), 1000 - 50);
  });
  test('patrimonio neto separa liquidez y deudas', () => {
    const S = makeState();
    S.accounts.push({ id: 'loan', name: 'Coche', kind: 'loan', currency: 'EUR', initial: -10000, includeInTotal: true });
    S.transactions.push(tx({ type: 'transfer', accountId: 'bank', toAccountId: 'loan', amount: 300, toAmount: 300, categoryId: null }));
    const nw = netWorth(S);
    assert.close(nw.liquid, 100 + 700);
    assert.close(nw.debt, -9700);
    assert.close(nw.total, 800 - 9700);
    const li = loanInfo(S, S.accounts[3]);
    assert.close(li.paid, 300);
    assert.close(li.pct, 3);
  });
});

describe('Estadísticas por etiqueta', () => {
  test('un movimiento con dos etiquetas cuenta en ambas', () => {
    const S = makeState({ transactions: [tx({ amount: 40, tags: ['viaje', 'roma'] }), tx({ amount: 10, tags: ['viaje'] }), tx({ amount: 99 })] });
    const { tags } = tagStats(S, OCT);
    const by = Object.fromEntries(tags.map((t) => [t.key, t.expense]));
    assert.deepEqual(by, { viaje: 50, roma: 40 });
    assert.equal(tags[0].count, 2);
  });
});

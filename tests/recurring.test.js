import { describe, test, assert } from './harness.js';
import { generateRecurring, nextOccurrence, occurrenceDate, resumeRule, toggleSkip, upcoming } from '../js/core/recurring.js';
import { creditInfo } from '../js/core/ledger.js';
import { makeState, tx } from './fixtures.js';

const rule = (o) => ({ id: 'r', freq: 'monthly', startDate: '2026-01-31', n: 1, active: true, skips: [],
  template: { type: 'expense', amount: 12, accountId: 'cash', categoryId: 'fun', toAccountId: null, toAmount: null, note: '', tags: [] }, ...o });

describe('Recurrentes: fechas', () => {
  test('mensual desde el 31: último día de los meses cortos y vuelta al 31', () => {
    const r = rule({ startDate: '2027-01-31' });
    assert.equal(occurrenceDate(r, 1), '2027-02-28');
    assert.equal(occurrenceDate(r, 2), '2027-03-31');
    assert.equal(occurrenceDate(r, 3), '2027-04-30');
  });
  test('mensual en año bisiesto', () => {
    assert.equal(occurrenceDate(rule({ startDate: '2028-01-31' }), 1), '2028-02-29');
  });
  test('anual desde el 29 de febrero', () => {
    const r = rule({ freq: 'yearly', startDate: '2028-02-29' });
    assert.equal(occurrenceDate(r, 1), '2029-02-28');
    assert.equal(occurrenceDate(r, 4), '2032-02-29');
  });
  test('diaria y semanal', () => {
    assert.equal(occurrenceDate(rule({ freq: 'weekly', startDate: '2026-10-01' }), 2), '2026-10-15');
    assert.equal(occurrenceDate(rule({ freq: 'daily', startDate: '2026-12-31' }), 1), '2027-01-01');
  });
});

describe('Recurrentes: generación', () => {
  test('crea lo vencido, salta las fechas omitidas y limpia las omisiones pasadas', () => {
    const S = makeState({ recurring: [rule({ startDate: '2026-08-14', skips: ['2026-09-14', '2026-12-14'] })] });
    generateRecurring(S, '2026-10-14');
    assert.deepEqual(S.transactions.map((t) => t.date), ['2026-10-14']);
    assert.equal(S.recurring[0].n, 3);
    assert.deepEqual(S.recurring[0].skips, ['2026-12-14'], 'la omisión futura se conserva');
  });
  test('no crea nada futuro ni para reglas detenidas', () => {
    const S = makeState({ recurring: [rule({ startDate: '2026-10-20' }), rule({ id: 'p', startDate: '2026-01-01', active: false })] });
    assert.equal(generateRecurring(S, '2026-10-14'), 0);
    assert.equal(S.transactions.length, 0);
  });
  test('cada movimiento generado tiene copias propias de etiquetas y partes', () => {
    const tpl = { type: 'expense', amount: 57, accountId: 'bank', categoryId: 'food', toAccountId: null, toAmount: null, note: '', tags: ['casa'],
      splits: [{ categoryId: 'food', amount: 45 }, { categoryId: 'home', amount: 12 }] };
    const S = makeState({ recurring: [rule({ startDate: '2026-08-01', template: tpl })] });
    generateRecurring(S, '2026-10-14');
    assert.equal(S.transactions.length, 2);
    S.transactions[0].tags.push('otra');
    S.transactions[0].splits[0].amount = 1;
    assert.deepEqual(S.transactions[1].tags, ['casa']);
    assert.equal(S.transactions[1].splits[0].amount, 45);
    assert.deepEqual(tpl.tags, ['casa']);
  });
  test('omitir una vez y deshacer', () => {
    const r = rule({ startDate: '2026-10-20', n: 0 });
    assert.equal(nextOccurrence(r).date, '2026-10-20');
    assert.equal(toggleSkip(r, '2026-10-20'), true);
    assert.deepEqual(nextOccurrence(r), { date: '2026-11-20', skipped: ['2026-10-20'] });
    assert.equal(toggleSkip(r, '2026-10-20'), false);
    assert.equal(nextOccurrence(r).date, '2026-10-20');
  });
  test('reanudar no rellena lo que pasó en pausa', () => {
    const r = rule({ startDate: '2026-01-10', active: false });
    resumeRule(r, '2026-10-14');
    assert.equal(occurrenceDate(r, r.n), '2026-11-10');
  });
});

describe('Próximos movimientos', () => {
  test('suma lo que sale y respeta las omisiones', () => {
    const S = makeState({ recurring: [rule({ freq: 'weekly', startDate: '2026-10-09' })] });
    let u = upcoming(S, 7, 'all', '2026-10-14');
    assert.deepEqual(u.items.map((i) => i.date), ['2026-10-16']);
    assert.close(u.out, 12);
    toggleSkip(S.recurring[0], '2026-10-16');
    u = upcoming(S, 7, 'all', '2026-10-14');
    assert.close(u.out, 0);
    assert.equal(u.items[0].skipped, true);
  });
  test('incluye movimientos con fecha futura', () => {
    const S = makeState({ transactions: [tx({ date: '2026-10-20', amount: 30 }), tx({ date: '2026-12-20', amount: 99 })] });
    const u = upcoming(S, 30, 'all', '2026-10-14');
    assert.equal(u.items.length, 1);
    assert.close(u.out, 30);
  });
  test('cargo estimado de una tarjeta de crédito', () => {
    const S = makeState();
    S.accounts.push({ id: 'visa', name: 'Visa', kind: 'credit', currency: 'EUR', initial: 0, includeInTotal: true, limit: 1000, closingDay: 25, paymentDay: 5 });
    S.transactions.push(
      tx({ accountId: 'visa', amount: 340, date: '2026-09-20' }),
      tx({ accountId: 'visa', amount: 85.5, date: '2026-09-28' }),
      tx({ accountId: 'visa', amount: 60, date: '2026-10-10' }),
      tx({ type: 'transfer', accountId: 'bank', toAccountId: 'visa', amount: 100, toAmount: 100, categoryId: null, date: '2026-10-02' }),
    );
    const ci = creditInfo(S, S.accounts[3], '2026-10-14');
    assert.equal(ci.lastClose, '2026-09-25');
    assert.equal(ci.nextClose, '2026-10-25');
    assert.close(ci.statement, 340);
    assert.close(ci.pending, 240);
    assert.close(ci.cycleSpend, 145.5);
    assert.close(ci.available, 614.5);
    assert.equal(ci.due, '2026-10-05');
    const card = upcoming(S, 30, 'all', '2026-10-14').items.find((i) => i.kind === 'card');
    assert.ok(card && card.overdue, 'el cargo del día 5 ya está vencido');
    assert.close(card.amount, 240);
  });
});

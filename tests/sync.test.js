import { describe, test, assert } from './harness.js';
import { merge3, mergeById, mergeRecord, repairRefs, samePayload, toPayload } from '../js/core/sync.js';
import { generateRecurring } from '../js/core/recurring.js';
import { validateImport } from '../js/core/validate.js';
import { makeState, tx } from './fixtures.js';

const ids = (list) => list.map((x) => x.id).sort();
const clone = (v) => JSON.parse(JSON.stringify(v));
// Carga compartida de un estado, como la calcula la app (validada y limpia).
const P = (S) => toPayload(validateImport(clone(S)).data);

describe('Sincronización: fusión a tres bandas', () => {
  test('sin base (primera vez) solo suma: nunca borra', () => {
    const out = mergeById(null, [{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 1 }]);
    assert.deepEqual(ids(out), ['a', 'b', 'c']);
    assert.equal(out.find((x) => x.id === 'b').v, 1, 'mismo id en los dos: gana este dispositivo');
  });
  test('gana el lado que cambió', () => {
    const B = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const out = mergeById(B, [{ id: 'a', v: 1 }, { id: 'b', v: 9 }], [{ id: 'a', v: 7 }, { id: 'b', v: 1 }]);
    assert.deepEqual(out, [{ id: 'a', v: 7 }, { id: 'b', v: 9 }]);
  });
  test('los borrados se propagan en ambos sentidos', () => {
    const B = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const out = mergeById(B, [{ id: 'b' }, { id: 'c' }], [{ id: 'a' }, { id: 'c' }]);
    assert.deepEqual(ids(out), ['c']);
  });
  test('borrado en un lado y modificado en el otro: se conserva', () => {
    const out = mergeById([{ id: 'a', v: 1 }], [], [{ id: 'a', v: 2 }]);
    assert.deepEqual(out, [{ id: 'a', v: 2 }]);
  });
  test('cambios en campos distintos se juntan; en el mismo campo gana este dispositivo', () => {
    const b = { id: 't', note: '', amount: 10, date: '2026-10-01' };
    const out = mergeById([b], [{ ...b, note: 'cena', date: '2026-10-02' }], [{ ...b, amount: 12, date: '2026-10-03' }]);
    assert.deepEqual(out[0], { id: 't', note: 'cena', amount: 12, date: '2026-10-02' });
  });
  test('etiquetas: se unen las añadidas y se quitan las quitadas', () => {
    const b = { id: 't', tags: ['a'], note: '' };
    const out = mergeById([b], [{ ...b, tags: ['a', 'b'], note: 'x' }], [{ ...b, tags: ['c'] }]);
    assert.deepEqual(out[0].tags.sort(), ['b', 'c']);
  });
  test('recurrentes: repeticiones generadas (máximo) y omisiones (unión)', () => {
    const b = { id: 'r', n: 3, skips: [] };
    const out = mergeById([b], [{ ...b, n: 5 }], [{ ...b, n: 4, skips: ['2026-12-01'] }]);
    assert.equal(out[0].n, 5);
    assert.deepEqual(out[0].skips, ['2026-12-01']);
  });
  test('ajustes y tipos de cambio, clave a clave', () => {
    const out = mergeRecord({ currency: 'EUR', budget: 0 }, { currency: 'EUR', budget: 500 }, { currency: 'USD', budget: 0 });
    assert.deepEqual(out, { currency: 'USD', budget: 500 });
  });
  test('recupera una categoría borrada en otro dispositivo si un movimiento nuevo la usa', () => {
    const cat = { id: 'c1', name: 'Viajes', type: 'expense' };
    const base = { accounts: [{ id: 'a' }], categories: [cat], transactions: [], recurring: [], rules: [], rates: {}, settings: {} };
    const local = { ...clone(base), transactions: [{ id: 't', accountId: 'a', categoryId: 'c1' }] };
    const remote = { ...clone(base), categories: [], rules: [] };
    const out = merge3(base, local, remote);
    assert.deepEqual(ids(out.categories), ['c1']);
    assert.equal(out.transactions.length, 1);
  });
  test('quita las reglas cuya categoría ya no existe', () => {
    const p = repairRefs({ accounts: [], categories: [], transactions: [], recurring: [], rules: [{ id: 'r', categoryId: 'x' }] }, []);
    assert.equal(p.rules.length, 0);
  });
  test('comparar cargas no depende del orden', () => {
    const a = { accounts: [{ id: '1' }, { id: '2' }], categories: [], transactions: [], recurring: [], rules: [], rates: { USD: 1 }, settings: { b: 1, a: 2 } };
    const b = { ...a, accounts: [{ id: '2' }, { id: '1' }], settings: { a: 2, b: 1 } };
    assert.ok(samePayload(a, b));
    assert.ok(!samePayload(a, { ...b, rates: { USD: 2 } }));
  });
});

describe('Sincronización: recurrentes sin duplicados', () => {
  test('dos dispositivos que generan el mismo recibo crean el mismo movimiento', () => {
    const rule = { id: 'alquiler', freq: 'monthly', startDate: '2026-09-01', n: 1, active: true, skips: [],
      template: { type: 'expense', amount: 650, accountId: 'bank', categoryId: 'food', toAccountId: null, toAmount: null, note: 'Alquiler', tags: [] } };
    const A = makeState({ recurring: [clone(rule)] }), B = makeState({ recurring: [clone(rule)] });
    generateRecurring(A, '2026-10-14');
    generateRecurring(B, '2026-10-15');
    assert.deepEqual(A.transactions, B.transactions, 'mismo id y mismo contenido');
    const merged = merge3(null, P(A), P(B));
    assert.equal(merged.transactions.length, 1);
  });
  test('no vuelve a generar un recibo que ya llegó de otro dispositivo', () => {
    const rule = { id: 'r', freq: 'monthly', startDate: '2026-09-01', n: 1, active: true, skips: [],
      template: { type: 'expense', amount: 1, accountId: 'bank', categoryId: 'food', toAccountId: null, toAmount: null, note: '', tags: [] } };
    const S = makeState({ recurring: [rule] });
    generateRecurring(S, '2026-10-14');
    S.recurring[0].n = 1; // como si la regla llegara atrasada de otro dispositivo
    generateRecurring(S, '2026-10-14');
    assert.equal(S.transactions.length, 1);
  });
});

describe('Sincronización: dos dispositivos con cambios a la vez', () => {
  test('convergen al mismo contenido sin perder nada', () => {
    // Punto de partida común, ya sincronizado.
    const start = makeState({ transactions: [tx({ id: 'x', amount: 5 }), tx({ id: 'y', amount: 7 }), tx({ id: 'z', amount: 9, note: '' })] });
    let server = P(start);
    let baseA = clone(server), baseB = clone(server);
    const A = clone(start), B = clone(start);
    // A: añade un gasto y borra «y». B: edita la nota de «z» y añade una regla.
    A.transactions.push(tx({ id: 'nuevoA', amount: 3 }));
    A.transactions = A.transactions.filter((t) => t.id !== 'y');
    B.transactions.find((t) => t.id === 'z').note = 'farmacia';
    B.rules.push({ id: 'regla', pattern: 'farmacia', categoryId: 'food', type: 'expense' });
    // A sincroniza primero, luego B, y A otra vez (como haría la app).
    const sync = (dev, base) => {
      const merged = merge3(base, P(dev), server);
      server = clone(merged);
      return merged;
    };
    const a1 = sync(A, baseA); Object.assign(A, a1); baseA = clone(a1);
    const b1 = sync(B, baseB); Object.assign(B, b1); baseB = clone(b1);
    const a2 = sync(A, baseA); Object.assign(A, a2);
    assert.ok(samePayload(P(A), P(B)), 'los dos dispositivos tienen lo mismo');
    assert.deepEqual(ids(A.transactions), ['nuevoA', 'x', 'z']);
    assert.equal(A.transactions.find((t) => t.id === 'z').note, 'farmacia');
    assert.equal(A.rules.length, 1);
  });
});

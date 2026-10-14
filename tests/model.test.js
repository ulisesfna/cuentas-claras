import { describe, test, assert } from './harness.js';
import { SCHEMA_VERSION } from '../js/core/constants.js';
import { migrate, NewerVersionError } from '../js/core/model.js';
import { validateImport } from '../js/core/validate.js';
import { mergeData } from '../js/core/merge.js';
import { makeState, tx } from './fixtures.js';

// Datos tal como los guardaba la versión 1 de la app.
const v1 = () => ({
  settings: { currency: 'EUR' },
  accounts: [{ id: 'a1', name: 'Efectivo', icon: '💵', currency: 'EUR', initial: 0 }, { id: 'a2', name: 'Tarjeta', icon: '💳', currency: 'EUR', initial: 0 }],
  categories: [{ id: 'c1', name: 'Comida', icon: '🛒', color: '#2e9e6a', type: 'expense', order: 0 }],
  transactions: [{ id: 't1', type: 'expense', amount: 5, accountId: 'a1', categoryId: 'c1', date: '2026-10-01', note: '' }],
  recurring: [{ id: 'r1', freq: 'monthly', startDate: '2026-10-01', n: 1, active: true, template: { type: 'expense', amount: 5, accountId: 'a1', categoryId: 'c1' } }],
  rates: {},
});

describe('Migraciones', () => {
  test(`v1 → v${SCHEMA_VERSION}: tipos de cuenta, presupuestos, omisiones, etiquetas y reglas`, () => {
    const o = migrate(v1(), '2026-10-14');
    assert.equal(o.version, SCHEMA_VERSION);
    assert.deepEqual(o.accounts.map((a) => a.kind), ['cash', 'bank']);
    assert.equal(o.categories[0].budget, 0);
    assert.deepEqual(o.recurring[0].skips, []);
    assert.deepEqual(o.transactions[0].tags, []);
    assert.deepEqual(o.recurring[0].template.tags, []);
    assert.deepEqual(o.rules, []);
    assert.deepEqual(o.settings.csvProfiles, {});
    assert.equal(o.view.tag, null);
  });
  test('migrar dos veces no cambia nada', () => {
    const once = migrate(v1(), '2026-10-14');
    const twice = migrate(JSON.parse(JSON.stringify(once)), '2026-10-14');
    assert.deepEqual(twice, once);
  });
  test('datos de una versión más nueva: se rechazan', () => {
    assert.throws(() => migrate({ ...v1(), version: SCHEMA_VERSION + 1 }), NewerVersionError);
  });
  test('elementos mal formados no rompen la migración', () => {
    const o = v1();
    o.accounts.push(null);
    o.transactions.push('basura');
    migrate(o);
  });
});

describe('Validación de copias', () => {
  test('una copia correcta (también de la v1) se acepta y se limpia', () => {
    const r = validateImport(v1(), '2026-10-14');
    assert.ok(r.data, (r.errors || []).join(' | '));
    assert.equal(r.data.version, SCHEMA_VERSION);
    assert.equal(r.data.transactions[0].note, '');
  });
  test('detecta fechas imposibles, importes negativos y referencias rotas', () => {
    const o = v1();
    o.transactions.push({ ...o.transactions[0], id: 't2', date: '2026-02-31' });
    o.transactions.push({ ...o.transactions[0], id: 't3', amount: -5 });
    o.transactions.push({ ...o.transactions[0], id: 't4', accountId: 'nope' });
    o.transactions.push({ ...o.transactions[0], id: 't1' });
    const r = validateImport(o);
    assert.ok(r.errors && r.errors.length === 4, JSON.stringify(r.errors));
    assert.ok(/fecha/.test(r.errors[0]) && /importe/.test(r.errors[1]) && /cuenta/.test(r.errors[2]) && /repetido/.test(r.errors[3]));
  });
  test('valida las partes de un gasto dividido', () => {
    const o = makeState({ transactions: [tx({ id: 's1', amount: 50, splits: [{ categoryId: 'food', amount: 45 }, { categoryId: 'home', amount: 12 }] })] });
    assert.ok(/suman/.test(validateImport(o).errors[0]));
    o.transactions[0].splits = [{ categoryId: 'food', amount: 38 }, { categoryId: 'salary', amount: 12 }];
    assert.ok(/categoría/.test(validateImport(o).errors[0]));
    o.transactions[0].splits = [{ categoryId: 'food', amount: 38 }, { categoryId: 'home', amount: 12 }];
    const ok = validateImport(o);
    assert.ok(ok.data);
    assert.deepEqual(ok.data.transactions[0].splits, [{ categoryId: 'food', amount: 38 }, { categoryId: 'home', amount: 12 }]);
  });
  test('etiquetas: se rechaza un formato no válido y se quitan duplicados', () => {
    const o = makeState({ transactions: [tx({ id: 'g1', tags: 'viaje' })] });
    assert.ok(/etiquetas/.test(validateImport(o).errors[0]));
    o.transactions[0].tags = ['#Viaje', 'viaje', 'Roma'];
    assert.deepEqual(validateImport(o).data.transactions[0].tags, ['Viaje', 'Roma']);
  });
  test('reglas con categoría inexistente', () => {
    const o = makeState({ rules: [{ id: 'x', pattern: 'MERCADONA', categoryId: 'nope' }] });
    assert.ok(/categoría/.test(validateImport(o).errors[0]));
  });
  test('copia de una versión más nueva', () => {
    assert.ok(/más nueva/.test(validateImport({ ...v1(), version: 99 }).errors[0]));
  });
});

describe('Combinar copias', () => {
  test('reconoce cuentas y categorías por nombre y no duplica movimientos', () => {
    const cur = makeState({ transactions: [tx({ id: 'same' })] });
    const inc = makeState({
      accounts: [{ id: 'otro-banco', name: 'banco', icon: '🏦', kind: 'bank', currency: 'EUR', initial: 0, includeInTotal: true },
        { id: 'nueva', name: 'Hucha', icon: '🐷', kind: 'savings', currency: 'EUR', initial: 0, includeInTotal: true }],
      categories: [{ id: 'otra-comida', name: 'SUPERMERCADO', icon: '•', color: '#888', type: 'expense', order: 0, budget: 0 },
        { id: 'otra-limpieza', name: 'Limpieza', icon: '•', color: '#888', type: 'expense', order: 1, budget: 0 }],
      transactions: [tx({ id: 'same', accountId: 'otro-banco', categoryId: 'otra-comida' }),
        tx({ id: 'new', accountId: 'otro-banco', amount: 57, categoryId: 'otra-comida', splits: [{ categoryId: 'otra-comida', amount: 45 }, { categoryId: 'otra-limpieza', amount: 12 }] })],
      rules: [{ id: 'r', pattern: 'mercadona', categoryId: 'otra-comida', type: 'expense' }],
    });
    const { data, stats } = mergeData(cur, inc);
    assert.equal(stats.transactions, 1);
    assert.equal(stats.existing, 1);
    assert.equal(stats.accounts, 1, 'solo la Hucha es nueva');
    assert.equal(stats.categories, 0);
    const t = data.transactions.find((x) => x.id === 'new');
    assert.equal(t.accountId, 'bank');
    assert.deepEqual(t.splits.map((p) => p.categoryId), ['food', 'home']);
    assert.equal(data.rules[0].categoryId, 'food');
    assert.equal(cur.transactions.length, 1, 'no modifica el original');
  });
  test('convierte los tipos de cambio si la moneda principal es distinta', () => {
    const cur = makeState({ rates: {} });
    const inc = makeState({ settings: { currency: 'USD' }, rates: { EUR: 1.1, GBP: 1.3 } });
    const { data } = mergeData(cur, inc);
    assert.close(data.rates.GBP, 1.3 / 1.1, 0.0001);
    assert.close(data.rates.USD, 1 / 1.1, 0.0001);
  });
});

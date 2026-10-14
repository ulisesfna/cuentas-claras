import { describe, test, assert } from './harness.js';
import { defaultTxDate, periodISO, periodLabel, shiftView } from '../js/core/periods.js';
import { addMonths, daysBetween, fromISO, toISO } from '../js/core/util.js';

const set = (o = {}) => ({ weekStart: 1, monthStart: 1, ...o });

describe('Períodos', () => {
  test('semana que empieza en lunes (miércoles 14 oct 2026)', () => {
    assert.deepEqual(periodISO({ type: 'week', anchor: '2026-10-14' }, set()), { from: '2026-10-12', to: '2026-10-18' });
  });
  test('semana que empieza en domingo y en sábado', () => {
    assert.deepEqual(periodISO({ type: 'week', anchor: '2026-10-14' }, set({ weekStart: 0 })), { from: '2026-10-11', to: '2026-10-17' });
    assert.deepEqual(periodISO({ type: 'week', anchor: '2026-10-14' }, set({ weekStart: 6 })), { from: '2026-10-10', to: '2026-10-16' });
  });
  test('mes natural', () => {
    assert.deepEqual(periodISO({ type: 'month', anchor: '2026-10-14' }, set()), { from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(periodISO({ type: 'month', anchor: '2028-02-10' }, set()), { from: '2028-02-01', to: '2028-02-29' });
  });
  test('mes que empieza el día 25 (antes y después del 25)', () => {
    assert.deepEqual(periodISO({ type: 'month', anchor: '2026-10-14' }, set({ monthStart: 25 })), { from: '2026-09-25', to: '2026-10-24' });
    assert.deepEqual(periodISO({ type: 'month', anchor: '2026-10-25' }, set({ monthStart: 25 })), { from: '2026-10-25', to: '2026-11-24' });
    assert.deepEqual(periodISO({ type: 'month', anchor: '2026-01-10' }, set({ monthStart: 25 })), { from: '2025-12-25', to: '2026-01-24' });
  });
  test('año, intervalo y todo', () => {
    assert.deepEqual(periodISO({ type: 'year', anchor: '2026-10-14' }, set()), { from: '2026-01-01', to: '2026-12-31' });
    assert.deepEqual(periodISO({ type: 'range', anchor: '2026-10-01', from: '2026-10-01', to: '2026-10-15' }, set()), { from: '2026-10-01', to: '2026-10-15' });
    assert.deepEqual(periodISO({ type: 'all', anchor: '2026-10-14' }, set()), { from: null, to: null });
  });
  test('avanzar un mes desde el 31 de enero no se salta febrero', () => {
    const v = shiftView({ type: 'month', anchor: '2026-01-31' }, 1, set());
    assert.deepEqual(periodISO(v, set()), { from: '2026-02-01', to: '2026-02-28' });
    shiftView(v, 1, set());
    assert.deepEqual(periodISO(v, set()), { from: '2026-03-01', to: '2026-03-31' });
  });
  test('retroceder con mes que empieza el 25', () => {
    const v = shiftView({ type: 'month', anchor: '2026-10-14' }, -1, set({ monthStart: 25 }));
    assert.deepEqual(periodISO(v, set({ monthStart: 25 })), { from: '2026-08-25', to: '2026-09-24' });
  });
  test('desplazar un intervalo mantiene su duración', () => {
    const v = shiftView({ type: 'range', anchor: '2026-10-01', from: '2026-10-01', to: '2026-10-15' }, 1, set());
    assert.equal(v.from, '2026-10-16');
    assert.equal(v.to, '2026-10-30');
    assert.equal(daysBetween(v.from, v.to), 15);
  });
  test('cambio de año al avanzar semanas y días', () => {
    const w = shiftView({ type: 'week', anchor: '2026-12-30' }, 1, set());
    assert.deepEqual(periodISO(w, set()), { from: '2027-01-04', to: '2027-01-10' });
    const d = shiftView({ type: 'day', anchor: '2026-12-31' }, 1, set());
    assert.equal(d.anchor, '2027-01-01');
  });
  test('fecha propuesta para un movimiento nuevo', () => {
    assert.equal(defaultTxDate({ type: 'month', anchor: '2026-10-01' }, set(), '2026-10-14'), '2026-10-14');
    assert.equal(defaultTxDate({ type: 'month', anchor: '2026-09-05' }, set(), '2026-10-14'), '2026-09-30');
    assert.equal(defaultTxDate({ type: 'month', anchor: '2026-11-05' }, set(), '2026-10-14'), '2026-11-01');
  });
  test('etiquetas «Hoy» y «Ayer»', () => {
    assert.equal(periodLabel({ type: 'day', anchor: '2026-10-14' }, set(), '2026-10-14'), 'Hoy');
    assert.equal(periodLabel({ type: 'day', anchor: '2026-10-13' }, set(), '2026-10-14'), 'Ayer');
  });
  test('sumar meses ajusta al último día del mes', () => {
    assert.equal(toISO(addMonths(fromISO('2027-01-31'), 1)), '2027-02-28');
    assert.equal(toISO(addMonths(fromISO('2028-01-31'), 1)), '2028-02-29');
    assert.equal(toISO(addMonths(fromISO('2026-03-31'), -1)), '2026-02-28');
  });
});

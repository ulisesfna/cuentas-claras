import { describe, test, assert } from './harness.js';
import { evalExpr, pressKey } from '../js/core/calc.js';

const type = (keys, start = '0') => keys.reduce((e, k) => pressKey(e, k), start);

describe('Calculadora', () => {
  test('respeta la prioridad de × y ÷', () => {
    assert.equal(evalExpr('45,5+4×2'), 53.5);
    assert.equal(evalExpr('10-2×3'), 4);
    assert.equal(evalExpr('100÷4+1'), 26);
  });
  test('redondea a céntimos sin errores de coma flotante', () => {
    assert.equal(evalExpr('0,1+0,2'), 0.3);
    assert.equal(evalExpr('10÷3'), 3.33);
  });
  test('ignora un operador al final y divide entre cero como NaN', () => {
    assert.equal(evalExpr('12+'), 12);
    assert.ok(Number.isNaN(evalExpr('1÷0')));
  });
  test('teclear: ceros iniciales, una sola coma y dos decimales', () => {
    assert.equal(type(['0', '5']), '5');
    assert.equal(type(['5', ',', ',']), '5,');
    assert.equal(type(['5', ',', '1', '2', '3']), '5,12');
    assert.equal(type([','], '0'), '0,');
  });
  test('teclear: operadores', () => {
    assert.equal(type(['+']), '0', 'no se empieza por un operador');
    assert.equal(type(['5', '+', '-']), '5-', 'un operador sustituye al anterior');
    assert.equal(type(['2', '×', '3', '=']), '6');
    assert.equal(type(['5', '-', '9', '=']), '5-9', 'un resultado negativo no se aplica');
  });
  test('borrar y limpiar', () => {
    assert.equal(type(['5', '⌫']), '0');
    assert.equal(type(['1', '2', 'C']), '0');
  });
});

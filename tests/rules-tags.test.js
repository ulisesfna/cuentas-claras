import { describe, test, assert } from './harness.js';
import { matchRule, suggestKeyword } from '../js/core/rules.js';
import { addTag, allTags, cleanTag, deleteTag, hasTag, renameTag } from '../js/core/tags.js';
import { makeState, tx } from './fixtures.js';

describe('Reglas de categorización', () => {
  const rules = [
    { id: '1', pattern: 'cafetería', categoryId: 'fun', type: 'expense' },
    { id: '2', pattern: 'MERCADONA', categoryId: 'food', type: 'expense' },
    { id: '3', pattern: 'mercadona', categoryId: 'salary', type: 'income' },
  ];
  test('sin distinguir mayúsculas ni tildes, y solo del mismo tipo', () => {
    assert.equal(matchRule(rules, 'CAFETERIA LUNA', 'expense').id, '1');
    assert.equal(matchRule(rules, 'Compra en Mercadona', 'expense').id, '2');
    assert.equal(matchRule(rules, 'Devolución MERCADONA', 'income').id, '3');
    assert.equal(matchRule(rules, 'Panadería', 'expense'), null);
  });
  test('gana la primera de la lista', () => {
    const r = [{ id: 'a', pattern: 'amazon prime', categoryId: 'fun', type: 'expense' }, { id: 'b', pattern: 'amazon', categoryId: 'food', type: 'expense' }];
    assert.equal(matchRule(r, 'AMAZON PRIME VIDEO', 'expense').id, 'a');
    assert.equal(matchRule(r, 'AMAZON MARKETPLACE', 'expense').id, 'b');
  });
  test('propone una palabra clave sin números de tarjeta ni palabras del banco', () => {
    assert.equal(suggestKeyword('COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA VALENCIA'), 'MERCADONA');
    assert.equal(suggestKeyword('RECIBO NETFLIX.COM'), 'NETFLIX');
    assert.equal(suggestKeyword('Pago en Café Luna'), 'CAFÉ');
  });
});

describe('Etiquetas', () => {
  test('limpieza: sin «#», espacios como guiones', () => {
    assert.equal(cleanTag('  #Vacaciones Roma '), 'Vacaciones-Roma');
    assert.equal(cleanTag('##a,b'), 'ab');
  });
  test('sin duplicados aunque cambien mayúsculas o tildes', () => {
    assert.deepEqual(addTag(['Cumpleaños'], 'cumpleanos'), ['Cumpleaños']);
    assert.deepEqual(addTag(['a'], 'b'), ['a', 'b']);
    assert.ok(hasTag({ tags: ['Viaje'] }, '#viaje'));
    assert.ok(hasTag({ tags: [] }, null), 'sin filtro, todo pasa');
  });
  test('renombrar une etiquetas y quitar no borra movimientos', () => {
    const S = makeState({ transactions: [tx({ tags: ['roma'] }), tx({ tags: ['viaje', 'roma'] }), tx({ tags: ['viaje'] })] });
    S.recurring.push({ id: 'r', template: { tags: ['roma'] } });
    assert.equal(renameTag(S, 'Roma', 'viaje'), 3);
    assert.deepEqual(S.transactions.map((t) => t.tags), [['viaje'], ['viaje'], ['viaje']]);
    assert.deepEqual(S.recurring[0].template.tags, ['viaje']);
    deleteTag(S, 'VIAJE');
    assert.equal(S.transactions.length, 3);
    assert.deepEqual(allTags(S), []);
  });
});

import { describe, test, assert } from './harness.js';
import {
  buildExportCSV, buildRows, decodeBytes, detectDateFormat, detectDecimal, detectDelimiter, detectHeaderRow,
  guessMapping, parseAmount, parseCSV, parseDate, prepareImport,
} from '../js/core/csv.js';
import { makeState, tx } from './fixtures.js';

describe('CSV: lectura', () => {
  test('comillas, separador dentro de comillas, "" y saltos de línea', () => {
    assert.deepEqual(parseCSV('a;"b;c";"d ""e"""\r\n1;2;3\n', ';'), [['a', 'b;c', 'd "e"'], ['1', '2', '3']]);
    assert.deepEqual(parseCSV('"línea 1\nlínea 2",x', ','), [['línea 1\nlínea 2', 'x']]);
  });
  test('ignora filas vacías y conserva campos vacíos', () => {
    assert.deepEqual(parseCSV('a;;c\n\n;;\n1;2;3', ';'), [['a', '', 'c'], ['1', '2', '3']]);
  });
  test('detecta el separador', () => {
    assert.equal(detectDelimiter('Fecha;Concepto;Importe\n01/10/2026;Pan;-1,20\n02/10/2026;Café;-1,50'), ';');
    assert.equal(detectDelimiter('Date,Description,Amount\n2026-10-01,Bread,-1.20\n2026-10-02,"Coffee, large",-1.50'), ',');
    assert.equal(detectDelimiter('Fecha\tConcepto\tImporte\n01/10/2026\tPan\t-1,20'), '\t');
  });
  test('UTF-8 y Windows-1252 (Excel en Windows)', () => {
    assert.equal(decodeBytes(new TextEncoder().encode('﻿Café')), 'Café');
    assert.equal(decodeBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9])), 'Café');
  });
  test('encuentra la cabecera tras las líneas de presentación del banco', () => {
    const rows = [['Titular', 'ANA'], ['Periodo', '01/10/2026 - 14/10/2026'], ['Fecha', 'Concepto', 'Importe', 'Saldo'], ['14/10/2026', 'MERCADONA', '-45,30', '1.200,00']];
    assert.equal(detectHeaderRow(rows), 2);
    assert.equal(detectHeaderRow([['14/10/2026', 'Pan', '-1,20'], ['15/10/2026', 'Café', '-1,50']]), -1);
  });
});

describe('CSV: importes y fechas', () => {
  test('importes en formato español, inglés y de banco', () => {
    assert.equal(parseAmount('-1.234,56 €'), -1234.56);
    assert.equal(parseAmount('1,234.56'), 1234.56);
    assert.equal(parseAmount('(12,00)'), -12);
    assert.equal(parseAmount('12,50-'), -12.5);
    assert.equal(parseAmount('+3,5'), 3.5);
    assert.equal(parseAmount('1.234'), 1234, 'un grupo de 3 cifras son miles');
    assert.equal(parseAmount('1,234.5', '.'), 1234.5);
    assert.ok(Number.isNaN(parseAmount('abc')));
    assert.ok(Number.isNaN(parseAmount('')));
  });
  test('detecta el separador decimal mirando varias filas', () => {
    assert.equal(detectDecimal(['-45,30', '1.200,00', '3']), ',');
    assert.equal(detectDecimal(['-45.30', '1,200.00']), '.');
  });
  test('fechas en varios formatos', () => {
    assert.equal(parseDate('14/10/2026', 'dmy'), '2026-10-14');
    assert.equal(parseDate('14-10-26', 'dmy'), '2026-10-14');
    assert.equal(parseDate('10/14/2026', 'mdy'), '2026-10-14');
    assert.equal(parseDate('2026-10-14 09:30', 'ymd'), '2026-10-14');
    assert.equal(parseDate('20261014', 'ymd'), '2026-10-14');
    assert.equal(parseDate('31/02/2026', 'dmy'), null);
  });
  test('detecta el formato de fecha (ante la duda, día/mes/año)', () => {
    assert.equal(detectDateFormat(['14/10/2026', '03/10/2026']), 'dmy');
    assert.equal(detectDateFormat(['10/14/2026', '10/03/2026']), 'mdy');
    assert.equal(detectDateFormat(['03/04/2026']), 'dmy');
    assert.equal(detectDateFormat(['2026-10-14']), 'ymd');
  });
});

describe('CSV: columnas y filas', () => {
  test('propone columnas por el nombre de la cabecera', () => {
    const m = guessMapping(['F. Operación', 'F. Valor', 'Concepto', 'Importe', 'Saldo'], [['14/10/2026', '14/10/2026', 'MERCADONA', '-45,30', '1.200,00']]);
    assert.equal(m.dateCol, 0);
    assert.equal(m.descCol, 2);
    assert.equal(m.amountMode, 'single');
    assert.equal(m.amountCol, 3);
    assert.equal(m.decimal, ',');
    assert.equal(m.dateFormat, 'dmy');
  });
  test('cargos y abonos en columnas separadas', () => {
    const m = guessMapping(['Fecha', 'Descripción', 'Cargo', 'Abono'], []);
    assert.equal(m.amountMode, 'split');
    assert.equal(m.debitCol, 2);
    assert.equal(m.creditCol, 3);
    const rows = buildRows([['Fecha', 'Descripción', 'Cargo', 'Abono'], ['14/10/2026', 'Compra', '45,30', ''], ['15/10/2026', 'Nómina', '', '1.800,00']], { ...m, headerRow: 0, decimal: ',' });
    assert.deepEqual(rows.map((r) => r.amount), [-45.3, 1800]);
  });
  test('sin cabecera: propone columnas por el contenido', () => {
    const m = guessMapping([], [['14/10/2026', 'MERCADONA VALENCIA', '-45,30'], ['15/10/2026', 'NOMINA EMPRESA', '1.800,00']]);
    assert.equal(m.dateCol, 0);
    assert.equal(m.amountCol, 2);
    assert.equal(m.descCol, 1);
  });
  test('marca las filas que no se pueden leer e invierte el signo si se pide', () => {
    const map = { headerRow: -1, dateCol: 0, descCol: 1, amountMode: 'single', amountCol: 2, dateFormat: 'dmy', decimal: ',', invert: true };
    const rows = buildRows([['14/10/2026', 'Pan', '1,20'], ['Saldo final', '', '100,00'], ['15/10/2026', 'Cero', '0']], map);
    assert.equal(rows[0].amount, -1.2);
    assert.equal(rows[1].error, 'Fecha no válida');
    assert.equal(rows[2].error, 'Importe cero');
  });
});

describe('CSV: preparar la importación', () => {
  test('duplicados exactos, probables, reglas y filas idénticas dentro del archivo', () => {
    const S = makeState({
      rules: [{ id: 'm', pattern: 'mercadona', categoryId: 'food', type: 'expense' }],
      transactions: [
        tx({ id: 'prev', amount: 10, date: '2026-10-13', importRef: 'bank|2026-10-13|10.00|expense|cafe luna#1' }),
        tx({ id: 'manual', amount: 45.3, date: '2026-10-14' }),
      ],
    });
    const rows = [
      { line: 1, date: '2026-10-13', desc: 'CAFÉ LUNA', amount: -10, error: null },
      { line: 2, date: '2026-10-14', desc: 'MERCADONA VALENCIA', amount: -45.3, error: null },
      { line: 3, date: '2026-10-14', desc: 'PAN', amount: -1, error: null },
      { line: 4, date: '2026-10-14', desc: 'PAN', amount: -1, error: null },
      { line: 5, date: '2026-10-15', desc: 'NOMINA', amount: 1800, error: null },
    ];
    const p = prepareImport(S, rows, 'bank');
    assert.equal(p[0].dup, 'exact');
    assert.equal(p[0].include, false);
    assert.equal(p[1].dup, 'likely');
    assert.equal(p[1].categoryId, 'food', 'la regla pone Supermercado');
    assert.equal(p[2].ref.endsWith('#1') && p[3].ref.endsWith('#2'), true, 'dos panes iguales no se confunden');
    assert.equal(p[2].dup, null);
    assert.equal(p[4].type, 'income');
    assert.equal(p[4].categoryId, null, 'la regla de gastos no se aplica a un ingreso');
  });
});

describe('CSV: exportación', () => {
  test('una fila por parte, con etiquetas, decimales con coma y BOM', () => {
    const S = makeState({ transactions: [tx({ amount: 57, note: 'Súper; grande', tags: ['casa'], splits: [{ categoryId: 'food', amount: 45 }, { categoryId: 'home', amount: 12 }] })] });
    const { csv, count } = buildExportCSV(S, null, null);
    const lines = csv.split('\r\n');
    assert.equal(count, 1);
    assert.equal(lines.length, 3);
    assert.ok(csv.startsWith('﻿'));
    assert.ok(lines[1].includes(';Supermercado;-45,00;') && lines[2].includes(';Limpieza;-12,00;'));
    assert.ok(lines[1].includes('"Súper; grande"') && lines[1].includes('#casa'));
  });
});

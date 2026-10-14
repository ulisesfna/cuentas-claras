// Lectura de extractos bancarios en CSV y exportación de movimientos.
import { norm, pad, round2, validISO } from './util.js';
import { matchRule } from './rules.js';
import { accCur, accName, convert, getCategory, isSplit, txParts } from './ledger.js';

// Los bancos españoles suelen exportar en Windows-1252; si no es UTF-8 válido, se usa ese.
export function decodeBytes(buf) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
  return text.replace(/^﻿/, '');
}

// RFC 4180: comillas dobles, "" dentro de comillas y saltos de línea dentro de un campo.
export function parseCSV(text, delim) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"' && field.trim() === '') { inQ = true; field = ''; }
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}

const modeOf = (nums) => {
  const count = new Map();
  nums.forEach((n) => count.set(n, (count.get(n) || 0) + 1));
  let best = 0, freq = 0;
  for (const [n, f] of count) if (f > freq || (f === freq && n > best)) { best = n; freq = f; }
  return { value: best, freq };
};

// Elige el separador que da más filas con el mismo número (mayor que 1) de columnas.
export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 40).join('\n');
  let best = ';', score = -1;
  for (const d of [';', ',', '\t', '|']) {
    const m = modeOf(parseCSV(sample, d).map((r) => r.length));
    const s = m.value > 1 ? m.freq * 100 + m.value : 0;
    if (s > score) { score = s; best = d; }
  }
  return best;
}

// Fila de cabecera: la primera con el número habitual de columnas y casi todo texto
// (los bancos suelen poner antes unas líneas con el titular, la cuenta o el periodo). -1 si no hay.
export function detectHeaderRow(rows) {
  const m = modeOf(rows.filter((r) => r.length > 1).map((r) => r.length)).value;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i];
    if (r.length < m) continue;
    const texty = r.filter((c) => c && !looksNumeric(c) && !looksDate(c)).length;
    if (texty >= Math.ceil(r.filter(Boolean).length * 0.75) && texty >= 2) return i;
    if (r.length === m) return -1; // la primera fila "completa" ya son datos
  }
  return -1;
}
const looksNumeric = (s) => /^[-+(]?[\d.,\s]+[)\-]?\s*(€|eur)?$/i.test(String(s).trim()) && /\d/.test(s);
const looksDate = (s) => /^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}/.test(String(s).trim());

// Separador decimal de un número escrito: la última «,» o «.» seguida de 1-2 cifras es el decimal;
// un grupo de exactamente 3 cifras tras un único separador se toma como miles («1.234» = mil doscientos).
function guessDecimal(s) {
  const lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
  if (lastC >= 0 && lastD >= 0) return lastC > lastD ? ',' : '.';
  const sep = lastC >= 0 ? ',' : lastD >= 0 ? '.' : null;
  if (!sep) return ',';
  const after = s.length - s.lastIndexOf(sep) - 1;
  if (after === 3 && s.split(sep).length === 2) return sep === ',' ? '.' : ',';
  return sep;
}
export function detectDecimal(samples) {
  let comma = 0, dot = 0;
  for (const s of samples) {
    const m = String(s).match(/([.,])(\d{1,2})\s*\)?-?\s*(€|eur)?$/i);
    if (m) { if (m[1] === ',') comma++; else dot++; }
  }
  return dot > comma ? '.' : ',';
}
// «-1.234,56 €», «1,234.56», «(12,00)», «12,50-» → número con signo. NaN si no se entiende.
export function parseAmount(str, decimal) {
  let s = String(str == null ? '' : str).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[€$£\s ]|eur|usd|gbp/gi, '');
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  const dec = decimal || guessDecimal(s);
  s = dec === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const n = parseFloat(s);
  return neg ? -n : n;
}

// Formatos: 'dmy' (14/10/2026), 'mdy' (10/14/2026) o 'ymd' (2026-10-14, también 20261014).
export function parseDate(str, fmt) {
  const s = String(str == null ? '' : str).trim();
  let a, b, c;
  const m = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
  if (m) [a, b, c] = [m[1], m[2], m[3]].map(Number);
  else {
    const k = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!k || fmt !== 'ymd') return null;
    [a, b, c] = [k[1], k[2], k[3]].map(Number);
  }
  let y, mo, d;
  if (fmt === 'ymd') [y, mo, d] = [a, b, c];
  else if (fmt === 'mdy') [mo, d, y] = [a, b, c];
  else [d, mo, y] = [a, b, c];
  if (y < 100) y += 2000;
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  return validISO(iso) ? iso : null;
}
// Ante la duda (12/10 puede ser 12 de octubre o 10 de diciembre) se prefiere día/mes/año.
export function detectDateFormat(samples) {
  const vals = samples.filter(Boolean);
  if (vals.length && vals.every((s) => /^\d{4}/.test(String(s).trim()))) return 'ymd';
  const ok = (f) => vals.filter((s) => parseDate(s, f)).length;
  const dmy = ok('dmy'), mdy = ok('mdy');
  return mdy > dmy ? 'mdy' : 'dmy';
}

// Propone qué columna es cada cosa, por el nombre de la cabecera o, si no lo hay, por el contenido.
export function guessMapping(header, rows) {
  const names = header.map((h) => norm(h));
  const find = (...pats) => { for (const p of pats) { const i = names.findIndex((h) => h.includes(p)); if (i >= 0) return i; } return -1; };
  const cols = Math.max(header.length, ...rows.slice(0, 50).map((r) => r.length));
  const sample = (i) => rows.slice(0, 50).map((r) => r[i] || '').filter(Boolean);
  const balance = find('saldo', 'balance');
  let date = find('fecha oper', 'f. oper', 'f.oper', 'fecha mov', 'fecha', 'date', 'f. valor', 'valor');
  let desc = find('concepto', 'descripcion', 'description', 'detalle', 'movimiento', 'beneficiario', 'comercio', 'concept', 'payee', 'memo', 'texto');
  let amount = find('importe', 'amount', 'cantidad', 'monto');
  const debit = find('cargo', 'debe', 'debito', 'debit', 'salida', 'withdrawal');
  const credit = find('abono', 'haber', 'credito', 'credit', 'entrada', 'deposit');
  if (date < 0) {
    for (let i = 0; i < cols; i++) {
      const s = sample(i);
      if (s.length && s.filter(looksDate).length >= s.length * 0.8) { date = i; break; }
    }
  }
  const mode = amount < 0 && (debit >= 0 || credit >= 0) ? 'split' : 'single';
  if (mode === 'single' && amount < 0) {
    let best = -1, bestN = 0;
    for (let i = 0; i < cols; i++) {
      if (i === date || i === balance) continue;
      const n = sample(i).filter((x) => looksNumeric(x)).length;
      if (n > bestN) { bestN = n; best = i; }
    }
    amount = best;
  }
  if (desc < 0) {
    let best = -1, len = 0;
    for (let i = 0; i < cols; i++) {
      if ([date, amount, debit, credit, balance].includes(i)) continue;
      const s = sample(i);
      const avg = s.length ? s.reduce((t, x) => t + (looksNumeric(x) ? 0 : x.length), 0) / s.length : 0;
      if (avg > len) { len = avg; best = i; }
    }
    desc = best;
  }
  const amountSamples = mode === 'single' ? sample(amount) : [...sample(debit), ...sample(credit)];
  return {
    dateCol: date, descCol: desc, amountMode: mode, amountCol: amount, debitCol: debit, creditCol: credit,
    dateFormat: detectDateFormat(sample(date)), decimal: detectDecimal(amountSamples), invert: false,
  };
}

// Convierte las filas de datos en { line, date, desc, amount (con signo: negativo = gasto), error }.
export function buildRows(rows, map) {
  const out = [];
  const start = map.headerRow >= 0 ? map.headerRow + 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[map.dateCol], map.dateFormat);
    let amount;
    if (map.amountMode === 'split') {
      const num = (v) => { if (!v) return 0; const n = parseAmount(v, map.decimal); return isFinite(n) ? Math.abs(n) : NaN; };
      amount = num(r[map.creditCol]) - num(r[map.debitCol]);
    } else amount = parseAmount(r[map.amountCol], map.decimal);
    if (map.invert) amount = -amount;
    const desc = String(r[map.descCol] || '').replace(/\s+/g, ' ').trim();
    let error = null;
    if (!date) error = 'Fecha no válida';
    else if (!isFinite(amount)) error = 'Importe no válido';
    else if (Math.abs(amount) < 0.005) error = 'Importe cero';
    out.push({ line: i + 1, date, desc, amount: isFinite(amount) ? round2(amount) : NaN, error });
  }
  return out;
}

export const headerSignature = (header) => norm(header.join('|')).slice(0, 500);
const squash = (s) => norm(s).replace(/\s+/g, ' ').trim();

// Prepara la importación: tipo, categoría por reglas y detección de duplicados.
// - «exact»: la misma fila ya se importó antes (misma huella).
// - «likely»: ya hay un movimiento en esa cuenta con la misma fecha, tipo e importe (p. ej. apuntado a mano).
export function prepareImport(S, rows, accountId) {
  const seenRefs = new Set(S.transactions.filter((t) => t.importRef).map((t) => t.importRef));
  const pool = new Map();
  for (const t of S.transactions) {
    if (t.accountId !== accountId || t.type === 'transfer') continue;
    const k = `${t.date}|${t.type}|${round2(t.amount).toFixed(2)}`;
    pool.set(k, (pool.get(k) || 0) + 1);
  }
  const occurrences = new Map();
  return rows.map((row) => {
    if (row.error) return { ...row, include: false };
    const type = row.amount < 0 ? 'expense' : 'income';
    const abs = Math.abs(row.amount);
    const base = `${accountId}|${row.date}|${abs.toFixed(2)}|${type}|${squash(row.desc)}`;
    const k = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, k);
    const ref = `${base}#${k}`;
    let dup = null;
    if (seenRefs.has(ref)) dup = 'exact';
    else {
      const pk = `${row.date}|${type}|${abs.toFixed(2)}`;
      if (pool.get(pk) > 0) { dup = 'likely'; pool.set(pk, pool.get(pk) - 1); }
    }
    const rule = matchRule(S.rules, row.desc, type);
    return { ...row, type, abs, ref, dup, ruleId: rule ? rule.id : null, categoryId: rule ? rule.categoryId : null, manual: false, include: !dup };
  });
}

// CSV para hojas de cálculo: separador «;», decimales con coma y BOM para Excel.
// Los movimientos divididos ocupan una fila por parte.
export function buildExportCSV(S, from, to) {
  const base = S.settings.currency;
  const num = (n) => (n == null ? '' : round2(n).toFixed(2).replace('.', ','));
  const q = (v) => { const s = String(v == null ? '' : v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['Fecha', 'Tipo', 'Cuenta', 'Cuenta destino', 'Categoría', 'Importe', 'Moneda', `Importe en ${base}`, 'Nota', 'Etiquetas', 'Dividido']];
  const txs = S.transactions.filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  const label = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia' };
  for (const t of txs) {
    const cur = accCur(S, t.accountId);
    const tags = (t.tags || []).map((g) => '#' + g).join(' ');
    const parts = t.type === 'transfer' ? [{ categoryId: null, amount: t.amount }] : txParts(t);
    for (const p of parts) {
      const signed = t.type === 'expense' ? -p.amount : p.amount;
      rows.push([t.date, label[t.type], accName(S, t.accountId), t.type === 'transfer' ? accName(S, t.toAccountId) : '',
        p.categoryId ? getCategory(S, p.categoryId).name : '', num(signed), cur, num(convert(S, signed, cur, base)), t.note || '', tags,
        isSplit(t) ? `Sí (total ${num(t.amount)})` : '']);
    }
  }
  return { csv: '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n'), count: txs.length };
}

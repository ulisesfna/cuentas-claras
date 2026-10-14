// Validación de copias: comprueba la forma de cada elemento antes de usarlo.
import { ACCOUNT_KINDS, COLORS, DEFAULT_SETTINGS, DEFAULT_VIEW, FREQ, SCHEMA_VERSION } from './constants.js';
import { dayOrNull, isNum, isStr, round2, todayISO, validISO } from './util.js';
import { migrate } from './model.js';
import { uniqueTags } from './tags.js';

const CUR_RE = /^[A-Z]{3}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

// Devuelve { data } con una copia limpia y migrada, o { errors, more } con los primeros problemas.
export function validateImport(raw, today = todayISO()) {
  const errors = [];
  let total = 0;
  const fail = (msg) => { total++; if (errors.length < 6) errors.push(msg); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['El archivo no contiene datos de Cuentas Claras.'] };
  const ver = raw.version == null ? 1 : raw.version;
  if (!Number.isInteger(ver) || ver < 1) return { errors: ['El número de versión de la copia no es válido.'] };
  if (ver > SCHEMA_VERSION) return { errors: [`La copia viene de una versión más nueva de la app (formato ${ver}). Actualiza la app y vuelve a intentarlo.`] };
  const lists = { accounts: 'cuentas', categories: 'categorías', transactions: 'movimientos' };
  for (const [k, l] of Object.entries(lists)) if (!Array.isArray(raw[k])) return { errors: [`Falta la lista de ${l}.`] };
  let o;
  try { o = migrate(JSON.parse(JSON.stringify(raw)), today); } catch (e) { return { errors: ['No se pudo convertir la copia al formato actual.'] }; }

  const accIds = new Set();
  const accounts = [];
  o.accounts.forEach((a, i) => {
    const w = `Cuenta ${i + 1}`;
    if (!a || typeof a !== 'object') return fail(`${w}: no tiene un formato válido.`);
    if (!isStr(a.id, 64) || accIds.has(a.id)) return fail(`${w}: identificador vacío o repetido.`);
    if (!isStr(a.name, 80)) return fail(`${w}: falta el nombre.`);
    if (!CUR_RE.test(a.currency)) return fail(`${w} («${a.name}»): moneda no válida.`);
    if (a.initial != null && !isNum(a.initial)) return fail(`${w} («${a.name}»): saldo inicial no numérico.`);
    accIds.add(a.id);
    accounts.push({
      id: a.id, name: a.name.trim(), icon: isStr(a.icon, 16) ? a.icon : '🏦', kind: ACCOUNT_KINDS[a.kind] ? a.kind : 'bank',
      currency: a.currency, initial: round2(a.initial || 0), includeInTotal: a.includeInTotal !== false,
      limit: isNum(a.limit) && a.limit > 0 ? a.limit : 0, closingDay: dayOrNull(a.closingDay), paymentDay: dayOrNull(a.paymentDay),
    });
  });
  if (!accounts.length && !total) fail('La copia no tiene ninguna cuenta.');

  const cats = new Map();
  const categories = [];
  o.categories.forEach((c, i) => {
    const w = `Categoría ${i + 1}`;
    if (!c || typeof c !== 'object') return fail(`${w}: no tiene un formato válido.`);
    if (!isStr(c.id, 64) || cats.has(c.id)) return fail(`${w}: identificador vacío o repetido.`);
    if (!isStr(c.name, 60)) return fail(`${w}: falta el nombre.`);
    if (c.type !== 'expense' && c.type !== 'income') return fail(`${w} («${c.name}»): tipo desconocido.`);
    const cc = {
      id: c.id, name: c.name.trim(), type: c.type, icon: isStr(c.icon, 16) ? c.icon : '🏷️',
      color: COLOR_RE.test(c.color) ? c.color : COLORS[i % COLORS.length], archived: c.archived === true,
      order: isNum(c.order) ? c.order : i, budget: isNum(c.budget) && c.budget > 0 ? c.budget : 0,
    };
    cats.set(cc.id, cc);
    categories.push(cc);
  });

  const typeName = (t) => (t === 'expense' ? 'gastos' : 'ingresos');
  // Comprueba un movimiento o una plantilla (sin fecha ni id). Devuelve el error o null.
  const checkMove = (t, w) => {
    if (!['expense', 'income', 'transfer'].includes(t.type)) return `${w}: tipo desconocido.`;
    if (!isNum(t.amount) || t.amount <= 0) return `${w}: importe no válido.`;
    if (!accIds.has(t.accountId)) return `${w}: la cuenta no existe en la copia.`;
    if (t.tags != null && (!Array.isArray(t.tags) || t.tags.length > 50 || t.tags.some((g) => typeof g !== 'string' || g.length > 60))) return `${w}: etiquetas no válidas.`;
    if (t.type === 'transfer') {
      if (!accIds.has(t.toAccountId) || t.toAccountId === t.accountId) return `${w}: la cuenta de destino no es válida.`;
      if (t.toAmount != null && (!isNum(t.toAmount) || t.toAmount < 0)) return `${w}: importe de destino no válido.`;
      return null;
    }
    const c = cats.get(t.categoryId);
    if (!c) return `${w}: la categoría no existe en la copia.`;
    if (c.type !== t.type) return `${w}: la categoría «${c.name}» no es de ${typeName(t.type)}.`;
    if (t.splits != null) {
      if (!Array.isArray(t.splits) || t.splits.length < 2 || t.splits.length > 20) return `${w}: la división debe tener entre 2 y 20 partes.`;
      for (const p of t.splits) {
        if (!p || !isNum(p.amount) || p.amount <= 0) return `${w}: una parte de la división tiene un importe no válido.`;
        const pc = cats.get(p.categoryId);
        if (!pc || pc.type !== t.type) return `${w}: una parte de la división usa una categoría que no existe o no es de ${typeName(t.type)}.`;
      }
      const sum = round2(t.splits.reduce((s, p) => s + p.amount, 0));
      if (Math.abs(sum - round2(t.amount)) > 0.005) return `${w}: las partes suman ${sum} y el importe es ${t.amount}.`;
    }
    return null;
  };
  const cleanMove = (t) => {
    const m = {
      type: t.type, amount: round2(t.amount), accountId: t.accountId,
      categoryId: t.type === 'transfer' ? null : t.categoryId,
      toAccountId: t.type === 'transfer' ? t.toAccountId : null,
      toAmount: t.type === 'transfer' ? round2(isNum(t.toAmount) ? t.toAmount : t.amount) : null,
      note: typeof t.note === 'string' ? t.note.slice(0, 500) : '',
      tags: uniqueTags(t.tags),
    };
    if (t.type !== 'transfer' && Array.isArray(t.splits)) m.splits = t.splits.map((p) => ({ categoryId: p.categoryId, amount: round2(p.amount) }));
    return m;
  };

  const ruleIds = new Set();
  const recurring = [];
  o.recurring.forEach((r, i) => {
    const w = `Regla recurrente ${i + 1}`;
    if (!r || typeof r !== 'object' || !r.template || typeof r.template !== 'object') return fail(`${w}: no tiene un formato válido.`);
    if (!isStr(r.id, 64) || ruleIds.has(r.id)) return fail(`${w}: identificador vacío o repetido.`);
    if (!FREQ[r.freq]) return fail(`${w}: frecuencia desconocida.`);
    if (!validISO(r.startDate)) return fail(`${w}: fecha de inicio no válida.`);
    if (!Number.isInteger(r.n) || r.n < 0) return fail(`${w}: contador no válido.`);
    const err = checkMove(r.template, w);
    if (err) return fail(err);
    ruleIds.add(r.id);
    recurring.push({ id: r.id, freq: r.freq, startDate: r.startDate, n: r.n, active: r.active !== false, skips: (r.skips || []).filter(validISO), template: cleanMove(r.template) });
  });

  const txIds = new Set();
  const transactions = [];
  o.transactions.forEach((t, i) => {
    const w = `Movimiento ${i + 1}`;
    if (!t || typeof t !== 'object') return fail(`${w}: no tiene un formato válido.`);
    if (!isStr(t.id, 64) || txIds.has(t.id)) return fail(`${w}: identificador vacío o repetido.`);
    if (!validISO(t.date)) return fail(`${w}: fecha no válida.`);
    const err = checkMove(t, `${w} (${t.date})`);
    if (err) return fail(err);
    txIds.add(t.id);
    const clean = { id: t.id, ...cleanMove(t), date: t.date, createdAt: isNum(t.createdAt) ? t.createdAt : 0 };
    if (typeof t.recurringId === 'string' && ruleIds.has(t.recurringId)) clean.recurringId = t.recurringId;
    if (isStr(t.importRef, 300)) clean.importRef = t.importRef;
    if (isStr(t.importBatch, 64)) clean.importBatch = t.importBatch;
    transactions.push(clean);
  });

  const rules = [];
  (o.rules || []).forEach((r, i) => {
    const w = `Regla de categorización ${i + 1}`;
    if (!r || typeof r !== 'object' || !isStr(r.id, 64)) return fail(`${w}: no tiene un formato válido.`);
    if (!isStr(r.pattern, 80)) return fail(`${w}: falta el texto a buscar.`);
    const c = cats.get(r.categoryId);
    if (!c) return fail(`${w} («${r.pattern}»): la categoría no existe en la copia.`);
    rules.push({ id: r.id, pattern: r.pattern.trim(), categoryId: r.categoryId, type: c.type });
  });

  if (total) return { errors, more: total - errors.length };

  const rates = {};
  for (const [c, v] of Object.entries(o.rates)) if (CUR_RE.test(c) && isNum(v) && v > 0) rates[c] = v;
  const s = o.settings;
  const profiles = {};
  if (s.csvProfiles && typeof s.csvProfiles === 'object') {
    for (const [k, p] of Object.entries(s.csvProfiles)) if (p && typeof p === 'object' && k.length <= 2000) profiles[k] = p;
  }
  const settings = {
    ...DEFAULT_SETTINGS,
    currency: CUR_RE.test(s.currency) ? s.currency : 'EUR',
    theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto',
    weekStart: [0, 1, 6].includes(s.weekStart) ? s.weekStart : 1,
    monthStart: Number.isInteger(s.monthStart) && s.monthStart >= 1 && s.monthStart <= 28 ? s.monthStart : 1,
    carryOver: s.carryOver === true,
    budgetEnabled: s.budgetEnabled === true,
    budget: isNum(s.budget) && s.budget > 0 ? s.budget : 0,
    pinHash: typeof s.pinHash === 'string' ? s.pinHash : null,
    lockType: s.lockType === 'password' ? 'password' : 'pin',
    autoLock: s.autoLock !== false,
    listMode: s.listMode === 'date' ? 'date' : 'category',
    lastAccount: accIds.has(s.lastAccount) ? s.lastAccount : null,
    csvProfiles: profiles,
  };
  return {
    data: {
      version: SCHEMA_VERSION, settings, rates, accounts, categories, transactions, recurring, rules,
      view: { ...DEFAULT_VIEW, anchor: today },
    },
  };
}

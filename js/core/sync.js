// Fusión de datos entre dispositivos (lógica pura, sin red ni cifrado).
//
// Se usa una fusión "a tres bandas": para cada elemento se compara la versión de este dispositivo
// (local), la del servidor (remota) y la última que ambos compartieron (base, lo último sincronizado).
// Así se sabe quién cambió qué, y también se propagan los borrados, sin necesitar marcas de tiempo:
//   · si solo cambió un lado, gana ese cambio;
//   · si los dos cambiaron, se mezclan campo a campo (las etiquetas y las omisiones se unen);
//     si tocaron el mismo campo, gana este dispositivo (el último en sincronizar);
//   · borrado en un lado y modificado en el otro → se conserva el modificado (no perder datos).
// Sin base (primera vez o base perdida) solo se suman cosas: nunca se borra nada.
import { DEFAULT_SETTINGS } from './constants.js';

// Ajustes que viajan entre dispositivos. El resto (tema, código de bloqueo, vista…) es de cada dispositivo.
export const SYNCED_SETTINGS = ['currency', 'weekStart', 'monthStart', 'carryOver', 'budgetEnabled', 'budget', 'csvProfiles'];
const LISTS = ['accounts', 'categories', 'transactions', 'recurring', 'rules'];

// Parte compartida de un estado ya validado (validateImport().data).
export function toPayload(data) {
  const settings = {};
  for (const k of SYNCED_SETTINGS) settings[k] = data.settings[k];
  return {
    accounts: data.accounts, categories: data.categories, transactions: data.transactions,
    recurring: data.recurring, rules: data.rules || [], rates: data.rates, settings,
  };
}
// Estado completo a partir de una carga, para poder validarla con validateImport.
export function payloadState(p, version) {
  return {
    version, accounts: p.accounts, categories: p.categories, transactions: p.transactions,
    recurring: p.recurring || [], rules: p.rules || [], rates: p.rates || {}, settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}) },
  };
}

// JSON que no depende del orden de las claves.
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
}
export const canon = (v) => JSON.stringify(stable(v));
const eq = (a, b) => (a === undefined || b === undefined ? a === b : canon(a) === canon(b));
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const byId = (list) => [...(list || [])].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

// ¿Mismo contenido? (el orden de las listas no cuenta: cada dispositivo puede guardarlas en otro orden)
export function samePayload(a, b) {
  if (!a || !b) return a === b;
  const norm = (p) => ({ ...Object.fromEntries(LISTS.map((k) => [k, byId(p[k])])), rates: p.rates || {}, settings: p.settings || {} });
  return canon(norm(a)) === canon(norm(b));
}

// Conjunto a tres bandas: lo que quedó en ambos + lo añadido en cada lado (lo quitado en uno, se quita).
function mergeSet(b, l, r) {
  const base = new Set((b || []).map(canon));
  const lc = new Set(l.map(canon)), rc = new Set(r.map(canon));
  const out = [];
  const seen = new Set();
  for (const x of [...l, ...r]) {
    const k = canon(x);
    if (seen.has(k)) continue;
    const keep = base.has(k) ? lc.has(k) && rc.has(k) : true;
    if (keep) { seen.add(k); out.push(x); }
  }
  return out;
}

export function mergeValue(b, l, r, key) {
  if (eq(l, r)) return l;
  if (eq(l, b)) return r; // solo cambió (o se borró) en el servidor
  if (eq(r, b)) return l; // solo cambió (o se borró) aquí
  // Cambiaron los dos lados.
  if (l === undefined) return r; // borrado frente a modificado: se conserva el modificado
  if (r === undefined) return l;
  if (key === 'n' && typeof l === 'number' && typeof r === 'number') return Math.max(l, r); // repeticiones ya generadas
  if ((key === 'tags' || key === 'skips') && Array.isArray(l) && Array.isArray(r)) return mergeSet(b, l, r);
  if (isRecord(l) && isRecord(r) && isRecord(b)) return mergeRecord(b, l, r);
  return l; // el mismo dato cambiado en los dos: gana este dispositivo
}
export function mergeRecord(b, l, r) {
  const out = {};
  for (const k of new Set([...Object.keys(l || {}), ...Object.keys(r || {})])) {
    const v = mergeValue(b ? b[k] : undefined, l ? l[k] : undefined, r ? r[k] : undefined, k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}
export function mergeById(B, L, R) {
  const map = (list) => new Map((list || []).map((x) => [x.id, x]));
  const bm = map(B), lm = map(L), rm = map(R);
  const ids = [...new Set([...(L || []).map((x) => x.id), ...(R || []).map((x) => x.id)])];
  return ids.map((id) => mergeValue(bm.get(id), lm.get(id), rm.get(id))).filter((x) => x !== undefined);
}

// Fusiona las tres versiones. `base` puede ser null.
export function merge3(base, local, remote) {
  const out = {};
  for (const k of LISTS) out[k] = mergeById(base ? base[k] : null, local[k], remote[k]);
  out.rates = mergeRecord(base ? base.rates : null, local.rates || {}, remote.rates || {});
  out.settings = mergeRecord(base ? base.settings : null, local.settings || {}, remote.settings || {});
  return repairRefs(out, [local, remote, base]);
}

// Si un lado borró una cuenta o categoría mientras el otro la usaba en un movimiento nuevo,
// se recupera para no dejar el movimiento sin cuenta o sin categoría.
export function repairRefs(p, sources) {
  const find = (list, id) => { for (const s of sources) { const x = s && (s[list] || []).find((e) => e.id === id); if (x) return x; } return null; };
  const ensure = (list, id) => {
    if (!id || p[list].some((e) => e.id === id)) return;
    const x = find(list, id);
    if (x) p[list].push({ ...x, archived: false });
  };
  const moves = [...p.transactions, ...p.recurring.map((r) => r.template)];
  for (const t of moves) {
    ensure('accounts', t.accountId);
    if (t.toAccountId) ensure('accounts', t.toAccountId);
    if (t.categoryId) ensure('categories', t.categoryId);
    (t.splits || []).forEach((s) => ensure('categories', s.categoryId));
  }
  p.rules = p.rules.filter((r) => p.categories.some((c) => c.id === r.categoryId));
  return p;
}

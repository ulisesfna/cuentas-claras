// Estado inicial, versiones del modelo de datos y migraciones.
import { DEFAULT_SETTINGS, DEFAULT_VIEW, EXPENSE_DEFAULTS, INCOME_DEFAULTS, SCHEMA_VERSION } from './constants.js';
import { todayISO, uid } from './util.js';

export function defaultState(today = todayISO()) {
  const categories = [];
  EXPENSE_DEFAULTS.forEach(([name, ic, color], i) => categories.push({ id: uid(), name, icon: ic, color, type: 'expense', archived: false, order: i, budget: 0 }));
  INCOME_DEFAULTS.forEach(([name, ic, color], i) => categories.push({ id: uid(), name, icon: ic, color, type: 'income', archived: false, order: i, budget: 0 }));
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, csvProfiles: {} },
    view: { ...DEFAULT_VIEW, anchor: today },
    accounts: [
      { id: uid(), name: 'Efectivo', icon: '💵', kind: 'cash', currency: 'EUR', initial: 0, includeInTotal: true },
      { id: uid(), name: 'Tarjeta', icon: '💳', kind: 'bank', currency: 'EUR', initial: 0, includeInTotal: true },
    ],
    categories,
    transactions: [],
    recurring: [],
    rules: [],
    rates: {},
  };
}

// Cada entrada lleva los datos de la versión N-1 a la N. Para cambiar el modelo, añade aquí
// la función N, sube SCHEMA_VERSION y añade una prueba en tests/model.test.js.
const objs = (list) => list.filter((x) => x && typeof x === 'object');
export const MIGRATIONS = {
  // v2: tipos de cuenta, presupuesto por categoría y omisiones puntuales en recurrentes.
  2(o) {
    objs(o.accounts).forEach((a) => { if (!a.kind) a.kind = a.icon === '💵' ? 'cash' : 'bank'; });
    objs(o.categories).forEach((c) => { if (typeof c.budget !== 'number') c.budget = 0; });
    objs(o.recurring).forEach((r) => { if (!Array.isArray(r.skips)) r.skips = []; });
  },
  // v3: etiquetas, gastos divididos (opcional, sin cambios), reglas de categorización y perfiles de CSV.
  3(o) {
    objs(o.transactions).forEach((t) => { if (!Array.isArray(t.tags)) t.tags = []; });
    objs(o.recurring).forEach((r) => { if (r.template && typeof r.template === 'object' && !Array.isArray(r.template.tags)) r.template.tags = []; });
    if (!Array.isArray(o.rules)) o.rules = [];
    if (!o.settings.csvProfiles || typeof o.settings.csvProfiles !== 'object') o.settings.csvProfiles = {};
    o.view.tag = null;
  },
};

export class NewerVersionError extends Error {}

export function migrate(o, today = todayISO()) {
  if (!o || typeof o !== 'object') throw new Error('sin datos');
  let v = Number.isInteger(o.version) && o.version > 0 ? o.version : 1;
  if (v > SCHEMA_VERSION) throw new NewerVersionError(String(v));
  o.settings = Object.assign({}, DEFAULT_SETTINGS, o.settings || {});
  o.view = Object.assign({ ...DEFAULT_VIEW, anchor: today }, o.view || {});
  ['accounts', 'categories', 'transactions', 'recurring'].forEach((k) => { if (!Array.isArray(o[k])) o[k] = []; });
  if (!o.rates || typeof o.rates !== 'object') o.rates = {};
  for (; v < SCHEMA_VERSION; v++) MIGRATIONS[v + 1](o);
  if (!Array.isArray(o.rules)) o.rules = [];
  o.version = SCHEMA_VERSION;
  return o;
}

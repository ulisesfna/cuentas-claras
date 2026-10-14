// Estado de prueba con identificadores fijos para escribir pruebas legibles.
import { DEFAULT_SETTINGS, DEFAULT_VIEW, SCHEMA_VERSION } from '../js/core/constants.js';

export function makeState(over = {}) {
  const cat = (id, name, type, budget = 0) => ({ id, name, icon: '•', color: '#888888', type, archived: false, order: 0, budget });
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, csvProfiles: {}, ...(over.settings || {}) },
    view: { ...DEFAULT_VIEW, anchor: '2026-10-14', ...(over.view || {}) },
    accounts: over.accounts || [
      { id: 'cash', name: 'Efectivo', icon: '💵', kind: 'cash', currency: 'EUR', initial: 100, includeInTotal: true },
      { id: 'bank', name: 'Banco', icon: '🏦', kind: 'bank', currency: 'EUR', initial: 1000, includeInTotal: true },
      { id: 'usd', name: 'Dólares', icon: '💲', kind: 'bank', currency: 'USD', initial: 0, includeInTotal: true },
    ],
    categories: over.categories || [
      cat('food', 'Supermercado', 'expense'), cat('fun', 'Ocio', 'expense'), cat('home', 'Limpieza', 'expense'),
      cat('salary', 'Salario', 'income'),
    ],
    transactions: over.transactions || [],
    recurring: over.recurring || [],
    rules: over.rules || [],
    rates: over.rates || { USD: 0.9 },
  };
}

let n = 0;
export const tx = (o) => ({
  id: 't' + (n++), type: 'expense', amount: 10, accountId: 'bank', categoryId: 'food', toAccountId: null, toAmount: null,
  date: '2026-10-10', note: '', tags: [], createdAt: n, ...o,
});

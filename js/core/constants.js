// Constantes y datos por defecto.

export const APP_VERSION = '1.2.0';
export const SCHEMA_VERSION = 3;
export const LOCALE = 'es-ES';
export const KDF_ITERATIONS = 600000; // PBKDF2-SHA-256, recomendación OWASP
export const BUDGET_WARN = 0.8; // aviso de presupuesto al 80 %
export const BACKUP_WARN_DAYS = 30;

export const EXPENSE_DEFAULTS = [
  ['Facturas', '🧾', '#4f7cff'], ['Coche', '🚗', '#e5484d'], ['Ropa', '👕', '#9b5de5'],
  ['Comunicaciones', '📱', '#2bb3d9'], ['Comer fuera', '🍽️', '#f08c2e'], ['Ocio', '🎬', '#e94f9c'],
  ['Supermercado', '🛒', '#2e9e6a'], ['Regalos', '🎁', '#d0453b'], ['Salud', '💊', '#12a594'],
  ['Casa', '🏠', '#8d6e63'], ['Mascotas', '🐾', '#c08a2e'], ['Deporte', '⚽', '#3d7fd1'],
  ['Taxi', '🚕', '#d9a400'], ['Higiene', '🧴', '#7b93b8'], ['Transporte', '🚌', '#3f8f5f'],
];
export const INCOME_DEFAULTS = [['Salario', '💼', '#16875a'], ['Depósitos', '🏦', '#2b8fd9'], ['Ahorros', '🐷', '#e94f9c']];
export const COLORS = ['#e5484d', '#f08c2e', '#d9a400', '#8bb31d', '#2e9e6a', '#12a594', '#2bb3d9', '#4f7cff', '#3d7fd1',
  '#6e56cf', '#9b5de5', '#e94f9c', '#d0453b', '#8d6e63', '#c08a2e', '#7b93b8', '#3f8f5f', '#5b6b7a'];
export const CATEGORY_EMOJIS = ('🛒 🍽️ ☕ 🍺 🍕 🧾 💡 💧 🔥 📱 🌐 📺 🏠 🛋️ 🔧 🧹 🚗 ⛽ 🅿️ 🚕 🚌 🚆 ✈️ 🏨 🧳 👕 👟 👜 💄 🧴 ' +
  '💊 🏥 🦷 🏋️ ⚽ 🎬 🎮 🎵 📚 🎓 ✏️ 🎁 🎉 💐 🐾 👶 🧸 💼 💻 🏦 🐷 💰 💵 💳 📈 🪙 🏆 🤝 💸 ⭐ ❤️ 🍷 🎨 📷 🛠️ 🌱 📦 🏛️ 🚬 🧒').split(' ');
export const ACCOUNT_EMOJIS = '💵 💳 🏦 💰 🐷 👛 💼 🪙 📈 🏠 🚗 ✈️ 🎓 🧾 💶 💷 💴 🌍'.split(' ');
export const CURRENCIES = ('EUR USD GBP CHF MXN ARS COP CLP PEN UYU BOB PYG BRL VES DOP GTQ CRC HNL NIO PAB CUP CAD AUD NZD ' +
  'JPY CNY KRW INR RUB TRY PLN SEK NOK DKK CZK HUF RON BGN MAD ZAR AED ILS').split(' ');
export const FREQ = { daily: 'Cada día', weekly: 'Cada semana', monthly: 'Cada mes', yearly: 'Cada año' };

// Categorías virtuales para transferencias cuando se ve una sola cuenta.
export const PSEUDO = {
  __transfer_out: { id: '__transfer_out', name: 'Transferencias enviadas', icon: '↗', color: '#7b8794', type: 'expense' },
  __transfer_in: { id: '__transfer_in', name: 'Transferencias recibidas', icon: '↙', color: '#7b8794', type: 'income' },
};
export const UNKNOWN_CAT = { id: '__none', name: 'Sin categoría', icon: '❔', color: '#7b8794', type: 'expense' };

// Tipos de cuenta: `group` decide si cuenta como liquidez, ahorro o deuda.
export const ACCOUNT_KINDS = {
  cash: { label: 'Efectivo', icon: '💵', group: 'liquid' },
  bank: { label: 'Cuenta o tarjeta de débito', icon: '🏦', group: 'liquid' },
  savings: { label: 'Ahorro e inversión', icon: '🐷', group: 'savings' },
  credit: { label: 'Tarjeta de crédito', icon: '💳', group: 'debt' },
  loan: { label: 'Préstamo o deuda', icon: '🧾', group: 'debt' },
};
export const GROUPS = { liquid: 'Liquidez', savings: 'Ahorro e inversión', debt: 'Deudas' };
export const kindOf = (a) => (ACCOUNT_KINDS[a.kind] ? a.kind : 'bank');
export const isDebt = (a) => ACCOUNT_KINDS[kindOf(a)].group === 'debt';

export const DEFAULT_SETTINGS = {
  currency: 'EUR', theme: 'auto', weekStart: 1, monthStart: 1, carryOver: false,
  budgetEnabled: false, budget: 0, pinHash: null, lockType: 'pin', autoLock: true, listMode: 'category', lastAccount: null,
  csvProfiles: {},
};
export const DEFAULT_VIEW = { type: 'month', anchor: null, from: null, to: null, account: 'all', tag: null };

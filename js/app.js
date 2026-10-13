'use strict';
/*
 * Cuentas Claras — gestor de finanzas personales.
 * Aplicación web progresiva sin dependencias. Todos los datos se guardan
 * en el navegador (localStorage) y se pueden exportar o restaurar.
 */
(function () {
  const STORAGE_KEY = 'cuentas-claras:v1';
  const APP_VERSION = '1.0.0';
  const LOCALE = 'es-ES';

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  let seq = 0;
  const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayISO = () => toISO(new Date());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  function addMonths(d, n, day = d.getDate()) {
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last));
    return t;
  }
  const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000) + 1;

  function parseNum(s) {
    let t = String(s == null ? '' : s).trim().replace(/\s/g, '');
    if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(',', '.');
    const n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }
  // Número "plano" con coma decimal, sin separador de miles (para el teclado y los campos).
  const plain = (n) => round2(n || 0).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  const plainRate = (n) => String(+(+n).toFixed(6)).replace('.', ',');

  const nfCache = new Map();
  function fmt(n, cur) {
    cur = cur || S.settings.currency;
    let nf = nfCache.get(cur);
    if (!nf) {
      try { nf = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur }); }
      catch (e) { nf = { format: (x) => x.toFixed(2).replace('.', ',') + ' ' + cur }; }
      nfCache.set(cur, nf);
    }
    return nf.format(Math.abs(n) < 0.005 ? 0 : n);
  }
  const fmtSigned = (n, cur) => (n > 0.004 ? '+' : n < -0.004 ? '−' : '') + fmt(Math.abs(n), cur);
  const signCls = (n) => (n < -0.004 ? 'expense' : n > 0.004 ? 'income' : '');

  let currencyNames = null;
  try { currencyNames = new Intl.DisplayNames([LOCALE], { type: 'currency' }); } catch (e) { /* sin nombres */ }
  const curName = (c) => { try { return currencyNames ? currencyNames.of(c) : c; } catch (e) { return c; } };

  const dfDay = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  const dfShort = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
  const dfShortY = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  const dfMonth = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
  const dfFull = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  function shortDate(iso) {
    const d = fromISO(iso);
    return d.getFullYear() === new Date().getFullYear() ? dfShort.format(d) : dfShortY.format(d);
  }
  function dayLabel(iso) {
    if (iso === todayISO()) return 'Hoy';
    if (iso === toISO(addDays(new Date(), -1))) return 'Ayer';
    const d = fromISO(iso);
    return cap(dfDay.format(d)) + (d.getFullYear() !== new Date().getFullYear() ? ` de ${d.getFullYear()}` : '');
  }

  // ---------------------------------------------------------------------------
  // Iconos (SVG en línea, trazo)
  // ---------------------------------------------------------------------------
  const ICONS = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    transfer: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    wallet: '<path d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M3 7V6a2 2 0 0 1 2-2h11v3"/><circle cx="16.5" cy="13.5" r="1.2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.3"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    coins: '<circle cx="9" cy="9" r="6"/><path d="M14.9 9.9A6 6 0 1 1 9.9 14.9"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    backspace: '<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/><path d="m12 9 6 6M18 9l-6 6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // ---------------------------------------------------------------------------
  // Datos por defecto
  // ---------------------------------------------------------------------------
  const EXPENSE_DEFAULTS = [
    ['Facturas', '🧾', '#4f7cff'], ['Coche', '🚗', '#e5484d'], ['Ropa', '👕', '#9b5de5'],
    ['Comunicaciones', '📱', '#2bb3d9'], ['Comer fuera', '🍽️', '#f08c2e'], ['Ocio', '🎬', '#e94f9c'],
    ['Supermercado', '🛒', '#2e9e6a'], ['Regalos', '🎁', '#d0453b'], ['Salud', '💊', '#12a594'],
    ['Casa', '🏠', '#8d6e63'], ['Mascotas', '🐾', '#c08a2e'], ['Deporte', '⚽', '#3d7fd1'],
    ['Taxi', '🚕', '#d9a400'], ['Higiene', '🧴', '#7b93b8'], ['Transporte', '🚌', '#3f8f5f'],
  ];
  const INCOME_DEFAULTS = [['Salario', '💼', '#16875a'], ['Depósitos', '🏦', '#2b8fd9'], ['Ahorros', '🐷', '#e94f9c']];
  const COLORS = ['#e5484d', '#f08c2e', '#d9a400', '#8bb31d', '#2e9e6a', '#12a594', '#2bb3d9', '#4f7cff', '#3d7fd1',
    '#6e56cf', '#9b5de5', '#e94f9c', '#d0453b', '#8d6e63', '#c08a2e', '#7b93b8', '#3f8f5f', '#5b6b7a'];
  const CATEGORY_EMOJIS = ('🛒 🍽️ ☕ 🍺 🍕 🧾 💡 💧 🔥 📱 🌐 📺 🏠 🛋️ 🔧 🧹 🚗 ⛽ 🅿️ 🚕 🚌 🚆 ✈️ 🏨 🧳 👕 👟 👜 💄 🧴 ' +
    '💊 🏥 🦷 🏋️ ⚽ 🎬 🎮 🎵 📚 🎓 ✏️ 🎁 🎉 💐 🐾 👶 🧸 💼 💻 🏦 🐷 💰 💵 💳 📈 🪙 🏆 🤝 💸 ⭐ ❤️ 🍷 🎨 📷 🛠️ 🌱 📦 🏛️ 🚬 🧒').split(' ');
  const ACCOUNT_EMOJIS = '💵 💳 🏦 💰 🐷 👛 💼 🪙 📈 🏠 🚗 ✈️ 🎓 🧾 💶 💷 💴 🌍'.split(' ');
  const CURRENCIES = ('EUR USD GBP CHF MXN ARS COP CLP PEN UYU BOB PYG BRL VES DOP GTQ CRC HNL NIO PAB CUP CAD AUD NZD ' +
    'JPY CNY KRW INR RUB TRY PLN SEK NOK DKK CZK HUF RON BGN MAD ZAR AED ILS').split(' ');
  const FREQ = { daily: 'Cada día', weekly: 'Cada semana', monthly: 'Cada mes', yearly: 'Cada año' };

  // Categorías virtuales para transferencias cuando se ve una sola cuenta.
  const PSEUDO = {
    __transfer_out: { id: '__transfer_out', name: 'Transferencias enviadas', icon: '↗', color: '#7b8794', type: 'expense' },
    __transfer_in: { id: '__transfer_in', name: 'Transferencias recibidas', icon: '↙', color: '#7b8794', type: 'income' },
  };
  const UNKNOWN_CAT = { id: '__none', name: 'Sin categoría', icon: '❔', color: '#7b8794', type: 'expense' };
  const TRANSFER_ICO = '<span class="cat-ico" style="--c:#7b8794">⇄</span>';

  const DEFAULT_SETTINGS = {
    currency: 'EUR', theme: 'auto', weekStart: 1, monthStart: 1, carryOver: false,
    budgetEnabled: false, budget: 0, pinHash: null, autoLock: true, listMode: 'category', lastAccount: null,
  };

  function defaultState() {
    const categories = [];
    EXPENSE_DEFAULTS.forEach(([name, ic, color], i) => categories.push({ id: uid(), name, icon: ic, color, type: 'expense', archived: false, order: i }));
    INCOME_DEFAULTS.forEach(([name, ic, color], i) => categories.push({ id: uid(), name, icon: ic, color, type: 'income', archived: false, order: i }));
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      view: { type: 'month', anchor: todayISO(), from: null, to: null, account: 'all' },
      accounts: [
        { id: uid(), name: 'Efectivo', icon: '💵', currency: 'EUR', initial: 0, includeInTotal: true },
        { id: uid(), name: 'Tarjeta', icon: '💳', currency: 'EUR', initial: 0, includeInTotal: true },
      ],
      categories,
      transactions: [],
      recurring: [],
      rates: {},
    };
  }

  function migrate(o) {
    o.settings = Object.assign({}, DEFAULT_SETTINGS, o.settings || {});
    o.view = Object.assign({ type: 'month', anchor: todayISO(), from: null, to: null, account: 'all' }, o.view || {});
    ['accounts', 'categories', 'transactions', 'recurring'].forEach((k) => { if (!Array.isArray(o[k])) o[k] = []; });
    if (!o.rates || typeof o.rates !== 'object') o.rates = {};
    o.version = 1;
    return o;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* datos corruptos o almacenamiento bloqueado */ }
    return defaultState();
  }
  let storageWarned = false;
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }
    catch (e) {
      if (!storageWarned) { storageWarned = true; toast('No se pudo guardar en este navegador. Descarga una copia de seguridad.'); }
    }
  }

  let S = load();

  // ---------------------------------------------------------------------------
  // Consultas sobre el estado
  // ---------------------------------------------------------------------------
  const getAccount = (id) => S.accounts.find((a) => a.id === id);
  const accName = (id) => { const a = getAccount(id); return a ? a.name : '—'; };
  const getCategory = (id) => PSEUDO[id] || S.categories.find((c) => c.id === id) || UNKNOWN_CAT;
  const accCur = (id) => { const a = getAccount(id); return a ? a.currency : S.settings.currency; };
  const rateOf = (cur) => (cur === S.settings.currency ? 1 : (S.rates[cur] > 0 ? S.rates[cur] : 1));
  const convert = (amt, from, to) => (from === to ? amt : (amt * rateOf(from)) / rateOf(to));
  const sortedCats = (type) => S.categories.filter((c) => c.type === type && !c.archived).sort((a, b) => a.order - b.order);
  const isIncluded = (id) => { const a = getAccount(id); return !!a && a.includeInTotal !== false; };
  const inScope = (id, acc) => (acc === 'all' ? isIncluded(id) : id === acc);
  const touches = (t, acc) => (t.type === 'transfer' ? inScope(t.accountId, acc) || inScope(t.toAccountId, acc) : inScope(t.accountId, acc));
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0));
  const viewCurrency = (view = S.view) => { const a = getAccount(view.account); return a ? a.currency : S.settings.currency; };

  function catIcon(c, size) {
    return `<span class="cat-ico" style="--c:${esc(c.color)}${size ? `;--size:${size}px` : ''}">${esc(c.icon)}</span>`;
  }

  // Convierte un movimiento en "apuntes" de ingreso/gasto vistos desde una cuenta (o todas).
  function txEntries(t, acc) {
    if (t.type === 'transfer') {
      const out = inScope(t.accountId, acc);
      const inn = inScope(t.toAccountId, acc);
      const res = [];
      if (out && !inn) res.push({ type: 'expense', amount: t.amount, currency: accCur(t.accountId), key: '__transfer_out' });
      if (inn && !out) res.push({ type: 'income', amount: t.toAmount, currency: accCur(t.toAccountId), key: '__transfer_in' });
      return res;
    }
    if (!inScope(t.accountId, acc)) return [];
    return [{ type: t.type, amount: t.amount, currency: accCur(t.accountId), key: t.categoryId }];
  }

  function accountBalance(a) {
    let b = a.initial || 0;
    for (const t of S.transactions) {
      if (t.type === 'transfer') {
        if (t.accountId === a.id) b -= t.amount;
        if (t.toAccountId === a.id) b += t.toAmount;
      } else if (t.accountId === a.id) {
        b += t.type === 'income' ? t.amount : -t.amount;
      }
    }
    return b;
  }
  const totalBalance = () => S.accounts.filter((a) => a.includeInTotal !== false)
    .reduce((s, a) => s + convert(accountBalance(a), a.currency, S.settings.currency), 0);

  // ---------------------------------------------------------------------------
  // Períodos
  // ---------------------------------------------------------------------------
  function periodRange(v = S.view) {
    const a = fromISO(v.anchor);
    switch (v.type) {
      case 'day': return { from: a, to: a };
      case 'week': {
        const f = addDays(a, -((a.getDay() - S.settings.weekStart + 7) % 7));
        return { from: f, to: addDays(f, 6) };
      }
      case 'month': {
        const ms = S.settings.monthStart;
        const f = a.getDate() >= ms ? new Date(a.getFullYear(), a.getMonth(), ms) : new Date(a.getFullYear(), a.getMonth() - 1, ms);
        return { from: f, to: addDays(new Date(f.getFullYear(), f.getMonth() + 1, ms), -1) };
      }
      case 'year': return { from: new Date(a.getFullYear(), 0, 1), to: new Date(a.getFullYear(), 11, 31) };
      case 'range': return { from: fromISO(v.from), to: fromISO(v.to) };
      default: return { from: null, to: null };
    }
  }
  function periodISO(v = S.view) {
    const r = periodRange(v);
    return { from: r.from ? toISO(r.from) : null, to: r.to ? toISO(r.to) : null };
  }
  function periodLabel(v = S.view) {
    const r = periodRange(v);
    switch (v.type) {
      case 'day': {
        const iso = toISO(r.from);
        if (iso === todayISO()) return 'Hoy';
        if (iso === toISO(addDays(new Date(), -1))) return 'Ayer';
        return cap(dfFull.format(r.from));
      }
      case 'week': return `${dfShort.format(r.from)} – ${dfShortY.format(r.to)}`;
      case 'month': return S.settings.monthStart === 1 ? cap(dfMonth.format(r.from)) : `${dfShort.format(r.from)} – ${dfShortY.format(r.to)}`;
      case 'year': return String(r.from.getFullYear());
      case 'range': return `${dfShortY.format(r.from)} – ${dfShortY.format(r.to)}`;
      default: return 'Todo el historial';
    }
  }
  function shiftPeriod(dir) {
    const v = S.view;
    if (v.type === 'all') return;
    const r = periodRange(v);
    if (v.type === 'day') v.anchor = toISO(addDays(r.from, dir));
    else if (v.type === 'week') v.anchor = toISO(addDays(r.from, 7 * dir));
    else if (v.type === 'month') v.anchor = toISO(new Date(r.from.getFullYear(), r.from.getMonth() + dir, r.from.getDate()));
    else if (v.type === 'year') v.anchor = toISO(new Date(r.from.getFullYear() + dir, 0, 1));
    else if (v.type === 'range') {
      const len = daysBetween(v.from, v.to);
      v.from = toISO(addDays(r.from, len * dir));
      v.to = toISO(addDays(r.to, len * dir));
      v.anchor = v.from;
    }
    save();
    render();
    if (!reducedMotion()) {
      const anim = (el) => el && el.animate && el.animate(
        [{ opacity: 0.2, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      anim($('.donut-cell')); anim($('#txList'));
    }
  }
  function defaultTxDate() {
    const { from, to } = periodISO();
    const t = todayISO();
    if ((!from || t >= from) && (!to || t <= to)) return t;
    return to && t > to ? to : from;
  }

  // ---------------------------------------------------------------------------
  // Cálculo de la vista (totales por categoría)
  // ---------------------------------------------------------------------------
  function computeView(view = S.view) {
    const { from, to } = periodISO(view);
    const acc = view.account;
    const cur = viewCurrency(view);
    const carryOn = S.settings.carryOver;
    const groups = new Map();
    const transfers = [];
    let income = 0, expense = 0, carry = 0;

    for (const t of S.transactions) {
      if (to && t.date > to) continue;
      const before = !!from && t.date < from;
      if (before && !carryOn) continue;
      if (!before && acc === 'all' && t.type === 'transfer' && inScope(t.accountId, acc) && inScope(t.toAccountId, acc)) transfers.push(t);
      for (const e of txEntries(t, acc)) {
        const v = convert(e.amount, e.currency, cur);
        if (before) { carry += e.type === 'income' ? v : -v; continue; }
        if (e.type === 'income') income += v; else expense += v;
        const gk = e.type + ':' + e.key;
        let g = groups.get(gk);
        if (!g) { g = { gk, key: e.key, cat: getCategory(e.key), type: e.type, total: 0, items: [] }; groups.set(gk, g); }
        g.total += v;
        g.items.push(t);
      }
    }
    if (carryOn) for (const a of S.accounts) if (inScope(a.id, acc)) carry += convert(a.initial || 0, a.currency, cur);

    const all = [...groups.values()];
    const exp = all.filter((g) => g.type === 'expense').sort((a, b) => b.total - a.total);
    const inc = all.filter((g) => g.type === 'income').sort((a, b) => b.total - a.total);
    return { view, from, to, cur, income, expense, carry, balance: income - expense + (carryOn ? carry : 0), exp, inc, transfers };
  }

  // Presupuesto mensual (moneda principal) escalado al período visible.
  function periodBudget(d) {
    if (!S.settings.budgetEnabled || !(S.settings.budget > 0)) return null;
    const monthly = convert(S.settings.budget, S.settings.currency, d.cur);
    const perDay = (monthly * 12) / 365;
    switch (d.view.type) {
      case 'month': return monthly;
      case 'year': return monthly * 12;
      case 'week': return perDay * 7;
      case 'day': return perDay;
      case 'range': return perDay * daysBetween(d.from, d.to);
      default: {
        const first = S.transactions.reduce((m, t) => (t.date < m ? t.date : m), todayISO());
        return perDay * daysBetween(first, todayISO());
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Movimientos recurrentes
  // ---------------------------------------------------------------------------
  function occurrenceDate(rule, n) {
    const s = fromISO(rule.startDate);
    switch (rule.freq) {
      case 'daily': return toISO(addDays(s, n));
      case 'weekly': return toISO(addDays(s, 7 * n));
      case 'yearly': return toISO(addMonths(s, 12 * n));
      default: return toISO(addMonths(s, n));
    }
  }
  function generateRecurring() {
    const today = todayISO();
    let added = 0;
    for (const r of S.recurring) {
      if (!r.active) continue;
      let guard = 0;
      while (guard++ < 3000) {
        const date = occurrenceDate(r, r.n);
        if (date > today) break;
        S.transactions.push({ ...r.template, id: uid(), date, recurringId: r.id, createdAt: Date.now() });
        r.n++;
        added++;
      }
    }
    if (added) save();
    return added;
  }

  // ---------------------------------------------------------------------------
  // Calculadora del teclado
  // ---------------------------------------------------------------------------
  const isOp = (c) => c !== '' && '+-×÷'.includes(c);
  function evalExpr(expr) {
    const toks = expr.match(/\d+(?:,\d*)?|[+\-×÷]/g) || [];
    while (toks.length && isOp(toks[toks.length - 1])) toks.pop();
    if (!toks.length) return 0;
    const num = (t) => parseFloat(String(t).replace(',', '.')) || 0;
    const terms = [num(toks[0])];
    for (let i = 1; i < toks.length; i += 2) {
      const op = toks[i], n = num(toks[i + 1]);
      if (op === '×') terms[terms.length - 1] *= n;
      else if (op === '÷') terms[terms.length - 1] = n === 0 ? NaN : terms[terms.length - 1] / n;
      else terms.push(op === '-' ? -n : n);
    }
    return round2(terms.reduce((a, b) => a + b, 0));
  }
  function pressKey(expr, k) {
    const last = expr.slice(-1);
    const lastNum = expr.split(/[+\-×÷]/).pop();
    switch (k) {
      case 'C': return '0';
      case '⌫': return expr.length > 1 ? expr.slice(0, -1) : '0';
      case '=': { const r = evalExpr(expr); return r >= 0 && isFinite(r) ? plain(r) : expr; }
      case ',':
        if (lastNum.includes(',')) return expr;
        return isOp(last) ? expr + '0,' : expr + ',';
      case '+': case '-': case '×': case '÷':
        if (expr === '0') return expr;
        if (isOp(last) || last === ',') return expr.slice(0, -1) + k;
        return expr + k;
      default:
        if (expr.length >= 28) return expr;
        if (lastNum.includes(',') && lastNum.split(',')[1].length >= 2) return expr;
        if (lastNum === '0') return expr.slice(0, -1) + k;
        if (lastNum.length >= 10) return expr;
        return expr + k;
    }
  }
  const displayExpr = (e) => e.replace(/-/g, '−').replace(/([+−×÷])/g, ' $1 ');

  // ---------------------------------------------------------------------------
  // Hojas (modales) con soporte del botón "atrás"
  // ---------------------------------------------------------------------------
  const stack = [];
  const afterPop = [];
  let pendingPops = 0;
  let useHistory = true;
  try { history.replaceState({ depth: 0 }, ''); } catch (e) { useHistory = false; }

  function openSheet({ title, cls = '', ovCls = '', actions = '' }) {
    const ov = document.createElement('div');
    ov.className = `overlay ${ovCls}`;
    const hid = 'sh' + uid();
    ov.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true" aria-labelledby="${hid}">
      <header class="sheet-head">
        <button class="icon-btn" data-close aria-label="Cerrar">${icon('close')}</button>
        <h2 id="${hid}">${esc(title)}</h2>
        <div class="sheet-actions">${actions}</div>
      </header>
      <div class="sheet-body"></div>
    </div>`;
    document.body.appendChild(ov);
    const sh = { el: ov, sheet: $('.sheet', ov), body: $('.sheet-body', ov), refresh: null, onKey: null };
    stack.push(sh);
    if (useHistory) { try { history.pushState({ depth: stack.length }, ''); } catch (e) { useHistory = false; } }
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeSheet(); });
    $('[data-close]', ov).addEventListener('click', () => closeSheet());
    requestAnimationFrame(() => ov.classList.add('open'));
    return sh;
  }
  function popTo(depth) {
    while (stack.length > depth) {
      const sh = stack.pop();
      sh.el.classList.remove('open');
      sh.el.classList.add('closing');
      setTimeout(() => sh.el.remove(), 200);
    }
    afterPop.splice(0).forEach((f) => f());
  }
  // Cierra la hoja superior; `then` se ejecuta cuando ya está cerrada.
  function closeSheet(then) {
    if (stack.length - pendingPops <= 0) return;
    if (then) afterPop.push(then);
    if (useHistory) { pendingPops++; history.back(); } else popTo(stack.length - 1);
  }
  window.addEventListener('popstate', (e) => {
    pendingPops = Math.max(0, pendingPops - 1);
    popTo((e.state && e.state.depth) || 0);
  });
  function refreshAll() {
    render();
    stack.forEach((s) => s.refresh && s.refresh());
  }

  function confirmDialog(message, { ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'overlay dialog-ov open';
      ov.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true">
        <p>${esc(message)}</p>
        <div class="dialog-actions">
          <button class="btn" data-r="0">${esc(cancel)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(ok)}</button>
        </div></div>`;
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      ov.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (b) done(b.dataset.r === '1'); else if (e.target === ov) done(false);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
      $('[data-r="1"]', ov).focus();
    });
  }

  let toastTimer;
  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    if (action) $('button', el).onclick = () => { el.classList.remove('show'); action.run(); };
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
  }
  function shake(el) {
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }
  function download(filename, content, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------------------------------------------------------------------------
  // Pantalla principal
  // ---------------------------------------------------------------------------
  const RING_SLOTS = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [4, 1], [3, 1], [2, 1]];
  const expanded = new Set();

  function render() {
    applyTheme();
    renderHeader();
    const d = computeView();
    renderOverview(d);
    renderList(d);
  }

  function renderHeader() {
    if (S.view.account !== 'all' && !getAccount(S.view.account)) S.view.account = 'all';
    const a = getAccount(S.view.account);
    $('#accountLabel').textContent = a ? `${a.icon} ${a.name}` : 'Todas las cuentas';
    $('#periodLabel').textContent = periodLabel();
    const fixed = S.view.type === 'all';
    $('#prevPeriod').disabled = fixed;
    $('#nextPeriod').disabled = fixed;
    $('#btnTransfer').hidden = S.accounts.length < 2;
  }

  function renderOverview(d) {
    const cats = sortedCats('expense');
    const overflow = cats.length > 16;
    const shown = overflow ? cats.slice(0, 15) : cats;
    const spent = new Map(d.exp.map((g) => [g.key, g.total]));
    const slots = shown.map((c) => {
      const s = spent.get(c.id);
      return `<button class="ring-cat" data-cat="${c.id}" title="${esc(c.name)}${s ? ': ' + fmt(s, d.cur) : ''}" aria-label="Añadir gasto en ${esc(c.name)}">${catIcon(c)}<span class="ring-name">${esc(c.name)}</span></button>`;
    });
    if (overflow) slots.push(`<button class="ring-cat" data-more aria-label="Más categorías"><span class="cat-ico more">•••</span><span class="ring-name">Más</span></button>`);
    else if (slots.length < 16) slots.push(`<button class="ring-cat" data-addcat aria-label="Nueva categoría"><span class="cat-ico more">+</span><span class="ring-name">Nueva</span></button>`);

    let html = slots.map((s, i) => `<div class="slot" style="grid-row:${RING_SLOTS[i][0]};grid-column:${RING_SLOTS[i][1]}">${s}</div>`).join('');
    html += `<div class="donut-cell">${donutSVG(d)}<div class="donut-center">${centerHTML(d)}</div></div>`;
    $('#ring').innerHTML = html;

    const bal = $('#balanceValue');
    bal.textContent = fmt(d.balance, d.cur);
    bal.className = 'amt ' + signCls(d.balance);
  }

  function donutSVG(d) {
    const R = 78, SW = 20, C = 2 * Math.PI * R;
    let segs = '';
    if (d.expense > 0) {
      const gap = d.exp.length > 1 ? 1.4 : 0;
      let off = 0;
      for (const g of d.exp) {
        const len = (g.total / d.expense) * C;
        const vis = Math.max(len - gap, 0.8);
        segs += `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${esc(g.cat.color)}" stroke-width="${SW}" stroke-dasharray="${vis.toFixed(2)} ${(C - vis).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(g.cat.name)}: ${esc(fmt(g.total, d.cur))}</title></circle>`;
        off += len;
      }
    }
    let budget = '';
    const b = periodBudget(d);
    if (b) {
      const R2 = 95, C2 = 2 * Math.PI * R2;
      const p = Math.min(d.expense / b, 1);
      const col = d.expense > b ? 'var(--expense)' : p > 0.85 ? 'var(--warn)' : 'var(--income)';
      budget = `<circle class="donut-track" r="${R2}" cx="100" cy="100" fill="none" stroke-width="4"/>
        <circle r="${R2}" cx="100" cy="100" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(p * C2).toFixed(2)} ${C2.toFixed(2)}"/>`;
    }
    return `<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="Gastos por categoría">
      <g transform="rotate(-90 100 100)">
        <circle class="donut-track" r="${R}" cx="100" cy="100" fill="none" stroke-width="${SW}"/>
        ${segs}${budget}
      </g></svg>`;
  }

  function centerHTML(d) {
    const b = periodBudget(d);
    if (b != null) {
      const left = b - d.expense;
      return `<span class="c-label">${left >= 0 ? 'Disponible' : 'Excedido'}</span>
        <span class="c-big ${left >= 0 ? 'income' : 'expense'}">${fmt(Math.abs(left), d.cur)}</span>
        <span class="c-sub">de ${fmt(b, d.cur)}</span>`;
    }
    return `<span class="c-label">Ingresos</span><span class="c-val income">${fmt(d.income, d.cur)}</span>
      <span class="c-label">Gastos</span><span class="c-val expense">${fmt(d.expense, d.cur)}</span>`;
  }

  function renderList(d) {
    $$('.list-mode button').forEach((b) => {
      const on = b.dataset.mode === S.settings.listMode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    const el = $('#txList');
    const showCarry = S.settings.carryOver && d.from && Math.abs(d.carry) > 0.004;
    const empty = !d.exp.length && !d.inc.length && !d.transfers.length;
    let html = '';
    if (showCarry) html += `<div class="carry-row"><span>Saldo anterior</span><span class="amt ${signCls(d.carry)}">${fmt(d.carry, d.cur)}</span></div>`;
    if (empty) {
      html += `<div class="empty"><div class="big">🪙</div><p><b>Sin movimientos en este período</b></p>
        <p>Pulsa <b>− Gasto</b> o <b>+ Ingreso</b>, o toca una categoría alrededor del gráfico para apuntar un gasto.</p></div>`;
    } else {
      html += S.settings.listMode === 'date' ? dateList(d) : categoryList(d);
    }
    el.innerHTML = html;
  }

  function categoryList(d) {
    const sec = (title, groups, total, type) => (groups.length
      ? `<section class="list-sec"><h3><span>${title}</span><span class="amt ${type}">${fmt(total, d.cur)}</span></h3>${groups.map((g) => groupHTML(g, total, d)).join('')}</section>`
      : '');
    let html = sec('Gastos', d.exp, d.expense, 'expense') + sec('Ingresos', d.inc, d.income, 'income');
    if (d.transfers.length) {
      html += `<section class="list-sec"><h3><span>Transferencias</span><span>${d.transfers.length}</span></h3>
        <div class="day-items">${d.transfers.slice().sort(byDateDesc).map((t) => itemRow(t, 'cat')).join('')}</div></section>`;
    }
    return html;
  }

  function groupHTML(g, total, d) {
    const pct = total ? Math.round((g.total / total) * 100) : 0;
    const open = expanded.has(g.gk);
    return `<div class="grp${open ? ' open' : ''}">
      <button class="grp-head" data-group="${esc(g.gk)}" aria-expanded="${open}">
        ${catIcon(g.cat)}
        <span class="grp-main"><span class="grp-name">${esc(g.cat.name)} <small>${g.items.length}</small></span>
          <span class="bar"><i style="width:${pct}%;background:${esc(g.cat.color)}"></i></span></span>
        <span class="grp-pct">${pct}%</span>
        <span class="amt ${g.type}">${fmt(g.total, d.cur)}</span>
      </button>
      ${open ? `<div class="grp-items">${g.items.slice().sort(byDateDesc).map((t) => itemRow(t, 'cat')).join('')}</div>` : ''}
    </div>`;
  }

  function dateList(d) {
    const acc = d.view.account;
    const txs = S.transactions.filter((t) => (!d.from || t.date >= d.from) && (!d.to || t.date <= d.to) && touches(t, acc)).sort(byDateDesc);
    let html = '', day = null, rows = [], net = 0;
    const flush = () => {
      if (!day) return;
      html += `<section class="list-sec"><h3><span>${esc(dayLabel(day))}</span><span class="amt ${signCls(net)}">${fmtSigned(net, d.cur)}</span></h3><div class="day-items">${rows.join('')}</div></section>`;
    };
    for (const t of txs) {
      if (t.date !== day) { flush(); day = t.date; rows = []; net = 0; }
      rows.push(itemRow(t, 'date'));
      for (const e of txEntries(t, acc)) net += (e.type === 'income' ? 1 : -1) * convert(e.amount, e.currency, d.cur);
    }
    flush();
    return html;
  }

  // mode: 'cat' (dentro de una categoría), 'date' (agrupado por día) o 'search'
  function itemRow(t, mode) {
    const acc = S.view.account;
    const sub = [];
    let ico, title, amt;
    if (t.type === 'transfer') {
      ico = TRANSFER_ICO;
      title = `${accName(t.accountId)} → ${accName(t.toAccountId)}`;
      const fc = accCur(t.accountId), tc = accCur(t.toAccountId);
      if (mode !== 'search' && acc !== 'all' && acc === t.toAccountId) amt = `<span class="amt income">+${fmt(t.toAmount, tc)}</span>`;
      else if (mode !== 'search' && acc !== 'all') amt = `<span class="amt expense">−${fmt(t.amount, fc)}</span>`;
      else amt = `<span class="amt neutral">${fmt(t.amount, fc)}</span>`;
      if (t.note) sub.push(t.note);
    } else {
      const c = getCategory(t.categoryId);
      ico = catIcon(c);
      if (mode === 'cat') title = t.note || c.name;
      else { title = c.name; if (t.note) sub.push(t.note); }
      if (acc === 'all' || mode === 'search') sub.push(accName(t.accountId));
      amt = `<span class="amt ${t.type}">${t.type === 'expense' ? '−' : '+'}${fmt(t.amount, accCur(t.accountId))}</span>`;
    }
    if (mode !== 'date') sub.unshift(shortDate(t.date));
    return `<button class="tx-row" data-tx="${t.id}">${ico}
      <span class="tx-main"><span class="tx-title">${esc(title)}${t.recurringId ? ' <span class="rec" title="Recurrente">↻</span>' : ''}</span>
      ${sub.length ? `<span class="tx-sub">${sub.map(esc).join(' · ')}</span>` : ''}</span>${amt}</button>`;
  }

  // ---------------------------------------------------------------------------
  // Editor de movimientos (gasto / ingreso / transferencia)
  // ---------------------------------------------------------------------------
  const KEYS = [['C', 'k-fn'], ['÷', 'k-op'], ['×', 'k-op'], ['⌫', 'k-fn'], ['7'], ['8'], ['9'], ['-', 'k-op'],
    ['4'], ['5'], ['6'], ['+', 'k-op'], ['1'], ['2'], ['3'], ['=', 'k-eq'], ['0', 'k-zero'], [',']];

  function openTxSheet(opts = {}) {
    const tx = opts.tx || null;
    const accs = S.accounts;
    if (!accs.length) { toast('Crea primero una cuenta'); return; }
    const preferred = getAccount(S.view.account) ? S.view.account : getAccount(S.settings.lastAccount) ? S.settings.lastAccount : accs[0].id;
    const d = tx
      ? { type: tx.type, expr: plain(tx.amount), accountId: tx.accountId, toAccountId: tx.toAccountId || null, categoryId: tx.categoryId || null, date: tx.date, note: tx.note || '', repeat: 'none' }
      : { type: opts.type || 'expense', expr: '0', accountId: preferred, toAccountId: null, categoryId: opts.categoryId || null, date: defaultTxDate(), note: '', repeat: 'none' };
    const otherAcc = (id) => (accs.find((a) => a.id !== id) || accs[0]).id;
    if (d.type === 'transfer') {
      if (accs.length < 2) { toast('Necesitas al menos dos cuentas para transferir'); return; }
      if (!d.toAccountId || d.toAccountId === d.accountId) d.toAccountId = otherAcc(d.accountId);
    }
    const rule = tx && tx.recurringId ? S.recurring.find((r) => r.id === tx.recurringId) : null;
    const accOptions = accs.map((a) => `<option value="${a.id}">${esc(a.icon)} ${esc(a.name)}${a.currency !== S.settings.currency ? ` (${a.currency})` : ''}</option>`).join('');

    const sh = openSheet({
      title: tx ? 'Editar movimiento' : 'Nuevo movimiento', cls: 'sheet-tx', ovCls: 'ov-tx',
      actions: tx ? `<button class="icon-btn" data-del aria-label="Eliminar movimiento" title="Eliminar">${icon('trash')}</button>` : '',
    });
    const root = sh.body;
    root.innerHTML = `
      <div class="seg full" role="tablist">
        <button data-type="expense" role="tab">Gasto</button>
        <button data-type="income" role="tab">Ingreso</button>
        <button data-type="transfer" role="tab" ${accs.length < 2 ? 'disabled title="Necesitas dos cuentas"' : ''}>Transferencia</button>
      </div>
      <div class="amount"><div class="amount-expr" aria-live="polite"></div><div class="amount-sub"></div></div>
      <div class="tx-fields">
        <label class="field-chip"><span class="lbl from-lbl">Cuenta</span><select data-f="account">${accOptions}</select></label>
        <label class="field-chip to-only"><span class="lbl">Hacia</span><select data-f="to">${accOptions}</select></label>
        <label class="field-chip"><span class="lbl">Fecha</span><input type="date" data-f="date" required></label>
        ${tx ? '' : `<label class="field-chip"><span class="lbl">Repetir</span><select data-f="repeat"><option value="none">No</option>
          ${Object.entries(FREQ).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>`}
      </div>
      ${rule && rule.active ? `<div class="banner">↻ Movimiento recurrente (${FREQ[rule.freq].toLowerCase()}) · <button class="link" data-stop>Detener repetición</button></div>` : ''}
      <input class="note-input" data-f="note" type="text" maxlength="140" placeholder="Nota (opcional)" autocomplete="off">
      <div class="cat-hint not-transfer"></div>
      <div class="cat-grid not-transfer" role="listbox" aria-label="Categoría"></div>
      <div class="keypad">${KEYS.map(([k, c]) => `<button class="${c || ''}" data-k="${k}" aria-label="${k === '⌫' ? 'Borrar' : k === 'C' ? 'Limpiar' : k}">${k === '-' ? '−' : k === '⌫' ? icon('backspace') : k}</button>`).join('')}</div>`;

    $('[data-f=account]', root).value = d.accountId;
    if (d.toAccountId) $('[data-f=to]', root).value = d.toAccountId;
    $('[data-f=date]', root).value = d.date;
    $('[data-f=note]', root).value = d.note;

    const upd = () => {
      sh.sheet.dataset.type = d.type;
      $$('.seg [data-type]', root).forEach((b) => {
        const on = b.dataset.type === d.type;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on);
      });
      const cur = accCur(d.accountId);
      const val = evalExpr(d.expr);
      $('.amount-expr', root).innerHTML = `${esc(displayExpr(d.expr))}<span class="cur">${esc(cur)}</span>`;
      let sub = /[+\-×÷]/.test(d.expr) ? '= ' + fmt(val, cur) : '';
      if (d.type === 'transfer') {
        const tc = accCur(d.toAccountId);
        if (tc !== cur) sub += (sub ? ' · ' : '') + `≈ ${fmt(convert(val, cur, tc), tc)} en destino`;
      }
      $('.amount-sub', root).textContent = sub;
      // La tecla "=" se convierte en "Guardar" cuando no hay operación pendiente.
      const eq = $('[data-k="="]', root);
      const pending = /[+\-×÷]/.test(d.expr);
      eq.classList.toggle('k-ok', !pending);
      eq.innerHTML = pending ? '=' : icon('check');
      eq.setAttribute('aria-label', pending ? 'Calcular' : 'Guardar');
      $('.from-lbl', root).textContent = d.type === 'transfer' ? 'Desde' : 'Cuenta';
      $('.cat-hint', root).textContent = !tx && val > 0 ? 'Toca una categoría para guardar' : 'Categoría';
    };

    const renderCats = () => {
      if (d.type === 'transfer') return;
      let cats = sortedCats(d.type);
      const selected = S.categories.find((c) => c.id === d.categoryId);
      if (selected && selected.type === d.type && selected.archived) cats = [selected, ...cats];
      $('.cat-grid', root).innerHTML = cats.map((c) => `<button class="cat-pick${c.id === d.categoryId ? ' sel' : ''}" data-cat="${c.id}" role="option" aria-selected="${c.id === d.categoryId}">${catIcon(c)}<span>${esc(c.name)}</span></button>`).join('')
        + `<button class="cat-pick" data-newcat><span class="cat-ico more">+</span><span>Nueva</span></button>`;
    };
    sh.refresh = renderCats;

    let saved = false;
    const doSave = () => {
      if (saved) return;
      const amount = evalExpr(d.expr);
      if (!(amount > 0)) { shake($('.amount', root)); toast('Introduce un importe mayor que cero'); return; }
      if (!d.date) { toast('Elige una fecha'); return; }
      let rec;
      if (d.type === 'transfer') {
        if (d.accountId === d.toAccountId) { toast('Elige dos cuentas distintas'); return; }
        rec = { type: 'transfer', amount, accountId: d.accountId, toAccountId: d.toAccountId, toAmount: round2(convert(amount, accCur(d.accountId), accCur(d.toAccountId))), categoryId: null };
      } else {
        if (!d.categoryId) { shake($('.cat-grid', root)); toast('Elige una categoría'); return; }
        rec = { type: d.type, amount, accountId: d.accountId, categoryId: d.categoryId, toAccountId: null, toAmount: null };
      }
      rec.note = d.note.trim();
      saved = true;
      if (tx) {
        Object.assign(tx, rec, { date: d.date });
      } else {
        const full = { ...rec, id: uid(), date: d.date, createdAt: Date.now() };
        if (d.repeat !== 'none') {
          const r = { id: uid(), freq: d.repeat, startDate: d.date, n: 1, active: true, template: { ...rec } };
          full.recurringId = r.id;
          S.recurring.push(r);
        }
        S.transactions.push(full);
      }
      S.settings.lastAccount = d.accountId;
      save();
      generateRecurring();
      closeSheet();
      refreshAll();
      toast(tx ? 'Movimiento actualizado' : { expense: 'Gasto añadido', income: 'Ingreso añadido', transfer: 'Transferencia registrada' }[d.type]);
    };

    const press = (k, fromKeypad) => {
      if (k === '=' && fromKeypad && !/[+\-×÷]/.test(d.expr)) { doSave(); return; }
      if (k === '=' && !(evalExpr(d.expr) >= 0)) { toast('El resultado no puede ser negativo'); return; }
      d.expr = pressKey(d.expr, k);
      upd();
    };

    $('.seg', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]');
      if (!b || b.disabled || b.dataset.type === d.type) return;
      d.type = b.dataset.type;
      if (d.type === 'transfer') {
        if (!d.toAccountId || d.toAccountId === d.accountId) d.toAccountId = otherAcc(d.accountId);
        $('[data-f=to]', root).value = d.toAccountId;
      } else {
        const c = S.categories.find((x) => x.id === d.categoryId);
        if (!c || c.type !== d.type) d.categoryId = null;
      }
      renderCats();
      upd();
    });
    root.addEventListener('change', (e) => {
      const f = e.target.dataset.f;
      if (f === 'account') d.accountId = e.target.value;
      else if (f === 'to') d.toAccountId = e.target.value;
      else if (f === 'date') { if (e.target.value) d.date = e.target.value; else e.target.value = d.date; }
      else if (f === 'repeat') d.repeat = e.target.value;
      upd();
    });
    $('[data-f=note]', root).addEventListener('input', (e) => { d.note = e.target.value; });
    $('.keypad', root).addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k, true); });
    // Abre el calendario al tocar en cualquier parte del campo de fecha.
    $('[data-f=date]', root).addEventListener('click', (e) => { try { e.target.showPicker(); } catch (err) { /* no soportado */ } });
    $('.cat-grid', root).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.newcat != null) {
        openCategoryForm(null, d.type, (c) => { d.categoryId = c.id; renderCats(); upd(); });
        return;
      }
      d.categoryId = b.dataset.cat;
      renderCats();
      if (!tx && evalExpr(d.expr) > 0) doSave();
    });
    const stopBtn = $('[data-stop]', root);
    if (stopBtn) stopBtn.addEventListener('click', () => {
      rule.active = false;
      save();
      stopBtn.closest('.banner').textContent = 'Repetición detenida. Este y los movimientos anteriores se conservan.';
      toast('Repetición detenida');
    });
    const delBtn = $('[data-del]', sh.el);
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!(await confirmDialog('¿Eliminar este movimiento?', { ok: 'Eliminar', danger: true }))) return;
      const idx = S.transactions.indexOf(tx);
      if (idx < 0) return;
      const [removed] = S.transactions.splice(idx, 1);
      save();
      closeSheet();
      refreshAll();
      toast('Movimiento eliminado', { label: 'Deshacer', run: () => { S.transactions.push(removed); save(); refreshAll(); } });
    });

    sh.onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.key === 'Enter') { if (tag === 'select') return false; doSave(); return true; }
      if (['input', 'select', 'textarea'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return false;
      const map = { '*': '×', x: '×', '/': '÷', '.': ',', ',': ',', Backspace: '⌫', Delete: 'C', c: 'C', '=': '=', '+': '+', '-': '-' };
      const k = /^\d$/.test(e.key) ? e.key : map[e.key];
      if (!k) return false;
      press(k);
      return true;
    };

    renderCats();
    upd();
  }

  // ---------------------------------------------------------------------------
  // Período, cuenta visible y búsqueda
  // ---------------------------------------------------------------------------
  function openPeriodSheet() {
    const sh = openSheet({ title: 'Período' });
    const v = S.view;
    const cur = periodISO();
    const opts = [['day', 'Día'], ['week', 'Semana'], ['month', 'Mes'], ['year', 'Año'], ['all', 'Todo']];
    sh.body.innerHTML = `
      <div class="list">${opts.map(([k, l]) => `<button class="list-row" data-type="${k}"><span class="grow t">${l}</span>${v.type === k ? icon('check') : ''}</button>`).join('')}</div>
      <h4 class="sub-h">Intervalo personalizado</h4>
      <div class="row2">
        <label class="field"><span>Desde</span><input type="date" data-from value="${esc(v.type === 'range' ? v.from : cur.from || todayISO())}"></label>
        <label class="field"><span>Hasta</span><input type="date" data-to value="${esc(v.type === 'range' ? v.to : cur.to || todayISO())}"></label>
      </div>
      <button class="btn btn-block" data-range>Aplicar intervalo</button>
      <h4 class="sub-h">Ir a un día concreto</h4>
      <div class="row2 align-end">
        <label class="field"><span>Fecha</span><input type="date" data-day value="${esc(v.anchor)}"></label>
        <button class="btn" data-goday>Ver día</button>
      </div>
      <button class="btn btn-primary btn-block" data-today>Volver a hoy</button>`;
    const apply = () => { save(); closeSheet(); render(); };
    sh.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-type]');
      if (t) {
        if (v.type === 'range' && v.from) v.anchor = v.from;
        v.type = t.dataset.type;
        apply();
      } else if (e.target.closest('[data-range]')) {
        const f = $('[data-from]', sh.body).value, to = $('[data-to]', sh.body).value;
        if (!f || !to || f > to) { toast('Revisa las fechas del intervalo'); return; }
        Object.assign(v, { type: 'range', from: f, to, anchor: f });
        apply();
      } else if (e.target.closest('[data-goday]')) {
        const day = $('[data-day]', sh.body).value;
        if (!day) return;
        Object.assign(v, { type: 'day', anchor: day });
        apply();
      } else if (e.target.closest('[data-today]')) {
        v.anchor = todayISO();
        if (v.type === 'range' || v.type === 'all') v.type = 'month';
        apply();
      }
    });
  }

  function openAccountSwitch() {
    const sh = openSheet({ title: 'Ver cuenta' });
    const cur = S.view.account;
    sh.body.innerHTML = `<div class="list">
      <button class="list-row" data-acc="all"><span class="acc-ico">∑</span>
        <span class="grow"><span class="t">Todas las cuentas</span><span class="s">${S.accounts.length} cuenta(s)</span></span>
        <span class="amt ${signCls(totalBalance())}">${fmt(totalBalance())}</span>${cur === 'all' ? icon('check') : ''}</button>
      ${S.accounts.map((a) => {
        const b = accountBalance(a);
        return `<button class="list-row" data-acc="${a.id}"><span class="acc-ico">${esc(a.icon)}</span>
          <span class="grow"><span class="t">${esc(a.name)}</span>${a.includeInTotal === false ? '<span class="s">Excluida del total</span>' : ''}</span>
          <span class="amt ${signCls(b)}">${fmt(b, a.currency)}</span>${cur === a.id ? icon('check') : ''}</button>`;
      }).join('')}
      </div>
      <button class="btn btn-block" data-manage>${icon('wallet')} Gestionar cuentas</button>`;
    sh.body.addEventListener('click', (e) => {
      const r = e.target.closest('[data-acc]');
      if (r) { S.view.account = r.dataset.acc; save(); closeSheet(); render(); return; }
      if (e.target.closest('[data-manage]')) closeSheet(openAccounts);
    });
  }

  function openSearch() {
    const sh = openSheet({ title: 'Buscar', cls: 'sheet-tall' });
    sh.body.innerHTML = `<div class="search-box">${icon('search')}<input type="search" placeholder="Nota, categoría, cuenta o importe" autocomplete="off" aria-label="Buscar movimientos"></div>
      <div class="search-results"></div>`;
    const input = $('input', sh.body), out = $('.search-results', sh.body);
    const run = () => {
      const q = norm(input.value.trim());
      if (!q) { out.innerHTML = `<p class="muted center">Busca entre ${S.transactions.length} movimientos.</p>`; return; }
      const res = S.transactions.filter((t) => {
        const hay = [t.note, t.type === 'transfer' ? 'transferencia' : getCategory(t.categoryId).name, accName(t.accountId),
          t.toAccountId ? accName(t.toAccountId) : '', plain(t.amount), t.amount.toFixed(2), t.date].join(' ');
        return norm(hay).includes(q);
      }).sort(byDateDesc);
      out.innerHTML = res.length
        ? `<p class="muted small">${res.length} resultado(s)${res.length > 300 ? ' · se muestran 300' : ''}</p><div class="day-items">${res.slice(0, 300).map((t) => itemRow(t, 'search')).join('')}</div>`
        : '<p class="muted center">Sin resultados</p>';
    };
    input.addEventListener('input', run);
    out.addEventListener('click', (e) => {
      const r = e.target.closest('[data-tx]');
      if (r) { const t = S.transactions.find((x) => x.id === r.dataset.tx); if (t) openTxSheet({ tx: t }); }
    });
    sh.refresh = run;
    run();
    setTimeout(() => input.focus(), 60);
  }

  // ---------------------------------------------------------------------------
  // Menú lateral
  // ---------------------------------------------------------------------------
  function openMenu() {
    const sh = openSheet({ title: 'Cuentas Claras', cls: 'sheet-drawer', ovCls: 'ov-drawer' });
    const items = [
      ['wallet', 'Cuentas', openAccounts], ['tag', 'Categorías', () => openCategories('expense')],
      ['repeat', 'Recurrentes', openRecurring], ['target', 'Presupuesto', openBudget],
      ['coins', 'Monedas', openCurrencies], ['search', 'Buscar', openSearch],
      ['download', 'Exportar y copias', openData], ['lock', 'Código de acceso', openSecurity],
      ['sliders', 'Ajustes', openSettings],
    ];
    const tb = totalBalance();
    sh.body.innerHTML = `<div class="menu-total"><span>Saldo total</span><strong class="${signCls(tb)}">${fmt(tb)}</strong></div>
      <nav class="menu">${items.map(([ic, label], i) => `<button class="menu-item" data-i="${i}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
      <p class="menu-foot">Versión ${APP_VERSION}<br>Tus datos se guardan solo en este dispositivo.</p>`;
    sh.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) closeSheet(items[+b.dataset.i][2]);
    });
  }

  // ---------------------------------------------------------------------------
  // Cuentas
  // ---------------------------------------------------------------------------
  function openAccounts() {
    const sh = openSheet({ title: 'Cuentas', actions: `<button class="icon-btn" data-add aria-label="Nueva cuenta">${icon('plus')}</button>` });
    const draw = () => {
      const tb = totalBalance();
      sh.body.innerHTML = `<div class="total-card"><span>Saldo total</span><strong class="${signCls(tb)}">${fmt(tb)}</strong></div>
        <div class="list">${S.accounts.map((a) => {
          const b = accountBalance(a);
          const notes = [a.currency !== S.settings.currency ? `${a.currency} · ${curName(a.currency)}` : '', a.includeInTotal === false ? 'Excluida del total' : ''].filter(Boolean).join(' · ');
          return `<button class="list-row" data-id="${a.id}"><span class="acc-ico">${esc(a.icon)}</span>
            <span class="grow"><span class="t">${esc(a.name)}</span>${notes ? `<span class="s">${esc(notes)}</span>` : ''}</span>
            <span class="amt ${signCls(b)}">${fmt(b, a.currency)}</span></button>`;
        }).join('')}</div>
        <button class="btn btn-block" data-add>${icon('plus')} Nueva cuenta</button>`;
    };
    sh.refresh = draw;
    draw();
    sh.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) { openAccountForm(null); return; }
      const r = e.target.closest('[data-id]');
      if (r) openAccountForm(getAccount(r.dataset.id));
    });
  }

  function openAccountForm(acc) {
    const isNew = !acc;
    const a = acc ? { ...acc } : { id: uid(), name: '', icon: '🏦', currency: S.settings.currency, initial: 0, includeInTotal: true };
    const sh = openSheet({ title: isNew ? 'Nueva cuenta' : 'Editar cuenta' });
    const base = S.settings.currency;
    sh.body.innerHTML = `
      <label class="field"><span>Nombre</span><input data-name maxlength="40" value="${esc(a.name)}" placeholder="p. ej. Banco, Ahorros…"></label>
      <div class="field"><span>Icono</span><div class="emoji-grid">${ACCOUNT_EMOJIS.map((e) => `<button data-emoji="${e}" class="${e === a.icon ? 'sel' : ''}">${e}</button>`).join('')}</div></div>
      <label class="field"><span>Moneda</span><select data-cur>${currencyOptions(a.currency)}</select></label>
      <div class="field rate-field"><span>Tipo de cambio</span>
        <div class="rate-line">1 <b data-curcode></b> = <input data-rate inputmode="decimal" placeholder="0,00"> ${esc(base)}</div></div>
      <label class="field"><span>Saldo inicial</span><input data-initial inputmode="decimal" value="${a.initial ? plain(a.initial) : ''}" placeholder="0"></label>
      <label class="switch-row"><span><b>Incluir en el saldo total</b><small>Desactívalo para cuentas que no quieras sumar (p. ej. una deuda o ahorro aparte).</small></span>
        <input type="checkbox" class="switch" data-incl ${a.includeInTotal !== false ? 'checked' : ''}></label>
      ${!isNew ? '<p class="muted small">Si cambias la moneda, los importes ya registrados no se convierten.</p>' : ''}
      <div class="form-actions">${isNew ? '' : `<button class="btn btn-danger-ghost" data-del>${icon('trash')} Eliminar</button>`}<span class="grow"></span><button class="btn btn-primary" data-save>Guardar</button></div>`;
    const curSel = $('[data-cur]', sh.body);
    const syncRate = () => {
      const c = curSel.value;
      $('.rate-field', sh.body).hidden = c === base;
      $('[data-curcode]', sh.body).textContent = c;
      $('[data-rate]', sh.body).value = S.rates[c] ? plainRate(S.rates[c]) : '';
    };
    curSel.addEventListener('change', syncRate);
    syncRate();
    sh.body.addEventListener('click', async (e) => {
      const em = e.target.closest('[data-emoji]');
      if (em) { a.icon = em.dataset.emoji; $$('[data-emoji]', sh.body).forEach((b) => b.classList.toggle('sel', b === em)); return; }
      if (e.target.closest('[data-save]')) {
        a.name = $('[data-name]', sh.body).value.trim();
        if (!a.name) { shake($('[data-name]', sh.body)); toast('Escribe un nombre'); return; }
        a.currency = curSel.value;
        a.initial = round2(parseNum($('[data-initial]', sh.body).value));
        a.includeInTotal = $('[data-incl]', sh.body).checked;
        if (a.currency !== base) {
          const r = parseNum($('[data-rate]', sh.body).value);
          if (r > 0) S.rates[a.currency] = r;
          else { shake($('[data-rate]', sh.body)); toast('Indica el tipo de cambio'); return; }
        }
        if (isNew) S.accounts.push(a); else Object.assign(acc, a);
        save();
        closeSheet();
        refreshAll();
        toast(isNew ? 'Cuenta creada' : 'Cuenta guardada');
        return;
      }
      if (e.target.closest('[data-del]')) {
        if (S.accounts.length <= 1) { toast('Debe existir al menos una cuenta'); return; }
        const n = S.transactions.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id).length;
        const msg = n ? `Se eliminará «${acc.name}» y sus ${n} movimiento(s). Esta acción no se puede deshacer.` : `¿Eliminar la cuenta «${acc.name}»?`;
        if (!(await confirmDialog(msg, { ok: 'Eliminar', danger: true }))) return;
        S.transactions = S.transactions.filter((t) => t.accountId !== acc.id && t.toAccountId !== acc.id);
        S.recurring = S.recurring.filter((r) => r.template.accountId !== acc.id && r.template.toAccountId !== acc.id);
        S.accounts = S.accounts.filter((x) => x.id !== acc.id);
        if (S.view.account === acc.id) S.view.account = 'all';
        if (S.settings.lastAccount === acc.id) S.settings.lastAccount = null;
        save();
        closeSheet();
        refreshAll();
        toast('Cuenta eliminada');
      }
    });
  }

  function currencyOptions(sel, exclude = []) {
    const list = CURRENCIES.includes(sel) ? CURRENCIES : [sel, ...CURRENCIES];
    return list.filter((c) => c === sel || !exclude.includes(c))
      .map((c) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c} · ${esc(curName(c))}</option>`).join('');
  }

  // ---------------------------------------------------------------------------
  // Categorías
  // ---------------------------------------------------------------------------
  function openCategories(type) {
    let tab = type;
    const sh = openSheet({ title: 'Categorías', actions: `<button class="icon-btn" data-add aria-label="Nueva categoría">${icon('plus')}</button>` });
    const draw = () => {
      const cats = sortedCats(tab);
      const arch = S.categories.filter((c) => c.type === tab && c.archived);
      sh.body.innerHTML = `
        <div class="seg full" data-tabs><button data-v="expense" class="${tab === 'expense' ? 'active' : ''}">Gastos</button><button data-v="income" class="${tab === 'income' ? 'active' : ''}">Ingresos</button></div>
        <p class="muted small">El orden de los gastos es el que aparece alrededor del gráfico.</p>
        <div class="list">${cats.map((c, i) => `<div class="list-row">
          <button class="grow-btn" data-edit="${c.id}">${catIcon(c)}<span class="t">${esc(c.name)}</span></button>
          <button class="icon-btn sm" data-move="-1" data-id="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icon('up')}</button>
          <button class="icon-btn sm" data-move="1" data-id="${c.id}" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Bajar">${icon('down')}</button>
        </div>`).join('') || '<p class="muted center">No hay categorías.</p>'}</div>
        <button class="btn btn-block" data-add>${icon('plus')} Nueva categoría</button>
        ${arch.length ? `<h4 class="sub-h">Archivadas</h4><div class="list">${arch.map((c) => `<div class="list-row archived">
          <button class="grow-btn" data-edit="${c.id}">${catIcon(c)}<span class="t">${esc(c.name)}</span></button>
          <button class="btn sm" data-restore="${c.id}">Restaurar</button></div>`).join('')}</div>` : ''}`;
    };
    sh.refresh = draw;
    draw();
    sh.el.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tabs] [data-v]');
      if (tb) { tab = tb.dataset.v; draw(); return; }
      if (e.target.closest('[data-add]')) { openCategoryForm(null, tab); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) { openCategoryForm(S.categories.find((c) => c.id === ed.dataset.edit), tab); return; }
      const mv = e.target.closest('[data-move]');
      if (mv && !mv.disabled) {
        const cats = sortedCats(tab);
        const i = cats.findIndex((c) => c.id === mv.dataset.id);
        const j = i + Number(mv.dataset.move);
        if (j < 0 || j >= cats.length) return;
        [cats[i], cats[j]] = [cats[j], cats[i]];
        cats.forEach((c, k) => { c.order = k; });
        save();
        refreshAll();
        return;
      }
      const rs = e.target.closest('[data-restore]');
      if (rs) {
        const c = S.categories.find((x) => x.id === rs.dataset.restore);
        c.archived = false;
        c.order = sortedCats(c.type).length;
        save();
        refreshAll();
      }
    });
  }

  function openCategoryForm(cat, type, onCreated) {
    const isNew = !cat;
    const c = cat ? { ...cat } : { id: uid(), name: '', icon: '🛍️', color: COLORS[S.categories.length % COLORS.length], type: type || 'expense', archived: false, order: 0 };
    const used = isNew ? 0 : S.transactions.filter((t) => t.categoryId === c.id).length;
    const sh = openSheet({ title: isNew ? 'Nueva categoría' : 'Editar categoría' });
    sh.body.innerHTML = `
      <div class="cat-preview"><span data-prev></span><b data-prev-name></b></div>
      <label class="field"><span>Nombre</span><input data-name maxlength="30" value="${esc(c.name)}" placeholder="p. ej. Gimnasio"></label>
      ${isNew ? `<div class="field"><span>Tipo</span><div class="seg full" data-typeseg>
        <button data-v="expense" class="${c.type === 'expense' ? 'active' : ''}">Gasto</button><button data-v="income" class="${c.type === 'income' ? 'active' : ''}">Ingreso</button></div></div>` : ''}
      <div class="field"><span>Icono</span><div class="emoji-grid">${CATEGORY_EMOJIS.map((e) => `<button data-emoji="${e}" class="${e === c.icon ? 'sel' : ''}">${e}</button>`).join('')}</div></div>
      <div class="field"><span>Color</span><div class="swatches">${COLORS.map((col) => `<button data-color="${col}" style="--c:${col}" class="${col === c.color ? 'sel' : ''}" aria-label="Color ${col}"></button>`).join('')}</div></div>
      <div class="form-actions">
        ${isNew ? '' : `${used ? `<button class="btn" data-archive>${c.archived ? 'Restaurar' : 'Archivar'}</button>` : ''}<button class="btn btn-danger-ghost" data-del>${icon('trash')} Eliminar</button>`}
        <span class="grow"></span><button class="btn btn-primary" data-save>Guardar</button></div>
      ${used ? `<p class="muted small">Usada en ${used} movimiento(s). Archivarla la oculta al añadir movimientos, sin perder el historial.</p>` : ''}`;
    const nameIn = $('[data-name]', sh.body);
    const preview = () => {
      $('[data-prev]', sh.body).innerHTML = catIcon(c, 64);
      $('[data-prev-name]', sh.body).textContent = nameIn.value.trim() || 'Nombre';
    };
    nameIn.addEventListener('input', preview);
    preview();
    sh.body.addEventListener('click', async (e) => {
      const em = e.target.closest('[data-emoji]');
      if (em) { c.icon = em.dataset.emoji; $$('[data-emoji]', sh.body).forEach((b) => b.classList.toggle('sel', b === em)); preview(); return; }
      const co = e.target.closest('[data-color]');
      if (co) { c.color = co.dataset.color; $$('[data-color]', sh.body).forEach((b) => b.classList.toggle('sel', b === co)); preview(); return; }
      const ty = e.target.closest('[data-typeseg] [data-v]');
      if (ty) { c.type = ty.dataset.v; $$('[data-typeseg] [data-v]', sh.body).forEach((b) => b.classList.toggle('active', b === ty)); return; }
      if (e.target.closest('[data-save]')) {
        c.name = nameIn.value.trim();
        if (!c.name) { shake(nameIn); toast('Escribe un nombre'); return; }
        if (isNew) {
          c.order = S.categories.filter((x) => x.type === c.type).reduce((m, x) => Math.max(m, x.order), -1) + 1;
          S.categories.push(c);
        } else Object.assign(cat, c);
        save();
        closeSheet();
        refreshAll();
        if (isNew && onCreated && c.type === type) onCreated(c);
        return;
      }
      if (e.target.closest('[data-archive]')) {
        cat.archived = !cat.archived;
        if (!cat.archived) cat.order = sortedCats(cat.type).length;
        save();
        closeSheet();
        refreshAll();
        toast(cat.archived ? 'Categoría archivada' : 'Categoría restaurada');
        return;
      }
      if (e.target.closest('[data-del]')) {
        const msg = used ? `Se eliminará «${cat.name}» y sus ${used} movimiento(s). Si quieres conservarlos, archívala en su lugar.` : `¿Eliminar la categoría «${cat.name}»?`;
        if (!(await confirmDialog(msg, { ok: 'Eliminar', danger: true }))) return;
        S.transactions = S.transactions.filter((t) => t.categoryId !== cat.id);
        S.recurring = S.recurring.filter((r) => r.template.categoryId !== cat.id);
        S.categories = S.categories.filter((x) => x.id !== cat.id);
        save();
        closeSheet();
        refreshAll();
        toast('Categoría eliminada');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Recurrentes, presupuesto y monedas
  // ---------------------------------------------------------------------------
  function openRecurring() {
    const sh = openSheet({ title: 'Movimientos recurrentes' });
    const draw = () => {
      if (!S.recurring.length) {
        sh.body.innerHTML = `<div class="empty"><div class="big">🔁</div><p><b>Sin movimientos recurrentes</b></p>
          <p>Al crear un gasto, ingreso o transferencia, elige <b>Repetir</b> para que se apunte solo cada día, semana, mes o año.</p></div>`;
        return;
      }
      sh.body.innerHTML = `<div class="list">${S.recurring.map((r) => {
        const t = r.template;
        const isTr = t.type === 'transfer';
        const c = isTr ? null : getCategory(t.categoryId);
        const title = t.note || (isTr ? `${accName(t.accountId)} → ${accName(t.toAccountId)}` : c.name);
        const next = r.active ? `Próximo: ${shortDate(occurrenceDate(r, r.n))}` : 'Detenido';
        return `<div class="list-row${r.active ? '' : ' archived'}">${isTr ? TRANSFER_ICO : catIcon(c)}
          <span class="grow"><span class="t">${esc(title)}</span><span class="s">${FREQ[r.freq]} · ${next}</span></span>
          <span class="amt ${isTr ? 'neutral' : t.type}">${fmt(t.amount, accCur(t.accountId))}</span>
          ${r.active ? `<button class="icon-btn sm" data-stop="${r.id}" aria-label="Detener" title="Detener">${icon('pause')}</button>`
            : `<button class="icon-btn sm" data-resume="${r.id}" aria-label="Reanudar" title="Reanudar">${icon('play')}</button>`}
          <button class="icon-btn sm" data-del="${r.id}" aria-label="Eliminar regla" title="Eliminar">${icon('trash')}</button></div>`;
      }).join('')}</div>
      <p class="muted small">Los movimientos ya creados se conservan aunque detengas o elimines la regla.</p>`;
    };
    sh.refresh = draw;
    draw();
    sh.body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-stop],[data-resume],[data-del]');
      if (!b) return;
      const r = S.recurring.find((x) => x.id === (b.dataset.stop || b.dataset.resume || b.dataset.del));
      if (!r) return;
      if (b.dataset.stop) r.active = false;
      else if (b.dataset.resume) {
        r.active = true;
        const t = todayISO();
        while (occurrenceDate(r, r.n) < t) r.n++; // no rellena el tiempo en pausa
        generateRecurring();
      } else {
        if (!(await confirmDialog('¿Eliminar esta regla? Los movimientos ya creados se conservan.', { ok: 'Eliminar', danger: true }))) return;
        S.recurring = S.recurring.filter((x) => x !== r);
      }
      save();
      refreshAll();
    });
  }

  function openBudget() {
    const sh = openSheet({ title: 'Presupuesto' });
    const draw = () => {
      const s = S.settings;
      const d = computeView({ type: 'month', anchor: todayISO(), account: 'all' });
      const b = s.budget || 0;
      const pct = b ? Math.min(100, (d.expense / b) * 100) : 0;
      const left = b - d.expense;
      sh.body.innerHTML = `
        <p class="muted">En modo presupuesto, el centro del gráfico muestra cuánto te queda por gastar. El importe es mensual y se ajusta solo si ves días, semanas o años.</p>
        <label class="switch-row"><span><b>Modo presupuesto</b></span><input type="checkbox" class="switch" data-en ${s.budgetEnabled ? 'checked' : ''}></label>
        <label class="field mt"><span>Presupuesto mensual (${esc(s.currency)})</span><input data-amt inputmode="decimal" value="${b ? plain(b) : ''}" placeholder="p. ej. 1200"></label>
        ${b ? `<div class="budget-card">
          <div class="row-between"><span>${esc(periodLabel({ type: 'month', anchor: todayISO() }))}</span><b>${fmt(d.expense)} de ${fmt(b)}</b></div>
          <div class="bar big"><i style="width:${pct}%;background:${left < 0 ? 'var(--expense)' : pct > 85 ? 'var(--warn)' : 'var(--income)'}"></i></div>
          <div class="s">${left >= 0 ? `Te quedan ${fmt(left)}` : `Te has pasado ${fmt(-left)}`}</div></div>` : ''}`;
    };
    sh.refresh = draw;
    draw();
    sh.body.addEventListener('change', (e) => {
      if (e.target.matches('[data-en]')) {
        S.settings.budgetEnabled = e.target.checked;
        if (e.target.checked && !(S.settings.budget > 0)) setTimeout(() => $('[data-amt]', sh.body).focus(), 50);
      }
      if (e.target.matches('[data-amt]')) S.settings.budget = Math.max(0, round2(parseNum(e.target.value)));
      save();
      refreshAll();
    });
  }

  function openCurrencies() {
    const sh = openSheet({ title: 'Monedas' });
    const draw = () => {
      const base = S.settings.currency;
      const used = new Set(S.accounts.map((a) => a.currency));
      Object.keys(S.rates).forEach((c) => used.add(c));
      used.delete(base);
      sh.body.innerHTML = `
        <label class="field"><span>Moneda principal</span><select data-base>${currencyOptions(base)}</select></label>
        <p class="muted small">Los totales, el gráfico y el presupuesto se muestran en la moneda principal. Los tipos de cambio se introducen a mano para que la app funcione sin conexión.</p>
        <h4 class="sub-h">Tipos de cambio</h4>
        ${used.size ? `<div class="list">${[...used].map((c) => `<div class="list-row">
            <span class="cur-code">${c}</span><span class="grow s">${esc(curName(c))}</span>
            <span class="rate-line">1 ${c} = <input class="rate-input" data-rate="${c}" inputmode="decimal" value="${S.rates[c] ? plainRate(S.rates[c]) : ''}" placeholder="1"> ${base}</span>
            ${S.accounts.some((a) => a.currency === c) ? '' : `<button class="icon-btn sm" data-rm="${c}" aria-label="Quitar ${c}">${icon('trash')}</button>`}
          </div>`).join('')}</div>` : `<p class="muted">Todas tus cuentas usan ${base}.</p>`}
        <div class="row2 align-end mt"><label class="field"><span>Añadir moneda</span><select data-addcur>${currencyOptions('USD', [base, ...used])}</select></label>
          <button class="btn" data-add>Añadir</button></div>`;
    };
    sh.refresh = draw;
    draw();
    sh.body.addEventListener('change', async (e) => {
      const rate = e.target.dataset.rate;
      if (rate) {
        const v = parseNum(e.target.value);
        if (v > 0) { S.rates[rate] = v; save(); refreshAll(); } else toast('El tipo de cambio debe ser mayor que cero');
        return;
      }
      if (e.target.matches('[data-base]')) {
        const nb = e.target.value, ob = S.settings.currency;
        if (!(await confirmDialog(`¿Usar ${nb} como moneda principal? Los tipos de cambio y el presupuesto se recalcularán.`))) { e.target.value = ob; return; }
        const r = rateOf(nb); // 1 nb = r ob
        const nr = {};
        for (const [c, v] of Object.entries(S.rates)) if (c !== nb) nr[c] = v / r;
        nr[ob] = 1 / r;
        S.rates = nr;
        S.settings.currency = nb;
        S.settings.budget = round2(S.settings.budget / r);
        save();
        refreshAll();
        if (!(r > 0) || r === 1) toast('Revisa los tipos de cambio');
      }
    });
    sh.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) {
        const c = $('[data-addcur]', sh.body).value;
        if (!S.rates[c]) S.rates[c] = 1;
        save();
        draw();
        const inp = $(`[data-rate="${c}"]`, sh.body);
        if (inp) { inp.focus(); inp.select(); }
        return;
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) { delete S.rates[rm.dataset.rm]; save(); draw(); }
    });
  }

  // ---------------------------------------------------------------------------
  // Ajustes, datos y seguridad
  // ---------------------------------------------------------------------------
  function openSettings() {
    const sh = openSheet({ title: 'Ajustes' });
    const draw = () => {
      const s = S.settings;
      sh.body.innerHTML = `
        <h4 class="sub-h first">Apariencia</h4>
        <div class="seg full" data-theme-seg>${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => `<button data-v="${k}" class="${s.theme === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        <h4 class="sub-h">Calendario</h4>
        <div class="row2">
          <label class="field"><span>La semana empieza el</span><select data-s="weekStart"><option value="1">Lunes</option><option value="0">Domingo</option><option value="6">Sábado</option></select></label>
          <label class="field"><span>El mes empieza el día</span><select data-s="monthStart">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
        </div>
        <p class="muted small">Útil si cobras, por ejemplo, el día 25: los meses irán del 25 al 24.</p>
        <h4 class="sub-h">Saldo</h4>
        <label class="switch-row"><span><b>Arrastrar saldo</b><small>Suma al período el saldo acumulado anterior, incluidos los saldos iniciales de las cuentas.</small></span>
          <input type="checkbox" class="switch" data-s="carryOver" ${s.carryOver ? 'checked' : ''}></label>
        <h4 class="sub-h">Más</h4>
        <div class="list">
          <button class="list-row" data-go="cur">${icon('coins')}<span class="grow"><span class="t">Monedas</span><span class="s">Principal: ${esc(s.currency)}</span></span>${icon('chevR')}</button>
          <button class="list-row" data-go="budget">${icon('target')}<span class="grow"><span class="t">Presupuesto</span><span class="s">${s.budgetEnabled && s.budget ? fmt(s.budget) + ' al mes' : 'Desactivado'}</span></span>${icon('chevR')}</button>
          <button class="list-row" data-go="cats">${icon('tag')}<span class="grow"><span class="t">Categorías</span></span>${icon('chevR')}</button>
          <button class="list-row" data-go="sec">${icon('lock')}<span class="grow"><span class="t">Código de acceso</span><span class="s">${s.pinHash ? 'Activado' : 'Desactivado'}</span></span>${icon('chevR')}</button>
          <button class="list-row" data-go="data">${icon('download')}<span class="grow"><span class="t">Exportar y copias de seguridad</span></span>${icon('chevR')}</button>
        </div>
        <p class="muted small center mt">Cuentas Claras ${APP_VERSION}</p>`;
      $('[data-s=weekStart]', sh.body).value = String(s.weekStart);
      $('[data-s=monthStart]', sh.body).value = String(s.monthStart);
    };
    sh.refresh = draw;
    draw();
    sh.body.addEventListener('change', (e) => {
      const k = e.target.dataset.s;
      if (!k) return;
      S.settings[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
      save();
      refreshAll();
    });
    sh.body.addEventListener('click', (e) => {
      const th = e.target.closest('[data-theme-seg] [data-v]');
      if (th) { S.settings.theme = th.dataset.v; save(); refreshAll(); return; }
      const go = e.target.closest('[data-go]');
      if (go) ({ cur: openCurrencies, budget: openBudget, cats: () => openCategories('expense'), sec: openSecurity, data: openData })[go.dataset.go]();
    });
  }

  function openData() {
    const sh = openSheet({ title: 'Exportar y copias' });
    const draw = () => {
      sh.body.innerHTML = `
        <p class="muted">Tus datos se guardan solo en este navegador. Descarga una copia de seguridad de vez en cuando y úsala para pasar tus datos a otro dispositivo.</p>
        <h4 class="sub-h">Exportar a hoja de cálculo (CSV)</h4>
        <div class="btn-col">
          <button class="btn" data-a="csv-period">${icon('download')} Período visible · ${esc(periodLabel())}</button>
          <button class="btn" data-a="csv-all">${icon('download')} Todos los movimientos</button>
        </div>
        <h4 class="sub-h">Copia de seguridad</h4>
        <div class="btn-col">
          <button class="btn btn-primary" data-a="backup">${icon('download')} Descargar copia (.json)</button>
          <button class="btn" data-a="restore">${icon('upload')} Restaurar desde archivo</button>
          <input type="file" accept="application/json,.json" hidden data-file>
        </div>
        <h4 class="sub-h">Zona peligrosa</h4>
        <button class="btn btn-danger-ghost" data-a="wipe">${icon('trash')} Borrar todos los datos</button>
        <p class="muted small mt">${S.transactions.length} movimientos · ${S.accounts.length} cuentas · ${S.categories.length} categorías</p>`;
    };
    sh.refresh = draw;
    draw();
    sh.body.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]');
      if (!a) return;
      const act = a.dataset.a;
      if (act === 'csv-period') exportCSV(true);
      else if (act === 'csv-all') exportCSV(false);
      else if (act === 'backup') {
        download(`cuentas-claras-copia-${todayISO()}.json`, JSON.stringify({ app: 'cuentas-claras', exportedAt: new Date().toISOString(), ...S }, null, 2), 'application/json');
        toast('Copia descargada');
      } else if (act === 'restore') $('[data-file]', sh.body).click();
      else if (act === 'wipe') {
        if (!(await confirmDialog('Se borrarán todas las cuentas, categorías y movimientos de este dispositivo. ¿Has descargado una copia?', { ok: 'Borrar todo', danger: true }))) return;
        const theme = S.settings.theme;
        S = defaultState();
        S.settings.theme = theme;
        save();
        expanded.clear();
        closeSheet();
        refreshAll();
        toast('Datos borrados');
      }
    });
    sh.body.addEventListener('change', (e) => {
      if (!e.target.matches('[data-file]')) return;
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let obj;
        try {
          obj = JSON.parse(reader.result);
          if (!obj || !Array.isArray(obj.accounts) || !Array.isArray(obj.categories) || !Array.isArray(obj.transactions)) throw new Error('formato');
        } catch (err) { toast('El archivo no es una copia válida'); return; }
        if (!(await confirmDialog(`La copia contiene ${obj.transactions.length} movimientos. Reemplazará todos los datos actuales. ¿Continuar?`, { ok: 'Restaurar', danger: true }))) return;
        delete obj.app; delete obj.exportedAt;
        S = migrate(obj);
        S.view.anchor = todayISO();
        generateRecurring();
        save();
        expanded.clear();
        closeSheet();
        refreshAll();
        toast('Copia restaurada');
      };
      reader.readAsText(file);
    });
  }

  function exportCSV(onlyPeriod) {
    const { from, to } = onlyPeriod ? periodISO() : { from: null, to: null };
    const base = S.settings.currency;
    const num = (n) => (n == null ? '' : round2(n).toFixed(2).replace('.', ','));
    const q = (v) => { const s = String(v == null ? '' : v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [['Fecha', 'Tipo', 'Cuenta', 'Cuenta destino', 'Categoría', 'Importe', 'Moneda', `Importe en ${base}`, 'Nota']];
    const txs = S.transactions.filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
    for (const t of txs) {
      const cur = accCur(t.accountId);
      rows.push([t.date, { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia' }[t.type], accName(t.accountId),
        t.type === 'transfer' ? accName(t.toAccountId) : '', t.type === 'transfer' ? '' : getCategory(t.categoryId).name,
        num(t.type === 'expense' ? -t.amount : t.amount), cur, num(convert(t.type === 'expense' ? -t.amount : t.amount, cur, base)), t.note || '']);
    }
    const csv = '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
    download(`cuentas-claras-${from ? `${from}_${to}` : 'todo'}.csv`, csv, 'text/csv;charset=utf-8');
    toast(`${txs.length} movimiento(s) exportados`);
  }

  // El código solo evita miradas casuales: no cifra los datos.
  function hashPin(pin) {
    const s = 'cuentas-claras:' + pin;
    let h1 = 0x811c9dc5, h2 = 5381;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) + c) >>> 0;
    }
    return h1.toString(16) + h2.toString(16);
  }

  function mountPinPad(container, { title, subtitle = '', onComplete }) {
    let pin = '';
    container.innerHTML = `<div class="pin-wrap">
      <div class="pin-title">${esc(title)}</div><div class="pin-sub">${esc(subtitle)}</div>
      <div class="pin-dots">${'<i></i>'.repeat(4)}</div>
      <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
        <span></span><button data-n="0">0</button><button data-back aria-label="Borrar">${icon('backspace')}</button></div></div>`;
    const dots = $$('.pin-dots i', container);
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const press = (n) => {
      if (pin.length >= 4) return;
      pin += n;
      paint();
      if (pin.length === 4) setTimeout(() => onComplete(pin), 120);
    };
    const back = () => { pin = pin.slice(0, -1); paint(); };
    $('.pin-pad', container).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.back != null) back(); else press(b.dataset.n);
    });
    return {
      reset(msg) {
        pin = '';
        paint();
        if (msg) { $('.pin-sub', container).textContent = msg; shake($('.pin-dots', container)); }
      },
      key(e) {
        if (/^\d$/.test(e.key)) { press(e.key); return true; }
        if (e.key === 'Backspace') { back(); return true; }
        return false;
      },
    };
  }

  let lockEl = null;
  function showLock() {
    if (!S.settings.pinHash || lockEl) return;
    lockEl = document.createElement('div');
    lockEl.className = 'lock';
    lockEl.innerHTML = '<img src="icons/icon.svg" alt="" class="lock-logo"><div class="lock-body"></div>';
    document.body.appendChild(lockEl);
    const pad = mountPinPad($('.lock-body', lockEl), {
      title: 'Introduce tu código',
      onComplete: (p) => {
        if (hashPin(p) === S.settings.pinHash) { lockEl.remove(); lockEl = null; }
        else pad.reset('Código incorrecto');
      },
    });
    lockEl.padKey = pad.key;
  }

  function openSecurity() {
    const sh = openSheet({ title: 'Código de acceso' });
    let pad = null;
    const home = () => {
      pad = null;
      const on = !!S.settings.pinHash;
      sh.body.innerHTML = `<p class="muted">Protege la app con un código de 4 dígitos que se pedirá al abrirla.</p>
        <div class="list">${on
          ? `<button class="list-row" data-act="change">${icon('lock')}<span class="grow t">Cambiar código</span>${icon('chevR')}</button>
             <button class="list-row" data-act="off">${icon('close')}<span class="grow t">Desactivar código</span>${icon('chevR')}</button>`
          : `<button class="list-row" data-act="on">${icon('lock')}<span class="grow t">Activar código</span>${icon('chevR')}</button>`}</div>
        ${on ? `<label class="switch-row"><span><b>Bloqueo automático</b><small>Pide el código si la app pasa más de 1 minuto en segundo plano.</small></span>
          <input type="checkbox" class="switch" data-auto ${S.settings.autoLock ? 'checked' : ''}></label>` : ''}
        <p class="muted small mt">El código evita el acceso casual desde este dispositivo, pero no cifra los datos.</p>`;
    };
    const ask = (title, subtitle, cb) => {
      sh.body.innerHTML = '<div class="pin-host"></div>';
      pad = mountPinPad($('.pin-host', sh.body), { title, subtitle, onComplete: cb });
    };
    const setNew = () => ask('Nuevo código', 'Elige 4 dígitos', (p1) => ask('Confirma el código', 'Repite los 4 dígitos', (p2) => {
      if (p1 !== p2) { toast('Los códigos no coinciden'); setNew(); return; }
      S.settings.pinHash = hashPin(p1);
      save();
      toast('Código activado');
      home();
    }));
    const verify = (then) => ask('Código actual', '', (p) => { if (hashPin(p) === S.settings.pinHash) then(); else pad.reset('Código incorrecto'); });
    sh.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'on') setNew();
      else if (act === 'change') verify(setNew);
      else if (act === 'off') verify(() => { S.settings.pinHash = null; save(); toast('Código desactivado'); home(); });
    });
    sh.body.addEventListener('change', (e) => {
      if (e.target.matches('[data-auto]')) { S.settings.autoLock = e.target.checked; save(); }
    });
    sh.onKey = (e) => (pad ? pad.key(e) : false);
    home();
  }

  // ---------------------------------------------------------------------------
  // Tema
  // ---------------------------------------------------------------------------
  const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const t = S.settings.theme;
    const root = document.documentElement;
    if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'auto' && darkQuery && darkQuery.matches);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0c3b37' : '#0f766e');
  }
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

  // ---------------------------------------------------------------------------
  // Arranque y eventos globales
  // ---------------------------------------------------------------------------
  function bind() {
    $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
    $('#btnMenu').addEventListener('click', openMenu);
    $('#btnAccount').addEventListener('click', openAccountSwitch);
    $('#btnSearch').addEventListener('click', openSearch);
    $('#btnTransfer').addEventListener('click', () => openTxSheet({ type: 'transfer' }));
    $('#prevPeriod').addEventListener('click', () => shiftPeriod(-1));
    $('#nextPeriod').addEventListener('click', () => shiftPeriod(1));
    $('#periodLabel').addEventListener('click', openPeriodSheet);
    $('#btnAddExpense').addEventListener('click', () => openTxSheet({ type: 'expense' }));
    $('#btnAddIncome').addEventListener('click', () => openTxSheet({ type: 'income' }));

    const ring = $('#ring');
    ring.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.cat) openTxSheet({ type: 'expense', categoryId: b.dataset.cat });
      else if (b.dataset.more != null) openTxSheet({ type: 'expense' });
      else if (b.dataset.addcat != null) openCategoryForm(null, 'expense');
    });
    // Deslizar a izquierda/derecha cambia de período, como en el gráfico de Monefy.
    let sx = null, sy = null;
    const swipeArea = $('.overview');
    swipeArea.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    swipeArea.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftPeriod(dx < 0 ? 1 : -1);
    });

    $('.list-mode').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      S.settings.listMode = b.dataset.mode;
      save();
      render();
    });
    $('#txList').addEventListener('click', (e) => {
      const g = e.target.closest('[data-group]');
      if (g) {
        const k = g.dataset.group;
        if (expanded.has(k)) expanded.delete(k); else expanded.add(k);
        render();
        return;
      }
      const r = e.target.closest('[data-tx]');
      if (r) { const t = S.transactions.find((x) => x.id === r.dataset.tx); if (t) openTxSheet({ tx: t }); }
    });

    document.addEventListener('keydown', (e) => {
      if (lockEl) { if (lockEl.padKey(e)) e.preventDefault(); return; }
      if ($('.dialog-ov')) return;
      const top = stack[stack.length - 1];
      if (e.key === 'Escape' && top) { e.preventDefault(); closeSheet(); return; }
      if (top) { if (top.onKey && top.onKey(e)) e.preventDefault(); return; }
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft') shiftPeriod(-1);
      else if (e.key === 'ArrowRight') shiftPeriod(1);
      else if (e.key === '-') { e.preventDefault(); openTxSheet({ type: 'expense' }); }
      else if (e.key === '+') { e.preventDefault(); openTxSheet({ type: 'income' }); }
      else if (e.key === '/') { e.preventDefault(); openSearch(); }
    });

    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (generateRecurring()) refreshAll();
      if (S.settings.pinHash && S.settings.autoLock && hiddenAt && Date.now() - hiddenAt > 60000) showLock();
    });
    // Mantiene sincronizadas varias pestañas abiertas.
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try { S = migrate(JSON.parse(e.newValue)); refreshAll(); } catch (err) { /* ignorar */ }
    });
  }

  function init() {
    S.view.anchor = todayISO();
    generateRecurring();
    bind();
    render();
    showLock();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  init();
})();

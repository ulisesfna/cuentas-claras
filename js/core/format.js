// Formato de importes y fechas (Intl, sin DOM).
import { LOCALE } from './constants.js';
import { cap, fromISO, toISO, addDays, todayISO } from './util.js';

let defaultCurrency = 'EUR';
// La interfaz fija la moneda principal para no tener que pasarla en cada llamada.
export const setDefaultCurrency = (c) => { defaultCurrency = c; };

const nfCache = new Map();
export function fmt(n, cur = defaultCurrency) {
  let nf = nfCache.get(cur);
  if (!nf) {
    try { nf = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur }); }
    catch (e) { nf = { format: (x) => x.toFixed(2).replace('.', ',') + ' ' + cur }; }
    nfCache.set(cur, nf);
  }
  return nf.format(Math.abs(n) < 0.005 ? 0 : n);
}
export const fmtSigned = (n, cur) => (n > 0.004 ? '+' : n < -0.004 ? '−' : '') + fmt(Math.abs(n), cur);
export const signCls = (n) => (n < -0.004 ? 'expense' : n > 0.004 ? 'income' : '');

let currencyNames = null;
try { currencyNames = new Intl.DisplayNames([LOCALE], { type: 'currency' }); } catch (e) { /* sin nombres */ }
export const curName = (c) => { try { return currencyNames ? currencyNames.of(c) : c; } catch (e) { return c; } };

export const dfDay = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
export const dfShort = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
export const dfShortY = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
export const dfMonth = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
export const dfFull = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
export const dfMonthShort = new Intl.DateTimeFormat(LOCALE, { month: 'short' });
export const nfCompact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
export const nfInt = new Intl.NumberFormat(LOCALE, { useGrouping: true });
let rtf = null;
try { rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' }); } catch (e) { /* sin formato relativo */ }

export function shortDate(iso, today = todayISO()) {
  const d = fromISO(iso);
  return d.getFullYear() === fromISO(today).getFullYear() ? dfShort.format(d) : dfShortY.format(d);
}
// «hace 3 días», «hace 2 minutos»…
export function relTime(ms, now = Date.now()) {
  const diff = (ms - now) / 1000;
  const abs = Math.abs(diff);
  const [v, u] = abs < 60 ? [diff, 'second'] : abs < 3600 ? [diff / 60, 'minute'] : abs < 86400 ? [diff / 3600, 'hour'] : [diff / 86400, 'day'];
  return rtf ? rtf.format(Math.round(v), u) : new Date(ms).toLocaleString(LOCALE);
}
export function dayLabel(iso, today = todayISO()) {
  const t = fromISO(today);
  if (iso === today) return 'Hoy';
  if (iso === toISO(addDays(t, -1))) return 'Ayer';
  if (iso === toISO(addDays(t, 1))) return 'Mañana';
  const d = fromISO(iso);
  return cap(dfDay.format(d)) + (d.getFullYear() !== t.getFullYear() ? ` de ${d.getFullYear()}` : '');
}

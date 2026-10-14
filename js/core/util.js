// Utilidades puras: texto, números y fechas (sin DOM ni estado).

let seq = 0;
export const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 7);
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Fechas como cadenas ISO locales (AAAA-MM-DD): se comparan como texto.
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
// Suma meses conservando el día; si el mes destino es más corto, usa su último día.
export function addMonths(d, n, day = d.getDate()) {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return t;
}
export const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000) + 1;
export const validISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(fromISO(s)) === s;

// Fecha con día `day` (ajustado al último día si el mes es más corto) en el mes `m` del año `y`.
export const dayInMonth = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
export function onOrBefore(day, ref) {
  const d = dayInMonth(ref.getFullYear(), ref.getMonth(), day);
  return d > ref ? dayInMonth(ref.getFullYear(), ref.getMonth() - 1, day) : d;
}
export function after(day, ref) {
  const d = dayInMonth(ref.getFullYear(), ref.getMonth(), day);
  return d <= ref ? dayInMonth(ref.getFullYear(), ref.getMonth() + 1, day) : d;
}

// Número escrito por una persona: «1.234,56», «12,5», «-3.5».
export function parseNum(s) {
  let t = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}
// Número "plano" con coma decimal, sin separador de miles (para el teclado y los campos).
export const plain = (n) => round2(n || 0).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
export const plainRate = (n) => String(+(+n).toFixed(6)).replace('.', ',');

export const isStr = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
export const isNum = (n) => typeof n === 'number' && isFinite(n);
export const dayOrNull = (n) => (Number.isInteger(n) && n >= 1 && n <= 31 ? n : null);

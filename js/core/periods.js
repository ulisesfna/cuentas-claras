// Períodos de la vista (día, semana, mes con inicio configurable, año, intervalo o todo).
import { addDays, cap, daysBetween, fromISO, toISO, todayISO } from './util.js';
import { dfFull, dfMonth, dfShort, dfShortY } from './format.js';

// `settings` aporta weekStart (0 = domingo, 1 = lunes, 6 = sábado) y monthStart (1-28).
export function periodRange(v, settings) {
  const a = fromISO(v.anchor);
  switch (v.type) {
    case 'day': return { from: a, to: a };
    case 'week': {
      const f = addDays(a, -((a.getDay() - settings.weekStart + 7) % 7));
      return { from: f, to: addDays(f, 6) };
    }
    case 'month': {
      const ms = settings.monthStart;
      const f = a.getDate() >= ms ? new Date(a.getFullYear(), a.getMonth(), ms) : new Date(a.getFullYear(), a.getMonth() - 1, ms);
      return { from: f, to: addDays(new Date(f.getFullYear(), f.getMonth() + 1, ms), -1) };
    }
    case 'year': return { from: new Date(a.getFullYear(), 0, 1), to: new Date(a.getFullYear(), 11, 31) };
    case 'range': return { from: fromISO(v.from), to: fromISO(v.to) };
    default: return { from: null, to: null };
  }
}

export function periodISO(v, settings) {
  const r = periodRange(v, settings);
  return { from: r.from ? toISO(r.from) : null, to: r.to ? toISO(r.to) : null };
}

export function periodLabel(v, settings, today = todayISO()) {
  const r = periodRange(v, settings);
  switch (v.type) {
    case 'day': {
      const iso = toISO(r.from);
      if (iso === today) return 'Hoy';
      if (iso === toISO(addDays(fromISO(today), -1))) return 'Ayer';
      return cap(dfFull.format(r.from));
    }
    case 'week': return `${dfShort.format(r.from)} – ${dfShortY.format(r.to)}`;
    case 'month': return settings.monthStart === 1 ? cap(dfMonth.format(r.from)) : `${dfShort.format(r.from)} – ${dfShortY.format(r.to)}`;
    case 'year': return String(r.from.getFullYear());
    case 'range': return `${dfShortY.format(r.from)} – ${dfShortY.format(r.to)}`;
    default: return 'Todo el historial';
  }
}

// Desplaza la vista un período hacia delante (dir = 1) o hacia atrás (dir = -1). Modifica `v`.
export function shiftView(v, dir, settings) {
  if (v.type === 'all') return v;
  const r = periodRange(v, settings);
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
  return v;
}

// Fecha propuesta para un movimiento nuevo: hoy si cae en el período; si no, su extremo más cercano.
export function defaultTxDate(v, settings, today = todayISO()) {
  const { from, to } = periodISO(v, settings);
  if ((!from || today >= from) && (!to || today <= to)) return today;
  return to && today > to ? to : from;
}

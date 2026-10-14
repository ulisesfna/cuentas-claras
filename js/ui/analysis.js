// Análisis: ingresos y gastos por mes, comparación con el mes anterior, media diaria,
// evolución por categoría y gasto por etiqueta. Respeta la cuenta y la etiqueta de la vista.
import { addDays, cap, daysBetween, esc, fromISO, toISO, todayISO } from '../core/util.js';
import { dfMonth, dfMonthShort, fmt, fmtSigned, nfCompact, signCls } from '../core/format.js';
import { periodRange } from '../core/periods.js';
import { computeView, convert, getAccount, getCategory, tagStats, viewCurrency } from '../core/ledger.js';
import { monthlyBudget } from '../core/budget.js';
import { $, $$, catIcon, closeSheet, openSheet } from './dom.js';
import { S } from './store.js';
import { setTagFilter } from './tags.js';

// Tope "redondo" para el eje: 1, 2, 2,5 o 5 por potencia de diez.
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
// Columna con el extremo superior redondeado (4 px) y la base recta.
function colPath(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
const pctDelta = (now, prev) => (prev > 0.004 ? ((now - prev) / prev) * 100 : null);
// Variación con flecha y palabra (no solo color); `upIsGood` decide el tono.
function deltaHTML(now, prev, upIsGood, cur, what = 'que el mes pasado') {
  const p = pctDelta(now, prev);
  if (p == null) return '<span class="delta">sin datos del mes anterior</span>';
  if (Math.abs(p) < 0.5) return `<span class="delta">→ igual ${what} (${fmt(prev, cur)})</span>`;
  const up = p > 0;
  return `<span class="delta ${up === upIsGood ? 'good' : 'bad'}">${up ? '↑' : '↓'} ${Math.abs(Math.round(p))} % ${up ? 'más' : 'menos'} ${what} (${fmt(prev, cur)})</span>`;
}

export function openAnalysis() {
  let months = 6;
  const sh = openSheet({ title: 'Análisis', cls: 'sheet-tall sheet-wide' });
  const draw = () => {
    const acc = S.view.account;
    const tag = S.view.tag || null;
    const cur = viewCurrency(S, S.view);
    const today = todayISO();
    const curR = periodRange({ type: 'month', anchor: today }, S.settings);
    const start = curR.from;
    const view = (o) => ({ account: acc, tag, ...o });
    const buckets = [];
    for (let k = months - 1; k >= 0; k--) {
      const anchor = toISO(new Date(start.getFullYear(), start.getMonth() - k, start.getDate()));
      const d = computeView(S, view({ type: 'month', anchor }));
      buckets.push({ d, from: fromISO(d.from), current: k === 0, label: dfMonthShort.format(fromISO(d.from)).replace('.', '') });
    }
    // Mes en curso frente al mismo punto del mes anterior (comparación justa).
    const elapsed = daysBetween(toISO(start), today);
    const prevFrom = new Date(start.getFullYear(), start.getMonth() - 1, start.getDate());
    const prevTo = addDays(start, -1);
    const prevSameTo = addDays(prevFrom, elapsed - 1) > prevTo ? prevTo : addDays(prevFrom, elapsed - 1);
    const now = computeView(S, view({ type: 'range', from: toISO(start), to: today, anchor: toISO(start) }));
    const prevSame = computeView(S, view({ type: 'range', from: toISO(prevFrom), to: toISO(prevSameTo), anchor: toISO(prevFrom) }));
    const prevFull = computeView(S, view({ type: 'month', anchor: toISO(prevFrom) }));
    const daysInMonth = daysBetween(toISO(start), toISO(curR.to));
    const avgNow = now.expense / elapsed;
    const avgPrev = prevFull.expense / daysBetween(toISO(prevFrom), toISO(prevTo));
    const projection = avgNow * daysInMonth;
    const budget = !tag && monthlyBudget(S) > 0 ? convert(S, monthlyBudget(S), S.settings.currency, cur) : 0;

    // Medias de los meses cerrados (el mes en curso está incompleto).
    const closed = buckets.filter((b) => !b.current);
    const avg = (f) => (closed.length ? closed.reduce((s, b) => s + f(b.d), 0) / closed.length : 0);
    const avgIn = avg((d) => d.income), avgOut = avg((d) => d.expense);
    const rate = avgIn > 0 ? ((avgIn - avgOut) / avgIn) * 100 : null;

    // Cambios por categoría (mismo número de días).
    const prevMap = new Map(prevSame.exp.map((g) => [g.key, g.total]));
    const nowMap = new Map(now.exp.map((g) => [g.key, g.total]));
    const changes = [...new Set([...prevMap.keys(), ...nowMap.keys()])]
      .map((k) => ({ cat: getCategory(S, k), now: nowMap.get(k) || 0, prev: prevMap.get(k) || 0 }))
      .map((c) => ({ ...c, diff: c.now - c.prev }))
      .filter((c) => Math.abs(c.diff) > 0.004)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 5);

    // Evolución de las categorías con más gasto en el período.
    const totals = new Map();
    buckets.forEach((b) => b.d.exp.forEach((g) => totals.set(g.key, (totals.get(g.key) || 0) + g.total)));
    const topCats = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, total]) => ({
      cat: getCategory(S, k), total, series: buckets.map((b) => { const g = b.d.exp.find((x) => x.key === k); return g ? g.total : 0; }),
    }));

    // Gasto por etiqueta en todo el rango (sin el filtro de etiqueta).
    const tagsAll = tag ? [] : tagStats(S, { type: 'range', from: toISO(buckets[0].from), to: today, anchor: toISO(buckets[0].from), account: acc }).tags
      .filter((t) => t.expense > 0.004).slice(0, 8);
    const tagMax = Math.max(1, ...tagsAll.map((t) => t.expense));

    const accObj = getAccount(S, acc);
    sh.body.innerHTML = `
      <div class="an-filters">
        <div class="seg" role="tablist" aria-label="Período del análisis">${[6, 12].map((n) => `<button data-months="${n}" role="tab" class="${n === months ? 'active' : ''}" aria-selected="${n === months}">${n} meses</button>`).join('')}</div>
        <span class="muted small">${accObj ? `${esc(accObj.icon)} ${esc(accObj.name)}` : 'Todas las cuentas'}${tag ? ` · solo <b>#${esc(tag)}</b>` : ''} · ${esc(cur)}</span>
      </div>

      <section class="an-card">
        <h3>Ingresos y gastos por mes</h3>
        <div class="legend"><span><i class="sw in"></i>Ingresos</span><span><i class="sw out"></i>Gastos</span></div>
        <div class="chart-box" data-chart></div>
        <p class="muted small">${closed.length ? `Media de los ${closed.length} meses cerrados: ingresos <b>${fmt(avgIn, cur)}</b>, gastos <b>${fmt(avgOut, cur)}</b>${rate != null ? `, ahorro <b>${fmt(avgIn - avgOut, cur)}</b> (${Math.round(rate)} % de los ingresos)` : ''}.` : ''} El mes en curso (*) aún no ha terminado.</p>
        <details class="table-view"><summary>Ver como tabla</summary>
          <table><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th></tr></thead><tbody>
          ${buckets.map((b) => `<tr><td>${esc(cap(dfMonth.format(b.from)))}${b.current ? ' *' : ''}</td><td>${fmt(b.d.income, cur)}</td><td>${fmt(b.d.expense, cur)}</td><td class="${signCls(b.d.income - b.d.expense)}">${fmtSigned(b.d.income - b.d.expense, cur)}</td></tr>`).join('')}
          </tbody></table></details>
      </section>

      <section class="an-card">
        <h3>Este mes frente al anterior</h3>
        <p class="muted small">Del día 1 al ${elapsed} de cada mes, para comparar lo mismo.</p>
        <div class="tiles">
          <div class="tile"><span>Gastos</span><b>${fmt(now.expense, cur)}</b>${deltaHTML(now.expense, prevSame.expense, false, cur)}</div>
          <div class="tile"><span>Ingresos</span><b>${fmt(now.income, cur)}</b>${deltaHTML(now.income, prevSame.income, true, cur)}</div>
          <div class="tile"><span>Balance</span><b>${fmtSigned(now.income - now.expense, cur)}</b><span class="delta">mes pasado a estas alturas: ${fmtSigned(prevSame.income - prevSame.expense, cur)}</span></div>
        </div>
        ${changes.length ? `<h4 class="sub-h">Lo que más ha cambiado</h4><div class="list">${changes.map((c) => `<div class="list-row">${catIcon(c.cat)}
          <span class="grow"><span class="t">${esc(c.cat.name)}</span><span class="s">${fmt(c.now, cur)} ahora · ${fmt(c.prev, cur)} el mes pasado</span></span>
          <span class="delta ${c.diff > 0 ? 'bad' : 'good'}">${c.diff > 0 ? '↑ +' : '↓ −'}${fmt(Math.abs(c.diff), cur)}</span></div>`).join('')}</div>` : ''}
      </section>

      <section class="an-card">
        <h3>Media diaria de gasto</h3>
        <div class="tiles">
          <div class="tile"><span>Este mes</span><b>${fmt(avgNow, cur)}<small> /día</small></b>${deltaHTML(avgNow, avgPrev, false, cur, 'que la media del mes pasado')}</div>
          <div class="tile"><span>Mes anterior</span><b>${fmt(avgPrev, cur)}<small> /día</small></b><span class="delta">${fmt(prevFull.expense, cur)} en total</span></div>
          <div class="tile"><span>Previsión a fin de mes</span><b>${fmt(projection, cur)}</b>${budget ? `<span class="delta ${projection > budget ? 'bad' : 'good'}">${projection > budget ? '⚠ por encima' : '✓ por debajo'} del presupuesto (${fmt(budget, cur)})</span>` : '<span class="delta">si sigues al mismo ritmo</span>'}</div>
        </div>
      </section>

      <section class="an-card">
        <h3>Evolución por categoría</h3>
        <p class="muted small">Gasto mensual de las categorías principales en los últimos ${months} meses (los gastos divididos cuentan en cada una de sus categorías). Cada fila tiene su propia escala; el mes en curso va en color.</p>
        ${topCats.length ? `<div class="list">${topCats.map((c) => {
          const mx = Math.max(...c.series) || 1;
          const bw = 8, gap = 3, h = 30;
          const svg = c.series.map((v, i) => {
            const bh = Math.max(v > 0 ? 2 : 0, (v / mx) * h);
            return `<path d="${colPath(i * (bw + gap), h - bh, bw, bh)}" fill="${buckets[i].current ? esc(c.cat.color) : 'var(--viz-muted)'}"><title>${esc(cap(dfMonth.format(buckets[i].from)))}: ${esc(fmt(v, cur))}</title></path>`;
          }).join('');
          const baseline = `<line x1="0" x2="${c.series.length * (bw + gap) - gap}" y1="${h - 0.5}" y2="${h - 0.5}" class="spark-base"/>`;
          const closedVals = c.series.slice(0, -1);
          const avgC = closedVals.length ? closedVals.reduce((s, v) => s + v, 0) / closedVals.length : 0;
          return `<div class="list-row evo-row">${catIcon(c.cat)}<span class="grow"><span class="t">${esc(c.cat.name)}</span>
            <span class="s">Media ${fmt(avgC, cur)}/mes · este mes ${fmt(c.series[c.series.length - 1], cur)}</span></span>
            <svg class="spark" width="${c.series.length * (bw + gap) - gap}" height="${h}" viewBox="0 0 ${c.series.length * (bw + gap) - gap} ${h}" role="img" aria-label="${esc(c.cat.name)}: ${c.series.map((v, i) => `${buckets[i].label} ${fmt(v, cur)}`).join(', ')}">${baseline}${svg}</svg></div>`;
        }).join('')}</div>` : '<p class="muted">Aún no hay gastos en este período.</p>'}
      </section>

      ${tag ? '' : `<section class="an-card">
        <h3>Gasto por etiqueta</h3>
        <p class="muted small">Últimos ${months} meses. Un movimiento con varias etiquetas cuenta en todas, así que estas cifras no se suman entre sí. Toca una para ver solo sus movimientos.</p>
        ${tagsAll.length ? `<div class="list">${tagsAll.map((t) => `<button class="list-row tag-row" data-tagfilter="${esc(t.name)}">
          <span class="tag-badge">#</span><span class="grow"><span class="row-between"><span class="t">${esc(t.name)}</span><b>${fmt(t.expense, cur)}</b></span>
          <span class="hbar out"><i style="width:${(t.expense / tagMax) * 100}%"></i></span><span class="s">${t.count} movimiento(s)</span></span></button>`).join('')}</div>`
          : '<p class="muted">Ningún gasto con etiquetas en este período. Añádelas al crear o editar un movimiento.</p>'}
      </section>`}`;
    drawMonthChart($('[data-chart]', sh.body), buckets, cur);
  };
  sh.refresh = draw;
  draw();
  sh.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-months]');
    if (b) { months = Number(b.dataset.months); draw(); return; }
    const t = e.target.closest('[data-tagfilter]');
    if (t) { setTagFilter(t.dataset.tagfilter); closeSheet(); }
  });
}

// Columnas agrupadas (ingresos y gastos) con un único eje, rejilla fina y tooltip por mes.
function drawMonthChart(box, buckets, cur) {
  const W = Math.max(280, box.clientWidth || 320), H = 210;
  const m = { l: 44, r: 6, t: 10, b: 24 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const max = niceMax(Math.max(...buckets.map((b) => Math.max(b.d.income, b.d.expense))));
  const y = (v) => m.t + ph - (v / max) * ph;
  const band = pw / buckets.length;
  const bw = Math.max(4, Math.min(24, (band * 0.72 - 2) / 2));
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, yy = y(v);
    grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="${i ? 'grid' : 'base'}"/><text x="${m.l - 6}" y="${yy + 4}" text-anchor="end" class="tick">${esc(nfCompact.format(v))}</text>`;
  }
  let bars = '', hits = '';
  buckets.forEach((b, i) => {
    const cx = m.l + band * i + band / 2;
    const x0 = cx - bw - 1;
    const hi = ph * (b.d.income / max), he = ph * (b.d.expense / max);
    bars += `<path class="bar-in" d="${colPath(x0, m.t + ph - hi, bw, hi)}"/><path class="bar-out" d="${colPath(cx + 1, m.t + ph - he, bw, he)}"/>`;
    bars += `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="tick${b.current ? ' now' : ''}">${esc(b.label)}${b.current ? '*' : ''}</text>`;
    hits += `<rect class="hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph}" data-i="${i}" tabindex="0" role="img"
      aria-label="${esc(cap(dfMonth.format(b.from)))}: ingresos ${esc(fmt(b.d.income, cur))}, gastos ${esc(fmt(b.d.expense, cur))}"/>`;
  });
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="month-chart" role="group" aria-label="Ingresos y gastos por mes">${grid}${bars}${hits}</svg><div class="chart-tip" hidden></div>`;
  const tip = $('.chart-tip', box);
  const show = (el) => {
    const b = buckets[+el.dataset.i];
    const bal = b.d.income - b.d.expense;
    tip.innerHTML = `<b>${esc(cap(dfMonth.format(b.from)))}${b.current ? ' (en curso)' : ''}</b>
      <span><i class="sw in"></i>Ingresos <b>${fmt(b.d.income, cur)}</b></span><span><i class="sw out"></i>Gastos <b>${fmt(b.d.expense, cur)}</b></span>
      <span>Balance <b>${fmtSigned(bal, cur)}</b></span>`;
    tip.hidden = false;
    $$('.hit', box).forEach((h) => h.classList.toggle('on', h === el));
    // Al lado del mes señalado (nunca encima de sus columnas).
    const x0 = +el.getAttribute('x');
    const right = x0 + band + 6;
    tip.style.left = `${right + tip.offsetWidth <= W ? right : Math.max(0, x0 - tip.offsetWidth - 6)}px`;
  };
  const hide = () => { tip.hidden = true; $$('.hit', box).forEach((h) => h.classList.remove('on')); };
  $$('.hit', box).forEach((h) => {
    h.addEventListener('pointerenter', () => show(h));
    h.addEventListener('pointerdown', () => show(h));
    h.addEventListener('focus', () => show(h));
    h.addEventListener('blur', hide);
  });
  $('svg', box).addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
}

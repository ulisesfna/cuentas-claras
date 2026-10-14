// Selector de período y búsqueda.
import { esc, norm, plain, todayISO } from '../core/util.js';
import { periodISO } from '../core/periods.js';
import { accName, byDateDesc, getCategory, txParts } from '../core/ledger.js';
import { $, closeSheet, icon, openSheet, toast } from './dom.js';
import { S, save } from './store.js';
import { itemRow, render } from './screen.js';
import { openTxSheet } from './tx-editor.js';

export function openPeriodSheet() {
  const sh = openSheet({ title: 'Período' });
  const v = S.view;
  const cur = periodISO(v, S.settings);
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

export function openSearch() {
  const sh = openSheet({ title: 'Buscar', cls: 'sheet-tall' });
  sh.body.innerHTML = `<div class="search-box">${icon('search')}<input type="search" placeholder="Nota, categoría, cuenta, #etiqueta o importe" autocomplete="off" aria-label="Buscar movimientos"></div>
    <div class="search-results"></div>`;
  const input = $('input', sh.body), out = $('.search-results', sh.body);
  const run = () => {
    const q = norm(input.value.trim());
    if (!q) { out.innerHTML = `<p class="muted center">Busca entre ${S.transactions.length} movimientos.</p>`; return; }
    const res = S.transactions.filter((t) => {
      const cats = t.type === 'transfer' ? 'transferencia' : txParts(t).map((p) => getCategory(S, p.categoryId).name).join(' ');
      const hay = [t.note, cats, accName(S, t.accountId), t.toAccountId ? accName(S, t.toAccountId) : '',
        plain(t.amount), t.amount.toFixed(2), t.date, (t.tags || []).map((g) => '#' + g).join(' ')].join(' ');
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

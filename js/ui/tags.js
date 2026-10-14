// Etiquetas: campo de edición y pantalla de etiquetas (totales, filtro, renombrar, quitar).
import { esc, uid } from '../core/util.js';
import { fmt, shortDate } from '../core/format.js';
import { periodLabel } from '../core/periods.js';
import { tagStats } from '../core/ledger.js';
import { addTag, allTags, cleanTag, deleteTag, renameTag, tagKey, uniqueTags } from '../core/tags.js';
import { $, closeSheet, confirmDialog, icon, openSheet, promptText, toast } from './dom.js';
import { S, save } from './store.js';
import { refreshAll } from './screen.js';

// Campo con «chips»: Intro o coma añaden la etiqueta; Retroceso con el campo vacío quita la última.
export function mountTagInput(container, initial = []) {
  let tags = uniqueTags(initial);
  const listId = 'tags-' + uid();
  container.innerHTML = `<div class="tag-input">${icon('hash')}<span class="tag-chips"></span>
    <input type="text" list="${listId}" placeholder="${tags.length ? 'Otra etiqueta' : 'Etiquetas (p. ej. vacaciones)'}" aria-label="Añadir etiqueta" autocomplete="off" enterkeyhint="done" maxlength="40">
    <datalist id="${listId}">${allTags(S).slice(0, 50).map((t) => `<option value="${esc(t.name)}"></option>`).join('')}</datalist></div>`;
  const chips = $('.tag-chips', container), input = $('input', container);
  const paint = () => {
    chips.innerHTML = tags.map((t, i) => `<span class="tag-chip">#${esc(t)}<button type="button" data-rm="${i}" aria-label="Quitar etiqueta ${esc(t)}">×</button></span>`).join('');
    input.placeholder = tags.length ? 'Otra etiqueta' : 'Etiquetas (p. ej. vacaciones)';
  };
  const commit = () => {
    if (!input.value.trim()) return;
    input.value.split(',').forEach((x) => { tags = addTag(tags, x); });
    input.value = '';
    paint();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      if (!input.value.trim()) return; // Intro con el campo vacío sigue guardando el movimiento
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === 'Backspace' && !input.value && tags.length) {
      tags = tags.slice(0, -1);
      paint();
    }
  });
  input.addEventListener('blur', commit);
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (b) { tags = tags.filter((_, i) => i !== +b.dataset.rm); paint(); input.focus(); }
  });
  paint();
  return { get: () => { commit(); return [...tags]; } };
}

// Activa (o quita) el filtro por etiqueta de la pantalla principal.
export function setTagFilter(tag) {
  S.view.tag = tag ? cleanTag(tag) : null;
  save();
  refreshAll();
}

export function openTags() {
  let scope = 'period';
  const sh = openSheet({ title: 'Etiquetas', cls: 'sheet-tall' });
  const draw = () => {
    const view = scope === 'period' ? { ...S.view, tag: null } : { type: 'all', anchor: S.view.anchor, account: S.view.account, tag: null };
    const { cur, tags } = tagStats(S, view);
    const known = allTags(S);
    const max = Math.max(1, ...tags.map((t) => Math.max(t.expense, t.income)));
    const where = scope === 'period' ? periodLabel(S.view, S.settings) : 'todo el historial';
    sh.body.innerHTML = `
      <div class="seg full" role="tablist">${[['period', 'Este período'], ['all', 'Todo el historial']].map(([k, l]) => `<button data-scope="${k}" role="tab" class="${k === scope ? 'active' : ''}" aria-selected="${k === scope}">${l}</button>`).join('')}</div>
      <p class="muted small">Una etiqueta agrupa movimientos de distintas categorías por su motivo: un viaje, una boda, una reforma. Toca una para ver solo sus movimientos en la pantalla principal. Un movimiento puede llevar varias, así que estos totales no se suman entre sí.</p>
      ${tags.length ? `<div class="list">${tags.map((t) => {
        const v = t.expense > 0 ? t.expense : t.income;
        const active = S.view.tag && tagKey(S.view.tag) === t.key;
        return `<div class="list-row tag-row${active ? ' active' : ''}">
          <button class="grow-btn" data-filter="${esc(t.name)}" aria-label="Ver solo #${esc(t.name)}">
            <span class="tag-badge">#</span>
            <span class="grow"><span class="t">${esc(t.name)}${active ? ' <span class="pill">Filtrando</span>' : ''}</span>
              <span class="s">${t.count} movimiento(s)${t.expense ? ` · gastos ${fmt(t.expense, cur)}` : ''}${t.income ? ` · ingresos ${fmt(t.income, cur)}` : ''} · último ${esc(shortDate(t.last))}</span>
              <span class="hbar"><i style="width:${(v / max) * 100}%"></i></span></span>
          </button>
          <button class="icon-btn sm" data-rename="${esc(t.name)}" aria-label="Renombrar #${esc(t.name)}" title="Renombrar">${icon('edit')}</button>
          <button class="icon-btn sm" data-del="${esc(t.name)}" aria-label="Quitar #${esc(t.name)} de todos los movimientos" title="Quitar">${icon('trash')}</button></div>`;
      }).join('')}</div>`
        : `<div class="empty"><div class="big">#</div><p><b>${known.length ? `Ninguna etiqueta en ${esc(where)}` : 'Aún no hay etiquetas'}</b></p>
          <p>Añádelas al crear o editar un movimiento, en el campo «Etiquetas».</p></div>`}
      ${S.view.tag ? `<button class="btn btn-block" data-clear>${icon('close')} Quitar el filtro #${esc(S.view.tag)}</button>` : ''}`;
  };
  sh.refresh = draw;
  draw();
  sh.body.addEventListener('click', async (e) => {
    const sc = e.target.closest('[data-scope]');
    if (sc) { scope = sc.dataset.scope; draw(); return; }
    const f = e.target.closest('[data-filter]');
    if (f) { setTagFilter(f.dataset.filter); closeSheet(); toast(`Mostrando solo #${f.dataset.filter}`); return; }
    if (e.target.closest('[data-clear]')) { setTagFilter(null); closeSheet(); return; }
    const rn = e.target.closest('[data-rename]');
    if (rn) {
      const from = rn.dataset.rename;
      const to = await promptText('Renombrar etiqueta', 'Si eliges el nombre de otra etiqueta, se unirán en una.', from);
      if (!to || !cleanTag(to) || cleanTag(to) === from) return;
      const n = renameTag(S, from, to);
      if (S.view.tag && tagKey(S.view.tag) === tagKey(from)) S.view.tag = cleanTag(to);
      save();
      refreshAll();
      toast(`#${from} → #${cleanTag(to)} en ${n} movimiento(s)`);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const tag = del.dataset.del;
      if (!(await confirmDialog(`Se quitará #${tag} de todos los movimientos que la llevan. Los movimientos no se borran.`, { ok: 'Quitar etiqueta', danger: true }))) return;
      const n = deleteTag(S, tag);
      if (S.view.tag && tagKey(S.view.tag) === tagKey(tag)) S.view.tag = null;
      save();
      refreshAll();
      toast(`Etiqueta quitada de ${n} movimiento(s)`);
    }
  });
}

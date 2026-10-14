// Categorías: lista (orden, archivadas) y formulario (icono, color, presupuesto).
import { BUDGET_WARN, CATEGORY_EMOJIS, COLORS } from '../core/constants.js';
import { esc, parseNum, plain, round2, uid } from '../core/util.js';
import { fmt } from '../core/format.js';
import { sortedCats, txParts } from '../core/ledger.js';
import { $, $$, catIcon, closeSheet, confirmDialog, icon, openSheet, shake, toast } from './dom.js';
import { S, save, setS } from './store.js';
import { refreshAll } from './screen.js';

const usesCategory = (t, id) => t.type !== 'transfer' && txParts(t).some((p) => p.categoryId === id);

export function openCategories(type = 'expense') {
  let tab = type;
  const sh = openSheet({ title: 'Categorías', actions: `<button class="icon-btn" data-add aria-label="Nueva categoría">${icon('plus')}</button>` });
  const draw = () => {
    const cats = sortedCats(S, tab);
    const arch = S.categories.filter((c) => c.type === tab && c.archived);
    sh.body.innerHTML = `
      <div class="seg full" data-tabs><button data-v="expense" class="${tab === 'expense' ? 'active' : ''}">Gastos</button><button data-v="income" class="${tab === 'income' ? 'active' : ''}">Ingresos</button></div>
      <p class="muted small">El orden de los gastos es el que aparece alrededor del gráfico.</p>
      <div class="list">${cats.map((c, i) => `<div class="list-row">
        <button class="grow-btn" data-edit="${c.id}">${catIcon(c)}<span class="grow"><span class="t">${esc(c.name)}</span>${c.budget > 0 ? `<span class="s">Presupuesto ${fmt(c.budget)} al mes</span>` : ''}</span></button>
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
      const cats = sortedCats(S, tab);
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
      c.order = sortedCats(S, c.type).length;
      save();
      refreshAll();
    }
  });
}

export function openCategoryForm(cat, type, onCreated) {
  const isNew = !cat;
  const c = cat ? { ...cat } : { id: uid(), name: '', icon: '🛍️', color: COLORS[S.categories.length % COLORS.length], type: type || 'expense', archived: false, order: 0, budget: 0 };
  const used = isNew ? 0 : S.transactions.filter((t) => usesCategory(t, c.id)).length;
  const rulesUsing = isNew ? 0 : (S.rules || []).filter((r) => r.categoryId === c.id).length;
  const sh = openSheet({ title: isNew ? 'Nueva categoría' : 'Editar categoría' });
  sh.body.innerHTML = `
    <div class="cat-preview"><span data-prev></span><b data-prev-name></b></div>
    <label class="field"><span>Nombre</span><input data-name maxlength="30" value="${esc(c.name)}" placeholder="p. ej. Gimnasio"></label>
    ${isNew ? `<div class="field"><span>Tipo</span><div class="seg full" data-typeseg>
      <button data-v="expense" class="${c.type === 'expense' ? 'active' : ''}">Gasto</button><button data-v="income" class="${c.type === 'income' ? 'active' : ''}">Ingreso</button></div></div>` : ''}
    <div class="field"><span>Icono</span><div class="emoji-grid">${CATEGORY_EMOJIS.map((e) => `<button data-emoji="${e}" class="${e === c.icon ? 'sel' : ''}">${e}</button>`).join('')}</div></div>
    <div class="field"><span>Color</span><div class="swatches">${COLORS.map((col) => `<button data-color="${col}" style="--c:${col}" class="${col === c.color ? 'sel' : ''}" aria-label="Color ${col}"></button>`).join('')}</div></div>
    <label class="field cat-budget"><span>Presupuesto mensual (opcional, ${esc(S.settings.currency)})</span>
      <input data-budget inputmode="decimal" value="${c.budget > 0 ? plain(c.budget) : ''}" placeholder="Sin límite">
      <small class="muted">Te avisaremos al llegar al ${Math.round(BUDGET_WARN * 100)} % y al superarlo.</small></label>
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
  const syncType = () => { $('.cat-budget', sh.body).hidden = c.type !== 'expense'; };
  syncType();
  sh.body.addEventListener('click', async (e) => {
    const em = e.target.closest('[data-emoji]');
    if (em) { c.icon = em.dataset.emoji; $$('[data-emoji]', sh.body).forEach((b) => b.classList.toggle('sel', b === em)); preview(); return; }
    const co = e.target.closest('[data-color]');
    if (co) { c.color = co.dataset.color; $$('[data-color]', sh.body).forEach((b) => b.classList.toggle('sel', b === co)); preview(); return; }
    const ty = e.target.closest('[data-typeseg] [data-v]');
    if (ty) { c.type = ty.dataset.v; $$('[data-typeseg] [data-v]', sh.body).forEach((b) => b.classList.toggle('active', b === ty)); syncType(); return; }
    if (e.target.closest('[data-save]')) {
      c.name = nameIn.value.trim();
      if (!c.name) { shake(nameIn); toast('Escribe un nombre'); return; }
      c.budget = c.type === 'expense' ? Math.max(0, round2(parseNum($('[data-budget]', sh.body).value))) : 0;
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
      if (!cat.archived) cat.order = sortedCats(S, cat.type).length;
      save();
      closeSheet();
      refreshAll();
      toast(cat.archived ? 'Categoría archivada' : 'Categoría restaurada');
      return;
    }
    if (e.target.closest('[data-del]')) {
      const extra = rulesUsing ? ` También se borrarán ${rulesUsing} regla(s) de categorización que la usan.` : '';
      const msg = used ? `Se eliminará «${cat.name}» y sus ${used} movimiento(s) (incluidos los divididos que tengan una parte en ella). Si quieres conservarlos, archívala en su lugar.${extra}` : `¿Eliminar la categoría «${cat.name}»?${extra}`;
      if (!(await confirmDialog(msg, { ok: 'Eliminar', danger: true }))) return;
      S.transactions = S.transactions.filter((t) => !usesCategory(t, cat.id));
      S.recurring = S.recurring.filter((r) => !usesCategory(r.template, cat.id));
      S.rules = (S.rules || []).filter((r) => r.categoryId !== cat.id);
      S.categories = S.categories.filter((x) => x.id !== cat.id);
      setS(S);
      save();
      closeSheet();
      refreshAll();
      toast('Categoría eliminada');
    }
  });
}

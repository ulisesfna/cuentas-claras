// Editor de movimientos (gasto / ingreso / transferencia), con etiquetas y división entre categorías.
import { FREQ } from '../core/constants.js';
import { esc, plain, round2, uid } from '../core/util.js';
import { fmt } from '../core/format.js';
import { defaultTxDate } from '../core/periods.js';
import { displayExpr, evalExpr, pressKey } from '../core/calc.js';
import { accCur, convert, getAccount, getCategory, isSplit, sortedCats } from '../core/ledger.js';
import { budgetAlert } from '../core/budget.js';
import { cloneTemplate, generateRecurring } from '../core/recurring.js';
import { matchRule } from '../core/rules.js';
import { $, $$, catIcon, closeSheet, confirmDialog, icon, openSheet, shake, toast } from './dom.js';
import { S, save } from './store.js';
import { refreshAll } from './screen.js';
import { mountTagInput } from './tags.js';
import { openCategoryForm } from './categories.js';

const KEYS = [['C', 'k-fn'], ['÷', 'k-op'], ['×', 'k-op'], ['⌫', 'k-fn'], ['7'], ['8'], ['9'], ['-', 'k-op'],
  ['4'], ['5'], ['6'], ['+', 'k-op'], ['1'], ['2'], ['3'], ['=', 'k-eq'], ['0', 'k-zero'], [',']];

export function openTxSheet(opts = {}) {
  const tx = opts.tx || null;
  const accs = S.accounts;
  if (!accs.length) { toast('Crea primero una cuenta'); return; }
  const preferred = getAccount(S, S.view.account) ? S.view.account : getAccount(S, S.settings.lastAccount) ? S.settings.lastAccount : accs[0].id;
  const d = tx
    ? { type: tx.type, expr: plain(tx.amount), accountId: tx.accountId, toAccountId: tx.toAccountId || null, categoryId: tx.categoryId || null,
      date: tx.date, note: tx.note || '', repeat: 'none', splits: isSplit(tx) ? tx.splits.map((p) => ({ ...p })) : null, autoRule: null }
    : { type: opts.type || 'expense', expr: '0', accountId: preferred, toAccountId: null, categoryId: opts.categoryId || null,
      date: defaultTxDate(S.view, S.settings), note: '', repeat: 'none', splits: null, autoRule: null };
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
    <div class="tags-host"></div>
    <div class="cat-hint-row not-transfer"><span class="cat-hint"></span><button type="button" class="link-btn" data-split>${icon('split')} Dividir</button></div>
    <div class="split-box not-transfer" hidden></div>
    <div class="cat-grid not-transfer" role="listbox" aria-label="Categoría"></div>
    <div class="keypad">${KEYS.map(([k, c]) => `<button class="${c || ''}" data-k="${k}" aria-label="${k === '⌫' ? 'Borrar' : k === 'C' ? 'Limpiar' : k}">${k === '-' ? '−' : k === '⌫' ? icon('backspace') : k}</button>`).join('')}</div>`;

  $('[data-f=account]', root).value = d.accountId;
  if (d.toAccountId) $('[data-f=to]', root).value = d.toAccountId;
  $('[data-f=date]', root).value = d.date;
  $('[data-f=note]', root).value = d.note;
  const tagInput = mountTagInput($('.tags-host', root), tx ? tx.tags || [] : S.view.tag ? [S.view.tag] : []);

  const upd = () => {
    sh.sheet.dataset.type = d.type;
    $$('.seg [data-type]', root).forEach((b) => {
      const on = b.dataset.type === d.type;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    const cur = accCur(S, d.accountId);
    const val = evalExpr(d.expr);
    $('.amount-expr', root).innerHTML = `${esc(displayExpr(d.expr))}<span class="cur">${esc(cur)}</span>`;
    let sub = /[+\-×÷]/.test(d.expr) ? '= ' + fmt(val, cur) : '';
    if (d.type === 'transfer') {
      const tc = accCur(S, d.toAccountId);
      if (tc !== cur) sub += (sub ? ' · ' : '') + `≈ ${fmt(convert(S, val, cur, tc), tc)} en destino`;
    }
    $('.amount-sub', root).textContent = sub;
    // La tecla "=" se convierte en "Guardar" cuando no hay operación pendiente.
    const eq = $('[data-k="="]', root);
    const pending = /[+\-×÷]/.test(d.expr);
    eq.classList.toggle('k-ok', !pending);
    eq.innerHTML = pending ? '=' : icon('check');
    eq.setAttribute('aria-label', pending ? 'Calcular' : 'Guardar');
    $('.from-lbl', root).textContent = d.type === 'transfer' ? 'Desde' : 'Cuenta';
    let hint = 'Categoría';
    if (d.splits) hint = 'Dividido entre categorías';
    else if (d.autoRule) hint = `Categoría sugerida por la regla «${d.autoRule}»`;
    else if (!tx && val > 0) hint = 'Toca una categoría para guardar';
    $('.cat-hint', root).textContent = hint;
  };

  const renderCats = () => {
    if (d.type === 'transfer') return;
    const box = $('.split-box', root), grid = $('.cat-grid', root);
    $('[data-split]', root).hidden = !!d.splits;
    if (d.splits) {
      const cur = accCur(S, d.accountId);
      grid.hidden = true;
      box.hidden = false;
      box.innerHTML = `${d.splits.map((p) => { const c = getCategory(S, p.categoryId); return `<div class="split-line">${catIcon(c, 28)}<span class="grow">${esc(c.name)}</span><b>${fmt(p.amount, cur)}</b></div>`; }).join('')}
        <div class="btn-row"><button type="button" class="btn sm" data-split-edit>${icon('edit')} Editar división</button><button type="button" class="btn sm btn-danger-ghost" data-split-off>Quitar división</button></div>`;
      return;
    }
    grid.hidden = false;
    box.hidden = true;
    let cats = sortedCats(S, d.type);
    const selected = S.categories.find((c) => c.id === d.categoryId);
    if (selected && selected.type === d.type && selected.archived) cats = [selected, ...cats];
    grid.innerHTML = cats.map((c) => `<button class="cat-pick${c.id === d.categoryId ? ' sel' : ''}" data-cat="${c.id}" role="option" aria-selected="${c.id === d.categoryId}">${catIcon(c)}<span>${esc(c.name)}</span></button>`).join('')
      + `<button class="cat-pick" data-newcat><span class="cat-ico more">+</span><span>Nueva</span></button>`;
  };
  sh.refresh = renderCats;

  const editSplit = () => {
    const total = evalExpr(d.expr);
    if (!(total > 0)) { shake($('.amount', root)); toast('Escribe primero el importe total'); return; }
    const parts = d.splits ? d.splits.map((p) => ({ ...p }))
      : [{ categoryId: d.categoryId || '', amount: total }, { categoryId: '', amount: 0 }];
    openSplitSheet({
      type: d.type, total, cur: accCur(S, d.accountId), parts,
      onDone: (res) => {
        if (res.splits) { d.splits = res.splits; d.categoryId = res.splits[0].categoryId; } else { d.splits = null; d.categoryId = res.categoryId; }
        d.autoRule = null;
        renderCats();
        upd();
      },
    });
  };

  let saved = false;
  const doSave = () => {
    if (saved) return;
    const amount = evalExpr(d.expr);
    if (!(amount > 0)) { shake($('.amount', root)); toast('Introduce un importe mayor que cero'); return; }
    if (!d.date) { toast('Elige una fecha'); return; }
    let rec;
    if (d.type === 'transfer') {
      if (d.accountId === d.toAccountId) { toast('Elige dos cuentas distintas'); return; }
      rec = { type: 'transfer', amount, accountId: d.accountId, toAccountId: d.toAccountId, toAmount: round2(convert(S, amount, accCur(S, d.accountId), accCur(S, d.toAccountId))), categoryId: null };
    } else if (d.splits) {
      const sum = round2(d.splits.reduce((s, p) => s + p.amount, 0));
      if (Math.abs(sum - amount) > 0.005) {
        toast(`Las partes suman ${fmt(sum, accCur(S, d.accountId))}: ajústalas al importe`);
        editSplit();
        return;
      }
      const main = d.splits.slice().sort((a, b) => b.amount - a.amount)[0];
      rec = { type: d.type, amount, accountId: d.accountId, categoryId: main.categoryId, toAccountId: null, toAmount: null, splits: d.splits.map((p) => ({ ...p })) };
    } else {
      if (!d.categoryId) { shake($('.cat-grid', root)); toast('Elige una categoría'); return; }
      rec = { type: d.type, amount, accountId: d.accountId, categoryId: d.categoryId, toAccountId: null, toAmount: null };
    }
    rec.note = d.note.trim();
    rec.tags = tagInput.get();
    saved = true;
    let savedTx = tx;
    if (tx) {
      if (!rec.splits) delete tx.splits;
      Object.assign(tx, rec, { date: d.date });
    } else {
      const full = { ...cloneTemplate(rec), id: uid(), date: d.date, createdAt: Date.now() };
      savedTx = full;
      if (d.repeat !== 'none') {
        const r = { id: uid(), freq: d.repeat, startDate: d.date, n: 1, active: true, skips: [], template: cloneTemplate(rec) };
        full.recurringId = r.id;
        S.recurring.push(r);
      }
      S.transactions.push(full);
    }
    S.settings.lastAccount = d.accountId;
    generateRecurring(S);
    save();
    closeSheet();
    refreshAll();
    const done = tx ? 'Movimiento actualizado' : { expense: 'Gasto añadido', income: 'Ingreso añadido', transfer: 'Transferencia registrada' }[d.type];
    const alert = budgetAlert(S, savedTx);
    toast(alert ? `${done}. ⚠️ ${alert}` : done, null, alert ? 6000 : 0);
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
    d.splits = null; // las partes eran categorías del otro tipo
    d.autoRule = null;
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
    else return;
    upd();
  });
  // Al escribir la nota, las reglas de categorización proponen la categoría (sin guardar).
  $('[data-f=note]', root).addEventListener('input', (e) => {
    d.note = e.target.value;
    if (tx || d.type === 'transfer' || d.splits) return;
    if (d.categoryId && !d.autoRule) return; // la elegiste tú: no se toca
    const r = matchRule(S.rules, d.note, d.type);
    const next = r ? r.categoryId : null;
    if (next !== (d.autoRule ? d.categoryId : null)) {
      d.categoryId = next;
      d.autoRule = r ? r.pattern : null;
      renderCats();
      upd();
    }
  });
  $('.keypad', root).addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k, true); });
  // Abre el calendario al tocar en cualquier parte del campo de fecha.
  $('[data-f=date]', root).addEventListener('click', (e) => { try { e.target.showPicker(); } catch (err) { /* no soportado */ } });
  $('.cat-grid', root).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.newcat != null) {
      openCategoryForm(null, d.type, (c) => { d.categoryId = c.id; d.autoRule = null; renderCats(); upd(); });
      return;
    }
    d.categoryId = b.dataset.cat;
    d.autoRule = null;
    renderCats();
    upd();
    if (!tx && evalExpr(d.expr) > 0) doSave();
  });
  $('[data-split]', root).addEventListener('click', editSplit);
  $('.split-box', root).addEventListener('click', (e) => {
    if (e.target.closest('[data-split-edit]')) editSplit();
    else if (e.target.closest('[data-split-off]')) {
      const main = d.splits.slice().sort((a, b) => b.amount - a.amount)[0];
      d.splits = null;
      d.categoryId = main.categoryId;
      renderCats();
      upd();
    }
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

// Reparte un importe entre varias categorías del mismo tipo.
// onDone({ splits }) con 2 o más partes, u onDone({ categoryId }) si queda una sola.
export function openSplitSheet({ type, total, cur, parts, onDone }) {
  let rows = parts.map((p) => ({ ...p }));
  const sh = openSheet({ title: 'Dividir entre categorías' });
  const cats = sortedCats(S, type);
  rows.forEach((r) => { const c = S.categories.find((x) => x.id === r.categoryId); if (c && c.archived && !cats.includes(c)) cats.unshift(c); });
  const leftOf = () => round2(total - rows.reduce((s, r) => s + (r.amount || 0), 0));
  const paintLeft = () => {
    const left = leftOf();
    const el = $('.split-left', sh.body);
    el.className = `split-left ${Math.abs(left) < 0.005 ? 'ok' : left < 0 ? 'over' : ''}`;
    el.innerHTML = Math.abs(left) < 0.005 ? '✓ Todo repartido' : left > 0 ? `Falta por repartir: <b>${fmt(left, cur)}</b>` : `Te pasas en <b>${fmt(-left, cur)}</b>`;
    $('[data-rest]', sh.body).disabled = Math.abs(left) < 0.005;
  };
  const draw = () => {
    sh.body.innerHTML = `
      <p class="muted small">Reparte el importe entre varias categorías, por ejemplo una compra con comida y productos de limpieza. Cada parte cuenta en su categoría: en el gráfico, los presupuestos y el análisis.</p>
      <div class="split-total"><span>Total del movimiento</span><b>${fmt(total, cur)}</b></div>
      <div class="split-rows">${rows.map((r, i) => `<div class="split-row">
        <select data-cat="${i}" aria-label="Categoría de la parte ${i + 1}"><option value="">Elige categoría…</option>
          ${cats.map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
        <input data-amt="${i}" inputmode="decimal" value="${r.amount ? plain(r.amount) : ''}" placeholder="0,00" aria-label="Importe de la parte ${i + 1}">
        <button type="button" class="icon-btn sm" data-rm="${i}" ${rows.length <= 2 ? 'disabled' : ''} aria-label="Quitar la parte ${i + 1}">${icon('close')}</button></div>`).join('')}</div>
      <div class="split-left"></div>
      <div class="btn-row"><button type="button" class="btn" data-add>${icon('plus')} Añadir parte</button><button type="button" class="btn" data-rest>Poner lo que falta en la última</button></div>
      <div class="form-actions"><span class="grow"></span><button type="button" class="btn btn-primary" data-ok>Aplicar división</button></div>`;
    paintLeft();
  };
  draw();
  sh.body.addEventListener('input', (e) => {
    const i = e.target.dataset.amt;
    if (i == null) return;
    const v = parseFloat(String(e.target.value).replace(/\./g, '').replace(',', '.'));
    rows[+i].amount = isFinite(v) && v > 0 ? round2(v) : 0;
    paintLeft();
  });
  sh.body.addEventListener('change', (e) => { const i = e.target.dataset.cat; if (i != null) rows[+i].categoryId = e.target.value; });
  sh.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) { rows.push({ categoryId: '', amount: Math.max(0, leftOf()) }); draw(); $$('[data-cat]', sh.body).pop().focus(); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm && !rm.disabled) { rows.splice(+rm.dataset.rm, 1); draw(); return; }
    if (e.target.closest('[data-rest]')) {
      const last = rows[rows.length - 1];
      last.amount = round2((last.amount || 0) + leftOf());
      if (last.amount <= 0) { toast('La última parte quedaría en cero o negativa'); last.amount = 0; }
      draw();
      return;
    }
    if (e.target.closest('[data-ok]')) {
      if (rows.some((r) => !r.categoryId)) { toast('Elige la categoría de cada parte'); return; }
      if (rows.some((r) => !(r.amount > 0))) { toast('Cada parte necesita un importe mayor que cero'); return; }
      if (Math.abs(leftOf()) >= 0.005) { shake($('.split-left', sh.body)); toast('Las partes deben sumar el total'); return; }
      // Dos partes de la misma categoría se juntan en una.
      const merged = [];
      for (const r of rows) {
        const m = merged.find((x) => x.categoryId === r.categoryId);
        if (m) m.amount = round2(m.amount + r.amount); else merged.push({ categoryId: r.categoryId, amount: r.amount });
      }
      closeSheet();
      onDone(merged.length > 1 ? { splits: merged } : { categoryId: merged[0].categoryId });
    }
  });
}

/*
 * Cuentas Claras — gestor de finanzas personales.
 * Punto de entrada: enlaza los eventos de la pantalla principal y arranca la app.
 * La lógica sin interfaz está en js/core (probada en tests/); la interfaz, en js/ui.
 */
import { decryptWithKey, isEnvelope, b64 } from './core/crypto.js';
import { migrate } from './core/model.js';
import { generateRecurring } from './core/recurring.js';
import { todayISO } from './core/util.js';
import { $, $$, closeSheet, icon, stack, toast } from './ui/dom.js';
import { META, readStored, S, save, saveMeta, setS, STORAGE_KEY, vault } from './ui/store.js';
import { expanded, refreshAll, render, renderNotice, shiftPeriod } from './ui/screen.js';
import { openTxSheet } from './ui/tx-editor.js';
import { openAccountSwitch } from './ui/accounts.js';
import { openCategoryForm } from './ui/categories.js';
import { openPeriodSheet, openSearch } from './ui/period.js';
import { openMenu } from './ui/menu.js';
import { openUpcoming } from './ui/recurring.js';
import { downloadBackup, initAutoBackup, openData, resumeAutoBackup } from './ui/backup.js';
import { hasCode, lockEl, showBlocked, showLock } from './ui/security.js';
import { openAnalysis } from './ui/analysis.js';
import { setTagFilter } from './ui/tags.js';
import { openHelp } from './ui/help.js';

function bind() {
  $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
  $('#btnMenu').addEventListener('click', openMenu);
  $('#btnAccount').addEventListener('click', openAccountSwitch);
  $('#btnSearch').addEventListener('click', openSearch);
  $('#btnStats').addEventListener('click', openAnalysis);
  $('#btnTransfer').addEventListener('click', () => openTxSheet({ type: 'transfer' }));
  $('#prevPeriod').addEventListener('click', () => shiftPeriod(-1));
  $('#nextPeriod').addEventListener('click', () => shiftPeriod(1));
  $('#periodLabel').addEventListener('click', openPeriodSheet);
  $('#btnAddExpense').addEventListener('click', () => openTxSheet({ type: 'expense' }));
  $('#btnAddIncome').addEventListener('click', () => openTxSheet({ type: 'income' }));
  $('#filterBar').addEventListener('click', (e) => { if (e.target.closest('[data-clear-tag]')) setTagFilter(null); });
  $('#notice').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-notice]');
    if (!b) return;
    const a = b.dataset.notice;
    if (a === 'backup') await downloadBackup();
    else if (a === 'snooze') { META.snoozeUntil = Date.now() + 7 * 86400000; saveMeta(); renderNotice(); toast('Te lo recordaremos dentro de una semana'); }
    else if (a === 'resume') await resumeAutoBackup();
    else if (a === 'data') openData();
  });
  $('#upcoming').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tx]');
    if (t) { const tx = S.transactions.find((x) => x.id === t.dataset.tx); if (tx) { openTxSheet({ tx }); return; } }
    if (e.target.closest('button')) openUpcoming();
  });

  const ring = $('#ring');
  ring.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cat) openTxSheet({ type: 'expense', categoryId: b.dataset.cat });
    else if (b.dataset.more != null) openTxSheet({ type: 'expense' });
    else if (b.dataset.addcat != null) openCategoryForm(null, 'expense');
  });
  // Deslizar a izquierda/derecha sobre el resumen cambia de período.
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
    if (!S || $('.dialog-ov')) return;
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
    else if (e.key === '?') { e.preventDefault(); openHelp(); }
  });

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (!S) return;
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (generateRecurring(S)) { save(); refreshAll(); }
    if (hasCode() && S.settings.autoLock && hiddenAt && Date.now() - hiddenAt > 60000) showLock();
  });
  // Mantiene sincronizadas varias pestañas abiertas (también con los datos cifrados).
  window.addEventListener('storage', async (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue || !S) return;
    try {
      const obj = JSON.parse(e.newValue);
      if (isEnvelope(obj)) {
        // Otro código (o cifrado recién activado en otra pestaña): hay que desbloquear de nuevo.
        if (!vault || obj.kdf.salt !== b64(vault.salt)) { location.reload(); return; }
        setS(migrate(await decryptWithKey(vault.key, obj)));
      } else {
        if (vault) { location.reload(); return; }
        setS(migrate(obj));
      }
      refreshAll();
    } catch (err) { /* ignorar */ }
  });
}

async function init() {
  bind();
  const st = readStored();
  if (st.newer) { showBlocked(); return; }
  if (st.envelope) await showLock(st.envelope);
  else setS(st.state);
  if (!META.installedAt) {
    // Para el aviso de copias: desde cuándo hay datos en este dispositivo.
    META.installedAt = S.transactions.reduce((m, t) => (t.createdAt && t.createdAt < m ? t.createdAt : m), Date.now());
    saveMeta();
  }
  S.view.anchor = todayISO();
  generateRecurring(S);
  save(); // guarda ya en el formato actual si hubo migración
  render();
  if (!st.envelope) await showLock();
  if (st.note === 'corrupt') toast('Los datos guardados estaban dañados: se han apartado y la app empieza de cero. Puedes descargarlos en Exportar y copias.', null, 9000);
  initAutoBackup();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();

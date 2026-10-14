// Copias de seguridad (manual y automática), restaurar o combinar, y exportar a CSV.
import { BACKUP_WARN_DAYS, SCHEMA_VERSION } from '../core/constants.js';
import { esc, todayISO } from '../core/util.js';
import { dfShortY, relTime } from '../core/format.js';
import { periodISO, periodLabel } from '../core/periods.js';
import { isEnvelope, openEnvelope, seal } from '../core/crypto.js';
import { validateImport } from '../core/validate.js';
import { mergeData } from '../core/merge.js';
import { defaultState } from '../core/model.js';
import { generateRecurring } from '../core/recurring.js';
import { buildExportCSV } from '../core/csv.js';
import { $, closeSheet, confirmDialog, dialog, download, icon, openSheet, promptSecret, stack, toast } from './dom.js';
import { cryptoOK, hooks, META, recoveryKeys, S, save, saveMeta, setS, setVault, vault } from './store.js';
import { backupOverdue, expanded, refreshAll, renderNotice } from './screen.js';
import { openCsvImport } from './importer.js';

// Contenido de una copia: cifrada con el mismo código si los datos están cifrados.
export async function backupPayload() {
  const exportedAt = new Date().toISOString();
  if (vault) return JSON.stringify({ ...(await seal(vault, S)), exportedAt });
  return JSON.stringify({ app: 'cuentas-claras', exportedAt, ...S }, null, 2);
}
function markBackup() {
  META.lastBackupAt = Date.now();
  META.snoozeUntil = 0;
  saveMeta();
}
export async function downloadBackup() {
  try {
    download(`cuentas-claras-copia-${todayISO()}.json`, await backupPayload(), 'application/json');
    markBackup();
    refreshAll();
    toast(vault ? 'Copia cifrada descargada' : 'Copia descargada');
  } catch (e) { toast('No se pudo crear la copia'); }
}

// Copia automática con la File System Access API (Chrome y Edge de escritorio).
// El archivo elegido se guarda en IndexedDB para reutilizarlo en cada visita.
const fsSupported = typeof window.showSaveFilePicker === 'function';
export const auto = { state: 'off', handle: null, timer: 0 };
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cuentas-claras', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', mode);
      const r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const idbGet = (k) => idb('readonly', (s) => s.get(k));
const idbSet = (k, v) => idb('readwrite', (s) => s.put(v, k));
const idbDel = (k) => idb('readwrite', (s) => s.delete(k));

export async function initAutoBackup() {
  hooks.afterSave = scheduleAutoBackup;
  if (!fsSupported) return;
  try {
    const h = await idbGet('backupHandle');
    if (!h) return;
    auto.handle = h;
    auto.state = (await h.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'active' : 'paused';
    if (auto.state === 'active') await writeAutoBackup();
  } catch (e) { auto.state = 'off'; }
  renderNotice();
}
export async function writeAutoBackup() {
  if (auto.state !== 'active' || !auto.handle || !S) return;
  try {
    const w = await auto.handle.createWritable();
    await w.write(await backupPayload());
    await w.close();
    META.auto = { name: auto.handle.name, lastAt: Date.now(), error: null };
    markBackup();
  } catch (e) {
    auto.state = e && e.name === 'NotAllowedError' ? 'paused' : 'error';
    META.auto = { ...(META.auto || {}), name: auto.handle.name, error: e && e.message ? e.message : 'Error desconocido' };
    saveMeta();
  }
  renderNotice();
  stack.forEach((s) => s.autoRefresh && s.autoRefresh());
}
function scheduleAutoBackup() {
  if (auto.state !== 'active') return;
  clearTimeout(auto.timer);
  auto.timer = setTimeout(writeAutoBackup, 1500);
}
async function enableAutoBackup() {
  try {
    const h = await window.showSaveFilePicker({
      suggestedName: 'cuentas-claras-autocopia.json',
      types: [{ description: 'Copia de Cuentas Claras', accept: { 'application/json': ['.json'] } }],
    });
    auto.handle = h;
    auto.state = 'active';
    await idbSet('backupHandle', h);
    await writeAutoBackup();
    if (auto.state === 'active') toast(`Copia automática activada en «${h.name}»`);
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('No se pudo activar la copia automática');
  }
}
export async function resumeAutoBackup() {
  if (!auto.handle) return;
  try {
    if ((await auto.handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
      auto.state = 'active';
      await writeAutoBackup();
      toast('Copia automática reanudada');
    }
  } catch (e) { toast('No se pudo reanudar la copia automática'); }
  renderNotice();
}
async function disableAutoBackup() {
  clearTimeout(auto.timer);
  auto.handle = null;
  auto.state = 'off';
  delete META.auto;
  saveMeta();
  try { await idbDel('backupHandle'); } catch (e) { /* ignorar */ }
  renderNotice();
}

// Lee, descifra si hace falta, valida y aplica (reemplazar o combinar) un archivo de copia.
async function restoreFromFile(file, sh) {
  let text;
  try { text = await file.text(); } catch (e) { toast('No se pudo leer el archivo'); return; }
  let obj;
  try { obj = JSON.parse(text); } catch (e) { await dialog({ title: 'Archivo no válido', message: 'El archivo no es una copia de Cuentas Claras (no es JSON válido).', buttons: [{ label: 'Entendido', value: true, cls: 'btn-primary' }] }); return; }
  let fromVault = null;
  if (isEnvelope(obj)) {
    if (!cryptoOK) { toast('Esta copia está cifrada y este navegador no puede descifrarla (hace falta https)'); return; }
    for (;;) {
      const secret = await promptSecret(`La copia está cifrada. Escribe el ${obj.lock === 'pin' ? 'PIN' : 'código o contraseña'} con el que se creó.`, { title: 'Copia cifrada', ok: 'Descifrar' });
      if (secret == null) return;
      try { const r = await openEnvelope(obj, secret); obj = r.obj; fromVault = r.vault; break; } catch (e) { toast('Código incorrecto'); }
    }
  }
  const res = validateImport(obj);
  if (res.errors) {
    await dialog({
      title: 'La copia tiene errores',
      html: `<p>No se ha cambiado nada. Estos son los problemas encontrados:</p><ul class="err-list">${res.errors.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>${res.more ? `<p class="muted small">…y ${res.more} más.</p>` : ''}`,
      buttons: [{ label: 'Entendido', value: true, cls: 'btn-primary' }],
    });
    return;
  }
  const inc = res.data;
  const mode = await dialog({
    title: 'Restaurar copia',
    html: `<p>La copia contiene <b>${inc.transactions.length}</b> movimientos, <b>${inc.accounts.length}</b> cuentas y <b>${inc.categories.length}</b> categorías.</p>
      <p><b>Combinar</b> añade lo que falte sin tocar tus datos actuales. <b>Reemplazar</b> borra lo actual y deja solo la copia.</p>`,
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Reemplazar todo', value: 'replace', cls: 'btn-danger' }, { label: 'Combinar', value: 'merge', cls: 'btn-primary' }],
  });
  if (!mode) return;
  if (mode === 'merge') {
    const { data, stats } = mergeData(S, inc);
    const added = [stats.transactions && `${stats.transactions} movimiento(s)`, stats.accounts && `${stats.accounts} cuenta(s)`,
      stats.categories && `${stats.categories} categoría(s)`, stats.recurring && `${stats.recurring} regla(s) recurrente(s)`,
      stats.rules && `${stats.rules} regla(s) de categorización`, stats.rates && `${stats.rates} tipo(s) de cambio`].filter(Boolean);
    if (!added.length) { toast(`No hay nada nuevo que añadir (${stats.existing} movimientos ya estaban)`); return; }
    const ok = await confirmDialog(`Se añadirán ${added.join(', ')}.${stats.existing ? ` ${stats.existing} movimiento(s) ya existían y se omitirán.` : ''}${stats.ratesSkipped ? ' Algunos tipos de cambio no se pudieron convertir: revísalos en Monedas.' : ''}`, { ok: 'Combinar' });
    if (!ok) return;
    setS(data);
  } else {
    if (!(await confirmDialog('Se borrarán tus datos actuales y se sustituirán por los de la copia. ¿Continuar?', { ok: 'Reemplazar', danger: true }))) return;
    const keepView = S.view;
    // La seguridad sigue siendo la de este dispositivo; si no tenía código, se adopta el de la copia cifrada.
    if (vault) inc.settings.pinHash = null;
    else if (fromVault) { setVault(fromVault); inc.settings.pinHash = null; }
    inc.view = { ...keepView, account: 'all', tag: null, anchor: todayISO() };
    setS(inc);
  }
  generateRecurring(S);
  save();
  expanded.clear();
  if (sh) closeSheet();
  refreshAll();
  toast(mode === 'merge' ? 'Copia combinada con tus datos' : 'Copia restaurada');
}

export function exportCSV(onlyPeriod) {
  const { from, to } = onlyPeriod ? periodISO(S.view, S.settings) : { from: null, to: null };
  const { csv, count } = buildExportCSV(S, from, to);
  download(`cuentas-claras-${from ? `${from}_${to}` : 'todo'}.csv`, csv, 'text/csv;charset=utf-8');
  toast(`${count} movimiento(s) exportados`);
}

export function openData() {
  const sh = openSheet({ title: 'Exportar y copias', cls: 'sheet-tall' });
  const draw = () => {
    const overdue = backupOverdue();
    const last = META.lastBackupAt
      ? `<b>Última copia:</b> ${esc(relTime(META.lastBackupAt))} (${esc(dfShortY.format(new Date(META.lastBackupAt)))})`
      : '<b>Todavía no has hecho ninguna copia</b> en este dispositivo.';
    let autoHTML;
    if (!fsSupported) {
      autoHTML = '<p class="muted small">La copia automática en un archivo solo está disponible en Chrome y Edge de ordenador. Aquí, descarga la copia a mano de vez en cuando.</p>';
    } else if (auto.state === 'off') {
      autoHTML = `<p class="muted small">Elige un archivo (por ejemplo, dentro de una carpeta sincronizada con Drive, OneDrive o Dropbox) y la app lo actualizará sola cada vez que cambies algo.</p>
        <button class="btn" data-a="auto-on">${icon('file')} Elegir archivo de copia automática</button>`;
    } else {
      const a = META.auto || {};
      const st = auto.state === 'active' ? `Activa · guardada ${a.lastAt ? esc(relTime(a.lastAt)) : 'pendiente'}`
        : auto.state === 'paused' ? 'En pausa: el navegador necesita tu permiso otra vez' : `Error: ${esc(a.error || '')}`;
      autoHTML = `<div class="status-card ${auto.state === 'active' ? 'ok' : 'warn'}"><b>${icon('file')} ${esc(a.name || (auto.handle && auto.handle.name) || 'Archivo')}</b><span>${st}</span></div>
        <div class="btn-row">${auto.state !== 'active' ? '<button class="btn btn-primary" data-a="auto-resume">Reanudar</button>' : '<button class="btn" data-a="auto-now">Guardar ahora</button>'}
        <button class="btn" data-a="auto-on">Cambiar archivo</button><button class="btn btn-danger-ghost" data-a="auto-off">Desactivar</button></div>`;
    }
    const rec = recoveryKeys();
    sh.body.innerHTML = `
      <div class="status-card ${overdue ? 'warn' : META.lastBackupAt ? 'ok' : ''}">
        <span>${last}</span>
        ${overdue ? `<span>⚠ Han pasado más de ${BACKUP_WARN_DAYS} días. Si se borran los datos del navegador, perderías lo apuntado desde entonces.</span>` : ''}
      </div>
      <p class="muted small">Tus datos se guardan solo en este navegador. Las copias sirven para recuperarlos y para pasarlos a otro dispositivo.${vault ? ' Como tus datos están cifrados, las copias también lo están: necesitarás tu código para restaurarlas.' : ''}</p>
      <h4 class="sub-h">Copia de seguridad</h4>
      <div class="btn-col">
        <button class="btn btn-primary" data-a="backup">${icon('download')} Descargar copia${vault ? ' cifrada' : ''} (.json)</button>
        <button class="btn" data-a="restore">${icon('upload')} Restaurar o combinar desde archivo</button>
        <input type="file" accept="application/json,.json" hidden data-file>
      </div>
      <h4 class="sub-h">Copia automática</h4>
      ${autoHTML}
      <h4 class="sub-h">Importar del banco</h4>
      <button class="btn" data-a="import">${icon('inbox')} Importar movimientos desde un CSV del banco</button>
      <h4 class="sub-h">Exportar a hoja de cálculo (CSV)</h4>
      <div class="btn-col">
        <button class="btn" data-a="csv-period">${icon('download')} Período visible · ${esc(periodLabel(S.view, S.settings))}</button>
        <button class="btn" data-a="csv-all">${icon('download')} Todos los movimientos</button>
      </div>
      ${vault ? '<p class="muted small">El CSV no va cifrado: guárdalo en un lugar seguro.</p>' : ''}
      ${rec.length ? `<h4 class="sub-h">Datos recuperados</h4><p class="muted small">En algún momento los datos guardados no se pudieron leer y se apartaron para no perderlos.</p>
        <button class="btn" data-a="recovery">${icon('download')} Descargar datos apartados (${rec.length})</button>` : ''}
      <h4 class="sub-h">Zona peligrosa</h4>
      <button class="btn btn-danger-ghost" data-a="wipe">${icon('trash')} Borrar todos los datos</button>
      <p class="muted small mt">${S.transactions.length} movimientos · ${S.accounts.length} cuentas · ${S.categories.length} categorías · formato de datos v${SCHEMA_VERSION}</p>`;
  };
  sh.refresh = draw;
  sh.autoRefresh = draw;
  draw();
  sh.body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const act = a.dataset.a;
    if (act === 'csv-period') exportCSV(true);
    else if (act === 'csv-all') exportCSV(false);
    else if (act === 'backup') await downloadBackup();
    else if (act === 'restore') $('[data-file]', sh.body).click();
    else if (act === 'import') { openCsvImport(); return; }
    else if (act === 'auto-on') await enableAutoBackup();
    else if (act === 'auto-resume') await resumeAutoBackup();
    else if (act === 'auto-now') { await writeAutoBackup(); toast('Copia guardada'); }
    else if (act === 'auto-off') { await disableAutoBackup(); toast('Copia automática desactivada'); }
    else if (act === 'recovery') {
      const dump = {};
      recoveryKeys().forEach((k) => { try { dump[k] = localStorage.getItem(k); } catch (err) { /* ignorar */ } });
      download(`cuentas-claras-datos-apartados-${todayISO()}.json`, JSON.stringify(dump, null, 2), 'application/json');
    } else if (act === 'wipe') {
      if (!(await confirmDialog('Se borrarán todas las cuentas, categorías y movimientos de este dispositivo. ¿Has descargado una copia?', { ok: 'Borrar todo', danger: true }))) return;
      const theme = S.settings.theme;
      const fresh = defaultState();
      fresh.settings.theme = theme;
      setS(fresh);
      save();
      expanded.clear();
      closeSheet();
      refreshAll();
      toast('Datos borrados');
      return;
    }
    draw();
  });
  sh.body.addEventListener('change', (e) => {
    if (!e.target.matches('[data-file]')) return;
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) restoreFromFile(file, sh);
  });
}

// Menú lateral y ajustes.
import { APP_VERSION } from '../core/constants.js';
import { esc } from '../core/util.js';
import { fmt, signCls } from '../core/format.js';
import { netWorth } from '../core/ledger.js';
import { monthlyBudget } from '../core/budget.js';
import { $, closeSheet, dialog, icon, openSheet } from './dom.js';
import { apkDownloadURL, apkInfo, apkVersionLabel, NATIVE } from './native.js';
import { S, save, vault } from './store.js';
import { backupOverdue, refreshAll } from './screen.js';
import { auto, openData } from './backup.js';
import { openAccounts, openCurrencies } from './accounts.js';
import { openCategories } from './categories.js';
import { openRecurring, openUpcoming } from './recurring.js';
import { openBudget } from './budget.js';
import { openSearch } from './period.js';
import { openSecurity } from './security.js';
import { openAnalysis } from './analysis.js';
import { openTags } from './tags.js';
import { openCsvImport, openRules } from './importer.js';
import { openHelp } from './help.js';
import { openSync, syncLabel, syncStatus } from './sync.js';

export function openMenu() {
  const sh = openSheet({ title: 'Cuentas Claras', cls: 'sheet-drawer', ovCls: 'ov-drawer' });
  const items = [
    ['wallet', 'Cuentas', openAccounts], ['tag', 'Categorías', () => openCategories('expense')],
    ['hash', 'Etiquetas', openTags], ['chart', 'Análisis', openAnalysis],
    ['calendar', 'Próximos movimientos', openUpcoming], ['repeat', 'Recurrentes', openRecurring],
    ['target', 'Presupuestos', openBudget], ['inbox', 'Importar del banco', openCsvImport],
    ['wand', 'Reglas de categorización', openRules], ['coins', 'Monedas', openCurrencies],
    ['search', 'Buscar', openSearch],
    ['cloud', 'Sincronización', openSync, ['needs-pass', 'needs-update', 'error'].includes(syncStatus().state) && syncStatus().enabled],
    ['download', 'Exportar y copias', openData, backupOverdue() || auto.state === 'paused' || auto.state === 'error'],
    ['lock', 'Código y cifrado', openSecurity], ['sliders', 'Ajustes', openSettings], ['help', 'Guía de uso', openHelp],
  ];
  if (!NATIVE && apkDownloadURL()) items.push(['phone', 'App de Android', openAndroidApp]);
  const nw = netWorth(S);
  const synced = syncStatus().enabled;
  sh.body.innerHTML = `<div class="menu-total"><span>Patrimonio neto</span><strong class="${signCls(nw.total)}">${fmt(nw.total)}</strong>
      <span class="s">Liquidez ${fmt(nw.liquid)}${Math.abs(nw.debt) > 0.004 ? ` · Deudas ${fmt(nw.debt)}` : ''}</span></div>
    <nav class="menu">${items.map(([ic, label, , dot], i) => `<button class="menu-item" data-i="${i}">${icon(ic)}<span class="grow">${label}</span>${dot ? '<span class="menu-dot" aria-label="Requiere atención"></span>' : ''}</button>`).join('')}</nav>
    <p class="menu-foot">Versión ${APP_VERSION}<span data-apk></span><br>${synced ? `Sincronización cifrada: ${esc(syncLabel().toLowerCase())}.` : 'Tus datos se guardan solo en este dispositivo.'}</p>`;
  apkInfo().then((i) => { const el = $('[data-apk]', sh.body); if (el && apkVersionLabel(i)) el.textContent = ` · ${apkVersionLabel(i)}`; });
  sh.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) closeSheet(items[+b.dataset.i][2]);
  });
}

// Solo en la web publicada en GitHub Pages: cómo pasar a la app de Android.
async function openAndroidApp() {
  const ok = await dialog({
    title: 'App de Android',
    html: `<p>Cuentas Claras también está como app de Android (APK): se abre como cualquier otra app y avisa cuando hay una versión nueva.</p>
      <p><b>Tus datos no pasan solos</b>, porque la app y esta web guardan cada una los suyos. Para llevártelos:</p>
      <ul><li>con la <b>sincronización</b>: actívala en la app con la misma contraseña, o</li>
      <li>con una <b>copia de seguridad</b>: descárgala aquí y, en la app, Exportar y copias → Restaurar.</li></ul>
      <p class="muted small">Al instalar, Android puede pedir permiso para instalar apps desde el navegador. Si Play Protect avisa: Más detalles → Instalar de todas formas.</p>`,
    buttons: [{ label: 'Cerrar', value: false }, { label: 'Descargar APK', value: true, cls: 'btn-primary' }],
  });
  if (ok) location.href = apkDownloadURL();
}

export function openSettings() {
  const sh = openSheet({ title: 'Ajustes' });
  const draw = () => {
    const s = S.settings;
    sh.body.innerHTML = `
      <h4 class="sub-h first">Apariencia</h4>
      <div class="seg full" data-theme-seg>${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => `<button data-v="${k}" class="${s.theme === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <h4 class="sub-h">Calendario</h4>
      <div class="row2">
        <label class="field"><span>La semana empieza el</span><select data-s="weekStart"><option value="1">Lunes</option><option value="0">Domingo</option><option value="6">Sábado</option></select></label>
        <label class="field"><span>El mes empieza el día</span><select data-s="monthStart">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      </div>
      <p class="muted small">Útil si cobras, por ejemplo, el día 25: los meses irán del 25 al 24.</p>
      <h4 class="sub-h">Saldo</h4>
      <label class="switch-row"><span><b>Arrastrar saldo</b><small>Suma al período el saldo acumulado anterior, incluidos los saldos iniciales de las cuentas.</small></span>
        <input type="checkbox" class="switch" data-s="carryOver" ${s.carryOver ? 'checked' : ''}></label>
      <h4 class="sub-h">Más</h4>
      <div class="list">
        <button class="list-row" data-go="cur">${icon('coins')}<span class="grow"><span class="t">Monedas</span><span class="s">Principal: ${esc(s.currency)}</span></span>${icon('chevR')}</button>
        <button class="list-row" data-go="budget">${icon('target')}<span class="grow"><span class="t">Presupuestos</span><span class="s">${monthlyBudget(S) ? fmt(monthlyBudget(S)) + ' al mes' : 'Sin presupuesto'}</span></span>${icon('chevR')}</button>
        <button class="list-row" data-go="cats">${icon('tag')}<span class="grow"><span class="t">Categorías</span></span>${icon('chevR')}</button>
        <button class="list-row" data-go="rules">${icon('wand')}<span class="grow"><span class="t">Reglas de categorización</span><span class="s">${(S.rules || []).length} regla(s)</span></span>${icon('chevR')}</button>
        <button class="list-row" data-go="sec">${icon('lock')}<span class="grow"><span class="t">Código y cifrado</span><span class="s">${vault ? 'Activado · datos cifrados' : s.pinHash ? 'Activado · datos sin cifrar' : 'Desactivado'}</span></span>${icon('chevR')}</button>
        <button class="list-row" data-go="sync">${icon('cloud')}<span class="grow"><span class="t">Sincronización</span><span class="s">${esc(syncLabel())}</span></span>${icon('chevR')}</button>
        <button class="list-row" data-go="data">${icon('download')}<span class="grow"><span class="t">Exportar y copias de seguridad</span></span>${icon('chevR')}</button>
        <button class="list-row" data-go="help">${icon('help')}<span class="grow"><span class="t">Guía de uso</span><span class="s">Cómo funciona cada apartado</span></span>${icon('chevR')}</button>
      </div>
      <p class="muted small center mt">Cuentas Claras ${APP_VERSION}</p>`;
    sh.body.querySelector('[data-s=weekStart]').value = String(s.weekStart);
    sh.body.querySelector('[data-s=monthStart]').value = String(s.monthStart);
  };
  sh.refresh = draw;
  draw();
  sh.body.addEventListener('change', (e) => {
    const k = e.target.dataset.s;
    if (!k) return;
    S.settings[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    save();
    refreshAll();
  });
  sh.body.addEventListener('click', (e) => {
    const th = e.target.closest('[data-theme-seg] [data-v]');
    if (th) { S.settings.theme = th.dataset.v; save(); refreshAll(); return; }
    const go = e.target.closest('[data-go]');
    if (go) ({ cur: openCurrencies, budget: openBudget, cats: () => openCategories('expense'), rules: openRules, sync: openSync, sec: openSecurity, data: openData, help: openHelp })[go.dataset.go]();
  });
}

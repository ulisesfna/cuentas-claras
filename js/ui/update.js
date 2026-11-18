// Actualizaciones. En la app de Android, como en «Mi calendario»: al abrirla y al volver a ella (como
// mucho cada 30 min) busca la versión nueva; si solo cambia la app web, la descarga y se recarga con
// ella sin instalar nada, y si cambia la parte de Android, descarga el APK y abre el instalador.
// En la web, «Buscar actualizaciones» vuelve a pedir los archivos saltándose las cachés y recarga si
// alguno ha cambiado.
import { APP_VERSION } from '../core/constants.js';
import { $, dialog, hideToast, stack, toast } from './dom.js';
import { lockEl } from './security.js';
import {
  apkInfo, applyWebUpdate, checkUpdate, downloadWebUpdate, installApk, isVisible,
  NATIVE, onInstallError, onVisibility,
} from './native.js';

const CHECK_KEY = 'cuentas-claras:apk-update';
const fail = (e) => toast((e && e.message) || String(e), null, 10000);
let busy = false;

// ---------------------------------------------------------------------------
// App de Android
// ---------------------------------------------------------------------------
export function initUpdates() {
  if (!NATIVE) return;
  onInstallError((msg) => toast(msg, null, 10000));
  setTimeout(() => autoUpdate(true).catch(() => {}), 4000);
  onVisibility((v) => { if (v) autoUpdate(false).catch(() => {}); });
}

function lastCheck() {
  try { return (JSON.parse(localStorage.getItem(CHECK_KEY)) || {}).at || 0; } catch (e) { return 0; }
}
function saveCheck() {
  try { localStorage.setItem(CHECK_KEY, JSON.stringify({ at: Date.now() })); } catch (e) { /* sin guardar */ }
}
// Hay algo a medias (una pantalla abierta, el código de bloqueo, escribiendo…): no recargar por sorpresa.
const userBusy = () => !!(lockEl || stack.length || $('.dialog-ov') || (document.activeElement && document.activeElement.matches('input, textarea, select')) || !isVisible());

async function autoUpdate(justOpened) {
  if (busy || Date.now() - lastCheck() < 30 * 60e3) return;
  busy = true;
  try {
    const u = await checkUpdate();
    saveCheck();
    if (!u) return;
    if (u.kind !== 'web') {
      toast(`Hay una versión nueva de la app (1.${u.version})`, { label: 'Actualizar', run: () => installUpdate(u).catch(fail) }, 30000);
      return;
    }
    await downloadWebUpdate(u); // descargada: si no se aplica ahora, se usará al volver a abrir la app
    if (justOpened && performance.now() < 30000 && !userBusy()) {
      // Recién abierta y sin nada a medias: recargar ya con la versión nueva
      toast(`Actualizando a la versión 1.${u.version}…`, null, 3000);
      setTimeout(() => applyWebUpdate(u).catch(fail), 1200);
    } else {
      toast(`Versión 1.${u.version} descargada`, { label: 'Aplicar ahora', run: () => applyWebUpdate(u).catch(fail) }, 15000);
    }
  } finally {
    busy = false;
  }
}

// APK nuevo: se descarga desde la app (con el progreso) y se abre el instalador de Android.
async function installUpdate(u) {
  if (u.kind === 'link') { location.href = u.url; return; }
  toast('Descargando la actualización… 0 %', null, 600000);
  try {
    await installApk(u.url, (pct) => toast(`Descargando la actualización… ${pct} %`, null, 600000));
    toast('Instalando… (cuando acabe, ábrela desde la notificación)', null, 10000);
  } catch (e) {
    hideToast();
    throw e;
  }
}

async function checkApk() {
  const u = await checkUpdate();
  saveCheck();
  if (!u) {
    const i = await apkInfo();
    toast(`Tienes la última versión (${i && (i.web || i.build) ? `Android 1.${i.web || i.build}` : APP_VERSION})`);
    return;
  }
  if (u.kind === 'web') {
    // Solo la app web: se descarga y la app se recarga con ella (sin instalar nada)
    toast(`Actualizando a la versión 1.${u.version}…`, null, 6000);
    await downloadWebUpdate(u, { now: true });
    return;
  }
  hideToast();
  const ok = await dialog({
    title: 'Hay una versión nueva',
    html: `<p>Ya está disponible la versión <b>1.${u.version}</b>. Esta vez cambia la parte de Android, así que hay que instalarla.</p>
      <p>${u.kind === 'apk' ? 'Se descarga desde aquí y se abre el instalador de Android' : 'Se descarga con el navegador; después, ábrela'}: se instala encima de esta y <b>tus datos se conservan</b>.</p>`,
    buttons: [{ label: 'Más tarde', value: false }, { label: 'Actualizar', value: true, cls: 'btn-primary' }],
  });
  if (ok) await installUpdate(u);
}

// ---------------------------------------------------------------------------
// «Buscar actualizaciones» (menú)
// ---------------------------------------------------------------------------
export async function checkForUpdates() {
  if (busy) return;
  busy = true;
  toast('Buscando actualizaciones…', null, 15000);
  try {
    if (NATIVE) await checkApk();
    else await checkWeb();
  } catch (e) {
    toast(NATIVE && e && e.message ? e.message : 'No se pudo comprobar: revisa la conexión a internet', null, 8000);
  } finally {
    busy = false;
  }
}

// Archivos de la app que ha cargado esta página (la propia página, módulos, estilos y manifiesto).
function appFiles() {
  const base = new URL('./', document.baseURI);
  const urls = new Set([base.href, new URL('index.html', base).href]);
  for (const e of performance.getEntriesByType('resource')) {
    const u = new URL(e.name);
    if (u.origin === base.origin && u.pathname.startsWith(base.pathname) && /\.(js|css|webmanifest|svg)$/.test(u.pathname)) urls.add(u.origin + u.pathname);
  }
  return [...urls];
}

async function checkWeb() {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
  if (reg) await reg.update().catch(() => {});
  // Lo que la app tiene guardado para funcionar sin conexión (solo sus propias cachés).
  const cached = [];
  if (window.caches) for (const k of await caches.keys()) if (k.startsWith('cuentas-claras-')) cached.push(await caches.open(k));
  let changed = false;
  for (const url of appFiles()) {
    // Primero lo guardado: el service worker guarda la respuesta nueva en cuanto llega.
    const olds = [];
    for (const c of cached) { const r = await c.match(url); if (r) olds.push(await r.text()); }
    // cache: 'reload' también renueva la caché del navegador, así que al recargar llega lo nuevo.
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) continue;
    const fresh = await res.text();
    if (olds.some((t) => t !== fresh)) changed = true;
  }
  if (reg && (reg.installing || reg.waiting)) changed = true;
  if (!changed) { toast(`Ya tienes la última versión (${APP_VERSION})`); return; }
  toast('Actualizando…', null, 5000);
  setTimeout(() => location.reload(), 600);
}

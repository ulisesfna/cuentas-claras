// «Buscar actualizaciones» (menú). En la app de Android consulta la última APK de GitHub; en la web
// vuelve a pedir los archivos de la app saltándose las cachés y recarga si alguno ha cambiado.
import { APP_VERSION } from '../core/constants.js';
import { dialog, hideToast, toast } from './dom.js';
import { latestRelease, NATIVE } from './native.js';

let busy = false;

export async function checkForUpdates() {
  if (busy) return;
  busy = true;
  toast('Buscando actualizaciones…', null, 15000);
  try {
    if (NATIVE) await checkApk();
    else await checkWeb();
  } catch (e) {
    toast('No se pudo comprobar: revisa la conexión a internet');
  } finally {
    busy = false;
  }
}

async function checkApk() {
  const up = await latestRelease({ force: true });
  if (!up) { toast('Esta copia de la app no sabe dónde buscar versiones nuevas'); return; }
  if (up.latest <= up.current) { toast(`Tienes la última versión (Android 1.${up.current})`); return; }
  hideToast();
  const ok = await dialog({
    title: 'Hay una versión nueva',
    html: `<p>Tienes la <b>1.${up.current}</b> y ya está disponible la <b>1.${up.latest}</b>.</p>
      <p>Descárgala y ábrela: se instala encima de esta y <b>tus datos se conservan</b>.</p>`,
    buttons: [{ label: 'Más tarde', value: false }, { label: 'Descargar', value: true, cls: 'btn-primary' }],
  });
  if (ok) location.href = up.url;
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

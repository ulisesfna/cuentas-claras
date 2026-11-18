// App de Android (APK hecha con Capacitor, ver android-app/). Dentro de la APK existe
// window.Capacitor: las copias se guardan con «Compartir», el botón «atrás» cierra pantallas y
// la app se actualiza desde dentro. En el navegador NATIVE es false y todo va como en la web.
const Cap = window.Capacitor;
export const NATIVE = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform() && typeof Cap.registerPlugin === 'function');
const P = NATIVE ? {
  app: Cap.registerPlugin('App'),
  fs: Cap.registerPlugin('Filesystem'),
  share: Cap.registerPlugin('Share'),
  upd: Cap.registerPlugin('Actualizar'), // android-app/nativo/ActualizarPlugin.java
} : null;
export const APK_NAME = 'CuentasClaras.apk';

// Guarda un archivo: en la APK no hay descargas, así que se escribe en la caché y se abre el menú
// «Compartir» (Drive, Archivos, correo…). Devuelve false si se cancela.
export async function shareFile(name, content) {
  try {
    const { uri } = await P.fs.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
    await P.share.share({ title: name, files: [uri], dialogTitle: 'Guardar en…' });
    return true;
  } catch (e) {
    if (/cancel/i.test((e && e.message) || '')) return false;
    throw e;
  }
}

// Avisa cuando la app pasa a primer o segundo plano. En la APK también escucha pause/resume de
// Android, por si la página no recibe visibilitychange; si llegan los dos, solo cuenta el primero.
let visible = document.visibilityState !== 'hidden';
const visListeners = [];
function setVisible(v) {
  if (v === visible) return;
  visible = v;
  visListeners.forEach((f) => f(v));
}
document.addEventListener('visibilitychange', () => setVisible(document.visibilityState !== 'hidden'));
if (NATIVE) {
  P.app.addListener('pause', () => setVisible(false));
  P.app.addListener('resume', () => setVisible(true));
}
export const isVisible = () => visible;
export const onVisibility = (f) => visListeners.push(f);

// Botón «atrás» de Android: `handler` devuelve true si ha cerrado algo; si no, la app se minimiza.
export function onBackButton(handler) {
  if (NATIVE) P.app.addListener('backButton', () => { if (!handler()) P.app.minimizeApp(); });
}

// ---------------------------------------------------------------------------
// Versiones nuevas (igual que en «Mi calendario»)
// Cada vez que se suben cambios, GitHub publica el APK, la app web (web.zip) y version.json.
// · Si la parte nativa no ha cambiado, la app web nueva se descarga sola y se usa en lugar de la del
//   APK (sin instalar nada). Ver android-app/nativo/Actualizar.java.
// · Si ha cambiado, el APK se descarga e instala desde la propia app.
// ---------------------------------------------------------------------------

// { build: APK, web: versión de la app web en uso, nativo, date, repo, self: admite actualizaciones
// propias }. apk-version.json lo escribe android-app/preparar.py al fabricar la APK.
let info = null;
export async function apkInfo() {
  if (!NATIVE) return null;
  if (!info) {
    const file = await fetch('apk-version.json').then((r) => r.json()).catch(() => ({}));
    const v = await P.upd.version().catch(() => null); // APK anteriores no lo tienen
    info = { ...file, web: file.build, ...(v ? { build: v.build, web: v.web, nativo: v.nativo, self: true } : {}) };
  }
  return info;
}
export function apkVersionLabel(i) {
  const v = i && (i.web || i.build);
  if (!v) return '';
  // Si la app web se actualizó sola, también la versión del APK instalado
  const apk = i.self && i.web && i.build && i.web !== i.build ? `, app ${i.build}` : '';
  return `Android 1.${v}${i.date ? ` (${i.date}${apk})` : apk ? ` (${apk.slice(2)})` : ''}`;
}

/** La app ha arrancado: si esta versión web es una descargada, se queda (si no llegara aquí, la
 *  próxima vez que se abra la app se volvería sola a la versión que trae el APK). */
export function confirmWebStarted() {
  if (NATIVE) P.upd.webOk().catch(() => {});
}
/** Errores del instalador de Android (cancelado, sin espacio…) */
export function onInstallError(f) {
  if (NATIVE) P.upd.addListener('instalacion', ({ error }) => error && f(error)).catch(() => {});
}

/**
 * ¿Hay una versión nueva? Devuelve null o { version, kind, … }: kind 'web' (se descarga sola),
 * 'apk' (hay que instalar el APK) o 'link' (APK antiguo sin el actualizador: abrir la descarga).
 * Lanza un error si no hay conexión.
 */
export async function checkUpdate() {
  const i = await apkInfo();
  if (!i) return null;
  if (i.self) {
    const rel = await P.upd.buscarVersion();
    if (!(rel.build > Math.max(i.web || 0, i.build || 0))) return null;
    if (rel.nativo === i.nativo && rel.web) return { version: rel.build, kind: 'web', rel };
    return { version: rel.build, kind: 'apk', url: rel.apk };
  }
  if (!i.repo) return null;
  const r = await fetch(`https://api.github.com/repos/${i.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  const latest = parseInt(String((await r.json()).tag_name || '').replace(/\D/g, ''), 10);
  if (!(latest > i.build)) return null;
  return { version: latest, kind: 'link', url: `https://github.com/${i.repo}/releases/latest/download/${APK_NAME}` };
}

/** Web: la descarga y, con `now`, recarga la app con ella (si no, se usará al volver a abrirla). */
export async function downloadWebUpdate(u, { now = false } = {}) {
  await P.upd.bajarWeb({ build: u.rel.build, web: u.rel.web, nativo: u.rel.nativo });
  if (now) await P.upd.aplicarWeb({ build: u.rel.build });
}
export const applyWebUpdate = (u) => P.upd.aplicarWeb({ build: u.version });

/** Descarga el APK desde la app (progreso en `onProgress(pct)`) y abre el instalador de Android. */
export async function installApk(url, onProgress) {
  // Para la notificación «se ha actualizado, toca para abrirla» (Android 13+ pide permiso)
  await P.upd.requestPermissions({ permissions: ['avisos'] }).catch(() => {});
  const h = await P.upd.addListener('descarga', ({ pct }) => onProgress(pct)).catch(() => null);
  try {
    await P.upd.instalarApk({ url });
  } finally {
    if (h && h.remove) h.remove();
  }
}

// En la web publicada en GitHub Pages: dirección fija de la última APK.
export function apkDownloadURL() {
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? `https://github.com/${m[1]}/${repo}/releases/latest/download/${APK_NAME}` : null;
}
